'use client';
import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, BellOff, Check, ChevronDown, CircleCheck, Clock3, EyeOff, Info, ListTree, Minus, Sparkles, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { rupiah } from '@/lib/accounting';
import type { Apply, CalcRow, Finding } from '@/lib/advisor';
import type { ScoreDelta } from '@/lib/insight-v25/health';
import type { ResolvedItem, TimelineEntry } from '@/lib/insight-v25/lifecycle';
import type { BriefSentence } from '@/lib/insight-v25/narrative';
import type { Driver, InsightSignal, LifecycleState, Status, Story } from '@/lib/insight-v25/types';
import type { LedgerTx } from '@/lib/types';

/** Insight V2.5 UI pieces: stories, the evidence drawer ("Kenapa?"), brief, what changed, progress and timeline. */
const short = (value: number) => { const n = Math.abs(value), sign = value < 0 ? '-' : ''; return n >= 1e9 ? `${sign}Rp${(n / 1e9).toFixed(1).replace('.', ',')} M` : n >= 1e6 ? `${sign}Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `${sign}Rp${Math.round(n / 1e3)} rb` : rupiah(value); };
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${short(Math.abs(value))}`;
export const statusTone: Record<Status, 'bad' | 'warn' | 'good' | 'info'> = { important: 'bad', watch: 'warn', positive: 'good', neutral: 'info' };
const statusWord: Record<Status, string> = { important: 'Penting', watch: 'Perlu dipantau', positive: 'Kabar baik', neutral: 'Info' };
const statusIcon: Record<Status, LucideIcon> = { important: AlertTriangle, watch: AlertTriangle, positive: CircleCheck, neutral: Info };
const stateWord: Partial<Record<LifecycleState, string>> = { NEW: 'Baru', WORSENING: 'Memburuk', IMPROVING: 'Membaik', SNOOZED: 'Ditunda', DISMISSED: 'Diabaikan' };
const times = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString('id-ID')}×`;
const dateText = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

export type StoryHandlers = { onOpen: (signature: string) => void; onGo: (view: string, focus?: string) => void; onApply: (apply: Apply, finding: Finding) => void; busy?: string };

function StateBadge({ state }: { state: LifecycleState }) {
  const word = stateWord[state];
  return word ? <span className={`ins2-state is-${state.toLowerCase()}`}>{word}</span> : null;
}
function Trend({ delta }: { delta?: number }) {
  if (!delta) return <Minus size={14} aria-hidden="true"/>;
  return delta > 0 ? <ArrowUpRight size={14} aria-hidden="true"/> : <ArrowDownRight size={14} aria-hidden="true"/>;
}

/** One root cause: what happened, the main reason, how sure, and the action. */
export function StoryCard({ story, handlers, index, onDismiss, compact }: { story: Story; handlers: StoryHandlers; index?: number; onDismiss?: (story: Story) => void; compact?: boolean }) {
  const s = story.root, Icon = statusIcon[story.tone];
  const finding = s.finding, apply = s.action?.apply || finding?.apply, target = s.action?.target || finding?.target;
  return <article className={`ins-card ins2-story tone-${statusTone[story.tone]}`}>
    <header className="ins-card-head">
      <span className={index !== undefined ? 'ins-step' : 'ins-card-icon'} aria-hidden="true">{index !== undefined ? index + 1 : <Icon size={18}/>}</span>
      <div className="ins-card-title">
        <span className="ins-kicker-line"><b>{statusWord[story.tone]}</b> · {s.confidence.label}</span>
        <h3>{story.title} <StateBadge state={story.state}/></h3>
      </div>
      {onDismiss && <button type="button" className="ins-hide" aria-label={`Abaikan ${story.title}`} title="Abaikan" onClick={() => onDismiss(story)}><EyeOff size={16}/></button>}
    </header>
    {s.current !== undefined && s.baseline !== undefined && s.unit === 'money' && s.baseline > 0 && <div className="ins2-compare">
      <span><small>Sekarang</small><strong>{short(s.current)}</strong></span>
      <span><small>Biasanya</small><strong>{short(s.baseline)}</strong></span>
      {s.delta !== undefined && <span className={s.delta > 0 ? 'up' : 'down'}><small>Selisih</small><strong><Trend delta={s.delta}/> {signed(s.delta)}</strong></span>}
    </div>}
    <p>{s.headline && s.headline !== story.title ? s.headline : story.what}</p>
    {!compact && story.why.length > 0 && <ul className="ins2-why">{story.why.slice(0, 3).map(w => <li key={w}>{w}</li>)}</ul>}
    <footer className="ins-card-foot">
      <button type="button" className="ins-link" onClick={() => handlers.onOpen(story.signature)}><ListTree size={15}/> Kenapa?</button>
      <div className="ins-card-actions">
        {target && <button type="button" className="ins-link" onClick={() => handlers.onGo(target.view, target.focus)}>{s.action?.label && !apply ? s.action.label : 'Lihat'} <ArrowRight size={15}/></button>}
        {apply && finding && <Button className="small ins-apply" disabled={handlers.busy === finding.id} onClick={() => handlers.onApply(apply, finding)}><Check size={15}/> {apply.kind === 'create-budget' ? `Buat ${short(apply.amount)}` : `Ubah ke ${short(apply.amount)}`}</Button>}
      </div>
    </footer>
  </article>;
}

/** A compact line for deep-dive lists. */
export function SignalRow({ signal, onOpen }: { signal: InsightSignal; onOpen: (signature: string) => void }) {
  const Icon = statusIcon[signal.tone];
  return <button type="button" className={`ins2-row tone-${statusTone[signal.tone]}`} onClick={() => onOpen(signal.signature)}>
    <span className="ins2-row-icon" aria-hidden="true"><Icon size={16}/></span>
    <span className="ins2-row-text"><strong>{signal.title} <StateBadge state={signal.lifecycleState}/></strong><small>{signal.headline && signal.headline !== signal.title ? signal.headline : signal.summary}</small></span>
    <span className="ins2-row-conf">{signal.confidence.label}</span>
  </button>;
}

/** The driver tree, one level open at a time. */
function DriverNode({ d, depth = 0 }: { d: Driver; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const kids = d.children || [];
  const mech = d.count?.baseline && d.count.current && d.frequencyEffect !== undefined ? `frekuensi ${signed(d.frequencyEffect)} · nominal ${signed(d.ticketEffect || 0)}` : d.count && !d.count.baseline && d.current ? 'baru siklus ini' : '';
  return <li className={`ins2-driver depth-${depth}`}>
    <button type="button" className="ins2-driver-row" aria-expanded={kids.length ? open : undefined} disabled={!kids.length} onClick={() => setOpen(v => !v)}>
      {kids.length ? <ChevronDown size={14} className={open ? 'open' : ''} aria-hidden="true"/> : <i aria-hidden="true"/>}
      <span><strong>{d.label}</strong><small>{short(d.current)} vs biasanya {short(d.baseline)}{d.count ? ` · ${times(d.count.current)} vs ${times(d.count.baseline)}` : ''}{mech ? ` · ${mech}` : ''}</small></span>
      <em className={d.delta > 0 ? 'up' : d.delta < 0 ? 'down' : ''}>{signed(d.delta)}</em>
    </button>
    {open && kids.length > 0 && <ul>{kids.map(k => <DriverNode key={k.id} d={k} depth={depth + 1}/>)}</ul>}
  </li>;
}

function Calc({ rows }: { rows: CalcRow[] }) {
  return <ol className="ins2-calc">{rows.map((r, i) => <li key={i} className={r.op === '=' ? 'is-total' : ''}><span>{r.op && r.op !== '=' ? `${r.op} ` : ''}{r.label}{r.note && <small>{r.note}</small>}</span><em>{r.text || rupiah(r.amount)}</em></li>)}</ol>;
}

/** Evidence drawer: what, why (drivers), the numbers, how sure and why, limits, transactions, actions. */
export function EvidenceDrawer({ story, signal, items, onClose, handlers, onDismiss, onSnooze }: { story?: Story; signal?: InsightSignal; items: LedgerTx[]; onClose: () => void; handlers: StoryHandlers; onDismiss?: (s: InsightSignal) => void; onSnooze?: (s: InsightSignal) => void }) {
  const s = story?.root || signal;
  const byId = useMemo(() => new Map(items.map(t => [t.id, t])), [items]);
  if (!s) return null;
  const txIds = [...new Set(s.evidence.flatMap(e => e.txIds || []).concat(s.drivers[0]?.txIds || []))].slice(0, 12);
  const txs = txIds.map(id => byId.get(id)).filter((t): t is LedgerTx => Boolean(t));
  const apply = s.action?.apply || s.finding?.apply, target = s.action?.target || s.finding?.target;
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent title={s.title} className="ins2-drawer">
    <div className={`ins2-drawer-head tone-${statusTone[s.tone]}`}><span>{statusWord[s.tone]}</span><StateBadge state={s.lifecycleState}/><span className="ins2-conf">{s.confidence.label}</span></div>
    <p className="ins2-what">{s.summary}</p>
    {s.drivers[0]?.children?.length ? <section><h4>Kenapa</h4><ul className="ins2-drivers"><DriverNode d={s.drivers[0]}/></ul><small className="ins2-note">Setiap cabang dijumlahkan sama dengan induknya. “Frekuensi” = lebih sering/jarang, “nominal” = lebih mahal/murah per transaksi.</small></section> : null}
    {story && story.members.length > 0 && <section><h4>Termasuk dalam cerita ini</h4><ul className="ins2-members">{story.members.map(m => <li key={m.signature}>{m.headline || m.title}</li>)}</ul></section>}
    {s.evidence.length > 0 && <section><h4>Bukti</h4><dl className="ins2-evidence">{s.evidence.map((e, i) => <div key={i}><dt>{e.label}</dt><dd>{e.value}{e.note && <small>{e.note}</small>}</dd></div>)}</dl></section>}
    {s.calc && <section><h4>Dari mana angka ini?</h4><Calc rows={s.calc}/></section>}
    <section><h4>Seberapa yakin</h4><p className="ins2-conf-line"><b>{s.confidence.label}</b>{s.confidence.reasons.length ? ` — ${s.confidence.reasons.join('; ')}.` : ''}</p></section>
    {s.caveats.length > 0 && <section className="ins2-caveats"><h4>Batasan</h4><ul>{s.caveats.map(c => <li key={c}>{c}</li>)}</ul></section>}
    {txs.length > 0 && <section><h4>Transaksinya</h4><ul className="ins2-txs">{txs.map(t => <li key={t.id}><span><strong>{t.merchant || t.description || 'Transaksi'}</strong><small>{dateText(t.date)}{t.time ? ` · ${t.time}` : ''}</small></span><em>{rupiah(t.ownShare ?? t.amount)}</em></li>)}</ul></section>}
    <div className="ins2-drawer-actions">
      {onSnooze && s.tone !== 'positive' && <button type="button" className="link-button" onClick={() => onSnooze(s)}><BellOff size={14}/> Ingatkan minggu depan</button>}
      {onDismiss && s.tone !== 'positive' && <button type="button" className="link-button" onClick={() => onDismiss(s)}><EyeOff size={14}/> Abaikan</button>}
      <span className="ins2-spacer"/>
      {target && <Button variant="secondary" className="small" onClick={() => { onClose(); handlers.onGo(target.view, target.focus); }}>Lihat <ArrowRight size={14}/></Button>}
      {apply && s.finding && <Button className="small" disabled={handlers.busy === s.finding.id} onClick={() => handlers.onApply(apply, s.finding!)}><Check size={14}/> {apply.kind === 'create-budget' ? `Buat ${short(apply.amount)}` : `Ubah ke ${short(apply.amount)}`}</Button>}
    </div>
    <p className="ins2-note">Insight tidak pernah memindahkan uang atau mengubah catatan sendiri. Tombol di atas hanya berjalan setelah kamu menekannya.</p>
  </DialogContent></Dialog>;
}

/** Score movement with "Kenapa naik 6?" (rows add up to the change, as the score formula weighs them). */
export function ScoreDeltaLine({ delta }: { delta: ScoreDelta | null }) {
  const [open, setOpen] = useState(false);
  if (!delta) return <small className="ins2-delta is-none">Perubahan skor muncul setelah Insight punya skor sebelumnya untuk dibandingkan.</small>;
  const word = delta.delta > 0 ? 'naik' : delta.delta < 0 ? 'turun' : 'tetap';
  return <div className="ins2-delta-wrap">
    <span className={`ins2-delta ${delta.delta > 0 ? 'up' : delta.delta < 0 ? 'down' : ''}`}><Trend delta={delta.delta}/> {delta.delta === 0 ? 'Sama' : `${delta.delta > 0 ? '+' : '−'}${Math.abs(delta.delta)}`} sejak {dateText(delta.previous.d)}</span>
    {delta.delta !== 0 && <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(v => !v)}>Kenapa {word} {Math.abs(delta.delta)}?</button>}
    {open && <ul className="ins2-delta-rows">{delta.rows.map(r => <li key={r.key}><span>{r.label}<small>{r.from} → {r.to} dari 100</small></span><em className={r.change > 0 ? 'up' : 'down'}>{r.change > 0 ? '+' : '−'}{Math.abs(r.change)}</em></li>)}<li className="is-total"><span>Total</span><em>{delta.delta > 0 ? '+' : '−'}{Math.abs(delta.delta)}</em></li></ul>}
  </div>;
}

export function BriefSection({ brief, onOpen, known }: { brief: BriefSentence[]; onOpen: (signature: string) => void; known: Set<string> }) {
  if (!brief.length) return null;
  return <section className="ins2-brief" aria-label="Ringkasan keuangan">
    <h2><Sparkles size={16} aria-hidden="true"/> Ringkasan</h2>
    <p>{brief.map((b, i) => known.has(b.signature) ? <button key={i} type="button" className="ins2-brief-link" onClick={() => onOpen(b.signature)}>{b.text}</button> : <span key={i}>{b.text}</span>).reduce<React.ReactNode[]>((all, node, i) => i ? [...all, ' ', node] : [node], [])}</p>
  </section>;
}

export function ChangedSection({ stories, handlers }: { stories: Story[]; handlers: StoryHandlers }) {
  return <section className="ins-section">
    <header className="ins-head"><span className="ins-section-icon" aria-hidden="true"><ArrowUpRight size={17}/></span><div><h2>Yang berubah</h2><small>Perubahan paling berarti dibanding pola biasamu, di titik siklus yang sama.</small></div></header>
    {stories.length ? <div className="ins2-changed">{stories.map(s => <button key={s.id} type="button" className={`ins2-change tone-${statusTone[s.tone]}`} onClick={() => handlers.onOpen(s.signature)}>
      <span className="ins2-change-top"><b>{statusWord[s.tone]}</b><StateBadge state={s.state}/></span>
      <strong>{s.title}</strong>
      <small>{s.root.headline && s.root.headline !== s.title ? s.root.headline : s.what}</small>
      <span className="ins2-change-foot">{s.confidence.label} · Kenapa? <ArrowRight size={13}/></span>
    </button>)}</div> : <p className="ins-empty"><Sparkles size={18} aria-hidden="true"/>Tidak ada perubahan berarti. Pengeluaranmu berjalan sesuai pola biasanya.</p>}
  </section>;
}

export function ProgressSection({ stories, resolved, onOpen }: { stories: Story[]; resolved: ResolvedItem[]; onOpen: (signature: string) => void }) {
  if (!stories.length && !resolved.length) return null;
  return <section className="ins-section">
    <header className="ins-head"><span className="ins-section-icon" aria-hidden="true"><CircleCheck size={17}/></span><div><h2>Kemajuan</h2><small>Yang membaik dan yang sudah teratasi.</small></div></header>
    <ul className="ins2-progress">
      {stories.map(s => <li key={s.id}><button type="button" onClick={() => onOpen(s.signature)}><CircleCheck size={16} aria-hidden="true"/><span><strong>{s.title}</strong><small>{s.root.headline || s.what}</small></span></button></li>)}
      {resolved.map(r => <li key={r.signature} className="is-resolved"><span className="ins2-progress-static"><Check size={16} aria-hidden="true"/><span><strong>Sudah teratasi: {r.title}</strong><small>sejak {dateText(r.date)}</small></span></span></li>)}
    </ul>
  </section>;
}

const timelineWord: Record<TimelineEntry['e'], string> = { new: 'Muncul', worse: 'Memburuk', better: 'Membaik', resolved: 'Teratasi', resurfaced: 'Muncul lagi' };
export function TimelineSection({ entries }: { entries: TimelineEntry[] }) {
  if (!entries.length) return null;
  return <section className="ins-section">
    <header className="ins-head"><span className="ins-section-icon" aria-hidden="true"><Clock3 size={17}/></span><div><h2>Riwayat Insight</h2><small>Hanya perubahan penting yang dicatat.</small></div></header>
    <ol className="ins2-timeline">{entries.slice(0, 12).map((e, i) => <li key={i} className={`tone-${statusTone[e.tone]}`}><time>{dateText(e.d)}</time><span><b>{timelineWord[e.e]}</b> {e.t}</span></li>)}</ol>
  </section>;
}
