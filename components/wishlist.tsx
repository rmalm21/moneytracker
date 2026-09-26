'use client';
import { useMemo, useState, type CSSProperties } from 'react';
import { Check, ExternalLink, Hourglass, MoreHorizontal, Pencil, Plus, RotateCcw, ShoppingBag, Sparkles, Star, Trash2, Wand2 } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { useUndoDelete } from './undo-delete';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Field, Input, Money, Select } from './fields';
import { Emoji, emojiKey } from './emoji';
import { ReorderHandle, reorder } from './reorder-handle';
import { IconChoice } from './visual-identity';
import { metrics, rupiah } from '@/lib/accounting';
import { availableMoney, committedAmount } from '@/lib/finance-control';
import { deleteWish, saveDisplayOrder, saveWish } from '@/lib/firestore';
import { dateInTimeZone, todayInTimeZone } from '@/lib/period';
import { coolingDays, coolingLeft, daysBetween, eta, monthlyForDate, priorityLabels, progress, readiness, remaining, sortWishes, wishColors, wishEmojis, wishSummary } from '@/lib/wishlist';
import type { LedgerTx, WishItem } from '@/lib/types';

const short = (value: number) => { const n = Math.abs(value); return n >= 1e9 ? `Rp${(n / 1e9).toFixed(1).replace('.', ',')} M` : n >= 1e6 ? `Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `Rp${Math.round(n / 1e3)} rb` : rupiah(value); };
const monthName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
const dayName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const largeEmoji = new Set(wishEmojis.map(emojiKey));
/** Big, sharp emoji for the wish cards (160px artwork), falling back to the normal set. */
function BigEmoji({ e }: { e: string }) {
  const key = emojiKey(e);
  return largeEmoji.has(key) ? <img src={`/emoji/lg/${key}.webp`} alt="" className="wl-emoji-img" draggable={false} decoding="async"/> : <Emoji e={e} className="wl-emoji-img"/>;
}
const ideas: [string, string, number][] = [['🎧', 'Headphone baru', 1_500_000], ['✈️', 'Liburan', 6_000_000], ['📱', 'HP baru', 5_000_000], ['👟', 'Sepatu lari', 1_200_000], ['💻', 'Laptop', 12_000_000]];
type Draft = { name: string; emoji: string; color: string; price: number; saved: number; monthly: number; priority: WishItem['priority']; link: string; notes: string; targetDate: string };
const emptyDraft = (): Draft => ({ name: '', emoji: '🎁', color: wishColors[0], price: 0, saved: 0, monthly: 0, priority: 2, link: '', notes: '', targetDate: '' });
type Sort = 'manual' | 'priority' | 'nearest' | 'cheap' | 'expensive';

export function WishlistView({ openTx }: { openTx: (preset?: Partial<LedgerTx>) => void }) {
  const { data, profile, user, cycle } = useApp();
  const { track } = useNotify();
  const undo = useUndoDelete();
  const today = todayInTimeZone(profile?.timeZone), day = dateInTimeZone(new Date(), profile?.timeZone);
  const income = profile?.monthlySalary || 0;
  const [tab, setTab] = useState<'active' | 'bought'>('active');
  const [sort, setSort] = useState<Sort>(() => { try { return (localStorage.getItem('dompet-ajaib:wish-sort') as Sort) || 'manual'; } catch { return 'manual'; } });
  const [editing, setEditing] = useState<WishItem | null>(null), [formOpen, setFormOpen] = useState(false), [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState<WishItem | null>(null), [amount, setAmount] = useState(0), [takeOut, setTakeOut] = useState(false);
  const [buying, setBuying] = useState<WishItem | null>(null), [record, setRecord] = useState(true);
  const [order, setOrder] = useState<string[] | null>(null);
  const all = data.wishlist || [];
  const summary = wishSummary(all);
  const freeAfterBills = useMemo(() => { const stat = metrics(data, cycle.start, cycle.end, profile?.salaryCycleStartDay, day); return availableMoney(stat.free, committedAmount(data, today, cycle.end, profile || {}), profile || {}); }, [data, cycle.start, cycle.end, profile?.salaryCycleStartDay, profile?.excludeCommittedFromAvailable, profile?.commitmentHorizon, profile?.freeMoneyBuffer, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const active = all.filter(w => w.status === 'active'), bought = all.filter(w => w.status === 'bought').sort((a, b) => (b.boughtDate || '').localeCompare(a.boughtDate || ''));
  const sorted = sortWishes(active, sort, today);
  const shown = tab === 'bought' ? bought : order && sort === 'manual' ? order.map(id => sorted.find(w => w.id === id)).filter((w): w is WishItem => Boolean(w)).concat(sorted.filter(w => !order.includes(w.id))) : sorted;
  const nearest = sortWishes(active.filter(w => remaining(w) > 0), 'nearest', today)[0];
  const nearestEta = nearest && eta(nearest, today);

  function chooseSort(next: Sort) { setSort(next); setOrder(null); try { localStorage.setItem('dompet-ajaib:wish-sort', next); } catch { /* per device */ } }
  function openForm(item?: WishItem, preset?: Partial<Draft>) {
    setEditing(item || null);
    setDraft(item ? { name: item.name, emoji: item.emoji, color: item.color || wishColors[0], price: item.price, saved: item.saved || 0, monthly: item.monthly || 0, priority: item.priority, link: item.link || '', notes: item.notes || '', targetDate: item.targetDate || '' } : { ...emptyDraft(), color: wishColors[active.length % wishColors.length], ...preset });
    setFormOpen(true);
  }
  function submit() {
    if (!user || !draft.name.trim() || draft.price <= 0) return;
    const fields: Partial<WishItem> = { name: draft.name.trim(), emoji: draft.emoji, color: draft.color, price: draft.price, monthly: draft.monthly || 0, priority: draft.priority, link: draft.link.trim(), notes: draft.notes.trim(), targetDate: draft.targetDate || '' };
    if (!editing) Object.assign(fields, { saved: Math.min(draft.saved || 0, draft.price), status: 'active', addedDate: today, sortOrder: all.reduce((n, w) => Math.max(n, (w.sortOrder ?? -1) + 1), 0), history: draft.saved ? [{ date: today, amount: draft.saved }] : [] });
    setFormOpen(false);
    track(saveWish(user.uid, fields, editing?.id), { pending: 'Menyimpan impian…', success: editing ? 'Impian diperbarui.' : `${draft.name.trim()} masuk wish list ✨`, failure: 'Impian belum tersimpan' });
  }
  function addSaving() {
    if (!user || !saving || amount <= 0) return;
    const delta = takeOut ? -Math.min(amount, saving.saved || 0) : Math.min(amount, remaining(saving));
    const next = Math.max(0, (saving.saved || 0) + delta);
    const item = saving; setSaving(null);
    track(saveWish(user.uid, { saved: next, history: [...(item.history || []), { date: today, amount: delta }].slice(-60) }, item.id), { pending: 'Menyimpan…', success: next >= item.price ? `${item.name} terkumpul penuh! 🎉` : takeOut ? 'Sisihan dikurangi.' : `+${short(delta)} untuk ${item.name}`, failure: 'Belum tersimpan' });
  }
  function markBought() {
    if (!user || !buying) return;
    const item = buying; setBuying(null);
    track(saveWish(user.uid, { status: 'bought', boughtDate: today }, item.id), { pending: 'Menyimpan…', success: `Selamat, ${item.name} terbeli! 🎉`, failure: 'Belum tersimpan', after: () => { if (record) openTx({ type: 'expense', amount: item.price, description: item.name, notes: 'Dari wish list' }); } });
  }
  function move(from: string, to: string) {
    if (!user) return;
    const ids = reorder(shown, from, to).map(w => w.id);
    setOrder(ids);
    track(saveDisplayOrder(user.uid, 'wishlist', ids), { pending: 'Menyimpan urutan…', success: 'Urutan disimpan.', failure: 'Urutan belum tersimpan', quiet: true });
  }

  const suggestedMonthly = draft.targetDate && draft.price ? monthlyForDate({ price: draft.price, saved: draft.saved }, draft.targetDate, today) : 0;
  const draftEta = draft.price ? eta({ price: draft.price, saved: draft.saved, monthly: draft.monthly }, today) : null;

  return <div className="wishlist-page">
    <div className="page-heading"><div><h1>Wish list</h1><p>Barang dan pengalaman impianmu. Sisihkan sedikit demi sedikit, lalu beli tanpa rasa bersalah.</p></div><div className="heading-actions"><Button onClick={() => openForm()}><Plus size={16}/> Tambah impian</Button></div></div>

    <section className="wl-hero">
      <div className="wl-hero-main">
        <small>Total impian aktif</small>
        <strong>{short(summary.total)}</strong>
        <div className="wl-hero-bar" role="img" aria-label={`Terkumpul ${Math.round(summary.progress * 100)}%`}><i style={{ width: `${Math.max(2, summary.progress * 100)}%` }}/></div>
        <span>Terkumpul <b>{short(summary.saved)}</b> · {Math.round(summary.progress * 100)}%</span>
      </div>
      <div className="wl-hero-stats">
        <span><small>Impian aktif</small><strong>{summary.count}</strong></span>
        <span><small>Siap dibeli</small><strong>{summary.ready}</strong></span>
        <span><small>Sisihan / bulan</small><strong>{short(summary.monthly)}</strong></span>
      </div>
      {nearest && <p className="wl-hero-next"><Sparkles size={15}/> Paling dekat: <b>{nearest.name}</b>{nearestEta ? ` — ± ${nearestEta.months} bulan lagi (${monthName(nearestEta.date)})` : ` — kurang ${short(remaining(nearest))}`}</p>}
    </section>

    {all.length > 0 && <div className="wl-toolbar">
      <div className="segmented" role="tablist"><button type="button" role="tab" aria-selected={tab === 'active'} className={tab === 'active' ? 'active' : ''} onClick={() => setTab('active')}>Impian ({active.length})</button><button type="button" role="tab" aria-selected={tab === 'bought'} className={tab === 'bought' ? 'active' : ''} onClick={() => setTab('bought')}>Tercapai ({bought.length})</button></div>
      {tab === 'active' && active.length > 1 && <label className="wl-sort"><span>Urutkan</span><Select value={sort} onChange={event => chooseSort(event.target.value as Sort)} aria-label="Urutkan impian" menuWidth={220}><option value="manual">Urutan saya</option><option value="priority">Prioritas</option><option value="nearest">Paling cepat tercapai</option><option value="cheap">Sisa termurah</option><option value="expensive">Harga tertinggi</option></Select></label>}
    </div>}

    {!all.length ? <section className="wl-empty">
      <div className="wl-empty-art" aria-hidden="true">{['✈️', '💻', '🎧', '👟', '📷'].map((e, i) => <span key={e} style={{ '--i': i } as CSSProperties}><BigEmoji e={e}/></span>)}</div>
      <h2>Apa impianmu berikutnya?</h2>
      <p>Catat barang atau pengalaman yang ingin kamu beli. Dompet Ajaib membantu menghitung kapan tercapai dan memberi jeda berpikir supaya tidak impulsif.</p>
      <div className="wl-ideas">{ideas.map(([e, name, price]) => <button type="button" key={name} onClick={() => openForm(undefined, { emoji: e, name, price })}><Emoji e={e}/> {name}</button>)}</div>
      <Button onClick={() => openForm()}><Plus size={16}/> Tambah impian pertama</Button>
    </section> : !shown.length ? <p className="ins-empty"><Sparkles size={18}/>{tab === 'bought' ? 'Belum ada impian yang tercapai. Semangat menyisihkan!' : 'Semua impian sudah tercapai. Tambahkan impian baru!'}</p> :
    <div className="wl-grid">{shown.map(w => {
      const ready = readiness(w, freeAfterBills, income, today), e = eta(w, today), pct = progress(w), wait = coolingLeft(w, income, today), done = w.status === 'bought';
      return <article key={w.id} className={`wl-card ${done ? 'is-bought' : ''} is-${ready.kind}`} data-sort-id={tab === 'active' && sort === 'manual' ? w.id : undefined}>
        <div className="wl-visual">
          {tab === 'active' && sort === 'manual' && active.length > 1 && <ReorderHandle id={w.id} onMove={move}/>}
          <span className="wl-priority" title={priorityLabels[w.priority]}>{[1, 2, 3].map(i => <Star key={i} size={12} className={i <= 4 - w.priority ? 'on' : ''}/>)}</span>
          <span className="wl-emoji"><BigEmoji e={w.emoji}/></span>
          {done ? <span className="wl-badge is-done"><Check size={13}/> Terbeli {w.boughtDate ? dayName(w.boughtDate) : ''}</span> : !remaining(w) ? <span className="wl-badge is-ready"><Sparkles size={13}/> Terkumpul!</span> : wait > 0 ? <span className="wl-badge is-wait" title={`Barang ≥ 20% gaji diberi 30 hari untuk dipikirkan, lainnya 7 hari.`}><Hourglass size={13}/> {wait} hari lagi</span> : null}
        </div>
        <div className="wl-body">
          <div className="wl-title"><h3>{w.name}</h3>{w.link && <a href={w.link} target="_blank" rel="noreferrer" className="icon-btn" aria-label={`Buka tautan ${w.name}`}><ExternalLink size={15}/></a>}</div>
          <strong className="wl-price">{rupiah(w.price)}</strong>
          {!done && <>
            <div className="wl-progress"><div><i style={{ width: `${Math.max(2, pct * 100)}%` }}/></div><span>{Math.round(pct * 100)}%</span></div>
            <p className="wl-meta"><span>Terkumpul <b>{short(w.saved || 0)}</b></span><span>{remaining(w) ? <>Kurang <b>{short(remaining(w))}</b></> : 'Lunas'}</span></p>
            <p className={`wl-hint is-${ready.kind}`}>{ready.kind === 'saving' && e ? `± ${e.months} bulan lagi (${monthName(e.date)}) dengan ${short(w.monthly || 0)}/bln` : ready.kind === 'saving' && !w.monthly ? 'Atur sisihan per bulan untuk melihat perkiraan waktu' : ready.label}</p>
          </>}
          {w.notes && <p className="wl-notes">{w.notes}</p>}
          <div className="wl-actions">
            {done ? <button type="button" className="link-button" onClick={() => user && track(saveWish(user.uid, { status: 'active', boughtDate: '' }, w.id), { pending: 'Menyimpan…', success: 'Dikembalikan ke wish list.', failure: 'Belum tersimpan' })}><RotateCcw size={14}/> Kembalikan</button> : <>
              {remaining(w) > 0 && <Button className="small" onClick={() => { setSaving(w); setAmount(w.monthly || 0); setTakeOut(false); }}><Plus size={15}/> Sisihkan</Button>}
              <Button variant={remaining(w) ? 'secondary' : 'primary'} className="small" onClick={() => { setBuying(w); setRecord(true); }}><ShoppingBag size={15}/> Beli</Button>
            </>}
            <details className="more-actions wl-more"><summary className="icon-btn" aria-label={`Menu ${w.name}`}><MoreHorizontal size={17}/></summary><div className="more-menu">
              {!done && <button type="button" onClick={() => openForm(w)}><Pencil size={15}/> Ubah</button>}
              {!done && (w.saved || 0) > 0 && <button type="button" onClick={() => { setSaving(w); setAmount(0); setTakeOut(true); }}><RotateCcw size={15}/> Kurangi sisihan</button>}
              <button type="button" className="danger" onClick={() => user && undo.remove(w.id, 'Impian', () => deleteWish(user.uid, w.id))}><Trash2 size={15}/> Hapus</button>
            </div></details>
          </div>
        </div>
      </article>;
    })}</div>}

    {/* Add / edit */}
    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent title={editing ? 'Ubah impian' : 'Tambah impian'} className="wish-dialog">
      <div className="wl-preview">
        <span className="wl-emoji"><BigEmoji e={draft.emoji}/></span>
        <div><strong>{draft.name || 'Nama impian'}</strong><span>{draft.price ? rupiah(draft.price) : 'Rp0'}</span><small>{draftEta ? (draftEta.months ? `Tercapai ± ${draftEta.months} bulan (${monthName(draftEta.date)})` : 'Sudah terkumpul') : draft.price ? `Masa pikir-pikir ${coolingDays(draft.price, income)} hari sebelum beli` : 'Isi harga untuk melihat perkiraan'}</small></div>
      </div>
      <form className="form-stack" onSubmit={event => { event.preventDefault(); submit(); }}>
        <Field label="Nama impian"><Input required value={draft.name} onChange={event => setDraft(d => ({ ...d, name: event.target.value }))} placeholder="contoh: Headphone noise cancelling"/></Field>
        <div className="form-grid"><Field label="Harga"><Money value={draft.price} onChange={price => setDraft(d => ({ ...d, price }))} required/></Field>{!editing && <Field label="Sudah terkumpul (opsional)"><Money value={draft.saved} onChange={saved => setDraft(d => ({ ...d, saved }))}/></Field>}</div>
        <IconChoice value={draft.emoji} onPick={e => setDraft(d => ({ ...d, emoji: e }))} options={wishEmojis}/>
        <div className="wl-field"><span>Prioritas</span><div className="ip-choices">{([1, 2, 3] as const).map(p => <button type="button" key={p} className={draft.priority === p ? 'active' : ''} aria-pressed={draft.priority === p} onClick={() => setDraft(d => ({ ...d, priority: p }))}>{draft.priority === p && <Check size={14}/>}{priorityLabels[p]}</button>)}</div></div>
        <div className="form-grid">
          <Field label="Target tanggal (opsional)"><Input type="date" value={draft.targetDate} min={today} onChange={event => setDraft(d => ({ ...d, targetDate: event.target.value }))}/></Field>
          <Field label="Sisihkan per bulan" hint={suggestedMonthly ? `Agar tercapai di tanggal itu: ${rupiah(suggestedMonthly)}/bln` : 'Masuk ke Rencana gajian di Insight'}><Money value={draft.monthly} onChange={monthly => setDraft(d => ({ ...d, monthly }))}/></Field>
        </div>
        {suggestedMonthly > 0 && suggestedMonthly !== draft.monthly && <button type="button" className="link-button wl-apply" onClick={() => setDraft(d => ({ ...d, monthly: suggestedMonthly }))}><Wand2 size={14}/> Pakai {rupiah(suggestedMonthly)}/bln</button>}
        <Field label="Tautan toko (opsional)"><Input type="url" inputMode="url" value={draft.link} onChange={event => setDraft(d => ({ ...d, link: event.target.value }))} placeholder="https://"/></Field>
        <Field label="Catatan (opsional)"><Input value={draft.notes} onChange={event => setDraft(d => ({ ...d, notes: event.target.value }))} placeholder="warna, ukuran, alasan ingin beli…"/></Field>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Batal</Button><Button type="submit" disabled={!draft.name.trim() || draft.price <= 0}><Check size={16}/> {editing ? 'Simpan' : 'Tambahkan'}</Button></div>
      </form>
    </DialogContent></Dialog>

    {/* Set aside */}
    <Dialog open={Boolean(saving)} onOpenChange={open => { if (!open) setSaving(null); }}><DialogContent title={takeOut ? 'Kurangi sisihan' : 'Sisihkan untuk impian'} className="wish-dialog">
      {saving && <>
        <div className="wl-preview"><span className="wl-emoji"><BigEmoji e={saving.emoji}/></span><div><strong>{saving.name}</strong><span>{short(saving.saved || 0)} dari {short(saving.price)}</span><small>{takeOut ? 'Uang dikembalikan ke saldo bebas' : `Kurang ${short(remaining(saving))}`}</small></div></div>
        <p className="muted wl-explain">Menyisihkan tidak memindahkan saldo dompet — uangnya tetap di dompetmu, hanya ditandai untuk impian ini sehingga Insight tidak menganggapnya uang menganggur.</p>
        {!takeOut && <div className="ip-choices">{[50_000, 100_000, 250_000, 500_000].filter(v => v <= remaining(saving)).map(v => <button type="button" key={v} className={amount === v ? 'active' : ''} onClick={() => setAmount(v)}>+{short(v)}</button>)}<button type="button" className={amount === remaining(saving) ? 'active' : ''} onClick={() => setAmount(remaining(saving))}>Lunasi {short(remaining(saving))}</button></div>}
        <Field label="Jumlah"><Money value={amount} onChange={setAmount}/></Field>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setSaving(null)}>Batal</Button><Button type="button" disabled={amount <= 0} onClick={addSaving}>{takeOut ? 'Kurangi' : 'Sisihkan'} {amount > 0 ? short(takeOut ? Math.min(amount, saving.saved || 0) : Math.min(amount, remaining(saving))) : ''}</Button></div>
      </>}
    </DialogContent></Dialog>

    {/* Buy */}
    <Dialog open={Boolean(buying)} onOpenChange={open => { if (!open) setBuying(null); }}><DialogContent title="Beli impian" className="wish-dialog">
      {buying && (() => { const wait = coolingLeft(buying, income, today), left = remaining(buying); return <>
        <div className="wl-celebrate"><span className="wl-emoji"><BigEmoji e={buying.emoji}/></span><strong>{buying.name}</strong><span>{rupiah(buying.price)}</span></div>
        {wait > 0 && <p className="notice">Masih masa pikir-pikir <b>{wait} hari</b> lagi (ditambahkan {daysBetween(buying.addedDate, today)} hari lalu). Kalau setelah dipikir tetap ingin, silakan lanjut.</p>}
        {left > 0 && <p className="notice">Sisihan belum penuh — masih kurang <b>{rupiah(left)}</b> yang akan diambil dari saldo biasa.</p>}
        <label className="check-row"><input type="checkbox" checked={record} onChange={event => setRecord(event.target.checked)}/> Catat sebagai pengeluaran sekarang</label>
        <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => setBuying(null)}>Nanti dulu</Button><Button type="button" onClick={markBought}><Check size={16}/> Sudah dibeli 🎉</Button></div>
      </>; })()}
    </DialogContent></Dialog>
  </div>;
}
