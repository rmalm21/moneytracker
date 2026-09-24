'use client';
import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, CarFront, Coffee, Coins, HandCoins, Pencil, Plus, Receipt, ShieldCheck, ShoppingBasket, Star, Trash2, TrendingDown, TrendingUp, UtensilsCrossed, Wallet } from 'lucide-react';
import { useApp } from './app-provider';
import { Field, Input, Money, Select } from './fields';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { saveProfile } from '@/lib/firestore';
import { rupiah } from '@/lib/accounting';
import type { LedgerTx, QuickAction } from '@/lib/types';

const defaults: QuickAction[] = [
  { id: 'expense', label: 'Pengeluaran', kind: 'expense' },
  { id: 'income', label: 'Pemasukan', kind: 'income' },
  { id: 'transfer', label: 'Transfer', kind: 'transfer' },
  { id: 'claims', label: 'Klaim kantor', kind: 'claims' },
  { id: 'receivables', label: 'Piutang', kind: 'receivables' },
  { id: 'debts', label: 'Utang', kind: 'debts' },
];
/** Old built-in food shortcuts, hidden unless the user changed them into their own. */
const legacy: Record<string, [string, number]> = { breakfast: ['Sarapan', 15000], lunch: ['Makan siang', 25000], snack: ['Jajan', 15000] };
const isLegacy = (action: QuickAction) => legacy[action.id]?.[0] === action.label && legacy[action.id]?.[1] === action.amount && !action.categoryId && !action.walletId;
const kindLabels: Record<QuickAction['kind'], string> = { expense: 'Pengeluaran', income: 'Pemasukan', transfer: 'Transfer dompet', claims: 'Klaim kantor', receivables: 'Piutang', debts: 'Utang' };
const icons = { expense: TrendingDown, income: TrendingUp, transfer: ArrowLeftRight, claims: ShieldCheck, receivables: HandCoins, debts: Coins };
const customIcons = { coffee: Coffee, food: UtensilsCrossed, shopping: ShoppingBasket, transport: CarFront, bill: Receipt, wallet: Wallet, star: Star };
const transactionKinds: QuickAction['kind'][] = ['expense', 'income', 'transfer'];
function isTransactionKind(kind: QuickAction['kind']): kind is 'expense' | 'income' | 'transfer' { return transactionKinds.includes(kind); }

export function QuickActions({ openTx, navigate, notify }: { openTx: (preset?: Partial<LedgerTx>) => void; navigate: (view: string) => void; notify: (message: string) => void }) {
  const { user, profile, data } = useApp();
  const [open, setOpen] = useState(false);
  const [actions, setActions] = useState<QuickAction[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<QuickAction>({ id: '', label: '', kind: 'expense' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const visible = (profile?.quickActions ?? defaults).filter(action => !isLegacy(action));

  function start() { setActions(visible.map(action => ({ ...action }))); setEditing(null); setError(''); setOpen(true); }
  function close(next: boolean) { setOpen(next); if (!next) setEditing(null); }
  function launch(action: QuickAction) {
    if (!isTransactionKind(action.kind)) { navigate(action.kind); return; }
    const categoryId = data.categories.some(category => category.id === action.categoryId && !category.isArchived) ? action.categoryId : undefined;
    const walletId = data.wallets.some(wallet => wallet.id === action.walletId && !wallet.isArchived) ? action.walletId : undefined;
    const subcategoryId = data.categories.some(category => category.id === action.subcategoryId && !category.isArchived && category.parentId === categoryId) ? action.subcategoryId : undefined;
    openTx({ type: action.kind, amount: action.amount, description: action.description, categoryId, subcategoryId, walletId });
  }
  function edit(index: number) { setEditing(index); setDraft(index < 0 ? { id: crypto.randomUUID(), label: '', kind: 'expense' } : { ...actions[index] }); setError(''); }
  function apply(event: FormEvent) {
    event.preventDefault();
    const label = draft.label.trim();
    if (!label) { setError('Isi nama tombol terlebih dahulu.'); return; }
    if (draft.amount && (!Number.isSafeInteger(draft.amount) || draft.amount < 0)) { setError('Nominal pintasan harus berupa Rupiah yang valid.'); return; }
    const description = draft.description?.trim();
    const updated: QuickAction = {
      id: draft.id, label, kind: draft.kind, icon: draft.icon || 'default',
      ...(transactionKinds.includes(draft.kind) && draft.amount ? { amount: draft.amount } : {}),
      ...(transactionKinds.includes(draft.kind) && description ? { description } : {}),
      ...(draft.kind !== 'transfer' && transactionKinds.includes(draft.kind) && draft.categoryId ? { categoryId: draft.categoryId } : {}),
      ...(draft.kind !== 'transfer' && transactionKinds.includes(draft.kind) && draft.subcategoryId ? { subcategoryId: draft.subcategoryId } : {}),
      ...(transactionKinds.includes(draft.kind) && draft.walletId ? { walletId: draft.walletId } : {}),
    };
    setActions(current => editing === -1 ? [...current, updated] : current.map((action, index) => index === editing ? updated : action));
    setEditing(null);
    setError('');
  }
  function shift(index: number, direction: -1 | 1) {
    setActions(current => { const next = [...current]; [next[index], next[index + direction]] = [next[index + direction], next[index]]; return next; });
  }
  async function save() {
    if (!user) return;
    setSaving(true); setError('');
    try { await saveProfile(user.uid, { quickActions: actions }); setOpen(false); notify('Catat cepat diperbarui.'); }
    catch (cause) { setError((cause as Error).message || 'Pintasan belum tersimpan.'); }
    finally { setSaving(false); }
  }

  return <>
    <div className="section-heading"><div><h2>Catat cepat</h2><p>Pilih pintasan untuk langsung mengisi transaksi.</p></div><Button variant="secondary" className="small" onClick={start}><Pencil size={15}/> Atur tombol</Button></div>
    <div className="quick-row">{visible.map(action => { const Icon = action.icon && action.icon !== 'default' ? customIcons[action.icon] : icons[action.kind]; return <button key={action.id} className="quick-action" onClick={() => launch(action)}><Icon size={16}/><span>{action.label}</span>{action.amount ? <small>{rupiah(action.amount)}</small> : null}</button>; })}{visible.length === 0 && <p className="muted">Belum ada tombol. Klik “Atur tombol” untuk menambahkannya.</p>}</div>
    <Dialog open={open} onOpenChange={close}><DialogContent title="Atur Catat cepat" className="quick-dialog">
      {editing === null ? <>
        <p className="muted">Ubah nama, jenis, nominal, dan urutan pintasan. Perubahan tersimpan untuk akunmu setelah menekan Simpan.</p>
        <div className="quick-editor-list">{actions.map((action, index) => <div className="quick-editor-item" key={action.id}><div className="quick-editor-name"><strong>{action.label}</strong><small>{kindLabels[action.kind]}{action.amount ? ` · ${rupiah(action.amount)}` : ''}</small></div><div className="row-actions"><button type="button" className="icon-btn" aria-label={`Naikkan ${action.label}`} title="Naik" disabled={index === 0} onClick={() => shift(index, -1)}><ArrowUp size={16}/></button><button type="button" className="icon-btn" aria-label={`Turunkan ${action.label}`} title="Turun" disabled={index === actions.length - 1} onClick={() => shift(index, 1)}><ArrowDown size={16}/></button><button type="button" className="icon-btn" aria-label={`Edit ${action.label}`} title="Edit" onClick={() => edit(index)}><Pencil size={16}/></button><button type="button" className="icon-btn" aria-label={`Hapus ${action.label}`} title="Hapus" onClick={() => setActions(current => current.filter((_, position) => position !== index))}><Trash2 size={16}/></button></div></div>)}</div>
        <div className="quick-editor-footer"><Button variant="secondary" disabled={actions.length >= 12} onClick={() => edit(-1)}><Plus size={16}/> Tambah pintasan</Button><button type="button" className="link-button" onClick={() => setActions(defaults.map(item => ({ ...item })))}>Kembalikan bawaan</button></div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button><Button disabled={saving} onClick={() => void save()}>{saving ? 'Menyimpan…' : 'Simpan pintasan'}</Button></div>
      </> : <form className="form-stack" onSubmit={apply}>
        <Field label="Nama tombol"><Input required maxLength={32} autoFocus value={draft.label} onChange={event => setDraft(previous => ({ ...previous, label: event.target.value }))} placeholder="Contoh: Kopi sore"/></Field>
        <Field label="Tindakan"><Select value={draft.kind} onChange={event => setDraft(previous => ({ ...previous, kind: event.target.value as QuickAction['kind'], amount: undefined, description: undefined, categoryId: undefined }))}>{Object.entries(kindLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}</Select></Field>
        <Field label="Ikon tombol"><Select value={draft.icon || 'default'} onChange={event => setDraft(previous => ({ ...previous, icon: event.target.value as QuickAction['icon'] }))}><option value="default">Ikon sesuai tindakan</option><option value="coffee">Kopi</option><option value="food">Makanan</option><option value="shopping">Belanja</option><option value="transport">Transportasi</option><option value="bill">Tagihan</option><option value="wallet">Dompet</option><option value="star">Bintang</option></Select></Field>
        {transactionKinds.includes(draft.kind) && <><Field label="Nominal awal (opsional)"><Money value={draft.amount || 0} onChange={amount => setDraft(previous => ({ ...previous, amount }))}/></Field><Field label="Keterangan awal (opsional)"><Input maxLength={100} value={draft.description || ''} onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))} placeholder="Terisi otomatis saat dibuka"/></Field><Field label="Dompet awal (opsional)"><Select value={draft.walletId || ''} onChange={event => setDraft(previous => ({ ...previous, walletId: event.target.value }))}><option value="">Pakai dompet bawaan</option>{data.wallets.filter(wallet => !wallet.isArchived).map(wallet => <option key={wallet.id} value={wallet.id}>{wallet.name}</option>)}</Select></Field>{draft.kind !== 'transfer' && <><Field label="Kategori awal (opsional)"><Select value={draft.categoryId || ''} onChange={event => setDraft(previous => ({ ...previous, categoryId: event.target.value, subcategoryId: undefined }))}><option value="">Pilih nanti saat mencatat</option>{data.categories.filter(category => !category.isArchived && !category.parentId && category.type === draft.kind).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>{draft.categoryId && <Field label="Subkategori awal (opsional)"><Select value={draft.subcategoryId || ''} onChange={event => setDraft(previous => ({ ...previous, subcategoryId: event.target.value }))}><option value="">Tanpa subkategori</option>{data.categories.filter(category => !category.isArchived && category.parentId === draft.categoryId).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</Select></Field>}</>}</>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => { setEditing(null); setError(''); }}>Kembali</Button><Button type="submit">Terapkan tombol</Button></div>
      </form>}
    </DialogContent></Dialog>
  </>;
}
