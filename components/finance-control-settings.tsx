'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpenText, Calculator, CircleHelp, History, Scale, ShieldCheck, SlidersHorizontal, Target, Wallet, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { Money } from './fields';
import { Button } from './ui/button';
import { AppIcon, identityStyle } from './visual-identity';
import { metrics, rupiah } from '@/lib/accounting';
import { availableMoney, committedAmount, horizonLabels, type AvailabilitySettings } from '@/lib/finance-control';
import { saveProfile, updateWalletFlags } from '@/lib/firestore';
import { kantongOf } from '@/lib/pockets';
import { walletGroup } from '@/lib/wallet-groups';
import { dateInTimeZone, todayInTimeZone } from '@/lib/period';

/**
 * Kontrol keuangan: how Uang bebas, Uang tersedia and Aset bersih are worked out — explained with the
 * user's own numbers — and every switch that changes them, down to each wallet.
 */
type Perform = (fn: () => Promise<unknown>, message: string) => Promise<void>;

function Card({ icon: Icon, title, lead, children }: { icon: LucideIcon; title: string; lead?: ReactNode; children: ReactNode }) {
  return <section className="fc-card"><header><span className="fc-card-icon"><Icon size={17}/></span><div><h3>{title}</h3>{lead && <p>{lead}</p>}</div></header>{children}</section>;
}
function Line({ label, value, kind = 'plain', note }: { label: string; value: number; kind?: 'plain' | 'minus' | 'total' | 'off' | 'note'; note?: string }) {
  return <div className={`fc-line is-${kind}`}><span>{label}{note && <small>{note}</small>}</span><strong>{kind === 'minus' ? `− ${rupiah(value)}` : rupiah(value)}</strong></div>;
}
function Toggle({ checked, onChange, title, children, disabled }: { checked: boolean; onChange: (value: boolean) => void; title: string; children?: ReactNode; disabled?: boolean }) {
  return <label className={`switch-row ${disabled ? 'is-disabled' : ''}`}><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)}/><span><strong>{title}</strong>{children && <small>{children}</small>}</span></label>;
}

export function FinanceControlSettings({ perform, navigate }: { perform: Perform; navigate?: (key: string) => void }) {
  const { data, profile, user, cycle } = useApp();
  const today = todayInTimeZone(profile?.timeZone), day = dateInTimeZone(new Date(), profile?.timeZone);
  const stat = metrics(data, cycle.start, cycle.end, profile?.salaryCycleStartDay, day, Boolean(profile?.netWorthIncludesReceivables));
  const settings: AvailabilitySettings = profile || {};
  const subtract = profile?.excludeCommittedFromAvailable !== false, horizon = profile?.commitmentHorizon || 'cycle';
  const committed = committedAmount(data, today, cycle.end, settings), buffer = Math.max(0, profile?.freeMoneyBuffer || 0);
  const available = availableMoney(stat.free, committed, settings);
  const { usable, usableCount, kantongMoney, goalMoney, keptWallets } = stat.freeParts;
  const [bufferDraft, setBufferDraft] = useState(buffer), [warning, setWarning] = useState(profile?.budgetWarningPercent || 80);
  useEffect(() => setBufferDraft(buffer), [buffer]);
  useEffect(() => setWarning(profile?.budgetWarningPercent || 80), [profile?.budgetWarningPercent]);
  const save = (changes: Parameters<typeof saveProfile>[1], message = 'Pengaturan disimpan.') => { if (user) void perform(() => saveProfile(user.uid, changes), message); };
  // Same order as the Dompet page.
  const wallets = data.wallets.filter(w => !w.isArchived).map((w, i) => ({ w, at: w.displayOrder ?? i })).sort((a, b) => a.at - b.at).map(row => row.w);
  const receivables = stat.receivables;

  return <div className="fc-page">
    <section className="fc-hero">
      <div><small>Uang tersedia sekarang</small><strong>{rupiah(available)}</strong><span>Uang bebas setelah tagihan dan cadangan aman — angka yang aman dipakai, sesuai pengaturan di bawah.</span></div>
      <div className="fc-hero-chips"><span><small>Uang bebas</small><b>{rupiah(stat.free)}</b></span><span><small>Aset bersih</small><b>{rupiah(stat.netWorth)}</b></span></div>
    </section>

    <Card icon={Calculator} title="Dari mana angkanya" lead={<>Tiga angka utama di aplikasi: <b>Uang bebas</b> (uang yang belum punya tujuan), <b>Uang tersedia</b> (uang bebas dikurangi tagihan dan cadangan), dan <b>Aset bersih</b> (seluruh harta dikurangi utang).</>}>
      <div className="fc-formula">
        <Line label={`Saldo dompet yang bisa dipakai (${usableCount} dompet)`} value={usable}/>
        {kantongMoney > 0 && <Line label="Dompet yang masuk kantong" value={kantongMoney} kind="minus" note="mis. dana darurat — sudah punya tujuan"/>}
        {goalMoney > 0 && <Line label="Sudah terkumpul untuk tujuan dana" value={goalMoney} kind="minus"/>}
        <Line label="Uang bebas" value={stat.free} kind="total"/>
        <Line label={subtract ? `Tagihan & rencana belum dibayar (${horizonLabels[horizon].toLowerCase()})` : 'Tagihan & rencana (tidak dikurangi)'} value={subtract ? committed : 0} kind={subtract ? 'minus' : 'off'}/>
        {buffer > 0 && <Line label="Cadangan aman" value={buffer} kind="minus" note="selalu disisihkan"/>}
        <Line label="Uang tersedia" value={available} kind="total"/>
        <Line label="Tidak dihitung: dompet Disimpan" value={keptWallets} kind="note"/>
      </div>
    </Card>

    <Card icon={SlidersHorizontal} title="Atur Uang tersedia" lead="Sesuaikan seberapa hati-hati angka Uang tersedia di Beranda, Insight, dan Wish list.">
      <div className="set-switches">
        <Toggle checked={subtract} title="Kurangi dengan tagihan & rencana" onChange={value => save({ excludeCommittedFromAvailable: value })}>Tagihan rutin, rencana pengeluaran, dan transaksi yang menunggu konfirmasi dianggap sudah terpakai walau belum dibayar.</Toggle>
      </div>
      <div className={`fc-field ${subtract ? '' : 'is-disabled'}`}><span className="fc-label">Tagihan yang dihitung</span>
        <div className="ip-seg fc-seg">{(Object.keys(horizonLabels) as (keyof typeof horizonLabels)[]).map(key => <button type="button" key={key} disabled={!subtract} className={horizon === key ? 'active' : ''} onClick={() => save({ commitmentHorizon: key })}>{horizonLabels[key]}</button>)}</div>
        <small className="fc-help">{horizon === 'week' ? 'Hanya tagihan 7 hari ke depan — angka lebih longgar, cocok kalau gaji mingguan.' : horizon === 'month' ? 'Tagihan 30 hari ke depan — paling hati-hati, walau melewati gajian.' : 'Tagihan sampai tanggal gajian berikutnya — paling umum untuk gaji bulanan.'} Tagihan yang sudah lewat jatuh tempo selalu dihitung.</small>
      </div>
      <div className="fc-field"><span className="fc-label">Cadangan aman</span>
        <div className="fc-buffer"><Money value={bufferDraft} onChange={setBufferDraft}/><Button className="small" disabled={bufferDraft === buffer} onClick={() => save({ freeMoneyBuffer: Math.max(0, bufferDraft) }, 'Cadangan aman disimpan.')}>Simpan</Button></div>
        <div className="ip-choices fc-chips">{[0, 250_000, 500_000, 1_000_000, 2_000_000].map(v => <button type="button" key={v} className={bufferDraft === v ? 'active' : ''} onClick={() => setBufferDraft(v)}>{v ? rupiah(v).replace('.000.000', ' jt').replace('.000', ' rb') : 'Tanpa'}</button>)}</div>
        <small className="fc-help">Nominal yang tidak pernah dianggap bisa dibelanjakan, misalnya uang jaga-jaga di dompet harian. Tidak mengubah saldo dompet mana pun.</small>
      </div>
      <div className="set-switches">
        <Toggle checked={Boolean(profile?.realisticMode)} title="Redupkan kartu Total Aset di Beranda" onChange={value => save({ realisticMode: value })}>Supaya perhatian tertuju ke uang bebas, bukan total saldo yang sebagian sudah disimpan.</Toggle>
      </div>
    </Card>

    <Card icon={Wallet} title="Dompet dalam perhitungan" lead={<>Atur tiap dompet: ikut <b>Uang bebas</b> (bisa dibelanjakan) dan/atau <b>Aset bersih</b>. Dompet Tabungan dan Investasi biasanya hanya masuk aset bersih.</>}>
      <ul className="fc-wallets">{wallets.map(w => { const k = kantongOf(w.id, data.funds), free = !w.isReserved && w.isSpendable !== false && !k; return <li key={w.id}>
        <span className="fc-wallet-icon" style={identityStyle(w.color)}><AppIcon icon={w.icon}/></span>
        <span className="fc-wallet-text"><strong>{w.name}</strong><small>{rupiah(w.cachedBalance)}{k ? ` · di kantong ${k.name}` : w.isReserved ? ' · Disimpan' : ''}</small></span>
        <span className="fc-pills">
          <button type="button" className={free ? 'on' : ''} disabled={Boolean(k)} title={k ? 'Dompet di kantong tidak masuk uang bebas' : undefined} aria-pressed={free} onClick={() => { if (user) void perform(() => updateWalletFlags(user.uid, w.id, { ...(w.group ? {} : { group: walletGroup(w) }), ...(free ? { isReserved: true } : { isReserved: false, isSpendable: true }) }), free ? `${w.name} tidak lagi dihitung sebagai uang bebas.` : `${w.name} dihitung sebagai uang bebas.`); }}>Uang bebas</button>
          <button type="button" className={w.includeInNetWorth !== false ? 'on' : ''} aria-pressed={w.includeInNetWorth !== false} onClick={() => { if (user) void perform(() => updateWalletFlags(user.uid, w.id, { includeInNetWorth: w.includeInNetWorth === false }), w.includeInNetWorth === false ? `${w.name} masuk aset bersih.` : `${w.name} tidak dihitung di aset bersih.`); }}>Aset bersih</button>
        </span>
      </li>; })}</ul>
      {!wallets.length && <p className="muted">Belum ada dompet.</p>}
    </Card>

    <Card icon={Scale} title="Aset bersih" lead="Gambaran kekayaanmu: semua yang kamu punya dikurangi semua yang kamu utang.">
      <div className="fc-formula">
        <Line label="Saldo dompet yang dihitung" value={stat.assets}/>
        <Line label="Utang yang belum lunas" value={stat.liabilities} kind="minus"/>
        {profile?.netWorthIncludesReceivables ? <Line label="Piutang & klaim kantor belum dibayar" value={receivables} note="ikut dihitung"/> : receivables > 0 ? <Line label="Piutang & klaim kantor (tidak dihitung)" value={receivables} kind="off"/> : null}
        <Line label="Aset bersih" value={stat.netWorth} kind="total"/>
      </div>
      <div className="set-switches"><Toggle checked={Boolean(profile?.netWorthIncludesReceivables)} title="Hitung piutang & klaim kantor" onChange={value => save({ netWorthIncludesReceivables: value })}>{profile?.netWorthIncludesReceivables ? 'Uang yang dipinjam orang dan klaim yang belum cair ikut menambah aset bersih.' : 'Mati: piutang dan klaim baru dihitung setelah benar-benar diterima — lebih hati-hati.'}</Toggle></div>
    </Card>

    <Card icon={Target} title="Peringatan anggaran" lead="Kapan anggaran dianggap hampir habis: warnanya berubah dan notifikasi dikirim (kalau pengingat anggaran aktif).">
      <div className="fc-field"><span className="fc-label">Beri tanda saat terpakai <b>{warning}%</b></span>
        <input className="fc-range" type="range" min={50} max={100} step={5} value={warning} onChange={e => setWarning(Number(e.target.value))} onPointerUp={() => { if (warning !== (profile?.budgetWarningPercent || 80)) save({ budgetWarningPercent: warning }, 'Batas peringatan disimpan.'); }} onKeyUp={() => { if (warning !== (profile?.budgetWarningPercent || 80)) save({ budgetWarningPercent: warning }, 'Batas peringatan disimpan.'); }}/>
        <div className="fc-range-scale"><span>50%</span><span>Seimbang 80%</span><span>100%</span></div>
        <small className="fc-help">Contoh: anggaran Makan Rp1 jt akan diberi tanda saat sudah terpakai {rupiah(1_000_000 * warning / 100)}. Tiap anggaran tetap bisa punya batasnya sendiri.</small>
      </div>
    </Card>

    <Card icon={ShieldCheck} title="Alat & bantuan">
      <div className="settings-links">
        <button type="button" className="settings-link" onClick={() => navigate?.('health')}><span className="settings-link-icon"><ShieldCheck size={18}/></span><span className="settings-link-text"><strong>Periksa Data</strong><small>Cari saldo yang tidak cocok dan catatan yang janggal</small></span></button>
        <button type="button" className="settings-link" onClick={() => navigate?.('cycles')}><span className="settings-link-icon"><History size={18}/></span><span className="settings-link-text"><strong>Riwayat Siklus</strong><small>Ringkasan dan laporan setiap siklus gaji</small></span></button>
        <button type="button" className="settings-link" onClick={() => navigate?.('help')}><span className="settings-link-icon"><CircleHelp size={18}/></span><span className="settings-link-text"><strong>Tanya Jawab</strong><small>Arti istilah seperti uang bebas, kantong, siklus, dan cara pakainya</small></span></button>
        <button type="button" className="settings-link" onClick={() => navigate?.('wallets')}><span className="settings-link-icon"><BookOpenText size={18}/></span><span className="settings-link-text"><strong>Atur dompet</strong><small>Kelompok, Disimpan, dan kegunaan tiap dompet</small></span></button>
      </div>
    </Card>
  </div>;
}
