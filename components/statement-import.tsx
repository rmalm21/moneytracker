'use client';
import { useMemo, useState, type ChangeEvent } from 'react';
import { FileSpreadsheet, Inbox } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Field, Select } from './fields';
import { emojiOrFallback } from './visual-identity';
import { addImportedDrafts } from '@/lib/firestore';
import { planImport, readStatement, readStatementFile, type ImportItem, type StatementRead } from '@/lib/import/statement';
import { rupiah } from '@/lib/accounting';
import { formatDate } from '@/lib/period';

/** Import rows the person skipped in Perlu dikonfirmasi, kept on this device so importing the file again leaves them out. */
const SKIPPED_KEY = (uid: string) => `dompet-ajaib:import-skipped:${uid}`;
export function readSkippedImports(uid: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SKIPPED_KEY(uid)) || '[]') as string[]); } catch { return new Set(); }
}
export function rememberSkippedImports(uid: string, ids: string[]) {
  try { const all = [...readSkippedImports(uid), ...ids.filter(id => id.startsWith('imp_'))]; localStorage.setItem(SKIPPED_KEY(uid), JSON.stringify(all.slice(-3000))); } catch { /* only a convenience */ }
}
const MAX_ROWS = 1000;

/**
 * 8.5 Import a bank or e-wallet statement (CSV or Excel) into Perlu dikonfirmasi. The file is read on this device and
 * never uploaded; only the suggested rows are saved, as drafts that change no balance until each is confirmed.
 */
export function StatementImport({ onDone }: { onDone: (count: number) => void }) {
  const { data, user } = useApp();
  const wallets = useMemo(() => data.wallets.filter(w => !w.isArchived).sort((a, b) => Number(b.type === 'bank' || b.type === 'ewallet') - Number(a.type === 'bank' || a.type === 'ewallet')), [data.wallets]);
  const [walletId, setWalletId] = useState(''), [fileName, setFileName] = useState(''), [read, setRead] = useState<StatementRead | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [withRecorded, setWithRecorded] = useState(false);
  const today = new Date().toLocaleDateString('en-CA');
  const plan: ImportItem[] = useMemo(() => !read || !walletId || !user ? [] : planImport({ ...read, rows: read.rows.slice(-MAX_ROWS) }, { walletId, wallets: data.wallets, categories: data.categories, transactions: data.transactions, drafts: data.drafts, skipped: readSkippedImports(user.uid) }), [read, walletId, user, data.wallets, data.categories, data.transactions, data.drafts]);
  const chosen = plan.filter(x => !x.already || (withRecorded && x.already === 'recorded'));
  const count = (k: ImportItem['already']) => plan.filter(x => x.already === k).length;
  const sum = (rows: ImportItem[]) => rows.reduce((n, x) => n + x.amount, 0);
  const out = chosen.filter(x => x.flow === 'expense'), inn = chosen.filter(x => x.flow === 'income'), moved = chosen.filter(x => x.flow === 'transfer');
  const catName = (x: ImportItem) => { const c = data.categories.find(k => k.id === (x.subcategoryId || x.categoryId)); return c ? `${emojiOrFallback(c.icon)} ${c.name}` : x.flow === 'transfer' ? `→ ${data.wallets.find(w => w.id === x.destinationWalletId)?.name || 'dompet lain'}` : 'Kategori belum ditebak'; };

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setError(''); setRead(null); setFileName(file.name);
    if (file.size > 8 * 1024 * 1024) { setError('File terlalu besar (lebih dari 8 MB). Unduh mutasi per bulan saja.'); return; }
    try {
      const table = await readStatementFile(new Uint8Array(await file.arrayBuffer()));
      const result = readStatement(table, today);
      if (!result.rows.length) throw Error('Tidak ada baris mutasi yang terbaca di file ini. Pastikan ada kolom tanggal dan nominal.');
      setRead(result);
      // The wallet named in the file name ("mutasi-bca-okt.csv") is picked when none is chosen yet.
      if (!walletId) { const hit = wallets.find(w => file.name.toLowerCase().includes(w.name.toLowerCase())); if (hit) setWalletId(hit.id); }
    } catch (err) { setError((err as Error).message || 'File tidak terbaca.'); }
  }
  async function save() {
    if (!user || !chosen.length) return;
    setBusy(true); setError('');
    try {
      await addImportedDrafts(user.uid, chosen.map(x => ({ id: x.id, date: x.date, flow: x.flow, amount: x.amount, walletId: x.walletId, destinationWalletId: x.destinationWalletId, categoryId: x.categoryId, subcategoryId: x.subcategoryId, name: x.name, description: x.description })));
      onDone(chosen.length);
      setRead(null); setFileName('');
    } catch (err) { setError((err as Error).message || 'Belum berhasil disimpan. Coba lagi.'); } finally { setBusy(false); }
  }

  return <div className="form-stack statement-import">
    <p className="muted">File dibaca di perangkat ini dan <strong>tidak diunggah</strong>. Semua baris masuk ke Perlu dikonfirmasi dulu; saldo baru berubah setelah tiap baris kamu konfirmasi.</p>
    <Field label="Mutasi dari dompet"><Select value={walletId} onChange={e => setWalletId(e.target.value)} required><option value="">Pilih dompet</option>{wallets.map(w => <option key={w.id} value={w.id}>{emojiOrFallback(w.icon, '👛')} {w.name}</option>)}</Select></Field>
    <label className={`file-pick ${fileName ? 'has-file' : ''}`}><input type="file" accept=".csv,.xlsx,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => void pick(e)} /><span className="file-pick-icon" aria-hidden="true"><FileSpreadsheet size={20} /></span><span className="file-pick-text"><strong>{fileName || 'Pilih file mutasi'}</strong><small>{fileName ? 'Ketuk untuk memilih file lain' : 'CSV atau Excel (.xlsx) dari internet/mobile banking atau e-wallet'}</small></span></label>
    {read && <div className="si-summary">
      <p><strong>{read.rows.length} baris terbaca</strong>{read.from && read.to ? ` · ${formatDate(read.from)} – ${formatDate(read.to)}` : ''}{read.rows.length > MAX_ROWS ? ` · diambil ${MAX_ROWS} terakhir` : ''}</p>
      <p className="muted">Kolom yang dibaca: {[read.columns.date, ...read.columns.description, read.columns.amount, read.columns.debit, read.columns.credit, read.columns.kind].filter(Boolean).join(' · ')}</p>
      {!walletId && <p className="form-error" role="alert">Pilih dulu dompet asal mutasi ini.</p>}
      {walletId && <>
        {chosen.length > 0 && <div className="si-stats">
          <span><small>Keluar</small><strong>{rupiah(sum(out))}</strong><small>{out.length} baris</small></span>
          <span><small>Masuk</small><strong className="amount-positive">{rupiah(sum(inn))}</strong><small>{inn.length} baris</small></span>
          {moved.length > 0 && <span><small>Pindah dompet</small><strong>{rupiah(sum(moved))}</strong><small>{moved.length} baris</small></span>}
        </div>}
        {read.unsure > 0 && <p className="notice">{read.unsure} nominal tanpa tanda masuk/keluar, jadi dibaca sebagai pengeluaran. Cek lagi saat konfirmasi.</p>}
        {(count('imported') > 0 || count('skipped') > 0) && <p className="muted">{[count('imported') && `${count('imported')} sudah pernah diimpor`, count('skipped') && `${count('skipped')} pernah kamu lewati`].filter(Boolean).join(' · ')}: tidak dimasukkan lagi.</p>}
        {count('recorded') > 0 && <label className="check-row"><input type="checkbox" checked={withRecorded} onChange={e => setWithRecorded(e.target.checked)} /><span>Ikutkan {count('recorded')} baris yang sepertinya sudah tercatat (nominal & tanggal sama di dompet ini)</span></label>}
        <ul className="si-preview">{chosen.slice(0, 8).map(x => <li key={x.id}><span><strong>{x.name}</strong><small>{formatDate(x.date)} · {catName(x)}{x.already === 'recorded' ? ' · mungkin sudah tercatat' : ''}</small></span><strong className={x.flow === 'income' ? 'amount-positive' : ''}>{x.flow === 'income' ? '+' : ''}{rupiah(x.amount)}</strong></li>)}</ul>
        {chosen.length > 8 && <p className="muted">dan {chosen.length - 8} baris lainnya.</p>}
        <p className="muted">Kalau saldo dompet ini di aplikasi sudah kamu samakan dengan bank, konfirmasi hanya transaksi yang memang belum tercatat supaya saldo tidak dobel.</p>
        <div className="settings-actions start"><Button onClick={() => void save()} disabled={busy || !chosen.length}><Inbox size={16} /> {busy ? 'Menyimpan…' : chosen.length ? `Masukkan ${chosen.length} ke Perlu dikonfirmasi` : 'Tidak ada baris baru'}</Button></div>
      </>}
    </div>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
