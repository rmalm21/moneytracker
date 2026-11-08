'use client';
/** 9.0 Ruang Bersama: Setor / Ambil, paying with one's own money (untuk bersama or patungan), who owes whom, Lunasi.
 * Rules of each step: lib/space-money.ts. */
import { useEffect, useMemo, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Check, HandCoins, Users, Wallet as WalletIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Input, Money, Select, categoryOptions } from './fields';
import { Emoji } from './emoji';
import { rupiah } from '@/lib/accounting';
import { todayInTimeZone } from '@/lib/period';
import { deleteTransaction } from '@/lib/firestore';
import { spaceKey } from '@/lib/space-key';
import {
  balances, deletePaidPersonally, deposit, equalShares, payPersonally, readPersonal, receiveSettlement, settleUp, subscribeSettlements, withdraw,
  type Person, type Settlement,
} from '@/lib/space-money';
import type { Category, LedgerTx, Wallet } from '@/lib/types';

function useMe(): Person | null {
  const { account, personalProfile } = useApp();
  return account ? { uid: account.uid, name: personalProfile?.displayName || account.displayName || (account.email || '').split('@')[0] || 'Anggota' } : null;
}
/** The person's own wallets and categories (while a space is on screen they are not loaded otherwise). */
function usePersonal(open: boolean) {
  const { account } = useApp();
  const [state, setState] = useState<{ wallets: Wallet[]; categories: Category[] } | null>(null), [error, setError] = useState('');
  useEffect(() => { if (!open || !account) return; let live = true; readPersonal(account.uid).then(v => { if (live) setState(v); }, e => { if (live) setError((e as Error).message); }); return () => { live = false; }; }, [open, account?.uid]);
  return { personal: state, error };
}
const walletOptions = (list: Wallet[]) => list.map(w => <option key={w.id} value={w.id}>{w.name} · {rupiah(w.cachedBalance ?? 0)}</option>);

/** Setor (own wallet → shared wallet) or Ambil (the other way). */
export function MoveDialog({ open, onOpenChange, start = 'deposit' }: { open: boolean; onOpenChange: (v: boolean) => void; start?: 'deposit' | 'withdraw' }) {
  const { space, data, profile } = useApp(), me = useMe(), { track } = useNotify();
  const { personal, error: loadError } = usePersonal(open);
  const [kind, setKind] = useState(start), [amount, setAmount] = useState(0), [mine, setMine] = useState(''), [shared, setShared] = useState(''), [date, setDate] = useState(''), [note, setNote] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const sharedWallets = data.wallets.filter(w => !w.isArchived);
  useEffect(() => { if (open) { setKind(start); setAmount(0); setNote(''); setError(''); setDate(todayInTimeZone(profile?.timeZone)); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (personal && !personal.wallets.some(w => w.id === mine)) setMine(personal.wallets[0]?.id || ''); }, [personal]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!sharedWallets.some(w => w.id === shared)) setShared(sharedWallets[0]?.id || ''); }, [sharedWallets.map(w => w.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!space || !me) return null;
  async function save() {
    const personalWallet = personal?.wallets.find(w => w.id === mine), spaceWallet = sharedWallets.find(w => w.id === shared);
    if (!personalWallet || !spaceWallet) { setError('Pilih dompet pribadi dan dompet bersama.'); return; }
    setBusy(true); setError('');
    const args = { me: me!, space: space!, amount, date, personalWallet, spaceWallet, personalCats: personal!.categories, spaceCats: data.categories, note };
    try {
      const task = kind === 'deposit' ? deposit(args) : withdraw(args);
      track(task, { pending: kind === 'deposit' ? 'Menyetor…' : 'Mengambil…', success: kind === 'deposit' ? `Setor ${rupiah(amount)} ke ${spaceWallet.name}` : `Ambil ${rupiah(amount)} dari ${spaceWallet.name}`, failure: 'Belum tersimpan' });
      await task; onOpenChange(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={kind === 'deposit' ? 'Setor ke ruang' : 'Ambil dari ruang'}>
    <form className="form-stack" onSubmit={e => { e.preventDefault(); void save(); }}>
      <div className="sp-seg" role="radiogroup" aria-label="Arah uang">
        <button type="button" role="radio" aria-checked={kind === 'deposit'} className={kind === 'deposit' ? 'on' : ''} onClick={() => setKind('deposit')}><ArrowDownToLine size={15}/> Setor</button>
        <button type="button" role="radio" aria-checked={kind === 'withdraw'} className={kind === 'withdraw' ? 'on' : ''} onClick={() => setKind('withdraw')}><ArrowUpFromLine size={15}/> Ambil</button>
      </div>
      <Field label="Nominal"><Money value={amount} onChange={setAmount} required/></Field>
      {!personal ? <p className="muted">{loadError || 'Membuka dompet pribadimu…'}</p> : !personal.wallets.length ? <p className="form-error">Belum ada dompet di Pribadi.</p> : <>
        <Field label={kind === 'deposit' ? 'Dari dompet pribadimu' : 'Masuk ke dompet pribadimu'}><Select value={mine} onChange={e => setMine(e.target.value)}>{walletOptions(personal.wallets)}</Select></Field>
        <Field label={kind === 'deposit' ? `Masuk ke dompet ${space.name}` : `Dari dompet ${space.name}`}><Select value={shared} onChange={e => setShared(e.target.value)}>{walletOptions(sharedWallets)}</Select></Field>
      </>}
      <Field label="Tanggal"><Input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
      <Field label="Catatan (opsional)"><Input value={note} maxLength={120} onChange={e => setNote(e.target.value)}/></Field>
      <div className="notice sp-outcome">{kind === 'deposit'
        ? <>Di <b>Pribadi</b>: keluar {rupiah(amount)} (Kontribusi bersama). Di <b>{space.name}</b>: masuk {rupiah(amount)} sebagai setoran {me.name}.</>
        : <>Di <b>{space.name}</b>: keluar {rupiah(amount)} (diambil {me.name}). Di <b>Pribadi</b>: masuk {rupiah(amount)}.</>}</div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="toolbar-row"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Batal</Button><Button type="submit" disabled={busy || !amount || !personal?.wallets.length}>{busy ? 'Menyimpan…' : kind === 'deposit' ? 'Setor' : 'Ambil'}</Button></div>
    </form>
  </DialogContent></Dialog>;
}

/** Shared spending paid with one's own money: for everyone (a contribution), or split (the others owe the payer). */
export function PayPersonallyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { space, data, profile } = useApp(), me = useMe(), { track } = useNotify();
  const { personal, error: loadError } = usePersonal(open);
  const [amount, setAmount] = useState(0), [what, setWhat] = useState(''), [cat, setCat] = useState(''), [mine, setMine] = useState(''), [date, setDate] = useState(''), [mode, setMode] = useState<'together' | 'split' | ''>(''), [shares, setShares] = useState<Record<string, number>>({}), [picked, setPicked] = useState<string[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const members = useMemo(() => space ? space.memberIds.map(uid => ({ uid, name: space.members[uid]?.name || 'Anggota' })) : [], [space]);
  useEffect(() => { if (open) { setAmount(0); setWhat(''); setCat(''); setMode(''); setError(''); setDate(todayInTimeZone(profile?.timeZone)); setPicked(members.map(m => m.uid)); setShares({}); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (personal && !personal.wallets.some(w => w.id === mine)) setMine(personal.wallets[0]?.id || ''); }, [personal]); // eslint-disable-line react-hooks/exhaustive-deps
  // Equal shares between the people ticked, until someone types their own amounts.
  useEffect(() => { if (mode === 'split' && picked.length) setShares(equalShares(amount, picked)); }, [mode, amount, picked.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!space || !me) return null;
  const myShare = mode === 'split' ? shares[me.uid] || 0 : amount, others = mode === 'split' ? members.filter(m => m.uid !== me.uid && (shares[m.uid] || 0) > 0) : [];
  const sum = Object.entries(shares).filter(([uid]) => picked.includes(uid)).reduce((n, [, v]) => n + v, 0);
  async function save() {
    const personalWallet = personal?.wallets.find(w => w.id === mine);
    if (!personalWallet) { setError('Pilih dompet pribadi.'); return; }
    if (!mode) { setError('Pilih dulu: untuk bersama atau patungan.'); return; }
    setBusy(true); setError('');
    try {
      const task = payPersonally({ me: me!, space: space!, amount, date, personalWallet, personalCats: personal!.categories, spaceCats: data.categories, description: what, categoryId: cat, mode, shares: Object.fromEntries(Object.entries(shares).filter(([uid]) => picked.includes(uid))), names: Object.fromEntries(members.map(m => [m.uid, m.name])) });
      track(task, { pending: 'Menyimpan…', success: mode === 'split' ? `Patungan ${rupiah(amount)} dicatat` : `${rupiah(amount)} dicatat sebagai kontribusimu`, failure: 'Belum tersimpan' });
      await task; onOpenChange(false);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Bayar pakai uang pribadi">
    <form className="form-stack" onSubmit={e => { e.preventDefault(); void save(); }}>
      <p className="muted">Untuk keperluan {space.name} yang kamu bayar dari dompet pribadimu.</p>
      <Field label="Nominal"><Money value={amount} onChange={setAmount} required/></Field>
      <Field label="Untuk apa"><Input value={what} maxLength={80} onChange={e => setWhat(e.target.value)} placeholder="Misalnya belanja dapur"/></Field>
      <Field label={`Kategori di ${space.name}`}><Select value={cat} onChange={e => setCat(e.target.value)}><option value="">Pilih kategori</option>{categoryOptions(data.categories.filter(c => !c.isArchived), ['expense'])}</Select></Field>
      {!personal ? <p className="muted">{loadError || 'Membuka dompet pribadimu…'}</p> : <Field label="Dibayar dari dompet pribadimu"><Select value={mine} onChange={e => setMine(e.target.value)}>{walletOptions(personal.wallets)}</Select></Field>}
      <Field label="Tanggal"><Input type="date" value={date} onChange={e => setDate(e.target.value)}/></Field>
      <div className="field"><span>Ini untuk…</span><div className="sp-modes">
        <button type="button" className={mode === 'together' ? 'on' : ''} aria-pressed={mode === 'together'} onClick={() => setMode('together')}><strong>Untuk bersama</strong><small>Dianggap kontribusimu ke {space.name}. Tidak ada yang perlu diganti.</small></button>
        <button type="button" className={mode === 'split' ? 'on' : ''} aria-pressed={mode === 'split'} onClick={() => setMode('split')} disabled={members.length < 2}><strong>Patungan, dibagi</strong><small>{members.length < 2 ? 'Butuh anggota lain di ruang ini.' : 'Anggota lain mengganti bagiannya ke kamu.'}</small></button>
      </div></div>
      {mode === 'split' && <div className="sp-shares">
        {members.map(m => <label key={m.uid} className="sp-share">
          <input type="checkbox" checked={picked.includes(m.uid)} onChange={e => setPicked(list => e.target.checked ? [...list, m.uid] : list.filter(x => x !== m.uid))}/>
          <span>{m.uid === me.uid ? `${m.name} (kamu)` : m.name}</span>
          {picked.includes(m.uid) && <Money value={shares[m.uid] || 0} onChange={v => setShares(s => ({ ...s, [m.uid]: v }))}/>}
        </label>)}
        <div className="toolbar-row"><button type="button" className="link-button" onClick={() => setShares(equalShares(amount, picked))}>Bagi rata</button><small className={sum === amount ? 'muted' : 'form-error'}>{sum === amount ? 'Pas' : sum < amount ? `Kurang ${rupiah(amount - sum)}` : `Lebih ${rupiah(sum - amount)}`}</small></div>
      </div>}
      {mode && <div className="notice sp-outcome">
        <p>Di <b>Pribadi</b>: {personal?.wallets.find(w => w.id === mine)?.name || 'dompetmu'} keluar {rupiah(amount)}{mode === 'split' ? <>, pengeluaranmu {rupiah(myShare)}{others.length ? <>, sisanya jadi piutang ke {others.map(o => `${o.name} ${rupiah(shares[o.uid] || 0)}`).join(', ')}</> : null}</> : <> (Kontribusi bersama)</>}.</p>
        <p>Di <b>{space.name}</b>: pengeluaran {rupiah(amount)}{what ? ` untuk ${what}` : ''}, dibayar {me.name}{mode === 'split' ? <>{others.length ? <>; {others.map(o => o.name).join(', ')} perlu mengganti bagiannya</> : null}</> : '. Kas bersama tidak berkurang'}.</p>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="toolbar-row"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Batal</Button><Button type="submit" disabled={busy || !amount || !personal?.wallets.length}>{busy ? 'Menyimpan…' : 'Simpan'}</Button></div>
    </form>
  </DialogContent></Dialog>;
}

/** Who owes whom in the space, with Lunasi for what this person owes and Terima for what was paid back to them. */
export function MemberBalances() {
  const { space } = useApp(), me = useMe();
  const [settlements, setSettlements] = useState<Settlement[]>([]), [paying, setPaying] = useState<{ to: Person; amount: number } | null>(null), [receiving, setReceiving] = useState<Settlement | null>(null);
  useEffect(() => space ? subscribeSettlements(space.id, setSettlements) : undefined, [space?.id]);
  if (!space || !me) return null;
  const name = (uid: string) => uid === me.uid ? 'Kamu' : space.members[uid]?.name || space.formerMembers?.[uid]?.name || 'Anggota';
  const list = balances(space), incoming = settlements.filter(s => s.to === me.uid && !s.received);
  if (!list.length && !incoming.length) return <p className="muted sp-even"><Check size={15}/> Tidak ada yang perlu diganti antar anggota.</p>;
  return <div className="sp-balances">
    {list.map(b => <div className="sp-balance" key={`${b.from}-${b.to}`}>
      <span><b>{name(b.from)}</b> perlu mengganti <b>{b.to === me.uid ? 'kamu' : name(b.to)}</b><strong>{rupiah(b.amount)}</strong></span>
      {b.from === me.uid && <Button className="small" onClick={() => setPaying({ to: { uid: b.to, name: name(b.to) }, amount: b.amount })}><HandCoins size={15}/> Lunasi</Button>}
    </div>)}
    {incoming.map(s => <div className="sp-balance is-in" key={s.id}>
      <span><b>{s.fromName}</b> sudah bayar ke kamu<strong>{rupiah(s.amount)}</strong></span>
      <Button className="small" onClick={() => setReceiving(s)}><Check size={15}/> Terima</Button>
    </div>)}
    <SettleDialog target={paying} onClose={() => setPaying(null)}/>
    <ReceiveDialog settlement={receiving} onClose={() => setReceiving(null)}/>
  </div>;
}

function SettleDialog({ target, onClose }: { target: { to: Person; amount: number } | null; onClose: () => void }) {
  const { space, profile } = useApp(), me = useMe(), { track } = useNotify();
  const { personal } = usePersonal(Boolean(target));
  const [amount, setAmount] = useState(0), [mine, setMine] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (target) { setAmount(target.amount); setError(''); } }, [target]);
  useEffect(() => { if (personal && !personal.wallets.some(w => w.id === mine)) setMine(personal.wallets[0]?.id || ''); }, [personal]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!space || !me) return null;
  async function save() {
    if (!target) return; setBusy(true); setError('');
    try {
      const task = settleUp({ me: me!, space: space!, to: target.to, amount, date: todayInTimeZone(profile?.timeZone), personalWallet: personal?.wallets.find(w => w.id === mine) || null, personalCats: personal?.categories || [] });
      track(task, { pending: 'Menyimpan…', success: `Lunasi ${rupiah(amount)} ke ${target.to.name}`, failure: 'Belum tersimpan' });
      await task; onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open={Boolean(target)} onOpenChange={v => { if (!v) onClose(); }}><DialogContent title={`Lunasi ke ${target?.to.name || ''}`}>
    <form className="form-stack" onSubmit={e => { e.preventDefault(); void save(); }}>
      <p className="muted">Bayar langsung ke {target?.to.name} (transfer atau tunai), lalu catat di sini. {target?.to.name} akan diminta memilih dompet tempat uangnya masuk.</p>
      <Field label="Nominal"><Money value={amount} onChange={setAmount} required/></Field>
      <Field label="Dibayar dari dompet pribadimu"><Select value={mine} onChange={e => setMine(e.target.value)}>{walletOptions(personal?.wallets || [])}<option value="">Jangan catat di Pribadi</option></Select></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="toolbar-row"><Button type="button" variant="secondary" onClick={onClose}>Batal</Button><Button type="submit" disabled={busy || !amount}>{busy ? 'Menyimpan…' : 'Sudah dibayar'}</Button></div>
    </form>
  </DialogContent></Dialog>;
}

function ReceiveDialog({ settlement, onClose }: { settlement: Settlement | null; onClose: () => void }) {
  const { space } = useApp(), me = useMe(), { track } = useNotify();
  const { personal } = usePersonal(Boolean(settlement));
  const [mine, setMine] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { if (personal && !personal.wallets.some(w => w.id === mine)) setMine(personal.wallets[0]?.id || ''); }, [personal]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!space || !me || !settlement) return null;
  async function save() {
    setBusy(true); setError('');
    try {
      const task = receiveSettlement({ me: me!, space: space!, settlement: settlement!, personalWallet: personal?.wallets.find(w => w.id === mine) || null, personalCats: personal?.categories || [] });
      track(task, { pending: 'Menyimpan…', success: `${rupiah(settlement!.amount)} dari ${settlement!.fromName} diterima`, failure: 'Belum tersimpan' });
      await task; onClose();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={v => { if (!v) onClose(); }}><DialogContent title={`Terima dari ${settlement.fromName}`}>
    <form className="form-stack" onSubmit={e => { e.preventDefault(); void save(); }}>
      <p>{settlement.fromName} mencatat sudah membayar <b>{rupiah(settlement.amount)}</b> ke kamu.</p>
      <Field label="Masuk ke dompet pribadimu" hint="Piutang patungan ke dia ikut berkurang."><Select value={mine} onChange={e => setMine(e.target.value)}>{walletOptions(personal?.wallets || [])}<option value="">Jangan catat di Pribadi</option></Select></Field>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="toolbar-row"><Button type="button" variant="secondary" onClick={onClose}>Nanti</Button><Button type="submit" disabled={busy}>{busy ? 'Menyimpan…' : 'Terima'}</Button></div>
    </form>
  </DialogContent></Dialog>;
}

/** Top of Beranda in a space: members, Setor / Ambil, paying with one's own money, who owes whom. */
export function SpaceHome() {
  const { space, data } = useApp();
  const [move, setMove] = useState<'deposit' | 'withdraw' | null>(null), [pay, setPay] = useState(false);
  if (!space) return null;
  const total = data.wallets.filter(w => !w.isArchived).reduce((n, w) => n + (w.cachedBalance || 0), 0);
  const names = space.memberIds.map(uid => space.members[uid]?.name || 'Anggota');
  return <section className="sp-home" aria-label={`Ruang ${space.name}`}>
    <header><span className="sp-pick-icon"><Emoji e={space.emoji || '🏠'}/></span><span className="sp-pick-text"><strong>{space.name}</strong><small><Users size={12}/> {names.join(', ')}</small></span><span className="sp-home-total"><small>Uang bersama</small><b>{rupiah(total)}</b></span></header>
    <div className="sp-home-actions">
      <Button className="small" variant="secondary" onClick={() => setMove('deposit')}><ArrowDownToLine size={15}/> Setor</Button>
      <Button className="small" variant="secondary" onClick={() => setMove('withdraw')}><ArrowUpFromLine size={15}/> Ambil</Button>
      <Button className="small" variant="secondary" onClick={() => setPay(true)}><WalletIcon size={15}/> Bayar pakai uang pribadi</Button>
    </div>
    <MemberBalances/>
    <MoveDialog open={Boolean(move)} start={move || 'deposit'} onOpenChange={v => { if (!v) setMove(null); }}/>
    <PayPersonallyDialog open={pay} onOpenChange={setPay}/>
  </section>;
}

/** In a shared transaction's details: where the money came from, and what deleting changes. */
export function SpaceFlowNotice({ tx, onDone }: { tx: LedgerTx; onDone: () => void }) {
  const { space } = useApp(), { track } = useNotify();
  const flow = tx.memberFlow;
  if (!space || !flow) return null;
  const others = flow.shares ? Object.entries(flow.shares).filter(([uid, n]) => uid !== flow.uid && n > 0).map(([uid, n]) => `${space.members[uid]?.name || space.formerMembers?.[uid]?.name || 'Anggota'} ${rupiah(n)}`) : [];
  const text = flow.kind === 'deposit' ? `Setoran ${flow.name} dari dompet pribadinya.`
    : flow.kind === 'withdrawal' ? `Diambil ${flow.name} ke dompet pribadinya.`
      : flow.kind === 'paid' ? `Dibayar ${flow.name} pakai uang pribadi, dihitung sebagai kontribusinya.`
        : `Patungan: dibayar ${flow.name} pakai uang pribadi.${others.length ? ` Bagian yang perlu diganti: ${others.join(', ')}.` : ''}`;
  function remove() {
    const task = !tx.walletId ? deletePaidPersonally(space!, tx) : deleteTransaction(spaceKey(space!.id), tx.id);
    track(task, { pending: 'Menghapus…', success: 'Transaksi dihapus', failure: 'Belum terhapus' });
    onDone();
  }
  return <div className="sp-flow">
    <div className="notice"><p><b>{tx.description || 'Transaksi'}</b> · {rupiah(tx.amount)}</p><p>{text}</p><p className="muted">Catatan di Pribadi {flow.name} tidak ikut berubah kalau ini dihapus{flow.kind === 'split' ? '; yang perlu diganti antar anggota ikut dibatalkan' : ''}. Untuk mengubah nominal, hapus lalu catat ulang.</p></div>
    <Button variant="danger" className="full" onClick={remove}>Hapus transaksi</Button>
  </div>;
}
