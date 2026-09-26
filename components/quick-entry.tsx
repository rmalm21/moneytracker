'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeftRight, ArrowRight, ArrowUpLeft, CreditCard, Gift, HandCoins, ShieldCheck, Sparkles, Target, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Button } from './ui/button';
import { Input, Select } from './fields';
import { groupOf, parseQuickText, QUICK_GROUPS, QUICK_LABELS, type QuickGroup, type QuickKind } from '@/lib/quick-entry';
import { createClaim, createDebt, createReceivable, newTx, saveWish, upsertTransaction, validateTx } from '@/lib/firestore';
import { rupiah } from '@/lib/accounting';
import { formatDate, timeInTimeZone, todayInTimeZone } from '@/lib/period';
import { walletActions, walletAllows } from '@/lib/wallet-capabilities';
import type { LedgerTx, Wallet } from '@/lib/types';

/**
 * "Ketik cepat": type a sentence ("beli pocari 8rb di alfa", "pinjam 500rb dari budi", "andi bayar 50rb",
 * "nabung 1jt ke dana darurat", "klaim taksi 80rb") and see at once what will be recorded. Simpan saves it
 * straight away; "Ubah detail" opens the full transaction form. The chips choose the kind when the sentence
 * alone doesn't say it (Utang, Piutang, Target…).
 */
const icons: Record<QuickKind, LucideIcon> = { expense: TrendingDown, income: TrendingUp, transfer: ArrowLeftRight, debt_new: CreditCard, debt_payment: CreditCard, receivable_new: HandCoins, receivable_payment: HandCoins, claim_new: ShieldCheck, claim_payment: ShieldCheck, target: Target, wish: Gift };
/** The other side of each kind ("new" ↔ "paid"), offered as a one-tap correction. */
const sibling: Partial<Record<QuickKind, QuickKind>> = { debt_new: 'debt_payment', debt_payment: 'debt_new', receivable_new: 'receivable_payment', receivable_payment: 'receivable_new', claim_new: 'claim_payment', claim_payment: 'claim_new', target: 'wish', wish: 'target' };
/** Tap-to-try examples: the sentence and what it becomes. */
type Example = { text: string; kind: QuickKind; result: string };
const examples: Record<QuickGroup, Example[]> = {
  auto: [
    { text: 'beli kopi 25rb di kenangan', kind: 'expense', result: 'di Kopi Kenangan, kategorinya terisi sendiri' },
    { text: 'gaji 7,5jt masuk bca', kind: 'income', result: 'Rp7.500.000 masuk ke BCA' },
    { text: 'pinjam 500rb dari budi', kind: 'debt_new', result: 'kamu berutang ke Budi' },
    { text: 'andi bayar 50rb', kind: 'receivable_payment', result: 'sisa utang Andi ke kamu berkurang' },
    { text: 'nabung 1jt ke dana darurat', kind: 'target', result: 'uangnya masuk ke Dana Darurat' },
  ],
  expense: [
    { text: 'makan siang 30rb', kind: 'expense', result: 'kategori makan terisi sendiri' },
    { text: 'bensin 50rb pake gopay', kind: 'expense', result: 'dibayar dari GoPay' },
    { text: 'pulsa 100rb kemarin', kind: 'expense', result: 'dicatat di tanggal kemarin' },
  ],
  income: [
    { text: 'gaji 7,5jt masuk bca', kind: 'income', result: 'langsung masuk ke BCA' },
    { text: 'bonus 500rb', kind: 'income', result: 'ke dompet utama, hari ini' },
    { text: 'jual sepatu 300rb', kind: 'income', result: 'hasil jual barang' },
  ],
  transfer: [
    { text: 'tf 200rb dari bca ke gopay', kind: 'transfer', result: 'pindah dari BCA ke GoPay' },
    { text: 'topup 100rb dari bca ke gopay', kind: 'transfer', result: 'isi saldo e-wallet' },
  ],
  debt: [
    { text: 'pinjam 500rb dari budi', kind: 'debt_new', result: 'kamu berutang ke Budi' },
    { text: 'bayar cicilan laptop 750rb', kind: 'debt_payment', result: 'mencicil utang “Cicilan laptop”' },
    { text: 'lunasin utang budi', kind: 'debt_payment', result: 'seluruh sisanya dibayar' },
  ],
  receivable: [
    { text: 'pinjemin andi 100rb', kind: 'receivable_new', result: 'Andi berutang ke kamu' },
    { text: 'bayarin sinta makan 50rb', kind: 'receivable_new', result: 'kamu menalangi Sinta' },
    { text: 'andi bayar 50rb', kind: 'receivable_payment', result: 'Andi mencicil ke kamu' },
  ],
  claim: [
    { text: 'klaim taksi 80rb', kind: 'claim_new', result: 'kamu menalangi kantor' },
    { text: 'klaim cair 900rb', kind: 'claim_payment', result: 'kantor sudah mengganti' },
  ],
  target: [
    { text: 'nabung 500rb ke dana darurat', kind: 'target', result: 'uangnya masuk ke Dana Darurat' },
    { text: 'sisihkan 100rb buat headphone', kind: 'wish', result: 'untuk impian di wish list' },
  ],
};
const toneOf = (kind: QuickKind) => ['income', 'receivable_payment', 'claim_payment'].includes(kind) ? 'in' : ['transfer', 'target', 'wish'].includes(kind) ? 'move' : 'out';
const txKinds = new Set<QuickKind>(['expense', 'income', 'transfer', 'debt_payment', 'receivable_payment', 'claim_payment', 'target']);
/** Kinds where money comes into the wallet (the default wallet is the income one). */
const incoming = new Set<QuickKind>(['income', 'receivable_payment', 'claim_payment', 'debt_new']);

export function QuickEntryBox({ onOpenForm, onDone, autoFocus = false }: { onOpenForm: (preset: Partial<LedgerTx>) => void; onDone?: () => void; autoFocus?: boolean }) {
  const { data, profile, user } = useApp();
  const { track } = useNotify();
  const [text, setText] = useState(''), [mode, setMode] = useState<QuickGroup | QuickKind>('auto'), [error, setError] = useState('');
  const [edit, setEdit] = useState<{ person?: string; name?: string; description?: string; walletId?: string; linkId?: string }>({});
  const today = todayInTimeZone(profile?.timeZone);
  const result = useMemo(() => text.trim() ? parseQuickText(text, { wallets: data.wallets, categories: data.categories, history: data.transactions, today, debts: data.debts, receivables: data.receivables, claims: data.claims, funds: data.funds, wishlist: data.wishlist }, mode) : null, [text, mode, data, today]);
  const kind = result?.kind;
  // A different kind means different fields: start them fresh.
  useEffect(() => { setEdit({}); setError(''); }, [kind]);

  const walletsFor = (action: 'pay' | 'receive' | 'transferOut' | 'transferIn') => data.wallets.filter(w => walletAllows(w as Wallet, action));
  const txType = result?.preset.type;
  const sourceAction = txType ? walletActions({ type: txType, adjustmentDirection: 'in' }).source as 'pay' | 'receive' | 'transferOut' : kind === 'debt_new' ? 'receive' : 'pay';
  const choices = walletsFor(sourceAction);
  const preferred = kind && incoming.has(kind) ? profile?.defaultIncomeWalletId : profile?.defaultExpenseWalletId;
  // New debts and receivables only move money when a wallet is named or picked (like their own forms).
  const fallbackWallet = kind === 'debt_new' || kind === 'receivable_new' ? '' : choices.find(w => w.id === preferred)?.id || choices[0]?.id || '';
  const walletId = edit.walletId ?? result?.preset.walletId ?? fallbackWallet;
  const linkOptions = kind === 'debt_payment' ? data.debts.filter(d => d.outstandingAmount > 0).map(d => ({ id: d.id, label: `${d.name} · sisa ${rupiah(d.outstandingAmount)}` }))
    : kind === 'receivable_payment' ? data.receivables.filter(r => r.remainingAmount > 0).map(r => ({ id: r.id, label: `${r.person} · sisa ${rupiah(r.remainingAmount)}` }))
    : kind === 'claim_payment' ? data.claims.filter(c => c.remainingAmount > 0).map(c => ({ id: c.id, label: `${c.name} · sisa ${rupiah(c.remainingAmount)}` }))
    : kind === 'target' ? data.funds.filter(f => !f.isArchived).map(f => ({ id: f.id, label: f.name }))
    : kind === 'wish' ? data.wishlist.filter(w => w.status === 'active').map(w => ({ id: w.id, label: `${w.name} · ${rupiah(w.saved || 0)} / ${rupiah(w.price)}` })) : [];
  const presetLink = kind === 'debt_payment' ? result?.preset.debtId : kind === 'receivable_payment' ? result?.preset.receivableId : kind === 'claim_payment' ? result?.preset.claimId : kind === 'target' ? result?.preset.fundId : kind === 'wish' ? result?.wishId : '';
  const linkId = edit.linkId ?? presetLink ?? '';
  const fund = kind === 'target' ? data.funds.find(f => f.id === linkId) : undefined;
  const destination = kind === 'target' ? fund?.linkedWalletId || (fund?.walletIds?.length === 1 ? fund.walletIds[0] : '') : result?.preset.destinationWalletId || '';
  const person = edit.person ?? result?.person ?? '', name = edit.name ?? result?.name ?? '', description = edit.description ?? result?.preset.description ?? '';
  const walletName = (id?: string | null) => data.wallets.find(w => w.id === id)?.name || '';
  const category = data.categories.find(c => c.id === (result?.preset.subcategoryId || result?.preset.categoryId));

  // What still stops a direct save (the form can always be opened instead).
  const missing = !result ? '' : kind === 'expense' && !result.preset.categoryId ? 'Kategorinya belum ketemu. Sebut kategorinya (mis. “makan”), atau tekan Ubah detail.'
    : txKinds.has(result.kind) && !walletId ? 'Pilih dompetnya dulu.'
    : kind === 'transfer' && (!destination || destination === walletId) ? 'Sebut dompet asal dan tujuan, mis. “dari bca ke gopay”.'
    : (kind === 'debt_payment' || kind === 'receivable_payment' || kind === 'claim_payment' || kind === 'wish') && !linkId ? 'Pilih catatan yang dimaksud di atas.'
    : kind === 'target' && !linkId ? 'Pilih tujuan dananya di atas.'
    : kind === 'target' && (!destination || destination === walletId) ? 'Tujuan dana ini belum punya dompet sendiri. Tekan Ubah detail untuk memilih dompet tujuan.'
    : kind === 'receivable_new' && !person.trim() ? 'Tulis nama orangnya.'
    : kind === 'claim_new' && (!name.trim() || !walletId) ? 'Lengkapi nama klaim dan dompet asalnya.'
    : kind === 'debt_new' && !name.trim() ? 'Beri nama utangnya.' : '';

  function preset(): Partial<LedgerTx> {
    if (!result) return {};
    const base: Partial<LedgerTx> = { ...result.preset, walletId: walletId || undefined };
    if (kind === 'debt_payment') base.debtId = linkId; if (kind === 'receivable_payment') base.receivableId = linkId; if (kind === 'claim_payment') base.claimId = linkId;
    if (kind === 'target') { base.fundId = linkId; if (destination) base.destinationWalletId = destination; }
    return base;
  }
  function openForm() { if (!result || !txKinds.has(result.kind)) return; const next = preset(); setText(''); onOpenForm(next); }
  function save() {
    if (!user || !result || !kind || missing) return;
    const uid = user.uid, label = QUICK_LABELS[kind], money = rupiah(result.amount), date = result.date;
    let task: Promise<unknown>, detail = '';
    try {
      if (kind === 'debt_new') { task = createDebt(uid, { name: name.trim(), provider: person.trim(), originalAmount: result.amount, dueDate: '', interestRate: 0, installmentAmount: 0, notes: '' }, walletId || undefined, date); detail = [person && `dari ${person}`, walletId && `masuk ke ${walletName(walletId)}`].filter(Boolean).join(' · '); }
      else if (kind === 'receivable_new') { task = createReceivable(uid, { person: person.trim(), description: description.trim(), originalAmount: result.amount, sourceWalletId: walletId || '', date, dueDate: '', status: 'open' }); detail = [person, description, walletId && `dari ${walletName(walletId)}`].filter(Boolean).join(' · '); }
      else if (kind === 'claim_new') { task = createClaim(uid, { name: name.trim(), amount: result.amount, sourceWalletId: walletId, submissionDate: date, expectedPaymentDate: '', paidDate: '', status: 'submitted', description: '', notes: '' }); detail = `${name} · dari ${walletName(walletId)}`; }
      else if (kind === 'wish') { const item = data.wishlist.find(w => w.id === linkId)!; task = saveWish(uid, { saved: (item.saved || 0) + result.amount, history: [...(item.history || []), { date, amount: result.amount }].slice(-60) }, item.id); detail = item.name; }
      else {
        const tx = newTx({ ...preset(), type: result.preset.type!, amount: result.amount, walletId, date, time: date === today ? timeInTimeZone(profile?.timeZone) : '' } as Partial<LedgerTx> & Pick<LedgerTx, 'type' | 'amount' | 'walletId'>);
        validateTx(tx);
        task = upsertTransaction(uid, tx);
        detail = [tx.description || tx.merchant, category?.name, kind === 'transfer' || kind === 'target' ? `${walletName(walletId)} → ${walletName(destination)}` : walletName(walletId)].filter(Boolean).join(' · ');
      }
    } catch (e) { setError((e as Error).message); return; }
    const retryPreset = preset();
    track(task, { pending: `Menyimpan ${label.toLowerCase()}…`, success: `${label} ${money} tersimpan.`, detail, failure: `${label} belum tersimpan`, retry: txKinds.has(kind) ? { label: 'Buka formulir', run: () => onOpenForm(retryPreset) } : undefined });
    setText(''); setMode('auto'); onDone?.();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!result) { if (text.trim()) setError('Sebutkan nominalnya, misalnya "beli pocari 8rb di alfa".'); return; }
    if (!missing) save(); else if (txKinds.has(result.kind)) openForm();
  }

  const activeGroup = mode === 'auto' ? 'auto' : mode in QUICK_LABELS ? groupOf(mode as QuickKind) : mode;
  const detected = kind ? groupOf(kind) : null;
  const Icon = kind ? icons[kind] : Sparkles;
  const other = kind ? sibling[kind] : undefined;
  const hasOther = other && (other !== 'wish' || data.wishlist.some(w => w.status === 'active')) && (other !== 'target' || data.funds.some(f => !f.isArchived));
  const tone = kind && toneOf(kind);

  return <div className="quick-entry-wrap">
    <form className="quick-entry" onSubmit={submit}>
      <span className="quick-entry-icon" aria-hidden="true"><Sparkles size={16}/></span>
      <input value={text} onChange={e => { setText(e.target.value); setError(''); }} placeholder="Tulis transaksimu di sini…" aria-label="Tulis transaksi dalam satu kalimat" autoFocus={autoFocus} enterKeyHint="go" autoComplete="off"/>
      <button type="submit" aria-label={result && !missing ? 'Simpan' : 'Lanjut'} disabled={!text.trim()}><ArrowRight size={17}/></button>
    </form>
    <div className="quick-groups" role="radiogroup" aria-label="Jenis catatan">{QUICK_GROUPS.map(([key, label]) => <button type="button" role="radio" aria-checked={activeGroup === key} key={key} className={`${activeGroup === key ? 'active' : ''} ${mode === 'auto' && detected === key ? 'is-detected' : ''}`} onClick={() => setMode(key)}>{label}</button>)}</div>
    {!text.trim() && <div className="quick-examples"><span className="qe-title">Ketuk contoh untuk mencoba</span>{(examples[activeGroup as QuickGroup] || examples.auto).map(example => { const ExampleIcon = icons[example.kind]; return <button type="button" key={example.text} className={`qe-item tone-${toneOf(example.kind)}`} onClick={() => setText(example.text)}><span className="qe-icon" aria-hidden="true"><ExampleIcon size={16}/></span><span className="qe-text"><strong>“{example.text}”</strong><small><b>{QUICK_LABELS[example.kind]}</b> · {example.result}</small></span><ArrowUpLeft size={15} className="qe-go" aria-hidden="true"/></button>; })}</div>}
    {text.trim() && !result && <small className="quick-entry-hint" role="alert">{error || 'Tambahkan nominalnya, misalnya 8rb, 25k, atau 1,5jt.'}</small>}
    {result && kind && <div className={`quick-preview tone-${tone}`}>
      <div className="qp-head"><span className="qp-icon" aria-hidden="true"><Icon size={18}/></span><span className="qp-title"><small>{QUICK_LABELS[kind]}</small><strong>{rupiah(result.amount)}</strong></span>{hasOther && other && <button type="button" className="qp-switch" onClick={() => setMode(other)}><small>Bukan ini?</small>{QUICK_LABELS[other]}</button>}</div>
      <div className="qp-facts">
        {(kind === 'expense' || kind === 'income') && <>{result.preset.description && <span>{result.preset.description}</span>}{result.preset.merchant && <span>{result.preset.merchant}</span>}{category ? <span className="qp-cat">{category.name}</span> : kind === 'expense' && <span className="qp-missing">Tanpa kategori</span>}</>}
        {kind === 'transfer' && <span>{walletName(walletId) || '?'} → {walletName(destination) || '?'}</span>}
        <span>{result.date === today ? 'Hari ini' : formatDate(result.date, false)}</span>
      </div>
      <div className="qp-fields">
        {(kind === 'debt_new' || kind === 'receivable_new') && <label className="qp-field"><span>{kind === 'debt_new' ? 'Dipinjam dari' : 'Dipinjam oleh'}</span><Input value={person} onChange={e => setEdit(v => ({ ...v, person: e.target.value }))} placeholder="Nama orang"/></label>}
        {(kind === 'debt_new' || kind === 'claim_new') && <label className="qp-field"><span>{kind === 'debt_new' ? 'Nama utang' : 'Nama klaim'}</span><Input value={name} onChange={e => setEdit(v => ({ ...v, name: e.target.value }))}/></label>}
        {kind === 'receivable_new' && <label className="qp-field"><span>Keperluan</span><Input value={description} onChange={e => setEdit(v => ({ ...v, description: e.target.value }))} placeholder="Opsional, mis. makan siang"/></label>}
        {linkOptions.length > 0 && <label className="qp-field"><span>{kind === 'debt_payment' ? 'Utang' : kind === 'receivable_payment' ? 'Piutang' : kind === 'claim_payment' ? 'Klaim' : kind === 'wish' ? 'Wish list' : 'Target'}</span><Select value={linkId} onChange={e => setEdit(v => ({ ...v, linkId: e.target.value }))}><option value="">Pilih…</option>{linkOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</Select></label>}
        {kind !== 'wish' && <label className="qp-field"><span>{kind === 'debt_new' ? 'Uangnya masuk ke' : kind === 'receivable_new' ? 'Uangnya keluar dari' : kind && incoming.has(kind) ? 'Masuk ke dompet' : 'Dari dompet'}</span><Select value={walletId} onChange={e => setEdit(v => ({ ...v, walletId: e.target.value }))}>{(kind === 'debt_new' || kind === 'receivable_new') ? <option value="">Tanpa dompet (saldo tidak berubah)</option> : <option value="">Pilih dompet</option>}{choices.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance)}</option>)}</Select></label>}
        {kind === 'target' && fund && <small className="qp-note">Masuk ke {walletName(destination) || 'dompet target'}</small>}
      </div>
      {(missing || error) && <small className="qp-warn" role="status">{error || missing}</small>}
      <div className="qp-actions">{txKinds.has(kind) && <Button type="button" variant="secondary" onClick={openForm}>Ubah detail</Button>}<Button type="button" onClick={save} disabled={Boolean(missing)}>Sesuai, simpan</Button></div>
    </div>}
  </div>;
}
