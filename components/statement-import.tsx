'use client';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { CheckCircle2, CopyCheck, FileSpreadsheet, Inbox, KeyRound, Pencil, Scale, SquareCheck, Trash2, X, Zap } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { RowCheck, RowMenu, useLongPress, type RowAction } from './row-actions';
import { Confirm } from './ui/alert-dialog';
import { Field, Input, Money, Select, categoryOptions } from './fields';
import { categoryEmoji, emojiOrFallback } from './visual-identity';
import { loadAllTransactions, saveRecord } from '@/lib/firestore';
import { placeKey, planImport, readStatement, readStatementSource, reconcile, recurringHints, type ImportItem, type StatementRead } from '@/lib/import/statement';
import { PURPOSES, finalize, isMerchantRow, isTransferRow, keepFor, missing, suggestFor, type FinalRow, type Focus, type Purpose, type RowEdit } from '@/lib/import/edit';
import { draftRows, recordRow, undoSaved, type Saved } from '@/lib/import/record';
import type { LedgerTx, Recurring } from '@/lib/types';
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
const MAX_ROWS = 1000, PAGE = 40;
const FOCUS_KEY = 'dompet-ajaib:import-focus';
const readFocus = (): Focus => { try { const v = localStorage.getItem(FOCUS_KEY); return v === 'notransfer' || v === 'merchant' ? v : 'all'; } catch { return 'all'; } };

/**
 * 8.5 Import a bank or e-wallet statement (CSV or Excel; 8.7 also PDF). The file is read on this device and never
 * uploaded. A PDF locked with a password is opened with the password typed here, used once and never kept.
 *
 * 8.7 Every row can be changed or removed before saving, and the person chooses: keep them all as drafts in Perlu
 * dikonfirmasi, or record the complete ones now (the rest still go to drafts). A transfer with a person is asked what it
 * was for (paying for something, lending, paying a debt, being paid back, borrowing). Rows that look like something
 * recorded before are shown side by side with it. After saving, each saved row can be deleted again from the list.
 */
export function StatementImport({ onDone, openTx }: { onDone: (message: string) => void; /** 8.6 Opens the form (here: a balance correction) when the page has one. */ openTx?: (preset: Partial<LedgerTx>) => void }) {
  const { data, user, profile } = useApp();
  const wallets = useMemo(() => data.wallets.filter(w => !w.isArchived).sort((a, b) => Number(b.type === 'bank' || b.type === 'ewallet') - Number(a.type === 'bank' || a.type === 'ewallet')), [data.wallets]);
  const [walletId, setWalletId] = useState(''), [fileName, setFileName] = useState(''), [read, setRead] = useState<StatementRead | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [withRecorded, setWithRecorded] = useState(false), [skipMaybe, setSkipMaybe] = useState(false);
  // 8.7 A PDF waiting for its password (kept only while this screen is open), and the password being typed.
  const [locked, setLocked] = useState<{ bytes: Uint8Array; name: string; wrong: boolean } | null>(null), [password, setPassword] = useState(''), [reading, setReading] = useState(false);
  // 8.7 The person's changes per row, rows taken out, the row being edited, how many rows are shown, and what was saved.
  const [edits, setEdits] = useState<Record<string, RowEdit>>({}), [removed, setRemoved] = useState<string[]>([]), [editing, setEditing] = useState(''), [shown, setShown] = useState(PAGE);
  const [saved, setSaved] = useState<(Saved & { gone?: boolean })[] | null>(null);
  // 8.8 Rows ticked to take out together, and the row whose menu is open (long press or right click).
  const [picked, setPicked] = useState<string[]>([]), [menuId, setMenuId] = useState('');
  const hold = useLongPress(id => setMenuId(id));
  const [focus, setFocusState] = useState<Focus>('all');
  useEffect(() => { setFocusState(readFocus()); }, []);
  const setFocus = (f: Focus) => { setFocusState(f); setPicked([]); try { localStorage.setItem(FOCUS_KEY, f); } catch { /* only a convenience */ } };
  // 8.8 A category chosen for one row also goes to the other rows of the same place in this file that were not set by hand.
  const [applied, setApplied] = useState<{ id: string; n: number } | null>(null);
  const owners = useMemo(() => [profile?.displayName, user?.displayName].filter((n): n is string => Boolean(n && n.trim())), [profile?.displayName, user?.displayName]);
  const today = new Date().toLocaleDateString('en-CA');
  // The whole history on this device: 8.6 the bank's closing balance against the wallet on that day, and 8.7 rows that
  // may have been recorded before (also long ago, or in another wallet).
  const [history, setHistory] = useState<LedgerTx[] | null>(null);
  useEffect(() => { if (!user || !read) return; let live = true; void loadAllTransactions(user.uid).then(items => { if (live) setHistory(items); }).catch(() => { if (live) setHistory(null); }); return () => { live = false; }; }, [user?.uid, read]);
  const plan: ImportItem[] = useMemo(() => !read || !walletId || !user ? [] : planImport({ ...read, rows: [...read.rows].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_ROWS) }, { walletId, wallets: data.wallets, categories: data.categories, transactions: history || data.transactions, drafts: data.drafts, skipped: readSkippedImports(user.uid), owners }), [read, walletId, user, data.wallets, data.categories, data.transactions, history, data.drafts, owners]);
  const keepFocus = (x: ImportItem) => keepFor(focus, x);
  const fresh = plan.filter(x => !x.already && !removed.includes(x.id));
  const focusCounts = { all: fresh.length, notransfer: fresh.filter(x => !isTransferRow(x)).length, merchant: fresh.filter(isMerchantRow).length };
  const maybes = plan.filter(x => x.maybe && !x.already && !removed.includes(x.id) && keepFocus(x));
  const items = useMemo(() => plan.filter(x => (!x.already || (withRecorded && x.already === 'recorded')) && !(skipMaybe && x.maybe) && !removed.includes(x.id) && keepFor(focus, x)), [plan, withRecorded, skipMaybe, removed, focus]);
  const rows: FinalRow[] = useMemo(() => items.map(x => finalize(x, edits[x.id], walletId)), [items, edits, walletId]);
  const ready = rows.filter(r => !missing(r)), waiting = rows.filter(r => missing(r)), undecided = rows.filter(r => r.person && !r.purpose);
  const wallet = data.wallets.find(w => w.id === walletId);
  // The bank's balance check counts the rows as they will be saved (edited amounts and dates, money in or out).
  const asItems = rows.map((r, i) => ({ ...items[i], amount: r.amount, date: r.date, destinationWalletId: r.destinationWalletId, flow: r.purpose === 'transfer' ? 'transfer' as const : r.direction === 'in' ? 'income' as const : 'expense' as const }));
  const match = read && wallet && history ? reconcile(read, asItems, wallet, history) : null;
  // 8.6 Bills that came every month (this file and your records), offered as a schedule; one tap each.
  const [madeRecurring, setMadeRecurring] = useState<string[]>([]);
  const hints = useMemo(() => !walletId || !plan.length ? [] : recurringHints(plan, history || data.transactions, data.recurring, today).filter(h => !madeRecurring.includes(h.key)), [plan, history, data.transactions, data.recurring, walletId, madeRecurring, today]);
  async function makeRecurring(h: (typeof hints)[number]) {
    if (!user) return;
    try {
      await saveRecord<Recurring>(user.uid, 'recurring', { name: h.name, type: 'expense', amount: h.amount, walletId: h.walletId, destinationWalletId: null, categoryId: h.categoryId, frequency: 'monthly', mode: 'inbox', nextDate: h.nextDate, anchorDay: h.day, active: true });
      setMadeRecurring(list => [...list, h.key]);
    } catch (err) { setError((err as Error).message || 'Jadwal rutin belum tersimpan.'); }
  }
  const count = (k: ImportItem['already']) => plan.filter(x => x.already === k).length;
  const sum = (list: FinalRow[]) => list.reduce((n, x) => n + x.amount, 0);
  const moved = rows.filter(r => r.purpose === 'transfer'), out = rows.filter(r => r.direction === 'out' && r.purpose !== 'transfer'), inn = rows.filter(r => r.direction === 'in' && r.purpose !== 'transfer');
  const walletName = (id: string | null) => data.wallets.find(w => w.id === id)?.name || '';
  const likeOf = (m: NonNullable<ImportItem['maybe']>) => `${m.name} · ${rupiah(m.amount)} · ${formatDate(m.date)} · ${walletName(m.walletId) || 'dompet lain'}`;
  const whyOf = (x: { date: string; amount: number }, m: NonNullable<ImportItem['maybe']>) => m.why === 'wallet' ? `dicatat di ${walletName(m.walletId) || 'dompet lain'}` : m.why === 'amount' ? `nominal beda ${rupiah(Math.abs(m.amount - x.amount))}` : `tanggal beda ${Math.round(Math.abs(Date.parse(`${m.date}T00:00:00Z`) - Date.parse(`${x.date}T00:00:00Z`)) / 864e5)} hari`;
  const openDebts = data.debts.filter(d => d.status !== 'paid' && d.outstandingAmount > 0), openReceivables = data.receivables.filter(r => r.status !== 'paid' && r.remainingAmount > 0);
  /** What a row will be, in a few words ("🗂️ Kopi", "→ Mandiri", "Bayar utang: Andi"). */
  function describe(r: FinalRow) {
    if (!r.purpose) return 'Belum ditentukan';
    if (r.purpose === 'transfer') return r.direction === 'out' ? `→ ${walletName(r.destinationWalletId) || 'pilih dompet tujuan'}` : `← dari ${walletName(r.walletId) || 'pilih dompet asal'}`;
    if (r.purpose === 'expense' || r.purpose === 'income') { const c = data.categories.find(k => k.id === (r.subcategoryId || r.categoryId)); return c ? `${categoryEmoji(c, data.categories.find(k => k.id === c.parentId))} ${c.name}` : 'Kategori belum dipilih'; }
    if (r.purpose === 'debt_payment') return `Bayar utang${r.debtId ? `: ${data.debts.find(d => d.id === r.debtId)?.name || ''}` : ''}`;
    if (r.purpose === 'receivable_payment') return `Pelunasan piutang${r.receivableId ? `: ${data.receivables.find(x => x.id === r.receivableId)?.person || ''}` : ''}`;
    return r.purpose === 'receivable_issue' ? `Piutang baru ke ${r.person || '…'}` : `Utang baru dari ${r.person || '…'}`;
  }
  const change = (id: string, patch: RowEdit) => setEdits(all => ({ ...all, [id]: { ...all[id], ...patch } }));
  /** Picks what a row is for; the matching debt or receivable of that person is filled in, and the editor opens when something is still missing. */
  function choose(r: FinalRow, purpose: Purpose) {
    const hint = suggestFor(r.person, r.direction, data.debts, data.receivables);
    const patch: RowEdit = { purpose, ...(purpose === 'debt_payment' && hint.debtId ? { debtId: hint.debtId } : {}), ...(purpose === 'receivable_payment' && hint.receivableId ? { receivableId: hint.receivableId } : {}) };
    change(r.id, patch);
    const item = items.find(x => x.id === r.id);
    const next = item ? finalize(item, { ...edits[r.id], ...patch }, walletId) : null, gap = next && missing(next);
    if (gap && gap !== 'Mungkin dobel') setEditing(r.id);
  }

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setError(''); setRead(null); setLocked(null); setPassword(''); setFileName(file.name); setEdits({}); setRemoved([]); setEditing(''); setShown(PAGE); setSaved(null); setPicked([]);
    const pdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    if (file.size > (pdf ? 20 : 8) * 1024 * 1024) { setError(`File terlalu besar (lebih dari ${pdf ? 20 : 8} MB). Unduh mutasi per bulan saja.`); return; }
    await open(new Uint8Array(await file.arrayBuffer()), file.name);
  }
  /** Reads the file (with the PDF's password when it has one); a locked PDF waits here for its password. */
  async function open(bytes: Uint8Array, name: string, pdfPassword?: string) {
    setReading(true); setError('');
    try {
      const source = await readStatementSource(bytes, { password: pdfPassword, today });
      const result = readStatement(source.table, today, undefined, source.meta);
      if (!result.rows.length) throw Error(source.kind === 'pdf' ? 'Tidak ada baris mutasi yang terbaca di PDF ini. Pastikan ini e-statement/mutasi rekening, bukan bukti transfer satuan.' : 'Tidak ada baris mutasi yang terbaca di file ini. Pastikan ada kolom tanggal dan nominal.');
      setRead(result); setLocked(null); setPassword('');
      // The wallet named in the file name ("mutasi-bca-okt.csv", "GoPay_Transaction_History.pdf") is picked (it can be changed).
      const low = name.toLowerCase().replace(/[_-]+/g, ' '), hit = wallets.find(w => low.includes(w.name.toLowerCase()));
      if (hit) setWalletId(hit.id);
    } catch (err) {
      if ((err as Error).name === 'PdfPasswordError') { setLocked({ bytes, name, wrong: Boolean((err as { wrong?: boolean }).wrong) }); setPassword(''); }
      else setError((err as Error).message || 'File tidak terbaca.');
    } finally { setReading(false); }
  }
  /** Saves: everything as drafts, or (now) the complete rows recorded and the rest as drafts. A row that fails to record waits as a draft too. */
  async function save(now: boolean) {
    if (!user || !rows.length) return;
    setBusy(true); setError('');
    const done: Saved[] = [], later = now ? [...waiting] : [...rows], failed: string[] = [];
    try {
      if (now) for (const r of ready) { try { done.push(await recordRow(user.uid, r)); } catch (e) { later.push(r); failed.push(`${r.name}: ${(e as Error).message}`); } }
      if (later.length) done.push(...await draftRows(user.uid, later, r => r.maybe ? likeOf(r.maybe) : undefined));
      setSaved(done); setRead(null); setFileName(''); setEditing('');
      if (failed.length) setError(`${failed.length} baris belum bisa dicatat dan masuk draft: ${failed.slice(0, 2).join(' · ')}`);
    } catch (err) { setError((err as Error).message || 'Belum berhasil disimpan. Coba lagi.'); if (done.length) setSaved(done); } finally { setBusy(false); }
  }
  async function undo(s: Saved) {
    if (!user) return;
    try { await undoSaved(user.uid, s); if (s.kind === 'draft') rememberSkippedImports(user.uid, [s.id]); setSaved(list => list && list.map(x => x.id === s.id && x.kind === s.kind ? { ...x, gone: true } : x)); }
    catch (err) { setError((err as Error).message || 'Belum berhasil dihapus.'); }
  }
  const summary = (list: (Saved & { gone?: boolean })[]) => { const live = list.filter(x => !x.gone), rec = live.filter(x => x.kind !== 'draft').length, dr = live.length - rec; return [rec && `${rec} transaksi dari mutasi dicatat`, dr && `${dr} masuk Perlu dikonfirmasi`].filter(Boolean).join(', ') || 'Tidak ada yang disimpan'; };

  if (saved) return <div className="form-stack statement-import">
    <div className="si-done"><strong><CheckCircle2 size={18} /> {summary(saved)}.</strong><small>Salah masuk? Hapus per baris di bawah. Yang dicatat langsung mengubah saldo; yang di Perlu dikonfirmasi belum.</small></div>
    <ul className="si-saved">{saved.map(s => <li key={`${s.kind}-${s.id}`} className={s.gone ? 'is-gone' : ''}>
      <span><strong>{s.name}</strong><small>{formatDate(s.date)} · {s.gone ? 'Dihapus' : s.kind === 'draft' ? 'Perlu dikonfirmasi' : s.kind === 'receivables' ? 'Piutang baru' : s.kind === 'debts' ? 'Utang baru' : 'Dicatat'}</small></span>
      <span className="si-saved-side"><b className={s.direction === 'in' ? 'amount-positive' : ''}>{s.direction === 'in' ? '+' : ''}{rupiah(s.amount)}</b>
        {!s.gone && <Confirm title="Hapus hasil impor ini?" description={s.kind === 'draft' ? 'Baris ini dihapus dari Perlu dikonfirmasi dan tidak dimasukkan lagi kalau file yang sama diimpor ulang di perangkat ini.' : s.kind === 'tx' ? 'Transaksi ini dihapus dan saldo dompetnya kembali seperti sebelum dicatat.' : `${s.kind === 'receivables' ? 'Piutang' : 'Utang'} ini dihapus beserta uang keluar/masuknya, dan saldo dompet kembali seperti sebelumnya.`} confirmLabel="Hapus" onConfirm={() => undo(s)}><button type="button" className="icon-button si-del" aria-label={`Hapus ${s.name}`}><Trash2 size={16} /></button></Confirm>}
      </span></li>)}</ul>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="settings-actions start"><Button onClick={() => onDone(`${summary(saved)}.`)}>Selesai</Button><Button variant="secondary" onClick={() => { setSaved(null); setError(''); }}>Impor file lain</Button></div>
  </div>;

  return <div className="form-stack statement-import">
    <p className="muted">File dibaca di perangkat ini dan <strong>tidak diunggah</strong>. Sebelum disimpan, tiap baris bisa kamu ubah atau hapus, lalu pilih simpan sebagai draft atau catat sekarang.</p>
    <Field label="Mutasi dari dompet"><Select value={walletId} onChange={e => setWalletId(e.target.value)} required><option value="">Pilih dompet</option>{wallets.map(w => <option key={w.id} value={w.id}>{emojiOrFallback(w.icon, '👛')} {w.name}</option>)}</Select></Field>
    <label className={`file-pick ${fileName ? 'has-file' : ''}`}><input type="file" accept=".csv,.xlsx,.txt,.pdf,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => void pick(e)} /><span className="file-pick-icon" aria-hidden="true"><FileSpreadsheet size={20} /></span><span className="file-pick-text"><strong>{fileName || 'Pilih file mutasi'}</strong><small>{reading ? 'Membaca file…' : fileName ? 'Ketuk untuk memilih file lain' : 'PDF e-statement, CSV, atau Excel (.xlsx) dari mobile banking atau e-wallet'}</small></span></label>
    {locked && <form className="si-password" onSubmit={e => { e.preventDefault(); if (password) void open(locked.bytes, locked.name, password); }}>
      <strong><KeyRound size={16} /> PDF ini dikunci password</strong>
      <small>Password-nya biasanya tertulis di email dari bank (sering pakai tanggal lahir). Dipakai sekali untuk membuka file di perangkat ini, tidak disimpan dan tidak dikirim ke mana pun.</small>
      <Field label="Password PDF"><Input type="password" autoComplete="off" value={password} onChange={e => setPassword(e.target.value)} autoFocus aria-invalid={locked.wrong || undefined} /></Field>
      {locked.wrong && <p role="alert" className="form-error">Password salah. Coba lagi.</p>}
      <div className="settings-actions start"><Button type="submit" disabled={!password || reading}>{reading ? 'Membuka…' : 'Buka PDF'}</Button></div>
    </form>}
    {read && <div className="si-summary">
      <p><strong>{read.rows.length} baris terbaca</strong>{read.from && read.to ? ` · ${formatDate(read.from)} – ${formatDate(read.to)}` : ''}{read.rows.length > MAX_ROWS ? ` · diambil ${MAX_ROWS} terakhir` : ''}</p>
      <p className="muted">Kolom yang dibaca: {[read.columns.date, ...read.columns.description, read.columns.amount, read.columns.debit, read.columns.credit, read.columns.kind].filter(Boolean).join(' · ')}</p>
      {!walletId && <p className="form-error" role="alert">Pilih dulu dompet asal mutasi ini.</p>}
      {walletId && <>
        {rows.length > 0 && <div className="si-stats">
          <span><small>Keluar</small><strong>{rupiah(sum(out))}</strong><small>{out.length} baris</small></span>
          <span><small>Masuk</small><strong className="amount-positive">{rupiah(sum(inn))}</strong><small>{inn.length} baris</small></span>
          {moved.length > 0 && <span><small>Pindah dompet</small><strong>{rupiah(sum(moved))}</strong><small>{moved.length} baris</small></span>}
        </div>}
        <div className="si-focus" role="radiogroup" aria-label="Yang dimasukkan">
          {([['all', 'Semua'], ['notransfer', 'Tanpa transfer'], ['merchant', 'Merchant saja']] as const).map(([key, label]) => <button key={key} type="button" role="radio" aria-checked={focus === key} className={`ix-filter ${focus === key ? 'is-on' : ''}`} onClick={() => setFocus(key)}>{label}<b>{focusCounts[key]}</b></button>)}
        </div>
        {focus !== 'all' && <p className="muted si-focus-note">{focus === 'merchant' ? 'Hanya belanja di toko dan layanan.' : 'Transfer antar dompet, top up, dan transfer ke/dari orang'} {focus === 'merchant' ? `Transfer, top up, pemasukan, dan biaya bank (${focusCounts.all - focusCounts.merchant} baris) dilewati.` : `(${focusCounts.all - focusCounts.notransfer} baris) dilewati.`} Pilihan ini diingat di HP ini.</p>}
        {match && focus !== 'all' && <p className="muted">Cocokkan saldo dengan bank ada di tampilan <b>Semua</b>, karena sebagian baris sedang dilewati.</p>}
        {match && focus === 'all' && <div className={`si-match ${Math.abs(match.diff) < 1 ? 'is-ok' : 'is-off'}`}>
          <strong>{Math.abs(match.diff) < 1 ? <><CheckCircle2 size={16}/> Saldo cocok dengan bank</> : <><Scale size={16}/> Saldo belum cocok, beda {rupiah(Math.abs(match.diff))}</>}</strong>
          <ul>
            <li><span>Saldo bank per {formatDate(match.date)}</span><b>{rupiah(match.bank)}</b></li>
            <li><span>{wallet!.name} di aplikasi per {formatDate(match.date)}</span><b>{rupiah(match.app)}</b></li>
            {match.pending !== 0 && <li><span>Kalau {rows.filter(x => x.date <= match.date).length} baris baru dicatat</span><b>{match.pending > 0 ? '+' : '−'}{rupiah(Math.abs(match.pending))}</b></li>}
          </ul>
          {Math.abs(match.diff) < 1 ? <small>{match.pending !== 0 ? 'Setelah semua baris baru dicatat, saldo di aplikasi sama persis dengan bank.' : 'Semua transaksi di file ini sudah tercatat.'}</small>
            : <><small>{match.diff > 0 ? 'Bank lebih besar' : 'Bank lebih kecil'} dari catatanmu{match.pending !== 0 ? ' (sudah menghitung baris baru)' : ''}. Biasanya ada transaksi yang tidak masuk file ini atau saldo awal dompet yang beda.</small>
              {openTx && <Button variant="secondary" className="small" onClick={() => openTx({ type: 'adjustment', amount: Math.abs(match.diff), adjustmentDirection: match.diff > 0 ? 'in' : 'out', walletId: wallet!.id, date: match.date, description: 'Disamakan dengan mutasi bank' })}>Samakan saldo {wallet!.name}</Button>}</>}
        </div>}
        {read.balance && read.balance.complete === false && <p className="notice">{read.balance.opening !== undefined && read.balance.closing !== undefined ? 'Saldo awal ditambah mutasi yang terbaca tidak sama dengan saldo akhir di file.' : 'Total masuk dan keluar yang terbaca tidak sama dengan ringkasan di file.'} Mungkin ada baris yang tidak terbaca, cek lagi filenya.</p>}
        {read.balance?.complete && read.balance.closing === undefined && read.balance.totalIn !== undefined && <p className="muted si-ok"><CheckCircle2 size={15} /><span>Total masuk dan keluar sama dengan ringkasan di file, jadi tidak ada baris yang terlewat.</span></p>}
        {((read.internal || 0) > 0 || (read.points || 0) > 0) && <p className="muted">{[read.internal && `${read.internal} pindah saldo antar kantong`, read.points && `${read.points} cashback berupa koin/poin (bukan uang)`].filter(Boolean).join(' · ')}: tidak dimasukkan.</p>}
        {read.unsure > 0 && <p className="notice">{read.unsure} nominal tanpa tanda masuk/keluar, jadi dibaca sebagai pengeluaran. Cek lagi sebelum disimpan.</p>}
        {(count('imported') > 0 || count('skipped') > 0 || count('scheduled') > 0) && <p className="muted">{[count('imported') && `${count('imported')} sudah pernah diimpor (atau masih menunggu dari impor sebelumnya)`, count('scheduled') && `${count('scheduled')} sudah menunggu dari jadwal rutin`, count('skipped') && `${count('skipped')} pernah kamu lewati`].filter(Boolean).join(' · ')}: tidak dimasukkan lagi.</p>}
        {count('recorded') > 0 && <label className="check-row"><input type="checkbox" checked={withRecorded} onChange={e => setWithRecorded(e.target.checked)} /><span>Ikutkan {count('recorded')} baris yang sepertinya sudah tercatat (nominal sama di dompet ini, tanggal sama atau beda sehari)</span></label>}
        {maybes.length > 0 && <div className="si-dupes">
          <strong><CopyCheck size={16} /> {maybes.length} baris mungkin sudah pernah kamu catat</strong>
          <small>Mirip catatan lama: nominal sama di dompet lain atau tanggalnya beda 2–3 hari, atau nominalnya beda sedikit (biaya layanan, tip) di tempat yang sama.</small>
          <ul>{maybes.slice(0, 6).map(x => <li key={x.id}><span><b>{x.name}</b> · {rupiah(x.amount)} · {formatDate(x.date)}</span><small>Mirip: {likeOf(x.maybe!)} ({whyOf(x, x.maybe!)})</small></li>)}</ul>
          {maybes.length > 6 && <small>dan {maybes.length - 6} lainnya.</small>}
          <label className="check-row"><input type="checkbox" checked={skipMaybe} onChange={e => setSkipMaybe(e.target.checked)} /><span>Lewati {maybes.length} baris ini</span></label>
          {!skipMaybe && <small>Kalau tetap dimasukkan, baris ini tidak ikut dicatat sekarang: masuk Perlu dikonfirmasi dengan tanda <b>Mungkin dobel</b>. Kalau memang bukan dobel, ubah barisnya lalu centang “Bukan dobel”.</small>}
        </div>}
        {undecided.length > 0 && <p className="notice si-people">{undecided.length} transfer ke/dari orang perlu kamu tentukan: bayar sesuatu, pinjamkan (piutang), bayar utang, pelunasan piutang, atau pinjam (utang).</p>}
        {(hints.length > 0 || madeRecurring.length > 0) && <div className="si-bills"><strong>Sepertinya tagihan rutin</strong>
          {hints.map(h => <div key={h.key} className="si-bill"><span><b>{h.name}</b><small>{rupiah(h.amount)} tiap tanggal {h.day} · muncul {h.months} bulan</small></span><Button variant="secondary" className="small" onClick={() => void makeRecurring(h)}>Jadikan rutin</Button></div>)}
          {madeRecurring.length > 0 && <small>{madeRecurring.length} jadwal rutin dibuat. Tiap bulan muncul di Perlu dikonfirmasi, dan baris mutasinya nanti tidak dimasukkan dua kali.</small>}
        </div>}
        {rows.length > 1 && <div className="si-pickbar">
          <label className="ix-all"><input type="checkbox" checked={rows.length > 0 && rows.every(r => picked.includes(r.id))} onChange={e => setPicked(e.target.checked ? rows.map(r => r.id) : [])} /><span>Pilih semua ({rows.length})</span></label>
          {picked.length > 0 ? <span className="ix-bulk-actions"><b>{picked.length} dipilih</b><Button variant="danger" className="small" onClick={() => { setRemoved(list => [...new Set([...list, ...picked])]); if (picked.includes(editing)) setEditing(''); setPicked([]); }}><Trash2 size={15} /> Hapus dari impor</Button><button type="button" className="icon-button" aria-label="Batal pilih" onClick={() => setPicked([])}><X size={16} /></button></span>
            : <small className="muted">Tekan lama sebuah baris untuk pilihan lain.</small>}
        </div>}
        <ul className="si-rows">{rows.slice(0, shown).map(r => {
          const item = items.find(x => x.id === r.id)!, edit = edits[r.id] || {}, problem = missing(r), dir = r.direction;
          const hint = r.person ? suggestFor(r.person, dir, data.debts, data.receivables) : {};
          return <li key={r.id} className={`si-row ${problem ? 'needs' : 'ready'} ${editing === r.id ? 'is-open' : ''} ${picked.includes(r.id) ? 'is-picked' : ''}`} {...hold(r.id)}>
            <div className="si-row-top">
              <RowCheck checked={picked.includes(r.id)} onChange={on => setPicked(list => on ? [...new Set([...list, r.id])] : list.filter(id => id !== r.id))} label={`Pilih ${r.name}`} />
              <button type="button" className="si-row-main" onClick={() => setEditing(editing === r.id ? '' : r.id)} aria-expanded={editing === r.id}>
                <span><strong>{r.name}</strong><small>{formatDate(r.date)} · {describe(r)}{item.from === 'history' && (r.purpose === 'expense' || r.purpose === 'income') && edit.categoryId === undefined ? ' (dari catatanmu)' : ''}</small></span>
                <b className={dir === 'in' ? 'amount-positive' : ''}>{dir === 'in' ? '+' : ''}{rupiah(r.amount)}</b>
              </button>
              <span className="si-row-actions">
                <button type="button" className="icon-button" aria-label={`Ubah ${r.name}`} onClick={() => setEditing(editing === r.id ? '' : r.id)}><Pencil size={15} /></button>
                <button type="button" className="icon-button si-del" aria-label={`Hapus ${r.name} dari impor`} onClick={() => { setRemoved(list => [...list, r.id]); if (editing === r.id) setEditing(''); }}><Trash2 size={15} /></button>
              </span>
            </div>
            {r.person && !r.purpose && <div className="si-ask"><small>{dir === 'out' ? `Transfer ke ${r.person}` : `Transfer dari ${r.person}`}, untuk apa?</small>
              <div className="si-chips">{PURPOSES[dir].map(p => <button type="button" key={p.key} className={`si-chip ${hint.purpose === p.key ? 'is-hint' : ''}`} onClick={() => choose(r, p.key)}>{p.label}{hint.purpose === p.key ? ' ✓' : ''}</button>)}</div>
              {hint.purpose && <small>{hint.purpose === 'debt_payment' ? `Ada utang ke ${r.person} yang belum lunas.` : `${r.person} masih punya piutang yang belum lunas.`}</small>}
            </div>}
            {problem && r.purpose && <small className={`si-problem ${problem === 'Mungkin dobel' ? 'is-double' : ''}`}>{problem === 'Mungkin dobel' ? `Mungkin dobel: ${likeOf(r.maybe!)} (${whyOf(r, r.maybe!)})` : `${problem}, atau simpan sebagai draft`}</small>}
            {editing === r.id && <div className="si-editor">
              <div className="si-chips" role="group" aria-label="Untuk apa">{PURPOSES[dir].map(p => <button type="button" key={p.key} className={`si-chip ${r.purpose === p.key ? 'is-on' : ''}`} aria-pressed={r.purpose === p.key} onClick={() => choose(r, p.key)}>{p.label}</button>)}</div>
              <Field label="Nama"><Input value={edit.name ?? item.name} onChange={e => change(r.id, { name: e.target.value })} /></Field>
              {(r.purpose === 'expense' || r.purpose === 'income') && <Field label="Kategori"><Select value={r.subcategoryId || r.categoryId || ''} onChange={e => {
                const c = data.categories.find(k => k.id === e.target.value), patch: RowEdit = c ? { categoryId: c.parentId || c.id, subcategoryId: c.parentId ? c.id : null } : { categoryId: null, subcategoryId: null };
                // The same place elsewhere in this file follows, unless its category was set by hand.
                const brand = placeKey(r.name), same = c && brand ? rows.filter(o => o.id !== r.id && o.direction === r.direction && (o.purpose === 'expense' || o.purpose === 'income') && (edits[o.id]?.categoryId === undefined || Boolean(edits[o.id]?.sameAs)) && placeKey(o.name) === brand) : [];
                setEdits(all => { const next = { ...all, [r.id]: { ...all[r.id], ...patch } }; for (const o of same) next[o.id] = { ...all[o.id], ...patch, sameAs: r.id }; return next; });
                setApplied(same.length ? { id: r.id, n: same.length } : null);
              }}><option value="">Pilih kategori</option>{categoryOptions(data.categories, [r.purpose])}</Select></Field>}
              {applied?.id === r.id && <small className="si-applied">Juga dipakai untuk {applied.n} baris lain dari tempat yang sama di file ini.</small>}
              {r.purpose === 'transfer' && <Field label={dir === 'out' ? 'Ke dompet' : 'Dari dompet'}><Select value={(dir === 'out' ? r.destinationWalletId : r.walletId) || ''} onChange={e => change(r.id, { otherWalletId: e.target.value })}><option value="">Pilih dompet</option>{wallets.filter(w => w.id !== walletId).map(w => <option key={w.id} value={w.id}>{emojiOrFallback(w.icon, '👛')} {w.name}</option>)}</Select></Field>}
              {r.purpose === 'debt_payment' && (openDebts.length ? <Field label="Utang yang dibayar"><Select value={r.debtId || ''} onChange={e => change(r.id, { debtId: e.target.value })}><option value="">Pilih utang</option>{openDebts.map(d => <option key={d.id} value={d.id}>{d.name} · sisa {rupiah(d.outstandingAmount)}</option>)}</Select></Field> : <small className="si-problem">Belum ada catatan utang yang belum lunas. Simpan sebagai draft dulu, atau pilih jenis lain.</small>)}
              {r.purpose === 'receivable_payment' && (openReceivables.length ? <Field label="Piutang yang dilunasi"><Select value={r.receivableId || ''} onChange={e => change(r.id, { receivableId: e.target.value })}><option value="">Pilih piutang</option>{openReceivables.map(x => <option key={x.id} value={x.id}>{x.person} · sisa {rupiah(x.remainingAmount)}</option>)}</Select></Field> : <small className="si-problem">Belum ada catatan piutang yang belum lunas. Simpan sebagai draft dulu, atau pilih jenis lain.</small>)}
              {(r.purpose === 'receivable_issue' || r.purpose === 'borrowing') && <Field label="Nama orangnya" hint={r.purpose === 'receivable_issue' ? 'Dicatat sebagai piutang baru: uang keluar dari dompet ini dan menunggu dibayar.' : 'Dicatat sebagai utang baru: uang masuk ke dompet ini dan jadi utang.'}><Input value={edit.person ?? item.person ?? ''} onChange={e => change(r.id, { person: e.target.value })} /></Field>}
              <div className="si-edit-pair"><Field label="Tanggal"><Input type="date" value={r.date} onChange={e => change(r.id, { date: e.target.value })} /></Field><Field label="Nominal"><Money value={r.amount} onChange={v => change(r.id, { amount: v })} /></Field></div>
              {r.maybe && <label className="check-row"><input type="checkbox" checked={Boolean(edit.notDouble)} onChange={e => change(r.id, { notDouble: e.target.checked })} /><span>Bukan dobel (catatan lama itu transaksi lain)</span></label>}
              <small className="muted">Dari mutasi: {r.description}</small>
              <div className="settings-actions start"><Button variant="secondary" className="small" onClick={() => setEditing('')}>Selesai</Button></div>
            </div>}
          </li>;
        })}</ul>
        {(() => { const r = rows.find(x => x.id === menuId); if (!r) return null; const dir = r.direction, item = items.find(x => x.id === r.id);
          const actions: RowAction[] = [
            { label: 'Ubah', icon: <Pencil size={18} />, hint: 'Nama, untuk apa, kategori, dompet, tanggal, nominal', onSelect: () => setEditing(r.id) },
            ...(r.maybe ? [{ label: edits[r.id]?.notDouble ? 'Tandai mungkin dobel lagi' : 'Bukan dobel', icon: <CopyCheck size={18} />, hint: `Mirip: ${likeOf(r.maybe)}`, onSelect: () => change(r.id, { notDouble: !edits[r.id]?.notDouble }) }] : []),
            { label: picked.includes(r.id) ? 'Batal pilih' : 'Pilih', icon: <SquareCheck size={18} />, hint: 'Centang untuk dihapus bersama yang lain', onSelect: () => setPicked(list => list.includes(r.id) ? list.filter(id => id !== r.id) : [...list, r.id]) },
            { label: 'Hapus dari impor', icon: <Trash2 size={18} />, danger: true, hint: 'Baris ini tidak ikut disimpan', onSelect: () => { setRemoved(list => [...list, r.id]); if (editing === r.id) setEditing(''); } },
          ];
          return <RowMenu open onOpenChange={o => { if (!o) setMenuId(''); }} title={r.name} subtitle={<>{formatDate(r.date)} · <b className={dir === 'in' ? 'amount-positive' : ''}>{dir === 'in' ? '+' : ''}{rupiah(r.amount)}</b> · {describe(r)}</>} actions={actions}>
            {item && <div className="si-ask"><small>Untuk apa?</small><div className="si-chips">{PURPOSES[dir].map(p => <button type="button" key={p.key} className={`si-chip ${r.purpose === p.key ? 'is-on' : ''}`} onClick={() => { choose(r, p.key); setMenuId(''); }}>{p.label}</button>)}</div></div>}
          </RowMenu>; })()}
        {rows.length > shown && <Button variant="secondary" className="small" onClick={() => setShown(n => n + PAGE)}>Tampilkan {Math.min(PAGE, rows.length - shown)} baris lagi ({rows.length - shown} tersisa)</Button>}
        {removed.length > 0 && <p className="muted">{removed.length} baris kamu hapus dari impor ini. <button type="button" className="link-button" onClick={() => setRemoved([])}>Kembalikan</button></p>}
        <p className="muted">Kalau saldo dompet ini di aplikasi sudah kamu samakan dengan bank, simpan hanya transaksi yang memang belum tercatat supaya saldo tidak dobel.</p>
        <div className="si-save">
          {ready.length > 0 && <Confirm title={`Catat ${ready.length} transaksi sekarang?`} description={`Saldo dompet langsung berubah.${waiting.length ? ` ${waiting.length} baris lain yang belum lengkap atau mungkin dobel masuk Perlu dikonfirmasi sebagai draft.` : ''}`} confirmLabel="Catat sekarang" onConfirm={() => save(true)}>
            <Button disabled={busy}><Zap size={16} /> {busy ? 'Menyimpan…' : `Catat ${ready.length} sekarang${waiting.length ? ` · ${waiting.length} ke draft` : ''}`}</Button>
          </Confirm>}
          <Button variant={ready.length ? 'secondary' : 'primary'} onClick={() => void save(false)} disabled={busy || !rows.length}><Inbox size={16} /> {busy ? 'Menyimpan…' : rows.length ? `Simpan semua ${rows.length} sebagai draft` : 'Tidak ada baris baru'}</Button>
          <small className="muted">Draft masuk Perlu dikonfirmasi dan belum mengubah saldo sampai kamu konfirmasi.</small>
        </div>
      </>}
    </div>}
    {error && <p role="alert" className="form-error">{error}</p>}
  </div>;
}
