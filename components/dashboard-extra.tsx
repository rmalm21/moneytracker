'use client';
import { useMemo, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from './app-provider';
import { Emoji } from './emoji';
import { Delta } from './delta';
import { AppIcon, identityStyle } from './visual-identity';
import { usePeriodTransactions } from './period-selector';
import { budgetCurrent, budgetIconCategoryId, rupiah, transactionExpense } from '@/lib/accounting';
import { budgetCommitted } from '@/lib/finance-control';
import { categoryBreakdown } from '@/lib/category-analytics';
import { emergencyPockets, isKantong, kantongWallets, pocketEmoji } from '@/lib/pockets';
import { progress as wishProgress, remaining as wishRemaining, sortWishes } from '@/lib/wishlist';
import { walletGroup, walletGroups } from '@/lib/wallet-groups';
import { dateInTimeZone, formatDate, nextDate, parseDate, type DateRange } from '@/lib/period';
import type { LedgerTx } from '@/lib/types';

/**
 * Extra Beranda cards the user can add from "Tambah kartu". Each is its own component so it can load
 * what it needs; they share one look: a foldable panel with a total and a short list.
 */
export const extraWidgets = ['savingsRate', 'weekSpend', 'bigExpenses', 'topMerchants', 'categoryChanges', 'budgetAlerts', 'kantong', 'assetMix', 'emergency', 'wishlist', 'debts', 'bills', 'notes', 'lastCycle'] as const;
export type ExtraWidgetId = typeof extraWidgets[number];
export type ExtraContext = { navigate: (view: string, focus?: string) => void; openTx: (preset?: Partial<LedgerTx>, editing?: LedgerTx) => void; range: DateRange; items: LedgerTx[]; prevItems: LedgerTx[]; loading: boolean; basis: string; today: string; /** Same Aset bersih as the hero card (receivables only when the user counts them). */ worth: { netWorth: number; receivables: number } };

const short = (value: number) => { const n = Math.abs(value), sign = value < 0 ? '-' : ''; return n >= 1e9 ? `${sign}Rp${(n / 1e9).toFixed(1).replace('.', ',').replace(',0', '')} M` : n >= 1e6 ? `${sign}Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `${sign}Rp${Math.round(n / 1e3)} rb` : rupiah(value); };
const shift = (date: string, days: number) => { const d = parseDate(date); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const daysUntil = (from: string, to: string) => Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
const whenText = (days: number) => days < 0 ? `terlambat ${-days} hari` : days === 0 ? 'hari ini' : days === 1 ? 'besok' : `${days} hari lagi`;
const monthName = (start: string) => { const d = parseDate(start); d.setDate(d.getDate() + 15); return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }); };

function Card({ title, sub, value, tone, children, link }: { title: string; sub?: ReactNode; value?: ReactNode; tone?: string; children: ReactNode; link?: [string, () => void] }) {
  return <details className="panel widget-details dx-card" open>
    <summary><span><strong>{title}</strong>{sub && <small>{sub}</small>}</span>{value !== undefined && <strong className={tone || ''}>{value}</strong>}</summary>
    <div className="widget-body">{children}{link && <button type="button" className="link-button dx-link" onClick={link[1]}>{link[0]} <ArrowRight size={14}/></button>}</div>
  </details>;
}
/** A thin progress bar; `color` may be a hex colour or a theme variable such as var(--rose). */
function Bar({ value, color }: { value: number; color?: string }) { return <i className="dx-bar" style={color ? { '--identity-color': color } as CSSProperties : undefined}><b style={{ width: `${Math.max(value > 0 ? 3 : 0, Math.min(1, value) * 100)}%` }}/></i>; }
function Row({ icon, color, title, sub, amount, amountSub, tone, bar, onClick }: { icon: ReactNode; color?: string; title: ReactNode; sub?: ReactNode; amount: ReactNode; amountSub?: ReactNode; tone?: string; bar?: ReactNode; onClick?: () => void }) {
  return <button type="button" className="dx-row" onClick={onClick}>
    <span className="dx-icon" style={identityStyle(color)}>{icon}</span>
    <span className="dx-main"><b>{title}</b>{sub && <small>{sub}</small>}{bar}</span>
    <span className="dx-amount"><strong className={tone || ''}>{amount}</strong>{amountSub && <small>{amountSub}</small>}</span>
  </button>;
}
const Empty = ({ children }: { children: ReactNode }) => <p className="dx-empty">{children}</p>;

function SavingsRate({ ctx }: { ctx: ExtraContext }) {
  const { profile } = useApp();
  const sum = (list: LedgerTx[], type: 'income' | 'expense') => list.reduce((n, t) => n + (type === 'income' ? (t.type === 'income' ? t.amount : 0) : transactionExpense(t)), 0);
  const income = sum(ctx.items, 'income'), expense = sum(ctx.items, 'expense'), rate = income > 0 ? (income - expense) / income : null;
  const prevIncome = sum(ctx.prevItems, 'income'), prevRate = prevIncome > 0 ? (prevIncome - sum(ctx.prevItems, 'expense')) / prevIncome : null;
  const target = profile?.insightProfile?.savingsTarget ?? .2, r = 40, c = 2 * Math.PI * r, shown = Math.max(0, Math.min(1, rate ?? 0));
  return <Card title="Rasio Menabung" sub="Bagian pemasukan yang tersisa" value={rate === null ? '–' : `${Math.round(rate * 100)}%`} tone={rate !== null && rate < 0 ? 'amount-negative' : ''} link={['Buka Insight', () => ctx.navigate('advisor')]}>
    {rate === null ? <Empty>{ctx.loading ? 'Memuat…' : 'Belum ada pemasukan di periode ini.'}</Empty> : <div className="dx-rate">
      <span className={`dx-ring ${rate >= target ? 'is-good' : rate < 0 ? 'is-bad' : ''}`} aria-hidden="true"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r={r} className="track"/>{shown > 0 && <circle cx="50" cy="50" r={r} className="fill" strokeDasharray={`${shown * c} ${c}`}/>}<circle cx="50" cy="50" r={r} className="goal" strokeDasharray={`2 ${c}`} strokeDashoffset={-target * c}/></svg><b>{Math.round(rate * 100)}%</b></span>
      <div><p>Tersisa <b>{rupiah(income - expense)}</b> dari pemasukan <b>{rupiah(income)}</b>.</p><p>Target menabung <b>{Math.round(target * 100)}%</b> {rate >= target ? '— tercapai 🎉' : `— kurang ${rupiah(Math.max(0, income * target - (income - expense)))}`}</p>{prevRate !== null && <Delta current={Math.round(rate * 100)} previous={Math.round(prevRate * 100)} good="up" basis={ctx.basis}/>}</div>
    </div>}
  </Card>;
}

function WeekSpend({ ctx }: { ctx: ExtraContext }) {
  const start = shift(ctx.today, -6), end = nextDate(ctx.today);
  const now = usePeriodTransactions({ start, end }), before = usePeriodTransactions({ start: shift(start, -7), end: start });
  const days = Array.from({ length: 7 }, (_, i) => { const date = shift(start, i); return { date, amount: now.items.filter(t => t.date === date).reduce((n, t) => n + transactionExpense(t), 0) }; });
  const total = days.reduce((n, d) => n + d.amount, 0), prev = before.items.reduce((n, t) => n + transactionExpense(t), 0), max = Math.max(1, ...days.map(d => d.amount));
  const top = [...days].sort((a, b) => b.amount - a.amount)[0];
  return <Card title="Belanja 7 Hari Terakhir" sub={<>Rata-rata {short(total / 7)}/hari{!before.loading && (total || prev) ? <> · <Delta current={total} previous={prev} good="down" basis="7 hari sebelumnya"/></> : null}</>} value={rupiah(total)} link={['Lihat transaksi', () => ctx.navigate('transactions', `@${start}..${end}`)]}>
    <div className="dx-week" role="img" aria-label={days.map(d => `${formatDate(d.date, false)}: ${rupiah(d.amount)}`).join(', ')}>{days.map(d => <span key={d.date} className={d.date === ctx.today ? 'is-today' : ''}><em>{d.amount ? short(d.amount).replace('Rp', '') : ''}</em><i style={{ height: `${Math.max(d.amount ? 6 : 2, d.amount / max * 100)}%` }}/><small>{parseDate(d.date).toLocaleDateString('id-ID', { weekday: 'short' })}</small></span>)}</div>
    {top && top.amount > 0 && <p className="dx-note">Paling banyak {formatDate(top.date, false)}: <b>{rupiah(top.amount)}</b>.</p>}
  </Card>;
}

function BigExpenses({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const list = [...ctx.items].filter(t => transactionExpense(t) > 0).sort((a, b) => transactionExpense(b) - transactionExpense(a)).slice(0, 5);
  return <Card title="Pengeluaran Terbesar" sub="Periode ini" value={list.length ? rupiah(list.reduce((n, t) => n + transactionExpense(t), 0)) : undefined}>
    {list.length ? list.map(t => { const cat = data.categories.find(c => c.id === (t.subcategoryId || t.categoryId)) || data.categories.find(c => c.id === t.categoryId); return <Row key={t.id} icon={<AppIcon icon={cat?.icon} fallback="🧾"/>} color={cat?.color} title={t.description || t.merchant || cat?.name || 'Pengeluaran'} sub={`${formatDate(t.date, false)}${cat ? ` · ${cat.name}` : ''}`} amount={rupiah(transactionExpense(t))} onClick={() => ctx.openTx(undefined, t)}/>; }) : <Empty>{ctx.loading ? 'Memuat…' : 'Belum ada pengeluaran di periode ini.'}</Empty>}
  </Card>;
}

function TopMerchants({ ctx }: { ctx: ExtraContext }) {
  const places = useMemo(() => { const map = new Map<string, { name: string; amount: number; count: number }>(); for (const t of ctx.items) { const spend = transactionExpense(t); const name = (t.merchant || '').trim(); if (!spend || !name) continue; const key = name.toLowerCase(); const row = map.get(key) || { name, amount: 0, count: 0 }; row.amount += spend; row.count++; map.set(key, row); } return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, 5); }, [ctx.items]);
  const max = Math.max(1, ...places.map(p => p.amount));
  return <Card title="Tempat Paling Sering" sub="Dari kolom Tempat saat mencatat" value={places.length ? `${places.length} tempat` : undefined} link={['Buka Analisis', () => ctx.navigate('analytics')]}>
    {places.length ? places.map(p => <Row key={p.name} icon={<Emoji e="📍"/>} title={p.name} sub={`${p.count}× · rata-rata ${short(p.amount / p.count)}`} amount={rupiah(p.amount)} bar={<Bar value={p.amount / max}/>}/>) : <Empty>Isi kolom <b>Tempat</b> saat mencatat pengeluaran untuk melihat tempat yang paling sering kamu datangi.</Empty>}
  </Card>;
}

function CategoryChanges({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const rows = useMemo(() => { const now = categoryBreakdown(ctx.items, data.categories), before = categoryBreakdown(ctx.prevItems, data.categories); const ids = new Set([...now.map(c => c.id), ...before.map(c => c.id)]); return [...ids].map(id => { const a = now.find(c => c.id === id), b = before.find(c => c.id === id), meta = a || b!; return { id, name: meta.name, icon: meta.icon, color: meta.color, now: a?.amount || 0, before: b?.amount || 0 }; }).filter(r => r.now !== r.before); }, [ctx.items, ctx.prevItems, data.categories]);
  const up = rows.filter(r => r.now > r.before).sort((a, b) => (b.now - b.before) - (a.now - a.before)).slice(0, 3), down = rows.filter(r => r.now < r.before).sort((a, b) => (a.now - a.before) - (b.now - b.before)).slice(0, 3);
  const list = (items: typeof rows, kind: 'up' | 'down') => items.map(r => <Row key={r.id} icon={<AppIcon icon={r.icon} fallback="🗂️"/>} color={r.color} title={r.name} sub={`${short(r.before)} → ${short(r.now)}`} amount={`${kind === 'up' ? '+' : '−'}${short(Math.abs(r.now - r.before))}`} tone={kind === 'up' ? 'amount-negative' : 'amount-positive'} amountSub={<Delta current={r.now} previous={r.before} good="down" basis={ctx.basis} compact/>} onClick={() => ctx.navigate('transactions', `category:${r.id}@${ctx.range.start}..${ctx.range.end}`)}/>);
  return <Card title="Kategori Naik & Turun" sub="Dibanding periode lalu di hari yang sama">
    {ctx.loading ? <Empty>Memuat…</Empty> : !up.length && !down.length ? <Empty>Belum ada perubahan berarti dibanding periode lalu.</Empty> : <>
      {up.length > 0 && <h5 className="dx-sub">Naik</h5>}{list(up, 'up')}
      {down.length > 0 && <h5 className="dx-sub">Turun</h5>}{list(down, 'down')}
    </>}
  </Card>;
}

function BudgetAlerts({ ctx }: { ctx: ExtraContext }) {
  const { data, profile } = useApp();
  const day = dateInTimeZone(new Date(), profile?.timeZone), salaryDay = profile?.salaryCycleStartDay || 24;
  const rows = data.budgets.filter(b => b.active && b.classification !== 'savings' && b.classification !== 'sinking').map(b => { const s = budgetCurrent(b, data.transactions, data.categories, day, salaryDay), committed = budgetCommitted(b, data, day, salaryDay), limit = Math.max(1, s.available), used = (s.spent + committed) / limit, warn = (b.warningPercent || profile?.budgetWarningPercent || 80) / 100, cat = data.categories.find(c => c.id === budgetIconCategoryId(b)); return { b, used, left: s.remaining - committed, over: s.spent > s.available || s.remaining - committed < 0, warn: used >= warn, cat }; }).filter(r => r.warn || r.over).sort((a, b) => b.used - a.used);
  return <Card title="Anggaran Perlu Perhatian" sub="Hampir habis atau terlampaui" value={rows.length ? `${rows.length} anggaran` : undefined} tone={rows.some(r => r.over) ? 'amount-negative' : ''} link={['Buka Anggaran', () => ctx.navigate('budgets')]}>
    {rows.length ? rows.map(r => <Row key={r.b.id} icon={<AppIcon icon={r.cat?.icon} fallback="🎯"/>} color={r.cat?.color} title={r.b.name} sub={`${Math.round(r.used * 100)}% terpakai`} amount={rupiah(r.left)} amountSub={r.left < 0 ? 'lewat batas' : 'sisa'} tone={r.left < 0 ? 'amount-negative' : ''} bar={<Bar value={r.used} color={r.over ? 'var(--rose)' : '#d98a1c'}/>} onClick={() => ctx.navigate('budgets')}/>) : <Empty>Semua anggaran masih aman. 👍</Empty>}
  </Card>;
}

function Kantong({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const list = data.funds.filter(f => !f.isArchived && isKantong(f));
  return <Card title="Kantong" sub={`${list.length} kantong`} value={rupiah(list.reduce((n, k) => n + Math.max(0, k.currentAmount), 0))} link={['Buka Dompet', () => ctx.navigate('wallets')]}>
    {list.length ? list.map(k => { const members = kantongWallets(k, data.wallets), pct = k.targetAmount ? k.currentAmount / k.targetAmount : 0; return <Row key={k.id} icon={<Emoji e={pocketEmoji(k)}/>} title={k.name} sub={members.map(w => w.name).join(' + ') || 'Belum ada dompet'} amount={rupiah(k.currentAmount)} amountSub={k.targetAmount ? `${Math.round(Math.min(1, pct) * 100)}% dari ${short(k.targetAmount)}` : undefined} bar={k.targetAmount ? <Bar value={pct}/> : undefined} onClick={() => ctx.navigate('wallets')}/>; }) : <Empty>Belum ada kantong. Kelompokkan dompet untuk satu tujuan, misalnya dana darurat, di menu Dompet.</Empty>}
  </Card>;
}

function AssetMix({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const live = data.wallets.filter(w => !w.isArchived && w.includeInNetWorth !== false);
  const groups = walletGroups.map(g => ({ ...g, amount: live.filter(w => walletGroup(w) === g.key).reduce((n, w) => n + Math.max(0, w.cachedBalance), 0) }));
  const total = groups.reduce((n, g) => n + g.amount, 0), debt = data.debts.reduce((n, d) => n + Math.max(0, d.outstandingAmount), 0);
  // Wallets below zero lower Aset bersih but not the total above, so they get their own row and the rows add up.
  const overdrawn = live.filter(w => w.cachedBalance < 0), minus = overdrawn.reduce((n, w) => n - w.cachedBalance, 0), { netWorth, receivables } = ctx.worth;
  const colors: Record<string, string> = { operational: 'var(--chart-1)', savings: 'var(--chart-3)', investment: 'var(--chart-4)' };
  return <Card title="Komposisi Aset" sub="Operasional, tabungan, dan investasi" value={rupiah(total)} link={['Buka Dompet', () => ctx.navigate('wallets')]}>
    {total > 0 ? <>
      <div className="dx-stack" role="img" aria-label={groups.map(g => `${g.label} ${Math.round(g.amount / total * 100)}%`).join(', ')}>{groups.filter(g => g.amount > 0).map(g => <i key={g.key} style={{ flex: g.amount, background: colors[g.key] }}/>)}</div>
      {groups.map(g => <div key={g.key} className="dx-legend"><i style={{ background: colors[g.key] }}/><span>{g.label}</span><b>{rupiah(g.amount)}</b><small>{Math.round(g.amount / total * 100)}%</small></div>)}
      {minus > 0 && <div className="dx-legend is-debt"><i/><span>Saldo minus<em>{overdrawn.map(w => w.name).join(', ')}</em></span><b className="amount-negative">−{rupiah(minus)}</b><small>{Math.round(minus / total * 100)}%</small></div>}
      {receivables > 0 && <div className="dx-legend is-plus"><i/><span>Piutang</span><b>+{rupiah(receivables)}</b><small>{Math.round(receivables / total * 100)}%</small></div>}
      {debt > 0 && <div className="dx-legend is-debt"><i/><span>Utang</span><b className="amount-negative">−{rupiah(debt)}</b><small>{Math.round(debt / total * 100)}%</small></div>}
      {(minus > 0 || receivables > 0 || debt > 0) && <div className="dx-legend is-total"><i/><span>Aset bersih</span><b className={netWorth < 0 ? 'amount-negative' : undefined}>{rupiah(netWorth)}</b><small/></div>}
    </> : <Empty>Belum ada saldo dompet.</Empty>}
  </Card>;
}

function Emergency({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  // Same rule as Insight: once there is an emergency kantong, older emergency Tujuan dana are not counted again.
  const found = emergencyPockets(data.funds), list = found?.list || [], amount = found?.total || 0, target = found?.target || 0;
  return <Card title="Dana Darurat" sub={target ? `${Math.round(Math.min(1, amount / target) * 100)}% dari target` : 'Uang jaga-jaga'} value={rupiah(amount)} link={['Lihat saran di Insight', () => ctx.navigate('advisor')]}>
    {list.length ? <>{target > 0 && <div className="dx-goal"><Bar value={amount / target} color="var(--positive)"/><small>{amount >= target ? 'Target tercapai 🎉' : `Kurang ${rupiah(target - amount)} lagi`}</small></div>}
      {list.map(f => <Row key={f.id} icon={<Emoji e={pocketEmoji(f)}/>} title={f.name} sub={isKantong(f) ? kantongWallets(f, data.wallets).map(w => w.name).join(' + ') : 'Tujuan dana'} amount={rupiah(f.currentAmount)} amountSub={f.targetAmount ? `dari ${short(f.targetAmount)}` : undefined} onClick={() => ctx.navigate(isKantong(f) ? 'wallets' : 'funds')}/>)}</>
      : <Empty>Belum ada dana darurat. Buat kantong <b>Dana darurat</b> di menu Dompet agar bisa dipantau di sini.</Empty>}
  </Card>;
}

function Wishlist({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const active = sortWishes((data.wishlist || []).filter(w => w.status === 'active'), 'priority', ctx.today).slice(0, 4);
  const left = (data.wishlist || []).filter(w => w.status === 'active').reduce((n, w) => n + wishRemaining(w), 0);
  return <Card title="Wish List" sub={`${(data.wishlist || []).filter(w => w.status === 'active').length} barang impian`} value={left ? `${short(left)} lagi` : undefined} link={['Buka Wish list', () => ctx.navigate('wishlist')]}>
    {active.length ? active.map(w => <Row key={w.id} icon={<Emoji e={w.emoji || '🎁'}/>} color={w.color} title={w.name} sub={`${rupiah(w.saved || 0)} dari ${rupiah(w.price)}`} amount={`${Math.round(wishProgress(w) * 100)}%`} bar={<Bar value={wishProgress(w)} color={w.color}/>} onClick={() => ctx.navigate('wishlist')}/>) : <Empty>Belum ada barang impian.</Empty>}
  </Card>;
}

function Debts({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const open = data.debts.filter(d => d.outstandingAmount > 0).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const monthly = open.reduce((n, d) => n + Math.min(d.installmentAmount || 0, d.outstandingAmount), 0);
  return <Card title="Utang & Cicilan" sub={monthly ? `Cicilan ${short(monthly)}/bulan` : `${open.length} utang aktif`} value={rupiah(open.reduce((n, d) => n + d.outstandingAmount, 0))} tone={open.length ? 'amount-negative' : ''} link={['Buka Utang', () => ctx.navigate('debts')]}>
    {open.length ? open.slice(0, 5).map(d => <Row key={d.id} icon={<Emoji e="💳"/>} title={d.name} sub={d.dueDate ? `Jatuh tempo ${formatDate(d.dueDate, false)} · ${whenText(daysUntil(ctx.today, d.dueDate))}` : d.provider || 'Tanpa jatuh tempo'} amount={rupiah(d.outstandingAmount)} amountSub={d.installmentAmount ? `cicilan ${short(d.installmentAmount)}` : undefined} bar={<Bar value={d.originalAmount ? (d.originalAmount - d.outstandingAmount) / d.originalAmount : 0} color="var(--positive)"/>} onClick={() => ctx.navigate('debts')}/>) : <Empty>Tidak ada utang aktif. 👏</Empty>}
  </Card>;
}

function Bills({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const next = data.recurring.filter(r => r.active && r.type !== 'income' && r.type !== 'transfer' && r.nextDate).sort((a, b) => a.nextDate.localeCompare(b.nextDate)).slice(0, 5);
  const month = data.recurring.filter(r => r.active && r.type !== 'income' && r.type !== 'transfer' && r.nextDate && r.nextDate <= shift(ctx.today, 30)).reduce((n, r) => n + r.amount, 0);
  return <Card title="Tagihan Rutin" sub="Jadwal berikutnya" value={month ? `${short(month)}/30 hari` : undefined} link={['Buka Jadwal rutin', () => ctx.navigate('recurring')]}>
    {next.length ? next.map(r => { const cat = data.categories.find(c => c.id === r.categoryId), days = daysUntil(ctx.today, r.nextDate); return <Row key={r.id} icon={<AppIcon icon={cat?.icon} fallback="🧾"/>} color={cat?.color} title={r.name} sub={`${formatDate(r.nextDate, false)} · ${whenText(days)}`} amount={rupiah(r.amount)} tone={days < 0 ? 'amount-negative' : ''} amountSub={r.mode === 'auto' ? 'otomatis' : r.mode === 'reminder' ? 'pengingat' : 'dikonfirmasi'} onClick={() => ctx.navigate('recurring')}/>; }) : <Empty>Belum ada tagihan rutin. Buat jadwal di menu Jadwal → Rutin.</Empty>}
  </Card>;
}

function Notes({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const upcoming = data.financialNotes.filter(n => n.date >= ctx.today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 4);
  const list = upcoming.length ? upcoming : data.financialNotes.filter(n => n.date < ctx.today).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  return <Card title="Catatan Keuangan" sub={upcoming.length ? 'Yang akan datang' : 'Terakhir dicatat'} value={data.financialNotes.length ? `${data.financialNotes.length} catatan` : undefined} link={['Buka Kalender', () => ctx.navigate('calendar')]}>
    {list.length ? list.map(n => <Row key={n.id} icon={<Emoji e="📝"/>} title={n.title} sub={`${formatDate(n.date, false)}${n.date >= ctx.today ? ` · ${whenText(daysUntil(ctx.today, n.date))}` : ''}${n.description ? ` · ${n.description}` : ''}`} amount={n.amount ? rupiah(n.amount) : ''} onClick={() => ctx.navigate('calendar')}/>) : <Empty>Belum ada catatan. Tambahkan dari Kalender, misalnya rencana bonus atau biaya sekolah.</Empty>}
  </Card>;
}

function LastCycle({ ctx }: { ctx: ExtraContext }) {
  const { data } = useApp();
  const [last, before] = [...data.cycleSnapshots].sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (!last) return <Card title="Siklus Lalu" sub="Belum ada siklus yang ditutup" link={['Buka Riwayat siklus', () => ctx.navigate('cycles')]}><Empty>Tutup siklus di Laporan → Riwayat siklus untuk melihat ringkasannya di sini.</Empty></Card>;
  const rate = last.income > 0 ? last.cashFlow / last.income : null;
  return <Card title="Siklus Lalu" sub={monthName(last.startDate)} value={`${last.cashFlow > 0 ? '+' : ''}${rupiah(last.cashFlow)}`} tone={last.cashFlow < 0 ? 'amount-negative' : 'amount-positive'} link={['Buka Riwayat siklus', () => ctx.navigate('cycles')]}>
    <div className="dx-kpis">
      <span><small>Masuk</small><b>{short(last.income)}</b>{before && <Delta current={last.income} previous={before.income} good="up" basis="Siklus sebelumnya" compact/>}</span>
      <span><small>Keluar</small><b>{short(last.expense)}</b>{before && <Delta current={last.expense} previous={before.expense} good="down" basis="Siklus sebelumnya" compact/>}</span>
      <span><small>Tersisa</small><b>{rate === null ? '–' : `${Math.round(rate * 100)}%`}</b></span>
      <span><small>Aset bersih</small><b className={last.closingNetWorth < last.openingNetWorth ? 'amount-negative' : ''}>{last.closingNetWorth >= last.openingNetWorth ? '+' : ''}{short(last.closingNetWorth - last.openingNetWorth)}</b></span>
    </div>
    {last.budgetTotal > 0 && <div className="dx-goal"><Bar value={last.budgetSpent / last.budgetTotal} color={last.budgetSpent > last.budgetTotal ? 'var(--rose)' : undefined}/><small>Anggaran {Math.round(last.budgetSpent / last.budgetTotal * 100)}% terpakai</small></div>}
  </Card>;
}

export function ExtraWidget({ id, ctx }: { id: ExtraWidgetId; ctx: ExtraContext }) {
  switch (id) {
    case 'savingsRate': return <SavingsRate ctx={ctx}/>;
    case 'weekSpend': return <WeekSpend ctx={ctx}/>;
    case 'bigExpenses': return <BigExpenses ctx={ctx}/>;
    case 'topMerchants': return <TopMerchants ctx={ctx}/>;
    case 'categoryChanges': return <CategoryChanges ctx={ctx}/>;
    case 'budgetAlerts': return <BudgetAlerts ctx={ctx}/>;
    case 'kantong': return <Kantong ctx={ctx}/>;
    case 'assetMix': return <AssetMix ctx={ctx}/>;
    case 'emergency': return <Emergency ctx={ctx}/>;
    case 'wishlist': return <Wishlist ctx={ctx}/>;
    case 'debts': return <Debts ctx={ctx}/>;
    case 'bills': return <Bills ctx={ctx}/>;
    case 'notes': return <Notes ctx={ctx}/>;
    case 'lastCycle': return <LastCycle ctx={ctx}/>;
  }
}
