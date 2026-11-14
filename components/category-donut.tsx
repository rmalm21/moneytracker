'use client';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Emoji } from './emoji';
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, ChevronUp, FolderTree } from 'lucide-react';
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { Delta } from './delta';
import { emojiOrFallback } from './visual-identity';
import { rupiah } from '@/lib/accounting';
import { categoryLines, type CategoryLine, type CategorySlice } from '@/lib/category-analytics';
import { amountsBySub, byTransaction, drillName, drillStats, lastDay, shortDate, type DrillBucket } from '@/lib/category-drill';
import type { Category, LedgerTx } from '@/lib/types';

type Slice = { id: string; name: string; amount: number; icon?: string; color?: string };
type Row = Slice & { pct: number; fill: string };
type Nav = (view: string, focus?: string) => void;
const RAD = Math.PI / 180;
const MIN_LABEL = .05;
const NONE = '__none';
const percent = (value: number) => `${Math.round(value * 100)}%`;
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${rupiah(Math.abs(value))}`;
/** Groups that are not a category of their own: what "Lihat transaksi" opens for them, if anything. */
const REAL = (id: string) => !['other', 'uncategorized', 'debt-payment', 'receivable-payment'].includes(id);
const linkFor = (id: string, kind: 'expense' | 'income', parent?: string): string =>
  // 10.3.1 "Tanpa subkategori" of a real category opens just those (to give them one), not the whole category.
  id === NONE ? (parent ? REAL(parent) ? `nosub:${parent}` : linkFor(parent, kind) : '') : id === 'other' ? '' : id === 'debt-payment' ? 'type:debt_payment' : id === 'receivable-payment' ? 'type:receivable_payment'
    : id === 'uncategorized' ? (kind === 'income' ? '' : 'category:uncategorized') : `category:${id}`;

/**
 * Spending (or income) by category: a donut with labelled slices, the total in the middle, and a legend with the change
 * vs the previous period. 10.3: tapping a category goes into it — a donut of its subcategories and the full story of
 * the category; tapping a subcategory shows the same for it (total, vs last period, share, how many, average, per day,
 * trend, names that come back, biggest transactions).
 */
export function CategoryDonut({ slices, previous, previousReady, navigate, basis, rangeFocus = '', kind = 'expense', items, prevItems, categories, range, today }: {
  slices: CategorySlice[]; previous: CategorySlice[]; previousReady: boolean; navigate: Nav; basis: string; rangeFocus?: string; kind?: 'expense' | 'income';
  items: LedgerTx[]; prevItems: LedgerTx[]; categories: Category[]; range: { start: string; end: string }; today: string;
}) {
  const good = kind === 'income' ? 'up' : 'down';
  const [path, setPath] = useState<{ cat: string | null; sub: string | null }>({ cat: null, sub: null });
  // 10.3.1 With one subcategory chosen the others fold away, so its detail sits right under it ("tampilkan semua" opens them).
  const [showAll, setShowAll] = useState(false);
  const legend = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  const lines = useMemo(() => categoryLines(items, categories, kind), [items, categories, kind]);
  const prevLines = useMemo(() => categoryLines(prevItems, categories, kind), [prevItems, categories, kind]);
  const rows = useMemo<(Row & CategorySlice)[]>(() => {
    const top = slices.slice(0, 6), rest = slices.slice(6);
    const list: CategorySlice[] = rest.length ? [...top, { id: 'other', name: 'Lainnya', amount: rest.reduce((n, s) => n + s.amount, 0), count: rest.reduce((n, s) => n + s.count, 0), icon: '📦', subcategories: rest.map(s => ({ id: s.id, name: s.name, amount: s.amount, icon: s.icon, color: s.color })) }] : top;
    return list.map((slice, index) => ({ ...slice, pct: total ? slice.amount / total : 0, fill: slice.id === 'other' ? 'var(--line-strong)' : slice.color || `var(--chart-${index % 6 + 1})` }));
  }, [slices, total]);
  const restIds = useMemo(() => slices.slice(6).map(s => s.id), [slices]);
  const previousOf = (id: string) => id === 'other' ? previous.filter(p => !rows.some(r => r.id === p.id)).reduce((n, p) => n + p.amount, 0) : previous.find(p => p.id === id)?.amount || 0;
  /** The parts behind a slice; for "Lainnya" each category of it plays the part of a subcategory. */
  const partsOf = (from: Map<string, CategoryLine[]>, id: string): CategoryLine[] => id === 'other' ? restIds.flatMap(cat => (from.get(cat) || []).map(line => ({ ...line, subId: cat }))) : from.get(id) || [];

  const go = (cat: string | null, sub: string | null = null) => {
    setPath({ cat, sub });
    // Coming from the bottom of a long legend: bring the top of the card back into view.
    const el = root.current; if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // A category that is no longer on the chart (the period or the flow changed): back to all categories.
  const catSlice = path.cat ? slices.find(s => s.id === path.cat) || rows.find(r => r.id === path.cat) : undefined;
  if (!path.cat || !catSlice) return topLevel();

  function topLevel() {
    return <div className="donut-layout" ref={root}>
      <Ring rows={rows} selected={null} onPick={id => go(id)} center={<><small>{kind === 'income' ? 'Total pemasukan' : 'Total pengeluaran'}</small><strong>{rupiah(total)}</strong><em>{slices.length} kategori</em></>}/>
      <div className="donut-legend">
        {rows.map(row => <div key={row.id} className="donut-row">
          <button type="button" className="donut-row-main has-chevron" onClick={() => go(row.id)} aria-label={`Perdalam ${row.name}`}>
            <span className="donut-dot" style={{ background: row.fill }}/>
            <span className="donut-name"><span aria-hidden="true"><Emoji e={emojiOrFallback(row.icon)}/></span> {row.name}</span>
            <span className="donut-amount"><strong>{rupiah(row.amount)}</strong><small>{percent(row.pct)}{previousReady && <> · <Delta current={row.amount} previous={previousOf(row.id)} good={good} basis={basis} compact/></>}</small></span>
            <ChevronRight className="donut-chevron" size={16} aria-hidden="true"/>
            <span className="donut-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, row.pct * 100)}%`, background: row.fill }}/></span>
          </button>
        </div>)}
      </div>
    </div>;
  }

  // Inside one category (or "Lainnya").
  const cat = path.cat, isOther = cat === 'other';
  const catRow = rows.find(r => r.id === cat);
  const catName = catSlice.name, catIcon = catSlice.icon, catFill = catRow?.fill || catSlice.color || 'var(--chart-1)';
  const catParts = partsOf(lines, cat), catPrevParts = partsOf(prevLines, cat);
  const catAmount = catSlice.amount, prevBySub = amountsBySub(catPrevParts), nowBySub = amountsBySub(catParts);
  const subList: Slice[] = isOther ? slices.slice(6).map(s => ({ id: s.id, name: s.name, amount: s.amount, icon: s.icon, color: s.color })) : catSlice.subcategories.map(s => ({ ...s }));
  // "Tanpa subkategori" only next to real subcategories (a category without any is simply the whole ring).
  const loose = isOther || !subList.length ? 0 : nowBySub.get(null) || 0;
  const subs: Row[] = [...subList, ...(loose > 0 ? [{ id: NONE, name: 'Tanpa subkategori', amount: loose, icon: '▫️' }] : !subList.length && !isOther ? [{ id: NONE, name: catName, amount: catAmount, icon: catIcon, color: catFill }] : [])]
    .sort((a, b) => b.amount - a.amount)
    .map((s, i) => ({ ...s, pct: catAmount ? s.amount / catAmount : 0, fill: s.id === NONE ? 'var(--line-strong)' : s.color || `var(--chart-${i % 6 + 1})` }));
  const prevOfSub = (id: string) => prevBySub.get(id === NONE ? null : id) || 0;
  const sub = path.sub ? subs.find(s => s.id === path.sub) : undefined;
  const pick = (id: string) => {
    if (isOther) return go(id);
    if (!subList.length) return;
    setShowAll(false);
    setPath(current => ({ cat, sub: current.sub === id ? null : id }));
    // The list folds up around the chosen row: keep it (and its detail just below) in view.
    requestAnimationFrame(() => { const el = legend.current; if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  };
  const folded = Boolean(sub) && !showAll && !isOther, rowsShown = folded ? subs.filter(r => r.id === sub!.id) : subs;
  // 10.3.1 Old records in a category with subcategories but without one: counted, with a way to give them one.
  const hasSubs = !isOther && REAL(cat) && categories.some(c => c.parentId === cat && !c.isArchived);
  const looseCount = hasSubs ? new Set(catParts.filter(line => line.subId === null).map(line => line.tx.id)).size : 0;

  // What stands out inside the category.
  const notes: string[] = [];
  if (!sub && subs.length > 1 && subs[0].id !== NONE) notes.push(`${subs[0].name} paling besar: ${percent(subs[0].pct)} dari ${catName}.`);
  if (!sub && previousReady && subs.length > 1) {
    const changes = subs.map(s => ({ s, change: s.amount - prevOfSub(s.id) }));
    // A subcategory that is gone this period still counts as a drop.
    for (const [id, amount] of prevBySub) { const key = id ?? NONE; if (!subs.some(s => s.id === key) && amount > 0) changes.push({ s: { id: key, name: id === null ? 'Tanpa subkategori' : categories.find(c => c.id === id)?.name || 'Lainnya', amount: 0, pct: 0, fill: '' }, change: -amount }); }
    const up = changes.filter(c => c.change > 0).sort((a, b) => b.change - a.change)[0], down = changes.filter(c => c.change < 0).sort((a, b) => a.change - b.change)[0];
    if (up) notes.push(`Paling naik: ${up.s.name} (${signed(up.change)} dari periode lalu).`);
    if (down) notes.push(`Paling turun: ${down.s.name} (${signed(down.change)}).`);
  }

  const focusParts = sub ? catParts.filter(line => (isOther ? line.subId : line.subId ?? NONE) === sub.id) : catParts;
  const focusPrev = sub ? catPrevParts.filter(line => (isOther ? line.subId : line.subId ?? NONE) === sub.id) : catPrevParts;
  const back = () => sub ? setPath({ cat, sub: null }) : go(null);

  return <div className="drill" ref={root}>
    <nav className="drill-nav" aria-label="Posisi grafik">
      <button type="button" className="drill-back" onClick={back}><ArrowLeft size={15}/> {sub ? catName : 'Semua kategori'}</button>
      <span className="drill-crumbs"><button type="button" onClick={() => go(null)}>Semua</button><ChevronRight size={12} aria-hidden="true"/>{sub ? <><button type="button" onClick={() => setPath({ cat, sub: null })}>{catName}</button><ChevronRight size={12} aria-hidden="true"/><b>{sub.name}</b></> : <b>{catName}</b>}</span>
    </nav>
    <div className="donut-layout">
      <Ring key={cat} rows={subs} selected={sub?.id || null} onPick={pick} center={sub
        ? <><span className="donut-center-icon" aria-hidden="true"><Emoji e={emojiOrFallback(sub.icon || catIcon)}/></span><small>{sub.name}</small><strong>{rupiah(sub.amount)}</strong><em>{percent(sub.pct)} dari {catName}</em></>
        : <><span className="donut-center-icon" aria-hidden="true"><Emoji e={emojiOrFallback(catIcon)}/></span><small>{catName}</small><strong>{rupiah(catAmount)}</strong><em>{total ? percent(catAmount / total) : '0%'} dari total</em></>}/>
      <div className="donut-legend" ref={legend}>
        <small className="drill-legend-head">{isOther ? `${subs.length} kategori kecil · ketuk untuk diperdalam` : !subList.length ? hasSubs ? 'Periode ini belum ada yang masuk ke subkategorinya.' : 'Belum ada subkategori di kategori ini.' : folded ? `Fokus ke ${sub!.name} · ketuk lagi untuk semua subkategori` : `${subList.length} subkategori · ketuk untuk detail`}</small>
        {(isOther || subList.length > 0) && rowsShown.map(row => <div key={row.id} className={`donut-row ${sub?.id === row.id ? 'is-selected' : ''} ${sub && sub.id !== row.id ? 'is-faded' : ''}`}>
          <button type="button" className={`donut-row-main ${isOther ? 'has-chevron' : ''}`} aria-pressed={isOther ? undefined : sub?.id === row.id} onClick={() => pick(row.id)}>
            <span className="donut-dot" style={{ background: row.fill }}/>
            <span className="donut-name">{row.icon && <span aria-hidden="true"><Emoji e={emojiOrFallback(row.icon)}/> </span>}{row.name}</span>
            <span className="donut-amount"><strong>{rupiah(row.amount)}</strong><small>{percent(row.pct)}{previousReady && <> · <Delta current={row.amount} previous={prevOfSub(row.id)} good={good} basis={basis} compact/></>}</small></span>
            {isOther && <ChevronRight className="donut-chevron" size={16} aria-hidden="true"/>}
            <span className="donut-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, row.pct * 100)}%`, background: row.fill }}/></span>
          </button>
        </div>)}
        {looseCount > 0 && (!sub || sub.id === NONE) && <div className="drill-nosub" role="note"><span><FolderTree size={14} aria-hidden="true"/> {looseCount} transaksi di {catName} belum punya subkategori.</span><button type="button" className="link-button" onClick={() => navigate('transactions', `nosub:${cat}${rangeFocus}`)}>Rapikan <ArrowRight size={14}/></button></div>}
        {sub && !isOther && subs.length > 1 && <button type="button" className="drill-more" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>
          {showAll ? <><ChevronUp size={15} aria-hidden="true"/> Ringkas, fokus ke {sub.name}</> : <><ChevronDown size={15} aria-hidden="true"/> Tampilkan {subs.length - 1} subkategori lain</>}
        </button>}
      </div>
    </div>
    <Detail key={`${cat}/${sub?.id || ''}`} kind={kind} parts={focusParts} prevParts={focusPrev} previousReady={previousReady} basis={basis} range={range} today={today} navigate={navigate} rangeFocus={rangeFocus}
      title={sub ? sub.name : catName} icon={sub?.icon || catIcon} fill={sub ? sub.fill : catFill}
      shares={sub ? [[sub.pct, `dari ${catName}`], [total ? sub.amount / total : 0, kind === 'income' ? 'dari semua pemasukan' : 'dari semua pengeluaran']] : [[total ? catAmount / total : 0, kind === 'income' ? 'dari semua pemasukan' : 'dari semua pengeluaran']]}
      notes={notes} link={linkFor(sub ? sub.id : cat, kind, cat)} prevTotal={sub ? prevOfSub(sub.id) : previousOf(cat)}/>
  </div>;
}

/** The donut itself, with labels beside the ring where there is room. */
function Ring({ rows: given, selected, onPick, center }: { rows: Row[]; selected: string | null; onPick: (id: string) => void; center: ReactNode }) {
  const [touched, setTouched] = useState(false);
  // The same slices keep the same array, so a re-render of the page does not restart the animation (labels wait for it).
  const sig = given.map(r => `${r.id}:${r.amount}:${r.fill}:${r.name}`).join('|');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(() => given, [sig]);
  type SliceProps = { cx?: number; cy?: number; midAngle?: number; outerRadius?: number; index?: number; points?: { x: number; y: number }[] };
  /** Where a slice label goes, or null when there is no room beside the ring (the centre and legend still show it). */
  const place = (props: SliceProps) => {
    const row = rows[props.index ?? 0];
    if (!row || rows.length < 2 || row.pct < MIN_LABEL) return null;
    const cx = props.cx ?? 0, outer = props.outerRadius ?? 0, angle = -(props.midAngle ?? 0) * RAD, cos = Math.cos(angle), right = cos >= 0, edge = 6, charWidth = 6.4;
    const x0 = cx + (outer + 22) * cos, y = (props.cy ?? 0) + (outer + 22) * Math.sin(angle);
    const vertical = Math.abs(Math.sin(angle)) > .8;
    // Room between the card edge and the ring (or the whole side when the label sits above/below the ring).
    const room = vertical ? (right ? cx * 2 - edge - x0 : x0 - edge) : (right ? cx * 2 - edge - (cx + outer * Math.abs(cos) + 4) : (cx - outer * Math.abs(cos) - 4) - edge);
    const fit = Math.floor(room / charWidth);
    if (fit < 4) return null;
    const full = row.name, name = full.length <= Math.min(fit, 13) ? full : `${full.slice(0, Math.min(fit, 13) - 1)}…`;
    const width = Math.max(name.length, 4) * charWidth;
    const x = right ? Math.min(Math.max(x0, vertical ? x0 : cx + outer * Math.abs(cos) + 4), cx * 2 - edge - width) : Math.max(Math.min(x0, vertical ? x0 : cx - outer * Math.abs(cos) - 4), edge + width);
    return { row, x, y, right, name };
  };
  const label = (props: SliceProps) => {
    const spot = place(props);
    if (!spot) return null;
    const faded = selected && selected !== spot.row.id;
    return <g opacity={faded ? .35 : 1}><text x={spot.x} y={spot.y - 3} textAnchor={spot.right ? 'start' : 'end'} className="donut-label-name">{spot.name}</text><text x={spot.x} y={spot.y + 11} textAnchor={spot.right ? 'start' : 'end'} className="donut-label-pct">{percent(spot.row.pct)}</text></g>;
  };
  const line = (props: SliceProps) => {
    const spot = place(props), points = props.points || [];
    if (!spot || points.length < 2) return <g/>;
    const [a, b] = points;
    return <path d={`M${a.x},${a.y}L${b.x},${b.y}`} stroke={spot.row.fill} strokeWidth={1.5} fill="none" opacity={selected && selected !== spot.row.id ? .35 : .9}/>;
  };
  return <div className="donut-chart">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 22, right: 58, bottom: 22, left: 58 }}>
        <Pie data={rows} dataKey="amount" nameKey="name" innerRadius="60%" outerRadius="80%" paddingAngle={rows.length > 1 ? 2 : 0} cornerRadius={4} stroke="var(--paper)" strokeWidth={2} label={label} labelLine={line} isAnimationActive={!touched} animationDuration={500} onClick={(_, index) => { setTouched(true); onPick(rows[index].id); }}>
          {rows.map(row => <Cell key={row.id} fill={row.fill} opacity={selected && selected !== row.id ? .3 : 1} style={{ cursor: 'pointer', outline: 'none' }}/>)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
    <div className="donut-center" aria-live="polite">{center}</div>
  </div>;
}

const UNIT_LABEL = { day: 'per hari', week: 'per minggu', month: 'per bulan' } as const;

/** The full story of one category or subcategory in the period. */
function Detail({ kind, parts, prevParts, previousReady, basis, range, today, navigate, rangeFocus, title, icon, fill, shares, notes, link, prevTotal }: {
  kind: 'expense' | 'income'; parts: CategoryLine[]; prevParts: CategoryLine[]; previousReady: boolean; basis: string; range: { start: string; end: string }; today: string;
  navigate: Nav; rangeFocus: string; title: string; icon?: string; fill: string; shares: [number, string][]; notes: string[]; link: string; prevTotal: number;
}) {
  const sig = `${range.start}..${range.end}@${today}|${parts.map(l => `${l.tx.id}:${l.amount}:${l.tx.date}:${drillName(l.tx)}`).join(',')}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stats = useMemo(() => drillStats(parts, range, today), [sig]);
  const prevCount = byTransaction(prevParts).length;
  const good = kind === 'income' ? 'up' : 'down';
  const lines = [...notes];
  if (previousReady) {
    const change = stats.total - prevTotal;
    lines.push(!prevTotal ? (stats.total ? 'Periode lalu belum ada di sini.' : '') : change === 0 ? `Sama persis dengan periode lalu (${rupiah(prevTotal)}).` : `${change > 0 ? 'Naik' : 'Turun'} ${rupiah(Math.abs(change))} (${Math.round(Math.abs(change) / prevTotal * 100)}%) dari periode lalu (${rupiah(prevTotal)}).`);
  }
  if (stats.busiestDay) lines.push(`Paling sering di hari ${stats.busiestDay.day} (${stats.busiestDay.count} transaksi).`);
  // Where the period is heading at this pace (spending only, once a few days have passed and some are left).
  if (kind === 'expense' && stats.total > 0 && stats.days >= 3 && stats.full > stats.days) lines.push(`Kalau begini terus, sampai ${shortDate(lastDay(range.end))} sekitar ${rupiah(Math.round(stats.perDay * stats.full / 1000) * 1000)}.`);
  const peak = Math.max(0, ...stats.buckets.map(b => b.amount));
  const open = (focus: string) => navigate('transactions', `${focus}${rangeFocus}`);

  return <section className="drill-detail" style={{ '--drill': fill } as React.CSSProperties} aria-label={`Detail ${title}`}>
    <header className="drill-head">
      <span className="drill-icon" aria-hidden="true"><Emoji e={emojiOrFallback(icon)}/></span>
      <span className="drill-title"><small>Detail</small><strong>{title}</strong></span>
      {link && <button type="button" className="link-button" onClick={() => open(link)}>Lihat transaksi <ArrowRight size={14}/></button>}
    </header>
    <div className="drill-stats">
      <div><small>Total</small><strong>{rupiah(stats.total)}</strong>{previousReady ? <Delta current={stats.total} previous={prevTotal} good={good} basis={basis}/> : <em>…</em>}</div>
      <div><small>Transaksi</small><strong>{stats.count}×</strong><em>{previousReady ? `periode lalu ${prevCount}×` : '…'}</em></div>
      <div><small>Rata-rata</small><strong>{rupiah(stats.average)}</strong><em>per transaksi</em></div>
      <div><small>Per hari</small><strong>{rupiah(stats.perDay)}</strong><em>dari {stats.days} hari</em></div>
    </div>
    <div className="drill-shares">{shares.map(([pct, text]) => <div key={text} className="drill-share"><span><b>{percent(pct)}</b> {text}</span><span className="donut-bar" aria-hidden="true"><i style={{ width: `${Math.max(2, Math.min(100, pct * 100))}%`, background: fill }}/></span></div>)}</div>
    {lines.filter(Boolean).length > 0 && <ul className="drill-notes">{lines.filter(Boolean).map(text => <li key={text}>{text}</li>)}</ul>}
    {stats.total > 0 && <div className="drill-block">
      <h4>Tren {UNIT_LABEL[stats.unit]}</h4>
      <div className="drill-trend">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.buckets} margin={{ top: 6, right: 2, bottom: 0, left: 2 }} barCategoryGap="18%">
            <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={10} tick={{ fontSize: 10, fill: 'var(--muted)' }}/>
            <Tooltip cursor={{ fill: 'color-mix(in srgb, var(--ink) 6%, transparent)' }} content={({ active, payload }) => { const b = payload?.[0]?.payload as DrillBucket | undefined; return active && b ? <div className="drill-tip"><small>{b.start === b.end ? shortDate(b.start) : `${shortDate(b.start)} – ${shortDate(b.end)}`}</small><strong>{rupiah(b.amount)}</strong></div> : null; }}/>
            <Bar dataKey="amount" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={450}>
              {stats.buckets.map(b => <Cell key={b.key} fill={fill} opacity={b.amount === peak ? 1 : .55}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>}
    {stats.total > 0 && <div className="drill-cols">
      {stats.names.some(n => n.count > 1) && <div className="drill-block">
        <h4>{kind === 'income' ? 'Paling sering dari' : 'Paling sering'}</h4>
        <ol className="drill-list">{stats.names.map(n => <li key={n.name}><span className="drill-list-name">{n.name}</span><small>{n.count}×</small><b>{rupiah(n.amount)}</b></li>)}</ol>
      </div>}
      <div className="drill-block">
        <h4>Transaksi terbesar</h4>
        <ol className="drill-list">{stats.biggest.map(({ tx, amount }) => <li key={tx.id}><button type="button" onClick={() => open(`tx:${tx.id}`)}><span className="drill-list-name">{drillName(tx) || 'Tanpa nama'}</span><small>{tx.date ? shortDate(tx.date) : ''}</small><b>{rupiah(amount)}</b></button></li>)}</ol>
      </div>
    </div>}
  </section>;
}
