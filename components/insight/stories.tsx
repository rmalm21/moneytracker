'use client';
import { useMemo, useState } from 'react';
import { ArrowDown, ArrowRight, Check, ChevronDown, ChevronRight, CircleCheck } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';
import { Button } from '../ui/button';
import type { Apply, Finding } from '@/lib/advisor';
import type { InsightV3Report } from '@/lib/insight-v3';
import type { Driver, InsightSignal } from '@/lib/insight-v25/types';
import type { LedgerTx } from '@/lib/types';
import type { ChangeItem, PriorityItem, progressView } from '@/lib/insight-v3/view';
import { help } from '@/lib/insight-v3/view';
import { dayMonth, money, moneyFull, signedMoney } from '@/lib/insight-v3/format';
import { HelpButton, OverflowMenu } from './section';

/** Story presentation: what changed (one root story per card), priorities as rows, progress, and the story sheet. */

export function ChangeCard({ item, onOpen }: { item: ChangeItem; onOpen: (sig: string) => void }) {
  return <article className={`ix-change tone-${item.tone}`}>
    <button type="button" className="ix-change-hit" onClick={() => onOpen(item.signature)} aria-label={`${item.title}. ${item.driver} Ketuk untuk melihat kenapa.`}>
      <span className="ix-change-top"><strong>{item.title}</strong>{item.badge && <span className="ix-badge">{item.badge}</span>}</span>
      {item.delta && <span className={`ix-delta dir-${item.deltaDir}`}>{item.delta}</span>}
      <span className="ix-change-driver">{item.driver}</span>
      {(item.tree.impact || item.limited) && <span className="ix-change-tree">{item.tree.impact && <span>↳ {item.tree.impact}</span>}{item.limited && <span className="ix-limited">{item.limited}</span>}</span>}
      <span className="ix-change-why">Kenapa? <ChevronRight size={14} aria-hidden="true"/></span>
    </button>
  </article>;
}

export function PriorityRow({ item, index, onOpen, onAction, busy, menu }: { item: PriorityItem; index: number; onOpen: (sig: string) => void; onAction: (item: PriorityItem) => void; busy?: boolean; menu: { label: string; onSelect: () => void }[] }) {
  return <li className={`ix-row tone-${item.tone}`}>
    <span className="ix-row-no" aria-hidden="true">{index + 1}</span>
    <button type="button" className="ix-row-text" onClick={() => onOpen(item.signature)}><strong>{item.title}</strong>{item.why && <small>{item.why}</small>}</button>
    <span className="ix-row-actions">
      {item.action && <button type="button" className={item.action.apply ? 'ix-pill is-primary' : 'ix-pill'} disabled={busy} onClick={() => onAction(item)}>{item.action.apply && <Check size={14} aria-hidden="true"/>}{item.action.label}</button>}
      <OverflowMenu label={item.title} items={menu}/>
    </span>
  </li>;
}

export function ProgressList({ view, onOpen }: { view: ReturnType<typeof progressView>; onOpen: (sig: string) => void }) {
  const [more, setMore] = useState(false);
  const list = more ? [...view.top, ...view.rest] : view.top;
  return <>
    <ul className="ix-progress">{list.map(p => <li key={p.key}>{p.signature ? <button type="button" onClick={() => onOpen(p.signature!)}><CircleCheck size={16} aria-hidden="true"/><span><strong>{p.title}</strong><small>{p.line}</small></span></button> : <span className="is-done"><Check size={16} aria-hidden="true"/><span><strong>{p.title}</strong><small>{p.line}</small></span></span>}</li>)}</ul>
    {view.rest.length > 0 && <button type="button" className="ix-more" onClick={() => setMore(v => !v)}>{more ? 'Ringkas' : `Lihat ${view.rest.length} lainnya`}</button>}
  </>;
}

/** One driver row with a bar; tapping opens how often / how big, the next level, and its transactions. */
function DriverRow({ d, total, txById, depth = 0 }: { d: Driver; total: number; txById: Map<string, LedgerTx>; depth?: number }) {
  const [open, setOpen] = useState(false);
  const share = total ? Math.abs(d.delta) / total : 0;
  const kids = (d.children || []).filter(c => Math.abs(c.delta) >= 1);
  const txs = (d.txIds || []).map(id => txById.get(id)).filter((t): t is LedgerTx => Boolean(t)).slice(0, 6);
  return <li className={`ix-driver depth-${depth}`}>
    <button type="button" className="ix-driver-row" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <span className="ix-driver-name">{d.label}</span>
      <span className="ix-driver-bar" aria-hidden="true"><b style={{ width: `${Math.max(4, Math.round(share * 100))}%` }} className={d.delta < 0 ? 'down' : ''}/></span>
      <span className="ix-driver-amt">{signedMoney(d.delta)}</span>
      <ChevronDown size={14} className={open ? 'open' : ''} aria-hidden="true"/>
    </button>
    {open && <div className="ix-driver-detail">
      {d.count && <p>{d.count.baseline ? `${fmtCount(d.count.current)}× transaksi (biasanya ${fmtCount(d.count.baseline)}×), rata-rata ${money(d.count.current ? d.current / d.count.current : 0)} per transaksi (biasanya ${money(d.baseline / d.count.baseline)}).` : `Baru siklus ini: ${fmtCount(d.count.current)}× transaksi.`}</p>}
      {d.frequencyEffect !== undefined && d.count?.baseline && d.count.current ? <p className="ix-note">Dari lebih sering/jarang {signedMoney(d.frequencyEffect)}, dari nilai per transaksi {signedMoney(d.ticketEffect || 0)}.</p> : null}
      {kids.length > 0 && <ul className="ix-drivers">{kids.map(k => <DriverRow key={k.id} d={k} total={kids.reduce((n, c) => n + Math.abs(c.delta), 0)} txById={txById} depth={depth + 1}/>)}</ul>}
      {!kids.length && txs.length > 0 && <ul className="ix-txs">{txs.map(t => <li key={t.id}><span>{t.merchant || t.description || 'Transaksi'}<small>{dayMonth(t.date)}</small></span><em>{moneyFull(t.ownShare ?? t.amount)}</em></li>)}</ul>}
    </div>}
  </li>;
}
const fmtCount = (n: number) => (Math.round(n * 10) / 10).toLocaleString('id-ID');

const basisWord = { direct: 'langsung', estimated: 'perkiraan', associated: 'bersamaan' } as const;
const effectWord = (kind: string) => kind === 'reduces' ? 'berkurang' : kind === 'increases' ? 'bertambah' : kind === 'estimated_to_affect' ? 'bisa lebih sempit' : kind === 'funds' ? 'diisi dari sisa siklus' : 'terkait';

/** Story sheet: answer → why (drivers) → impact (forward flow) → evidence & calculation, each a step deeper. */
export function StorySheet({ report, signature, extraSignals, items, onClose, onGo, onApply, busy, onDismiss, onSnooze }: { report: InsightV3Report; signature: string; extraSignals: InsightSignal[]; items: LedgerTx[]; onClose: () => void; onGo: (view: string, focus?: string) => void; onApply: (apply: Apply, finding: Finding) => void; busy?: string; onDismiss: (s: InsightSignal) => void; onSnooze: (s: InsightSignal) => void }) {
  const story = report.v25.stories.find(st => st.signature === signature);
  const s = story?.root || [...report.v25.signals, ...extraSignals].find(x => x.signature === signature);
  const txById = useMemo(() => new Map(items.map(t => [t.id, t])), [items]);
  const [allImpact, setAllImpact] = useState(false);
  if (!s) return null;
  const tree = s.drivers[0], kids = (tree?.children || []).filter(c => Math.abs(c.delta) >= 1).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const labels = new Map(report.graph.nodes.map(n => [n.id, n.label]));
  const chain = report.chain(signature), primary = allImpact ? chain : chain.slice(0, 3);
  const outcomes = report.outcomes.filter(o => o.decision.sig === signature);
  const apply = s.action?.apply || s.finding?.apply, target = s.action?.target || s.finding?.target;
  const badge = s.lifecycleState === 'NEW' ? 'Baru' : s.lifecycleState === 'WORSENING' ? 'Memburuk' : s.lifecycleState === 'IMPROVING' ? 'Membaik' : '';
  const txs = [...new Set(s.evidence.flatMap(e => e.txIds || []).concat(tree?.txIds || []))].map(id => txById.get(id)).filter((t): t is LedgerTx => Boolean(t)).slice(0, 10);
  return <Dialog open onOpenChange={o => { if (!o) onClose(); }}><DialogContent title={s.title} className="ix-sheet">
    <div className="ix-sheet-meta">{badge && <span className="ix-badge">{badge}</span>}{s.confidence.level !== 'high' && <span className="ix-limited">{s.confidence.level === 'low' ? 'Data masih terbatas' : 'Cukup yakin'}</span>}</div>
    <p className="ix-answer-line">{s.headline && s.headline !== s.title ? s.headline : s.summary}</p>
    {s.current !== undefined && s.baseline !== undefined && s.unit === 'money' && s.baseline > 0 && <dl className="ix-compare"><div><dt>Sekarang</dt><dd>{money(s.current)}</dd></div><div><dt>Biasanya</dt><dd>{money(s.baseline)}</dd></div>{s.delta !== undefined && <div><dt>Selisih</dt><dd className={s.delta > 0 ? 'up' : 'down'}>{signedMoney(s.delta)}</dd></div>}</dl>}
    {kids.length > 0 && <section className="ix-sheet-part"><h4>Kenapa</h4><ul className="ix-drivers">{kids.map(k => <DriverRow key={k.id} d={k} total={kids.reduce((n, c) => n + Math.abs(c.delta), 0)} txById={txById}/>)}</ul><p className="ix-note">Ketuk untuk melihat lebih sering atau lebih mahal, lalu transaksinya.</p></section>}
    {chain.length > 0 && <section className="ix-sheet-part"><h4>Dampaknya <HelpButton {...help.impact} label="label dampak"/></h4>
      <ol className="ix-flow">
        <li className="is-start"><strong>{s.title}</strong>{s.delta !== undefined && s.unit === 'money' && <span>{signedMoney(s.delta)}</span>}</li>
        {primary.map((e, i) => <li key={i} className={`is-${e.basis}`}><ArrowDown size={14} className="ix-flow-arrow" aria-hidden="true"/><strong>{labels.get(e.to) || e.to}</strong><span>{effectWord(e.kind)}{e.amount ? ` ±${money(e.amount)}` : ''} <em className="ix-basis">{basisWord[e.basis]}</em></span></li>)}
      </ol>
      {chain.length > 3 && <button type="button" className="ix-more" onClick={() => setAllImpact(v => !v)}>{allImpact ? 'Ringkas' : 'Lihat dampak lengkap'}</button>}
    </section>}
    {outcomes.length > 0 && <section className="ix-sheet-part"><h4>Keputusan sebelumnya</h4><ul className="ix-plain-list">{outcomes.map(o => <li key={o.decision.id}><span>{o.text}</span></li>)}</ul></section>}
    {story && story.members.length > 0 && <details className="ix-details"><summary>Sinyal terkait ({story.members.length})</summary><ul className="ix-plain-list">{story.members.map(m => <li key={m.signature}><span>{m.headline || m.title}</span></li>)}</ul></details>}
    <details className="ix-details"><summary>Bukti & perhitungan</summary>
      {!kids.length && <p>{s.summary}</p>}
      <dl className="ix-evidence">{s.evidence.map((e, i) => <div key={i}><dt>{e.label}</dt><dd>{e.value}{e.note && <small>{e.note}</small>}</dd></div>)}</dl>
      {s.calc && <ol className="ix-calc">{s.calc.map((r, i) => <li key={i} className={r.op === '=' ? 'is-total' : ''}><span>{r.op && r.op !== '=' ? `${r.op} ` : ''}{r.label}</span><em>{r.text || moneyFull(r.amount)}</em></li>)}</ol>}
      <p className="ix-note"><b>{s.confidence.label}.</b> {s.confidence.reasons.join('; ')}.</p>
      {s.caveats.length > 0 && <ul className="ix-caveats">{s.caveats.map(c => <li key={c}>{c}</li>)}</ul>}
    </details>
    {txs.length > 0 && <details className="ix-details"><summary>Transaksi ({txs.length})</summary><ul className="ix-txs">{txs.map(t => <li key={t.id}><span>{t.merchant || t.description || 'Transaksi'}<small>{dayMonth(t.date)}{t.time ? ` · ${t.time}` : ''}</small></span><em>{moneyFull(t.ownShare ?? t.amount)}</em></li>)}</ul></details>}
    <div className="ix-sheet-foot">
      {apply && s.finding ? <Button className="small" disabled={busy === s.finding.id} onClick={() => onApply(apply, s.finding!)}><Check size={14}/> {apply.kind === 'create-budget' ? `Buat anggaran ${money(apply.amount)}` : `Ubah anggaran ke ${money(apply.amount)}`}</Button>
        : target ? <Button variant="secondary" className="small" onClick={() => { onClose(); onGo(target.view, target.focus); }}>{s.action?.label && s.action.label !== 'Lihat' ? s.action.label : 'Lihat'} <ArrowRight size={14}/></Button> : <span/>}
      {s.tone !== 'positive' && <OverflowMenu label={s.title} items={[{ label: 'Ingatkan minggu depan', onSelect: () => onSnooze(s) }, { label: 'Sembunyikan', onSelect: () => onDismiss(s) }]}/>}
    </div>
    <p className="ix-note">Insight tidak pernah memindahkan uang atau mengubah catatan sendiri.</p>
  </DialogContent></Dialog>;
}
