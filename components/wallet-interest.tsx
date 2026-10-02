'use client';
/**
 * Bunga saldo otomatis: the compact status in the wallet header, the "Bunga saldo" sheet (settings, payout schedule,
 * simulation, status, checking payouts against the bank) and the detail of a credited interest transaction.
 * All numbers come from lib/wallet-interest.ts, the same functions the engine credits with.
 */
import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronRight, Percent, TrendingUp } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Field, Input, Money, Select } from './fields';
import { rupiah } from '@/lib/accounting';
import { todayInTimeZone } from '@/lib/period';
import { annualRate, creditOf, DEFAULT_TAX_RATE, estimateToday, microToRupiah, periodOn, runInterest, simulateInterest, unconfirmedInterest, updateInterestSettings, type InterestBasis, type InterestPayout, type InterestPending } from '@/lib/wallet-interest';
import type { LedgerTx, Wallet } from '@/lib/types';

const WEEKDAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const dateLabel = (date: string, year = false) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
const percent = (n: number) => `${n.toLocaleString('id-ID', { maximumFractionDigits: 4 })}%`;
const decimals = (n: number) => n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const readPercent = (text: string) => { const n = Number(text.replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : NaN; };
export const payoutLabel = (payout?: InterestPayout, day?: number) => payout === 'week' ? `tiap ${WEEKDAYS[(day || 1) - 1]}` : payout === 'month' ? (day && day < 31 ? `tiap tgl ${day}` : 'tiap akhir bulan') : 'tiap hari';

/** Everything the header and the sheet show, worked out from the wallet's full history (read from this device's copy). */
function useInterestState(wallet: Wallet) {
  const { user, profile } = useApp();
  const today = todayInTimeZone(profile?.timeZone);
  const [all, setAll] = useState<LedgerTx[] | null>(null);
  const { data } = useApp();
  const recent = data.transactions;
  useEffect(() => {
    if (!user || !wallet.interest) { setAll(null); return; }
    let live = true;
    void import('@/lib/firestore').then(m => m.loadAllTransactions(user.uid)).then(items => { if (live) setAll(items.filter(t => t.walletId === wallet.id || t.destinationWalletId === wallet.id)); }).catch(() => undefined);
    return () => { live = false; };
  }, [user, wallet.id, wallet.interest, recent]);
  return useMemo(() => {
    const txs = all || recent.filter(t => t.walletId === wallet.id || t.destinationWalletId === wallet.id);
    const credited = txs.filter(t => t.interest?.source === 'wallet_interest' && t.interest.walletId === wallet.id).sort((a, b) => b.date.localeCompare(a.date));
    const run = all ? runInterest(wallet, all, today) : { pending: null as InterestPending | null };
    return { today, last: credited[0] || null, unconfirmed: unconfirmedInterest(credited, wallet.id), estimate: all ? estimateToday(wallet, all, today) : null, pending: run.pending, credited };
  }, [all, recent, wallet, today]);
}

/** One line in the wallet header: rate · tax · payout, or an invitation to turn it on. */
export function InterestStatus({ wallet, onOpen }: { wallet: Wallet; onOpen: () => void }) {
  const state = useInterestState(wallet), settings = wallet.interest;
  const period = settings?.enabled ? periodOn(settings, state.today) || settings.periods[settings.periods.length - 1] : null;
  if (!settings?.enabled || !period) return <button type="button" className="wh-interest is-off" onClick={onOpen}><Percent size={13}/> Bunga otomatis belum aktif <ChevronRight size={14}/></button>;
  const yesterday = state.last && state.last.date >= state.today.slice(0, 8) ? state.last : null;
  return <button type="button" className="wh-interest" onClick={onOpen}>
    <span className="wh-interest-main"><TrendingUp size={13}/>{yesterday ? <>+{rupiah(yesterday.amount)} bunga {dateLabel(yesterday.date)}</> : state.estimate ? <>Estimasi hari ini +{rupiah(state.estimate.net)}</> : <>Bunga aktif</>}{state.unconfirmed.length > 0 && <i className="wh-dot" aria-label={`${state.unconfirmed.length} belum dicek`}/>}</span>
    <span className="wh-interest-meta">{percent(annualRate(period))} p.a.{period.tax ? ` · Pajak ${percent(period.taxRate)}` : ''} · {payoutLabel(period.payout, period.payoutDay)}</span>
    <ChevronRight size={14}/>
  </button>;
}

/** The "Bunga saldo" sheet. */
export function InterestSheet({ wallet, open, onOpenChange, notify }: { wallet: Wallet; open: boolean; onOpenChange: (open: boolean) => void; notify: (message: string) => void }) {
  const { user } = useApp();
  const state = useInterestState(wallet);
  const current = wallet.interest, active = current?.enabled ? periodOn(current, state.today) || current.periods[current.periods.length - 1] : null;
  const [enabled, setEnabled] = useState(Boolean(current?.enabled));
  const [rateText, setRateText] = useState(active ? String(active.rate).replace('.', ',') : '');
  const [basis, setBasis] = useState<InterestBasis>(active?.basis || 'year');
  const [tax, setTax] = useState(active ? active.tax : true);
  const [taxText, setTaxText] = useState(String(active?.taxRate ?? DEFAULT_TAX_RATE).replace('.', ','));
  const [payout, setPayout] = useState<InterestPayout>(active?.payout || 'day');
  const [payoutDay, setPayoutDay] = useState(active?.payoutDay || (active?.payout === 'week' ? 1 : 31));
  const [startDate, setStartDate] = useState(current?.enabled ? current.startDate : state.today);
  const [simBalance, setSimBalance] = useState(Math.max(0, wallet.cachedBalance) || 10_000_000);
  const [saving, setSaving] = useState(false), [error, setError] = useState('');
  useEffect(() => { if (open) { setEnabled(Boolean(current?.enabled)); setError(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const rate = readPercent(rateText), taxRate = readPercent(taxText);
  const draft = { from: startDate, rate: Number.isNaN(rate) ? 0 : rate, basis, tax, taxRate: Number.isNaN(taxRate) ? 0 : taxRate, payout, payoutDay };
  const sim = simulateInterest(simBalance, draft, 30);
  const startEditable = !current?.enabled || current.startDate > state.today;
  async function save() {
    if (!user) return;
    if (enabled && (Number.isNaN(rate) || rate <= 0 || rate > 100)) { setError('Isi bunga antara 0 dan 100%.'); return; }
    if (enabled && tax && (Number.isNaN(taxRate) || taxRate > 100)) { setError('Isi tarif pajak antara 0 dan 100%.'); return; }
    setSaving(true); setError('');
    try {
      const next = updateInterestSettings(current, { enabled, rate, basis, tax, taxRate, startDate: startEditable ? startDate : current!.startDate, payout, payoutDay }, state.today);
      await (await import('@/lib/interest-store')).saveWalletInterest(user.uid, wallet.id, next);
      notify(enabled ? 'Bunga otomatis disimpan. Hari yang sudah selesai dihitung otomatis.' : 'Bunga otomatis dimatikan. Riwayat bunga tetap disimpan.');
      onOpenChange(false);
    } catch (e) { setError((e as Error).message || 'Gagal menyimpan.'); } finally { setSaving(false); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title="Bunga saldo" className="interest-dialog">
    <div className="form-stack is-compact">
      {current?.enabled && <InterestSummary wallet={wallet} state={state} notify={notify}/>}
      <button type="button" role="switch" aria-checked={enabled} className={`ip-switch ${enabled ? 'on' : ''}`} onClick={() => setEnabled(!enabled)}><span><strong>Bunga otomatis</strong><small>{enabled ? 'Dihitung dari saldo akhir tiap hari' : current && !current.enabled ? 'Mati · riwayat bunga tetap ada' : 'Saldo bertambah sendiri dari bunga'}</small></span><i aria-hidden="true"/></button>
      {enabled && <>
        <div className="int-grid">
          <Field label="Bunga"><span className="int-suffix"><Input inputMode="decimal" value={rateText} placeholder="4,5" onChange={e => setRateText(e.target.value.replace(/[^\d.,]/g, ''))}/><em>%</em></span></Field>
          <Field label="Per"><Select value={basis} onChange={e => setBasis(e.target.value as InterestBasis)}><option value="year">tahun (p.a.)</option><option value="month">bulan</option></Select></Field>
        </div>
        <button type="button" role="switch" aria-checked={tax} className={`ip-switch is-small ${tax ? 'on' : ''}`} onClick={() => setTax(!tax)}><span><strong>Pajak bunga</strong><small>{tax ? 'Dipotong dari bunga' : 'Tanpa potongan'}</small></span><i aria-hidden="true"/></button>
        {tax && <Field label="Tarif pajak"><span className="int-suffix"><Input inputMode="decimal" value={taxText} onChange={e => setTaxText(e.target.value.replace(/[^\d.,]/g, ''))}/><em>%</em></span></Field>}
        <div className="field"><span>Bunga cair</span><div className="int-seg" role="radiogroup" aria-label="Bunga cair">{([['day', 'Harian'], ['week', 'Mingguan'], ['month', 'Bulanan']] as const).map(([value, label]) => <button key={value} type="button" role="radio" aria-checked={payout === value} className={payout === value ? 'active' : ''} onClick={() => { setPayout(value); setPayoutDay(value === 'week' ? 1 : 31); }}>{label}</button>)}</div></div>
        {payout === 'week' && <Field label="Cair setiap"><Select value={String(payoutDay)} onChange={e => setPayoutDay(Number(e.target.value))}>{WEEKDAYS.map((day, i) => <option key={day} value={i + 1}>{day}</option>)}</Select></Field>}
        {payout === 'month' && <Field label="Cair tanggal" hint="Bulan yang lebih pendek: cair di hari terakhirnya."><Select value={String(payoutDay)} onChange={e => setPayoutDay(Number(e.target.value))}>{Array.from({ length: 31 }, (_, i) => i + 1).map(day => <option key={day} value={day}>{day === 31 ? '31 / akhir bulan' : day}</option>)}</Select></Field>}
        {startEditable && <Field label="Mulai dihitung" hint="Tidak ada bunga sebelum tanggal ini."><Input type="date" value={startDate} min={state.today} onChange={e => setStartDate(e.target.value || state.today)}/></Field>}
        <section className="int-sim" aria-label="Simulasi bunga">
          <div className="int-sim-head"><strong>Simulasi</strong><span>tidak dicatat</span></div>
          <label className="int-sim-balance"><span>Saldo</span><Money value={simBalance} onChange={setSimBalance}/></label>
          <dl>
            <div><dt>Bunga kotor / hari</dt><dd>{rupiah(Math.round(sim.gross))}</dd></div>
            {tax && <div><dt>Pajak {percent(draft.taxRate)}</dt><dd>−{rupiah(Math.round(sim.tax))}</dd></div>}
            <div className="is-total"><dt>Bersih / hari</dt><dd>+{rupiah(Math.round(sim.net))}</dd></div>
            <div><dt>Perkiraan 30 hari</dt><dd>+{rupiah(sim.total)}</dd></div>
            <div><dt>Perkiraan saldo</dt><dd>{rupiah(sim.ending)}</dd></div>
          </dl>
        </section>
        <p className="int-note">Dihitung dari saldo akhir tiap hari dan masuk sebagai pemasukan “Bunga saldo” {payoutLabel(payout, payoutDay)}. Hari yang terlewat dihitung satu per satu saat aplikasi dibuka. Perubahan bunga berlaku mulai hari ini.</p>
      </>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Batal</Button><Button type="button" disabled={saving} onClick={() => void save()}>{saving ? 'Menyimpan…' : 'Simpan'}</Button></div>
    </div>
  </DialogContent></Dialog>;
}

function InterestSummary({ wallet, state, notify }: { wallet: Wallet; state: ReturnType<typeof useInterestState>; notify: (message: string) => void }) {
  return <section className="int-status">
    <dl>
      {state.pending && state.pending.nextPayout && state.pending.nextPayout > state.today && <div><dt>Terkumpul, belum cair</dt><dd>+{rupiah(creditOf(BigInt(state.pending.micro)))}<small>cair {dateLabel(state.pending.nextPayout)}</small></dd></div>}
      {state.estimate && <div><dt>Estimasi hari ini</dt><dd>+{rupiah(state.estimate.net)}<small>belum masuk saldo</small></dd></div>}
      {state.last && <div><dt>Terakhir cair</dt><dd>+{rupiah(state.last.amount)}<small>{dateLabel(state.last.date)}</small></dd></div>}
    </dl>
    {state.unconfirmed.length > 0 && <ConfirmList compact wallet={wallet} items={state.unconfirmed} notify={notify}/>}
  </section>;
}

/** Credited interest not checked yet: "Sesuai" keeps it, "Ubah" sets the bank's figure. */
function ConfirmList({ items, notify, title = 'Cocokkan dengan bank', compact = false }: { wallet?: Wallet; items: LedgerTx[]; notify: (message: string) => void; title?: string; compact?: boolean }) {
  const { user, data } = useApp();
  const several = new Set(items.map(t => t.walletId)).size > 1 || title !== 'Cocokkan dengan bank';
  const [all, setAll] = useState(false), limit = compact && !all ? 2 : 6;
  const [editing, setEditing] = useState<string | null>(null), [value, setValue] = useState(0), [busy, setBusy] = useState(false);
  async function confirm(tx: LedgerTx, amount: number) {
    if (!user) return; setBusy(true);
    try { await (await import('@/lib/interest-store')).confirmInterest(user.uid, tx.id, amount); setEditing(null); notify(amount === tx.amount ? 'Bunga ditandai sesuai.' : `Bunga diubah ke ${rupiah(amount)}. Saldo ikut disesuaikan.`); }
    catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  async function confirmAll() { if (!user) return; setBusy(true); try { const store = await import('@/lib/interest-store'); for (const tx of items) await store.confirmInterest(user.uid, tx.id, tx.amount); notify('Semua bunga ditandai sesuai.'); } catch (e) { notify((e as Error).message); } finally { setBusy(false); } }
  return <div className="int-confirm">
    <div className="int-confirm-head"><strong>{title}</strong>{items.length > 1 && <button type="button" className="link-button" disabled={busy} onClick={() => void confirmAll()}>{compact ? 'Semua sesuai' : 'Tandai semua sesuai'}</button>}</div>
    <ul>{items.slice(0, limit).map(tx => <li key={tx.id}>
      <span><strong>+{rupiah(tx.amount)}</strong><small>{several ? `${data.wallets.find(w => w.id === tx.walletId)?.name || 'Dompet'} · ` : ''}{tx.interest?.days && tx.interest.accrualFrom ? `${dateLabel(tx.interest.accrualFrom)}–${dateLabel(tx.date)}` : dateLabel(tx.date)}</small></span>
      {editing === tx.id ? <span className="int-confirm-edit"><Money value={value} onChange={setValue}/><Button type="button" className="small" disabled={busy || value <= 0} onClick={() => void confirm(tx, value)}>Simpan</Button></span>
        : <span className="int-confirm-actions"><Button type="button" variant="secondary" className="small" disabled={busy} onClick={() => void confirm(tx, tx.amount)}><Check size={14}/> Sesuai</Button><Button type="button" variant="ghost" className="small" disabled={busy} onClick={() => { setEditing(tx.id); setValue(tx.amount); }}>Ubah</Button></span>}
    </li>)}</ul>
    {items.length > limit && (compact && !all ? <button type="button" className="link-button int-more" onClick={() => setAll(true)}>Lihat {items.length - limit} lainnya</button> : <small className="int-more">+{items.length - limit} lainnya</small>)}
  </div>;
}

/** Shown instead of the edit form when an interest transaction is opened: how it was calculated, and the bank check. */
export function InterestTxDetail({ tx, notify, onDone }: { tx: LedgerTx; notify: (message: string) => void; onDone: () => void }) {
  const { user } = useApp();
  const r = tx.interest!;
  const [editing, setEditing] = useState(false), [value, setValue] = useState(tx.amount), [busy, setBusy] = useState(false);
  async function confirm(amount: number) {
    if (!user) return; setBusy(true);
    try { await (await import('@/lib/interest-store')).confirmInterest(user.uid, tx.id, amount); notify(amount === tx.amount ? 'Bunga ditandai sesuai.' : `Bunga diubah ke ${rupiah(amount)}.`); onDone(); }
    catch (e) { notify((e as Error).message); } finally { setBusy(false); }
  }
  const calculated = r.confirmed ? r.confirmed.calculated : tx.amount;
  return <div className="int-detail">
    <div className="int-detail-head"><span className="int-badge">Otomatis</span><strong>+{rupiah(tx.amount)}</strong><small>{r.days && r.accrualFrom ? `Bunga ${dateLabel(r.accrualFrom)}–${dateLabel(r.date, true)} · ${r.days} hari` : `Bunga untuk saldo akhir ${dateLabel(r.date, true)}`}</small></div>
    <dl className="int-detail-rows">
      <div><dt>{r.days ? 'Saldo akhir hari terakhir' : 'Saldo akhir hari'}</dt><dd>{rupiah(r.closing)}</dd></div>
      <div><dt>Bunga</dt><dd>{percent(r.rate)} {r.basis === 'month' ? '/ bulan' : 'p.a.'}</dd></div>
      <div><dt>Bunga kotor</dt><dd>Rp{decimals(microToRupiah(r.grossMicro))}</dd></div>
      {r.taxEnabled && <div><dt>Pajak {percent(r.taxRate)}</dt><dd>−Rp{decimals(microToRupiah(r.taxMicro))}</dd></div>}
      <div className="is-total"><dt>Bunga bersih</dt><dd>Rp{decimals(microToRupiah(r.netMicro))}</dd></div>
      {(r.carryInMicro > 0 || r.carryOutMicro > 0) && <div className="is-faint"><dt>Sisa di bawah Rp1</dt><dd>{r.carryInMicro > 0 ? `+Rp${decimals(microToRupiah(r.carryInMicro))} masuk` : ''}{r.carryInMicro > 0 && r.carryOutMicro > 0 ? ' · ' : ''}{r.carryOutMicro > 0 ? `Rp${decimals(microToRupiah(r.carryOutMicro))} ke berikutnya` : ''}</dd></div>}
      <div><dt>Dihitung aplikasi</dt><dd>{rupiah(calculated)}</dd></div>
      {r.confirmed && calculated !== tx.amount && <div><dt>Menurut bank</dt><dd>{rupiah(tx.amount)} <small>({tx.amount > calculated ? '+' : '−'}{rupiah(Math.abs(tx.amount - calculated))})</small></dd></div>}
    </dl>
    {r.confirmed ? <p className="int-note"><Check size={13}/> Sudah dicocokkan dengan bank.</p>
      : editing ? <div className="int-confirm-edit is-wide"><Field label="Nominal dari bank"><Money value={value} onChange={setValue}/></Field><Button type="button" disabled={busy || value <= 0} onClick={() => void confirm(value)}>Simpan</Button></div>
      : <div className="modal-actions"><Button type="button" variant="secondary" disabled={busy} onClick={() => setEditing(true)}>Beda dengan bank</Button><Button type="button" disabled={busy} onClick={() => void confirm(tx.amount)}><Check size={15}/> Sesuai</Button></div>}
  </div>;
}

/**
 * On Beranda and Transaksi: credited interest from any wallet that has not been checked against the bank yet, with
 * "Sesuai" / "Ubah" right there. Nothing is shown when everything is checked.
 */
export function InterestInbox({ notify }: { notify: (message: string) => void }) {
  const { data } = useApp();
  const items = useMemo(() => data.transactions.filter(t => t.interest?.source === 'wallet_interest' && !t.interest.confirmed).sort((a, b) => b.date.localeCompare(a.date)), [data.transactions]);
  if (!items.length) return null;
  return <section className="panel int-inbox" aria-label="Bunga belum dicek"><span className="int-inbox-icon" aria-hidden="true"><TrendingUp size={16}/></span><ConfirmList compact items={items} notify={notify} title={items.length > 1 ? `${items.length} bunga baru · cek dengan bank` : 'Bunga baru · cek dengan bank'}/></section>;
}
