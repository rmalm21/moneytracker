'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Camera, ChevronRight, Copy, Edit3, Image as ImageIcon, ListFilter, MessageCircle, MoreHorizontal, Plus, ReceiptText, Search, Share2, SlidersHorizontal, Trash2, Undo2, Users, WalletCards, X } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Confirm } from './ui/alert-dialog';
import { Empty, Field, Input, Money, Select } from './fields';
import { Emoji } from './emoji';
import { EmojiSearchButton } from './visual-identity';
import { ContextNotes } from './context-notes';
import { ManualPayments, SettleDialog, type SettleTarget } from './settle-dialog';
import { closeMenu } from './glass';
import { SplitFlow, type FlowStart } from './split-bill-flow';
import { takeReceiptHandoff } from './receipt-scan';
import { PersonAvatar, copyText, openWhatsApp, personName, personTone, renderShareImage, shareImage, shareText, statusTone } from './split-bill-shared';
import { BILL_STATUS_LABELS, billProgress, billShareText, computeSplit, EXTRA_LABELS, METHOD_LABELS, PERSON_STATUS_LABELS, personShareText, reminderText, type BillProgress, type PersonProgress, type SplitResult } from '@/lib/split-bill';
import { cancelSplitBill, deleteSplitBill, deleteSplitGroup, deleteSplitPerson, readTransaction, recordBetweenPayment, removeSplitReceipt, saveSplitGroup, saveSplitPerson, splitReceiptUrl, subscribeSplitBills, subscribeSplitContacts, undoBetweenPayment } from '@/lib/split-bill-store';
import { deleteTransaction, subscribeRelatedTransactions } from '@/lib/firestore';
import { rupiah } from '@/lib/accounting';
import { formatDate, todayInTimeZone } from '@/lib/period';
import type { LedgerTx, SplitBill, SplitGroup, SplitPerson } from '@/lib/types';

/**
 * Split Bill: shared bills and who still owes what. The list shows open bills first; details, payments and sharing
 * open on demand. Bills are read from the device copy only while this page is open.
 */
type Props = { notify: (message: string) => void; openTx: (preset?: Partial<LedgerTx>, editing?: LedgerTx) => void; navigate: (key: string, target?: string) => void; focus?: string };
type Tab = 'open' | 'done' | 'all';
type Filter = { status: '' | 'draft' | 'active' | 'partial' | 'settled' | 'cancelled'; period: 'all' | '30' | '90' | 'year'; person: string; group: string; payer: '' | 'me' | 'other' };
const noFilter: Filter = { status: '', period: 'all', person: '', group: '', payer: '' };
const PAGE = 15;
const dayBefore = (today: string, days: number) => { const date = new Date(`${today}T12:00:00`); date.setDate(date.getDate() - days); return date.toLocaleDateString('en-CA'); };

export function SplitBillView({ notify, navigate, focus }: Props) {
  const { user, data, profile } = useApp();
  const [bills, setBills] = useState<SplitBill[] | null>(null), [contacts, setContacts] = useState<{ people: SplitPerson[]; groups: SplitGroup[] }>({ people: [], groups: [] }), [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('open'), [search, setSearch] = useState(''), [filter, setFilter] = useState<Filter>(noFilter), [filterOpen, setFilterOpen] = useState(false), [limit, setLimit] = useState(PAGE);
  const [flow, setFlow] = useState<FlowStart | null>(null), [openId, setOpenId] = useState(''), [chooser, setChooser] = useState(false), [picker, setPicker] = useState(false), [peopleOpen, setPeopleOpen] = useState(false);
  const today = todayInTimeZone(profile?.timeZone);
  useEffect(() => { if (!user) return; return subscribeSplitBills(user.uid, setBills, e => setError(e.message)); }, [user?.uid]);
  useEffect(() => { if (!user) return; return subscribeSplitContacts(user.uid, setContacts, e => setError(e.message)); }, [user?.uid]);
  // Links from other pages: "new", "manual", "receipt", "tx:<id>" (a transaction to split), "bill:<id>".
  const [handled, setHandled] = useState('');
  useEffect(() => {
    if (!focus || focus === handled || !user || bills === null) return;
    setHandled(focus);
    if (focus === 'new') setChooser(true);
    else if (focus === 'manual' || focus === 'receipt') setFlow({ mode: focus });
    else if (focus === 'receipt-draft') { const handed = takeReceiptHandoff(); setFlow(handed ? { mode: 'receipt', receipt: handed.receipt, photo: handed.photo } : { mode: 'receipt' }); }
    else if (focus.startsWith('bill:')) setOpenId(focus.slice(5));
    else if (focus.startsWith('tx:')) void fromTransaction(focus.slice(3));
  }, [focus, handled, user?.uid, bills]);
  async function fromTransaction(id: string) {
    if (!user) return;
    const linked = (bills || []).find(bill => bill.transactionId === id && bill.status !== 'cancelled');
    if (linked) { setOpenId(linked.id); notify(linked.status === 'draft' ? 'Transaksi ini sudah punya draft Split Bill.' : 'Transaksi ini sudah menjadi Split Bill.'); return; }
    try {
      const tx = data.transactions.find(row => row.id === id) || await readTransaction(user.uid, id);
      if (!tx) { notify('Transaksi tidak ditemukan.'); return; }
      if (tx.type !== 'expense' || !tx.walletId) { notify('Hanya pengeluaran dari dompet yang bisa dijadikan Split Bill.'); return; }
      if (tx.splitBillId) { setOpenId(tx.splitBillId); return; }
      setFlow({ mode: 'transaction', tx });
    } catch (e) { setError((e as Error).message); }
  }

  const progress = useMemo(() => new Map((bills || []).map(bill => [bill.id, billProgress(bill, data.receivables, data.debts)])), [bills, data.receivables, data.debts]);
  const totals = useMemo(() => {
    let toMe = 0, fromMe = 0; const waiting = new Set<string>();
    for (const bill of bills || []) { const state = progress.get(bill.id); if (!state || bill.status !== 'active') continue; toMe += state.toMe; fromMe += state.fromMe; if (bill.payer === 'me') for (const person of state.people) if (person.role === 'receivable' && person.remaining > 0) waiting.add(person.name.toLocaleLowerCase('id-ID')); }
    return { toMe, fromMe, waiting: waiting.size };
  }, [bills, progress]);
  const personNames = useMemo(() => [...new Set((bills || []).flatMap(bill => bill.participants.filter(person => !person.isMe).map(person => person.name.trim())))].sort((a, b) => a.localeCompare(b, 'id')), [bills]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('id-ID');
    const since = filter.period === '30' ? dayBefore(today, 30) : filter.period === '90' ? dayBefore(today, 90) : filter.period === 'year' ? `${today.slice(0, 4)}-01-01` : '';
    return (bills || []).filter(bill => {
      const state = progress.get(bill.id)!;
      if (tab === 'open' && !['draft', 'active', 'partial'].includes(state.status)) return false;
      if (tab === 'done' && state.status !== 'settled') return false;
      if (filter.status && state.status !== filter.status) return false;
      if (since && bill.date < since) return false;
      if (filter.payer && bill.payer !== filter.payer) return false;
      if (filter.group && bill.groupId !== filter.group) return false;
      if (filter.person && !bill.participants.some(person => person.name.trim() === filter.person)) return false;
      if (!query) return true;
      const group = contacts.groups.find(row => row.id === bill.groupId)?.name || '';
      return [bill.title, bill.merchant, bill.notes, group, ...bill.participants.map(person => person.name), ...(bill.contextNotes || []).map(note => note.text), ...bill.items.map(item => item.name)].join(' ').toLocaleLowerCase('id-ID').includes(query);
    });
  }, [bills, progress, tab, filter, search, today, contacts.groups]);
  useEffect(() => setLimit(PAGE), [tab, filter, search]);
  const activeFilters = Object.entries(filter).filter(([key, value]) => value && !(key === 'period' && value === 'all')).length;
  const opened = (bills || []).find(bill => bill.id === openId);

  return <>
    <div className="page-heading"><div><h1>Split Bill</h1><p>Patungan dan tagihan bersama: siapa bayar berapa, dan siapa yang belum.</p></div><div className="heading-actions"><Button variant="secondary" onClick={() => setPeopleOpen(true)}><Users size={16}/> Orang & grup</Button><Button onClick={() => setChooser(true)}><Plus size={16}/> Buat Split Bill</Button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {bills === null ? <div className="view-skeleton" aria-busy="true" aria-label="Memuat Split Bill"><span/><span/><span/></div>
      : !bills.length ? <div className="panel sb-empty"><span className="sb-empty-icon" aria-hidden="true"><ReceiptText size={26}/></span><h2>Belum ada Split Bill.</h2><p>Patungan makanan, nongkrong, perjalanan, atau kegiatan lainnya bisa dicatat di sini.</p><Button onClick={() => setChooser(true)}><Plus size={16}/> Buat Split Bill</Button></div>
      : <>
        {(totals.toMe > 0 || totals.fromMe > 0) && <div className="sb-summary">
          <button type="button" className="sb-total is-in" onClick={() => { setTab('open'); setFilter({ ...noFilter, payer: 'me' }); }}><small>Belum kembali</small><strong>{rupiah(totals.toMe)}</strong><span>{totals.waiting ? `${totals.waiting} orang belum bayar` : 'Semua sudah bayar'}</span></button>
          <button type="button" className="sb-total is-out" onClick={() => { setTab('open'); setFilter({ ...noFilter, payer: 'other' }); }}><small>Harus dibayar</small><strong>{rupiah(totals.fromMe)}</strong><span>{totals.fromMe ? 'Bagianmu yang dibayari orang lain' : 'Tidak ada'}</span></button>
        </div>}
        <div className="sb-toolbar">
          <div className="hub-tabs sb-tabs" role="tablist" aria-label="Status Split Bill">{([['open', 'Belum lunas'], ['done', 'Lunas'], ['all', 'Semua']] as [Tab, string][]).map(([key, label]) => <button type="button" role="tab" key={key} aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>)}</div>
          <label className="sb-search"><Search size={16} aria-hidden="true"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari tagihan, tempat, orang…" aria-label="Cari Split Bill"/>{search && <button type="button" className="icon-btn" aria-label="Hapus pencarian" onClick={() => setSearch('')}><X size={15}/></button>}</label>
          <button type="button" className={`chip-button ${activeFilters ? 'is-open' : ''}`} onClick={() => setFilterOpen(true)}><SlidersHorizontal size={16}/><span>Filter</span>{activeFilters > 0 && <span className="chip-count">{activeFilters}</span>}</button>
        </div>
        {activeFilters > 0 && <div className="filter-chips sb-filter-chips">{filter.payer && <button type="button" className="filter-chip" onClick={() => setFilter({ ...filter, payer: '' })}>{filter.payer === 'me' ? 'Dibayar kamu' : 'Dibayar orang lain'} <X size={13}/></button>}{filter.status && <button type="button" className="filter-chip" onClick={() => setFilter({ ...filter, status: '' })}>{BILL_STATUS_LABELS[filter.status]} <X size={13}/></button>}{filter.period !== 'all' && <button type="button" className="filter-chip" onClick={() => setFilter({ ...filter, period: 'all' })}>{filter.period === 'year' ? 'Tahun ini' : `${filter.period} hari`} <X size={13}/></button>}{filter.person && <button type="button" className="filter-chip" onClick={() => setFilter({ ...filter, person: '' })}>{filter.person} <X size={13}/></button>}{filter.group && <button type="button" className="filter-chip" onClick={() => setFilter({ ...filter, group: '' })}>{contacts.groups.find(group => group.id === filter.group)?.name || 'Grup'} <X size={13}/></button>}</div>}
        {filtered.length ? <div className="sb-list">{filtered.slice(0, limit).map(bill => <BillRow key={bill.id} bill={bill} state={progress.get(bill.id)!} onOpen={() => setOpenId(bill.id)}/>)}</div>
          : <div className="panel"><Empty message={tab === 'done' ? 'Belum ada Split Bill yang lunas.' : search || activeFilters ? 'Tidak ada Split Bill yang cocok.' : 'Semua Split Bill sudah lunas.'}/></div>}
        {filtered.length > limit && <div className="sb-more-list"><Button variant="secondary" onClick={() => setLimit(n => n + PAGE)}>Tampilkan lebih banyak ({filtered.length - limit})</Button></div>}
      </>}

    <Dialog open={chooser} onOpenChange={setChooser}><DialogContent title="Buat Split Bill" className="sb-chooser-dialog"><div className="sb-chooser">
      <button type="button" onClick={() => { setChooser(false); setPicker(true); }}><span className="sb-chooser-icon"><WalletCards size={22}/></span><span><strong>Dari Transaksi</strong><small>Pengeluaran yang sudah dicatat. Tidak ada transaksi ganda.</small></span><ChevronRight size={18}/></button>
      <button type="button" onClick={() => { setChooser(false); setFlow({ mode: 'receipt' }); }}><span className="sb-chooser-icon"><Camera size={22}/></span><span><strong>Foto Struk</strong><small>Ambil atau unggah foto struk, lalu periksa itemnya.</small></span><ChevronRight size={18}/></button>
      <button type="button" onClick={() => { setChooser(false); setFlow({ mode: 'manual' }); }}><span className="sb-chooser-icon"><ReceiptText size={22}/></span><span><strong>Hitung Manual</strong><small>Isi total, orang, dan cara baginya sendiri.</small></span><ChevronRight size={18}/></button>
    </div></DialogContent></Dialog>
    {picker && <TransactionPicker bills={bills || []} onClose={() => setPicker(false)} onPick={tx => { setPicker(false); setFlow({ mode: 'transaction', tx }); }} onManual={() => { setPicker(false); navigate('transactions'); }}/>}
    {flow && <SplitFlow start={flow} people={contacts.people} groups={contacts.groups} onClose={() => setFlow(null)} onSaved={(id, message) => { setFlow(null); notify(message); setOpenId(id); }}/>}
    {opened && <BillDetail bill={opened} state={progress.get(opened.id)!} notify={notify} onClose={() => setOpenId('')} onEdit={mode => { setOpenId(''); setFlow({ mode, bill: opened }); }} groups={contacts.groups}/>}
    <FilterSheet open={filterOpen} onClose={() => setFilterOpen(false)} value={filter} onChange={setFilter} people={personNames} groups={contacts.groups}/>
    {peopleOpen && <PeopleManager people={contacts.people} groups={contacts.groups} onClose={() => setPeopleOpen(false)} notify={notify}/>}
  </>;
}

function BillRow({ bill, state, onOpen }: { bill: SplitBill; state: BillProgress; onOpen: () => void }) {
  const payer = bill.payer === 'me' ? 'Dibayar kamu' : `Dibayar ${state.payerName || 'orang lain'}`;
  return <button type="button" className={`sb-row ${state.status === 'cancelled' ? 'is-cancelled' : ''}`} onClick={onOpen}>
    <span className="sb-row-icon" aria-hidden="true"><ReceiptText size={19}/></span>
    <span className="sb-row-main"><strong>{bill.title}</strong><small>{formatDate(bill.date, false)} · {payer} · {bill.participants.length} orang</small></span>
    <span className="sb-row-side"><strong>{rupiah(bill.total)}</strong>{state.status === 'active' || state.status === 'partial' ? <small className="sb-left">Sisa {rupiah(state.remaining)}</small> : null}<span className={`gl-pill ${statusTone[state.status]}`}>{BILL_STATUS_LABELS[state.status]}</span></span>
  </button>;
}

/* ------------------------------------------------------------------ Detail */

function BillDetail({ bill, state, notify, onClose, onEdit, groups }: { bill: SplitBill; state: BillProgress; notify: (message: string) => void; onClose: () => void; onEdit: (mode: 'edit' | 'copy') => void; groups: SplitGroup[] }) {
  const { user, data, profile } = useApp();
  const { track } = useNotify();
  const result = useMemo(() => computeSplit(bill), [bill]);
  const [personId, setPersonId] = useState(''), [share, setShare] = useState<{ personId?: string } | null>(null), [photo, setPhoto] = useState(''), [busy, setBusy] = useState(false);
  const wallet = data.wallets.find(w => w.id === bill.walletId);
  const group = groups.find(row => row.id === bill.groupId);
  const person = state.people.find(row => row.id === personId);
  const active = bill.status === 'active';
  const myName = profile?.displayName?.trim() || '';
  async function showPhoto() { if (!bill.receiptPath) return; setBusy(true); try { setPhoto(await splitReceiptUrl(bill.receiptPath)); } catch (e) { notify((e as Error).message || 'Foto struk belum bisa dibuka.'); } finally { setBusy(false); } }
  const counts = [state.counts.paid && `${state.counts.paid} lunas`, state.counts.partial && `${state.counts.partial} sebagian`, state.counts.unpaid && `${state.counts.unpaid} belum bayar`].filter(Boolean).join(' · ');
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Split Bill" className="sb-detail-dialog"><div className="sb-detail">
    <header className="sb-detail-head">
      <div><h2>{bill.title}</h2><small>{formatDate(bill.date)}{bill.time ? ` · ${bill.time}` : ''}{bill.merchant ? ` · ${bill.merchant}` : ''}{group ? ` · ${group.emoji || '👥'} ${group.name}` : ''}</small></div>
      <span className={`gl-pill ${statusTone[state.status]}`}>{BILL_STATUS_LABELS[state.status]}</span>
    </header>
    <div className="sb-detail-total"><div><small>Total</small><strong>{rupiah(bill.total)}</strong></div><div><small>Dibayar oleh</small><strong>{bill.payer === 'me' ? 'Kamu' : state.payerName || '—'}</strong>{bill.payer === 'me' && wallet && <small>dari {wallet.name}</small>}</div></div>
    {bill.status === 'draft' && <div className="notice"><strong>Masih draft.</strong> Belum mengubah dompet, piutang, atau utang. Lanjutkan untuk menyimpannya.</div>}
    {bill.status === 'cancelled' && <div className="notice">Split Bill ini dibatalkan{bill.cancelledAt ? ` pada ${formatDate(bill.cancelledAt)}` : ''}. Piutang, utang, dan transaksi yang dibuatnya sudah dihapus.</div>}
    {active && <p className="sb-counts">{counts || 'Tidak ada yang perlu dibayar.'}{state.remaining > 0 ? ` · sisa ${rupiah(state.remaining)}` : ''}</p>}

    <section className="sb-section"><h3>Pembagian</h3>
      <div className="sb-people-list">{state.people.map(row => { const participant = bill.participants.find(p => p.id === row.id)!; return <button type="button" key={row.id} className="sb-person-row" onClick={() => setPersonId(row.id)}>
        <PersonAvatar person={participant}/><span className="sb-person-main"><strong>{personName(participant)}</strong><small>{row.role === 'payer' ? 'Yang bayar' : row.role === 'debt' ? `Bagianmu, dibayar ke ${state.payerName}` : row.status === 'partial' ? `Sudah bayar ${rupiah(row.paid)}` : row.role === 'between' ? `Bayar ke ${state.payerName}` : row.isMe ? 'Bagianmu' : 'Bayar ke kamu'}</small></span>
        <span className="sb-person-side"><strong>{rupiah(row.share)}</strong>{active && <span className={`gl-pill ${personTone[row.status]}`}>{row.isMe && row.role === 'payer' ? 'Bagianmu' : PERSON_STATUS_LABELS[row.status]}</span>}</span><ChevronRight size={17} aria-hidden="true"/>
      </button>; })}</div>
    </section>

    {active && <section className="sb-section sb-money"><h3>Uangmu</h3>
      {bill.payer === 'me' ? <>
        <div className="budget-line"><span>Keluar dari {wallet?.name || 'dompet'}</span><strong>{rupiah(bill.total)}</strong></div>
        <div className="budget-line"><span>Pengeluaranmu (bagianmu)</span><strong>{rupiah(state.myShare)}</strong></div>
        <div className="budget-line"><span>Ditalangi untuk orang lain</span><strong>{rupiah(state.owed)}</strong></div>
        <div className="budget-line"><span>Sudah kembali</span><strong>{rupiah(state.paid)}</strong></div>
      </> : <>
        <div className="budget-line"><span>Bagianmu (pengeluaran)</span><strong>{rupiah(state.myShare)}</strong></div>
        <div className="budget-line"><span>Sisa utang ke {state.payerName}</span><strong>{rupiah(state.fromMe)}</strong></div>
      </>}
    </section>}

    <details className="sb-section sb-bill-detail"><summary>Detail tagihan <small>{METHOD_LABELS[bill.method]}{bill.items.length ? ` · ${bill.items.length} item` : ''}</small></summary>
      {bill.items.map(item => <div className="budget-line" key={item.id}><span>{item.name}{item.qty > 1 ? ` · ${item.qty} × ${rupiah(item.price)}` : ''}{item.discount ? ` · diskon ${rupiah(item.discount)}` : ''}<small className="sb-takers">{[...new Set([...item.people, ...Object.keys(item.units || {}).filter(id => (item.units?.[id] || 0) > 0), ...Object.keys(item.custom || {}).filter(id => (item.custom?.[id] || 0) > 0)])].map(id => personName(bill.participants.find(p => p.id === id))).join(', ') || 'Belum dibagi'}</small></span><strong>{rupiah(Math.max(0, item.qty * item.price - (item.discount || 0)))}</strong></div>)}
      <div className="budget-line"><span>{bill.items.length ? 'Subtotal' : 'Tagihan sebelum biaya tambahan'}</span><strong>{rupiah(result.subtotal)}</strong></div>
      {result.extras.map(extra => <div className="budget-line" key={extra.id}><span>{extra.label || EXTRA_LABELS[extra.kind]}</span><strong>{extra.amount < 0 ? '−' : ''}{rupiah(Math.abs(extra.amount))}</strong></div>)}
      <div className="budget-line sb-strong"><span>Total</span><strong>{rupiah(result.total)}</strong></div>
      {bill.dueDate && <div className="budget-line"><span>Jatuh tempo</span><strong>{formatDate(bill.dueDate)}</strong></div>}
      {bill.receiptPath && (photo ? <img className="sb-receipt-photo" src={photo} alt={`Foto struk ${bill.title}`}/> : <button type="button" className="link-button" disabled={busy} onClick={() => void showPhoto()}><ImageIcon size={15}/> {busy ? 'Membuka…' : 'Lihat foto struk'}</button>)}
    </details>

    {bill.notes && <p className="legacy-note sb-notes">{bill.notes}</p>}
    {bill.status !== 'draft' && <ContextNotes kind="splitBills" id={bill.id} notes={bill.contextNotes} notify={notify}/>}

    <div className="sb-detail-actions">
      {bill.status === 'draft' ? <Button onClick={() => onEdit('edit')}><Edit3 size={16}/> Lanjutkan</Button> : <Button variant="secondary" onClick={() => setShare({})}><Share2 size={16}/> Bagikan</Button>}
      {active && <Button variant="secondary" onClick={() => onEdit('edit')}><Edit3 size={16}/> Ubah</Button>}
      <details className="more-actions"><summary aria-label="Pilihan lain"><MoreHorizontal size={18}/><span> Lainnya</span></summary><div className="more-menu">
        <button type="button" onClick={e => { closeMenu(e); onEdit('copy'); }}><Copy size={14}/> Salin jadi tagihan baru</button>
        {bill.receiptPath && user && <Confirm title="Hapus foto struk?" description="Hanya fotonya yang dihapus. Tagihan tetap tersimpan." onConfirm={() => track(removeSplitReceipt(user.uid, bill.id, bill.receiptPath!), { pending: 'Menghapus foto…', success: 'Foto struk dihapus.', failure: 'Foto belum terhapus' })}><button type="button" onClick={closeMenu}><Camera size={14}/> Hapus foto struk</button></Confirm>}
        {bill.status !== 'cancelled' && user && <Confirm title="Batalkan Split Bill?" description={state.paid > 0 ? 'Sudah ada pembayaran di tagihan ini, jadi belum bisa dibatalkan. Batalkan pembayarannya dulu dari detail tiap orang. Tidak ada yang dihapus diam-diam.' : bill.status === 'draft' ? 'Draft ini ditandai batal.' : bill.fromTransaction ? 'Piutang/utang dari tagihan ini dihapus. Transaksi aslinya tetap ada dan kembali dihitung penuh sebagai pengeluaranmu.' : 'Piutang/utang dan transaksi yang dibuat tagihan ini dihapus, saldo dompet dikembalikan. Tagihan tetap ada di riwayat sebagai dibatalkan.'} confirmLabel={state.paid > 0 ? 'Mengerti' : 'Ya, batalkan'} onConfirm={() => { if (state.paid > 0) return; track(cancelSplitBill(user.uid, bill.id), { pending: 'Membatalkan Split Bill…', success: 'Split Bill dibatalkan.', failure: 'Split Bill belum dibatalkan' }); }}><button type="button" onClick={closeMenu}><Undo2 size={14}/> Batalkan Split Bill</button></Confirm>}
        {bill.status !== 'active' && user && <Confirm title="Hapus permanen?" description="Tagihan ini hilang dari riwayat. Tidak ada transaksi, piutang, atau utang yang terhubung." confirmLabel="Hapus" onConfirm={() => { onClose(); track(deleteSplitBill(user.uid, bill), { pending: 'Menghapus…', success: 'Split Bill dihapus.', failure: 'Split Bill belum terhapus' }); }}><button type="button" onClick={closeMenu}><Trash2 size={14}/> Hapus permanen</button></Confirm>}
      </div></details>
    </div>
  </div>
  {person && <PersonSheet bill={bill} result={result} person={person} state={state} notify={notify} onClose={() => setPersonId('')} onShare={() => setShare({ personId: person.id })}/>}
  {share && <ShareSheet bill={bill} result={result} state={state} personId={share.personId} myName={myName} notify={notify} onClose={() => setShare(null)}/>}
  </DialogContent></Dialog>;
}

/* ------------------------------------------------------------------ One person */

function PersonSheet({ bill, result, person, state, notify, onClose, onShare }: { bill: SplitBill; result: SplitResult; person: PersonProgress; state: BillProgress; notify: (message: string) => void; onClose: () => void; onShare: () => void }) {
  const { user, data, profile } = useApp();
  const { track } = useNotify();
  const participant = bill.participants.find(row => row.id === person.id)!;
  const lines = result.people.find(row => row.id === person.id)?.lines || [];
  const [ledger, setLedger] = useState<LedgerTx[]>([]), [settle, setSettle] = useState<SettleTarget | null>(null), [between, setBetween] = useState(false), [remind, setRemind] = useState(false);
  const recordId = person.record?.id || '';
  useEffect(() => { if (!user || !recordId || (person.role !== 'receivable' && person.role !== 'debt')) return; return subscribeRelatedTransactions(user.uid, person.role === 'receivable' ? 'receivableId' : 'debtId', recordId, items => setLedger(items.filter(tx => tx.type === (person.role === 'receivable' ? 'receivable_payment' : 'debt_payment'))), () => setLedger([])); }, [user?.uid, recordId, person.role]);
  const active = bill.status === 'active', owes = active && person.role !== 'payer' && person.remaining > 0;
  const recordPayment = () => {
    if (person.role === 'between') { setBetween(true); return; }
    if (!person.record) { notify('Catatan piutang/utangnya tidak ditemukan. Buka Periksa Data.'); return; }
    setSettle({ kind: person.role === 'receivable' ? 'receivables' : 'debts', id: person.record.id, name: person.role === 'debt' ? state.payerName : personName(participant), remaining: person.remaining, split: true });
  };
  const betweenPayments = (bill.payments || []).filter(row => row.participantId === person.id);
  const wallets = new Map(data.wallets.map(w => [w.id, w.name]));
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title={personName(participant)} className="sb-person-dialog"><div className="sb-person-sheet">
    <div className="sb-person-top"><PersonAvatar person={participant} size="lg"/><div><strong>{personName(participant)}</strong><small>{person.role === 'payer' ? (participant.isMe ? 'Kamu yang membayar tagihan ini' : 'Yang membayar tagihan ini') : person.role === 'receivable' ? 'Membayar balik ke kamu' : person.role === 'debt' ? `Bagianmu, dibayar ke ${state.payerName}` : `Membayar ke ${state.payerName}`}</small></div>{active && <span className={`gl-pill ${personTone[person.status]}`}>{PERSON_STATUS_LABELS[person.status]}</span>}</div>
    <div className="sb-sum">
      {lines.map(line => <div className="budget-line" key={line.key}><span>{line.label}</span><strong>{line.amount < 0 ? '−' : ''}{rupiah(Math.abs(line.amount))}</strong></div>)}
      <div className="budget-line sb-strong"><span>Total</span><strong>{rupiah(person.share)}</strong></div>
      {person.role !== 'payer' && <><div className="budget-line"><span>Sudah bayar</span><strong>{rupiah(person.paid)}</strong></div><div className="budget-line"><span>Sisa</span><strong>{rupiah(person.remaining)}</strong></div></>}
    </div>
    <div className="sb-person-actions">
      {owes && <Button onClick={recordPayment}>{person.role === 'debt' ? 'Bayar bagianku' : 'Catat pembayaran'}</Button>}
      {owes && !participant.isMe && <Button variant="secondary" onClick={() => setRemind(true)}><MessageCircle size={16}/> Ingatkan</Button>}
      {!participant.isMe && person.role !== 'payer' && <Button variant="secondary" onClick={onShare}><Share2 size={16}/> Bagikan rincian</Button>}
    </div>
    {person.role !== 'payer' && <section className="sb-section"><h3>Riwayat pembayaran</h3>
      {!ledger.length && !betweenPayments.length && !(person.record?.manualPayments?.length) && <p className="muted">Belum ada pembayaran.</p>}
      {ledger.map(tx => <div className="budget-line" key={tx.id}><span>{formatDate(tx.date)} · {person.role === 'debt' ? 'dari' : 'ke'} {wallets.get(tx.walletId) || 'dompet'}</span><span className="toolbar-row"><strong>{rupiah(tx.amount)}</strong>{user && <Confirm title="Batalkan pembayaran ini?" description={`Saldo ${wallets.get(tx.walletId) || 'dompet'} dan sisa ${person.role === 'debt' ? 'utang' : 'piutang'} dikembalikan seperti sebelum pembayaran ini.`} confirmLabel="Batalkan pembayaran" onConfirm={() => track(deleteTransaction(user.uid, tx.id), { pending: 'Membatalkan pembayaran…', success: 'Pembayaran dibatalkan.', failure: 'Pembayaran belum dibatalkan' })}><button type="button" className="icon-btn" aria-label="Batalkan pembayaran" title="Batalkan"><Undo2 size={15}/></button></Confirm>}</span></div>)}
      {person.record && (person.role === 'receivable' || person.role === 'debt') && <ManualPayments kind={person.role === 'receivable' ? 'receivables' : 'debts'} id={person.record.id} payments={person.record.manualPayments}/>}
      {betweenPayments.map(payment => <div className="budget-line" key={payment.id}><span>{formatDate(payment.date)}{payment.note ? ` · ${payment.note}` : ''}</span><span className="toolbar-row"><strong>{rupiah(payment.amount)}</strong>{user && <Confirm title="Hapus catatan pembayaran ini?" description="Hanya tanda di Split Bill ini yang dihapus; tidak ada saldo dompet yang berubah." confirmLabel="Hapus" onConfirm={() => track(undoBetweenPayment(user.uid, bill.id, payment.id), { pending: 'Menghapus…', success: 'Catatan pembayaran dihapus.', failure: 'Belum terhapus' })}><button type="button" className="icon-btn" aria-label="Hapus catatan pembayaran" title="Hapus"><Undo2 size={15}/></button></Confirm>}</span></div>)}
    </section>}
  </div>
  <SettleDialog target={settle} onClose={() => setSettle(null)}/>
  {between && <BetweenPayment bill={bill} person={person} payerName={state.payerName} onClose={() => setBetween(false)} today={todayInTimeZone(profile?.timeZone)}/>}
  {remind && <ReminderSheet text={reminderText(bill, participant, person.remaining)} notify={notify} onClose={() => setRemind(false)}/>}
  </DialogContent></Dialog>;
}

function BetweenPayment({ bill, person, payerName, today, onClose }: { bill: SplitBill; person: PersonProgress; payerName: string; today: string; onClose: () => void }) {
  const { user } = useApp();
  const { track } = useNotify();
  const [amount, setAmount] = useState(person.remaining), [date, setDate] = useState(today), [note, setNote] = useState(''), [error, setError] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault(); if (!user) return;
    if (!amount || amount > person.remaining) { setError(`Nominal harus antara Rp1 dan ${rupiah(person.remaining)}.`); return; }
    onClose();
    track(recordBetweenPayment(user.uid, bill.id, person.id, amount, date, note), { pending: 'Mencatat…', success: `${person.name} sudah bayar ${rupiah(amount)} ke ${payerName}.`, failure: 'Pembayaran belum tercatat' });
  }
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title={`${person.name} bayar ke ${payerName}`}><form className="form-stack" onSubmit={submit}>
    <p className="muted">Hanya menandai bahwa {person.name} sudah membayar {payerName}. Saldo dompetmu tidak berubah.</p>
    <div className="form-grid"><Field label="Nominal"><Money value={amount} onChange={setAmount} required/></Field><Field label="Tanggal"><Input type="date" value={date} onChange={e => setDate(e.target.value)} required/></Field></div>
    <Field label="Catatan (opsional)"><Input value={note} maxLength={100} onChange={e => setNote(e.target.value)}/></Field>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit">Simpan</Button></div>
  </form></DialogContent></Dialog>;
}

/* ------------------------------------------------------------------ Sharing and reminders (the user sends them) */

function ReminderSheet({ text: initial, notify, onClose }: { text: string; notify: (message: string) => void; onClose: () => void }) {
  const [text, setText] = useState(initial);
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Ingatkan"><div className="form-stack">
    <p className="muted">Ubah kalimatnya bila perlu, lalu kirim sendiri. Dompet Ajaib tidak mengirim pesan apa pun.</p>
    <textarea className="input sb-textarea" rows={4} value={text} onChange={e => setText(e.target.value)} aria-label="Isi pengingat"/>
    <div className="sb-share-actions"><Button variant="secondary" onClick={() => void copyText(text).then(done => notify(done ? 'Teks disalin.' : 'Teks belum bisa disalin.'))}><Copy size={16}/> Salin</Button><Button variant="secondary" onClick={() => openWhatsApp(text)}><MessageCircle size={16}/> WhatsApp</Button><Button onClick={() => void shareText(text, 'Pengingat Split Bill').then(result => { if (result === 'copied') notify('Teks disalin.'); })}><Share2 size={16}/> Bagikan</Button></div>
  </div></DialogContent></Dialog>;
}

function ShareSheet({ bill, result, state, personId, myName, notify, onClose }: { bill: SplitBill; result: SplitResult; state: BillProgress; personId?: string; myName: string; notify: (message: string) => void; onClose: () => void }) {
  const [who, setWho] = useState(personId || ''), [edited, setEdited] = useState<string | null>(null), [imageUrl, setImageUrl] = useState(''), [busy, setBusy] = useState(false);
  const person = state.people.find(row => row.id === who);
  const text = edited ?? (who ? personShareText(bill, result, who, { myName, remaining: person?.role !== 'payer' ? person?.remaining : undefined }) : billShareText(bill, result, { myName, progress: bill.status === 'active' ? state : undefined }));
  useEffect(() => { setEdited(null); setImageUrl(''); }, [who]);
  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);
  const payer = state.payerName && bill.payer === 'other' ? state.payerName : myName || 'saya';
  async function makeImage() {
    setBusy(true);
    try {
      const share = result.people.find(row => row.id === who);
      const participant = bill.participants.find(row => row.id === who);
      const card = share && participant
        ? { title: bill.title, subtitle: `${formatDate(bill.date, false)}${bill.merchant ? ` · ${bill.merchant}` : ''}`, heading: participant.isMe ? (myName || 'Saya') : participant.name, lines: share.lines.map(line => [line.label, `${line.amount < 0 ? '−' : ''}${rupiah(Math.abs(line.amount))}`] as [string, string]), total: ['Total', rupiah(share.total)] as [string, string], footer: [`Bayar ke: ${bill.payer === 'me' ? (myName || 'saya') : state.payerName}`, ...(person && person.role !== 'payer' && person.remaining !== share.total ? [person.remaining > 0 ? `Sisa: ${rupiah(person.remaining)}` : 'Sudah lunas'] : [])] }
        : { title: `Split Bill — ${bill.title}`, subtitle: `${formatDate(bill.date, false)}${bill.merchant ? ` · ${bill.merchant}` : ''}`, heading: 'Pembagian', lines: result.people.map(row => [personName(bill.participants.find(p => p.id === row.id)).replace(/^Kamu$/, myName || 'Saya'), rupiah(row.total)] as [string, string]), total: ['Total', rupiah(result.total)] as [string, string], footer: [`Bayar ke: ${payer}`] };
      const blob = await renderShareImage(card);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(URL.createObjectURL(blob));
      const outcome = await shareImage(blob, `split-bill-${bill.title}${participantName(bill, who)}`);
      if (outcome === 'saved') notify('Gambar disimpan.');
    } catch (e) { notify((e as Error).message || 'Gambar belum bisa dibuat.'); }
    finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Bagikan" className="sb-share-dialog"><div className="form-stack">
    <Field label="Untuk"><Select value={who} onChange={e => setWho(e.target.value)}><option value="">Semua orang (ringkasan)</option>{bill.participants.map(row => <option key={row.id} value={row.id}>{row.isMe ? `${myName || 'Saya'} (kamu)` : row.name}</option>)}</Select></Field>
    <textarea className="input sb-textarea" rows={10} value={text} onChange={e => setEdited(e.target.value)} aria-label="Teks yang dibagikan"/>
    <small className="muted">Hanya berisi tagihan ini. Saldo dompet dan data keuangan lain tidak ikut. Tidak ada tautan publik yang dibuat.</small>
    {imageUrl && <img className="sb-share-preview" src={imageUrl} alt="Pratinjau gambar"/>}
    <div className="sb-share-actions"><Button variant="secondary" onClick={() => void copyText(text).then(done => notify(done ? 'Teks disalin.' : 'Teks belum bisa disalin.'))}><Copy size={16}/> Salin</Button><Button variant="secondary" onClick={() => openWhatsApp(text)}><MessageCircle size={16}/> WhatsApp</Button><Button variant="secondary" disabled={busy} onClick={() => void makeImage()}><ImageIcon size={16}/> {busy ? 'Membuat…' : 'Gambar'}</Button><Button onClick={() => void shareText(text).then(outcome => { if (outcome === 'copied') notify('Teks disalin.'); })}><Share2 size={16}/> Bagikan</Button></div>
  </div></DialogContent></Dialog>;
}
const participantName = (bill: SplitBill, id: string) => { const person = bill.participants.find(row => row.id === id); return person && !person.isMe ? `-${person.name}` : ''; };

/* ------------------------------------------------------------------ Filter, transaction picker, people & groups */

function FilterSheet({ open, onClose, value, onChange, people, groups }: { open: boolean; onClose: () => void; value: Filter; onChange: (value: Filter) => void; people: string[]; groups: SplitGroup[] }) {
  const set = (changes: Partial<Filter>) => onChange({ ...value, ...changes });
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Filter Split Bill"><div className="form-stack">
    <Field label="Status"><Select value={value.status} onChange={e => set({ status: e.target.value as Filter['status'] })}><option value="">Semua status</option>{(['draft', 'active', 'partial', 'settled', 'cancelled'] as const).map(key => <option key={key} value={key}>{BILL_STATUS_LABELS[key]}</option>)}</Select></Field>
    <Field label="Tanggal"><Select value={value.period} onChange={e => set({ period: e.target.value as Filter['period'] })}><option value="all">Semua tanggal</option><option value="30">30 hari terakhir</option><option value="90">90 hari terakhir</option><option value="year">Tahun ini</option></Select></Field>
    <Field label="Yang bayar"><Select value={value.payer} onChange={e => set({ payer: e.target.value as Filter['payer'] })}><option value="">Siapa saja</option><option value="me">Kamu</option><option value="other">Orang lain</option></Select></Field>
    {people.length > 0 && <Field label="Orang"><Select value={value.person} onChange={e => set({ person: e.target.value })}><option value="">Semua orang</option>{people.map(name => <option key={name} value={name}>{name}</option>)}</Select></Field>}
    {groups.length > 0 && <Field label="Grup"><Select value={value.group} onChange={e => set({ group: e.target.value })}><option value="">Semua grup</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</Select></Field>}
    <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => onChange(noFilter)}>Hapus filter</Button><Button type="button" onClick={onClose}>Terapkan</Button></div>
  </div></DialogContent></Dialog>;
}

function TransactionPicker({ bills, onPick, onClose, onManual }: { bills: SplitBill[]; onPick: (tx: LedgerTx) => void; onClose: () => void; onManual: () => void }) {
  const { data } = useApp();
  const [query, setQuery] = useState('');
  const used = new Set(bills.filter(bill => bill.status !== 'cancelled').map(bill => bill.transactionId).filter(Boolean));
  const wallets = new Map(data.wallets.map(w => [w.id, w.name]));
  const list = data.transactions.filter(tx => tx.type === 'expense' && tx.walletId && !tx.splitBillId && !used.has(tx.id)).filter(tx => !query.trim() || `${tx.description} ${tx.merchant} ${tx.amount}`.toLocaleLowerCase('id-ID').includes(query.trim().toLocaleLowerCase('id-ID'))).slice(0, 40);
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Pilih transaksi" className="sb-picker-dialog"><div className="form-stack">
    <label className="sb-search"><Search size={16} aria-hidden="true"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari pengeluaran…" aria-label="Cari transaksi"/></label>
    {list.length ? <div className="sb-picker">{list.map(tx => <button type="button" key={tx.id} onClick={() => onPick(tx)}><span className="sb-row-main"><strong>{tx.description || tx.merchant || 'Pengeluaran'}</strong><small>{formatDate(tx.date, false)} · {wallets.get(tx.walletId) || 'Dompet'}{tx.merchant && tx.description ? ` · ${tx.merchant}` : ''}</small></span><strong>{rupiah(tx.amount)}</strong></button>)}</div> : <Empty message="Tidak ada pengeluaran terbaru yang bisa dibagi."/>}
    <small className="muted">Transaksi lama: buka dari menu Transaksi, ketuk transaksinya, lalu pilih “Split Bill”.</small>
    <button type="button" className="link-button" onClick={onManual}><ListFilter size={15}/> Buka menu Transaksi</button>
  </div></DialogContent></Dialog>;
}

function PeopleManager({ people, groups, onClose, notify }: { people: SplitPerson[]; groups: SplitGroup[]; onClose: () => void; notify: (message: string) => void }) {
  const { user } = useApp();
  const { track } = useNotify();
  const [tab, setTab] = useState<'people' | 'groups'>('people');
  const [person, setPerson] = useState<Partial<SplitPerson> | null>(null), [group, setGroup] = useState<Partial<SplitGroup> | null>(null), [error, setError] = useState('');
  function savePerson(event: FormEvent) {
    event.preventDefault(); if (!user || !person) return;
    if (!person.name?.trim()) { setError('Isi nama orangnya.'); return; }
    const uid = user.uid, record = person;
    setPerson(null); setError('');
    track(saveSplitPerson(uid, { name: record.name!, nickname: record.nickname, emoji: record.emoji, notes: record.notes }, record.id), { pending: 'Menyimpan…', success: record.id ? 'Orang diperbarui.' : 'Orang disimpan.', failure: 'Belum tersimpan' });
  }
  function saveGroup(event: FormEvent) {
    event.preventDefault(); if (!user || !group) return;
    if (!group.name?.trim()) { setError('Isi nama grupnya.'); return; }
    const uid = user.uid, record = group;
    setGroup(null); setError('');
    track(saveSplitGroup(uid, { name: record.name!, emoji: record.emoji, memberIds: record.memberIds || [] }, record.id), { pending: 'Menyimpan…', success: record.id ? 'Grup diperbarui.' : 'Grup disimpan.', failure: 'Belum tersimpan' });
  }
  return <Dialog open onOpenChange={next => { if (!next) onClose(); }}><DialogContent title="Orang & grup" className="sb-people-dialog"><div className="form-stack">
    <div className="ip-seg sb-seg" role="tablist"><button type="button" role="tab" aria-selected={tab === 'people'} className={tab === 'people' ? 'active' : ''} onClick={() => setTab('people')}>Orang tersimpan</button><button type="button" role="tab" aria-selected={tab === 'groups'} className={tab === 'groups' ? 'active' : ''} onClick={() => setTab('groups')}>Grup</button></div>
    {tab === 'people' ? <>
      <p className="muted">Teman yang sering ikut patungan. Mereka tidak perlu punya akun Dompet Ajaib.</p>
      {person ? <form className="form-stack sb-edit" onSubmit={savePerson}>
        <div className="form-grid"><Field label="Nama"><Input autoFocus value={person.name || ''} maxLength={60} onChange={e => setPerson({ ...person, name: e.target.value })}/></Field><Field label="Panggilan (opsional)"><Input value={person.nickname || ''} maxLength={40} onChange={e => setPerson({ ...person, nickname: e.target.value })}/></Field></div>
        <div className="sb-emoji-row"><span className="sb-emoji-now">{person.emoji ? <Emoji e={person.emoji}/> : '—'}</span><EmojiSearchButton value={person.emoji} onPick={emoji => setPerson({ ...person, emoji })} label="Pilih emoji"/>{person.emoji && <button type="button" className="link-button" onClick={() => setPerson({ ...person, emoji: '' })}>Tanpa emoji</button>}</div>
        <Field label="Catatan (opsional)"><Input value={person.notes || ''} maxLength={300} onChange={e => setPerson({ ...person, notes: e.target.value })}/></Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setPerson(null)}>Batal</Button><Button type="submit">Simpan</Button></div>
      </form> : <Button variant="secondary" onClick={() => setPerson({ name: '' })}><Plus size={16}/> Tambah orang</Button>}
      {people.length ? <div className="sb-people-list">{people.map(row => <div className="sb-person-row is-static" key={row.id}><PersonAvatar person={row}/><span className="sb-person-main"><strong>{row.name}</strong>{(row.nickname || row.notes) && <small>{[row.nickname, row.notes].filter(Boolean).join(' · ')}</small>}</span><span className="toolbar-row"><button type="button" className="icon-btn" aria-label={`Ubah ${row.name}`} onClick={() => setPerson(row)}><Edit3 size={15}/></button>{user && <Confirm title={`Hapus ${row.name}?`} description="Tagihan lama tetap memakai namanya. Hanya daftar Orang tersimpan yang berubah." confirmLabel="Hapus" onConfirm={() => track(deleteSplitPerson(user.uid, row.id), { pending: 'Menghapus…', success: 'Orang dihapus.', failure: 'Belum terhapus' })}><button type="button" className="icon-btn" aria-label={`Hapus ${row.name}`}><Trash2 size={15}/></button></Confirm>}</span></div>)}</div> : !person && <Empty message="Belum ada orang tersimpan. Orang yang kamu tambahkan saat membuat Split Bill bisa disimpan di sini."/>}
    </> : <>
      <p className="muted">Pilih grup saat membuat Split Bill, semua anggotanya langsung ikut.</p>
      {group ? <form className="form-stack sb-edit" onSubmit={saveGroup}>
        <Field label="Nama grup"><Input autoFocus value={group.name || ''} maxLength={60} onChange={e => setGroup({ ...group, name: e.target.value })} placeholder="Misalnya Bultang, Kantor, Trip"/></Field>
        <div className="sb-emoji-row"><span className="sb-emoji-now"><Emoji e={group.emoji || '👥'}/></span><div className="sb-chips">{['🏸', '💼', '🏖️', '👥', '🍜', '⚽', '🎮', '🏠'].map(emoji => <button type="button" key={emoji} className={`sb-chip ${group.emoji === emoji ? 'is-on' : ''}`} onClick={() => setGroup({ ...group, emoji })}><Emoji e={emoji}/></button>)}</div><EmojiSearchButton value={group.emoji} onPick={emoji => setGroup({ ...group, emoji })} label="Lainnya"/></div>
        <Field label="Anggota">{people.length ? <div className="sb-chips">{people.map(row => { const on = (group.memberIds || []).includes(row.id); return <button type="button" key={row.id} className={`sb-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => setGroup({ ...group, memberIds: on ? (group.memberIds || []).filter(id => id !== row.id) : [...(group.memberIds || []), row.id] })}><PersonAvatar person={row} size="sm"/><span>{row.name}</span></button>; })}</div> : <p className="muted">Tambahkan orang di tab Orang tersimpan dulu.</p>}</Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setGroup(null)}>Batal</Button><Button type="submit">Simpan</Button></div>
      </form> : <Button variant="secondary" onClick={() => setGroup({ name: '', emoji: '👥', memberIds: [] })}><Plus size={16}/> Buat grup</Button>}
      {groups.length ? <div className="sb-people-list">{groups.map(row => <div className="sb-person-row is-static" key={row.id}><span className="sb-avatar is-md"><Emoji e={row.emoji || '👥'}/></span><span className="sb-person-main"><strong>{row.name}</strong><small>{row.memberIds.map(id => people.find(p => p.id === id)?.name).filter(Boolean).join(', ') || 'Belum ada anggota'}</small></span><span className="toolbar-row"><button type="button" className="icon-btn" aria-label={`Ubah ${row.name}`} onClick={() => setGroup(row)}><Edit3 size={15}/></button>{user && <Confirm title={`Hapus grup ${row.name}?`} description="Orang di dalamnya tetap tersimpan." confirmLabel="Hapus" onConfirm={() => track(deleteSplitGroup(user.uid, row.id), { pending: 'Menghapus…', success: 'Grup dihapus.', failure: 'Belum terhapus' })}><button type="button" className="icon-btn" aria-label={`Hapus ${row.name}`}><Trash2 size={15}/></button></Confirm>}</span></div>)}</div> : !group && <Empty message="Belum ada grup."/>}
    </>}
  </div></DialogContent></Dialog>;
}
