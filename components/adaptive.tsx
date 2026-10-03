'use client';
/**
 * Dompet Ajaib 5.0 — shared Adaptive Simplicity components: the one discovery prompt, the "Perlu perhatian" cluster,
 * "Kenapa angka ini?", "Yang bisa dilakukan di sini", short educational empty states and the 5.0 orientation.
 * They present canonical data; no money is calculated here.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ChevronRight, CircleHelp, Compass, Search, Sparkles, X } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { FeatureIcon } from './feature-icons';
import { useUsage, type OpenFeature } from './usage-hooks';
import { attentionItems, discoveryCandidates, markDismissed, markShown, markTried, pickDiscovery, readSignals, type AttentionItem, type DiscoveryCandidate } from '@/lib/discovery';
import { featureById, featuresOn, type FeatureAction } from '@/lib/features';
import { markSeen, writeUsage } from '@/lib/usage';
import { todayInTimeZone } from '@/lib/period';
import { rupiah } from '@/lib/accounting';

/** Signals and the single prompt (or none) for one screen. */
export function useDiscovery(screen: string, opts: { homeWidgets?: string[]; customizedHome?: boolean } = {}) {
  const { data, profile, user } = useApp();
  const usage = useUsage();
  const today = todayInTimeZone(profile?.timeZone);
  const signals = useMemo(() => readSignals(data, profile, today, { healthIssues: usage.health?.issues }), [data, profile, today, usage.health?.issues]);
  const candidates = useMemo(() => discoveryCandidates(data, signals, { screen, visited: usage.visited, homeWidgets: opts.homeWidgets, customizedHome: opts.customizedHome }), [data, signals, screen, usage.visited, opts.homeWidgets, opts.customizedHome]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pick = useMemo(() => pickDiscovery(candidates, signals, usage.discovery, Date.now()), [candidates, signals, usage.discovery]);
  return { pick, signals, uid: user?.uid, today };
}

/** One quiet, dismissible suggestion with a reason. Shows nothing when nothing is useful. */
export function DiscoveryCard({ screen, onOpen, onWidget, homeWidgets, customizedHome }: { screen: string; onOpen: OpenFeature; onWidget?: (widget: string) => void; homeWidgets?: string[]; customizedHome?: boolean }) {
  const { pick, uid, today } = useDiscovery(screen, { homeWidgets, customizedHome });
  // The prompt chosen when the screen opens stays for this visit (marking it seen must not swap it for another).
  const [held, setHeld] = useState<DiscoveryCandidate | null>(null), [gone, setGone] = useState(false);
  useEffect(() => { if (!held && pick && !gone) setHeld(pick); }, [pick, held, gone]);
  useEffect(() => { if (held) writeUsage(uid, u => ({ ...u, discovery: markShown(u.discovery, held.key, Date.now(), today) })); }, [held?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!held || gone) return null;
  const f = featureById(held.featureId);
  function act() {
    if (!held) return;
    writeUsage(uid, u => ({ ...u, discovery: markTried(u.discovery, held.key, Date.now()) }));
    setGone(true);
    if (held.action.kind === 'widget') onWidget?.(held.action.widget); else onOpen(held.action as FeatureAction, held.featureId);
  }
  function dismiss() { if (!held) return; writeUsage(uid, u => ({ ...u, discovery: markDismissed(u.discovery, held.key, Date.now()) })); setGone(true); }
  // Outside Beranda the prompt is one quiet line, so it never competes with the page's own question.
  if (screen !== 'home') return <aside className="discovery-card is-compact" aria-label="Saran fitur">
    <span className="dc-icon"><FeatureIcon name={f?.icon || 'sparkles'} size={16}/></span>
    <button type="button" className="dc-line" onClick={act} title={held.body}><strong>{held.title}</strong><span>{held.cta} <ArrowRight size={13}/></span></button>
    <button type="button" className="icon-btn dc-close" aria-label="Tutup saran" onClick={dismiss}><X size={15}/></button>
  </aside>;
  return <aside className="discovery-card" aria-label="Saran fitur">
    <span className="dc-icon"><FeatureIcon name={f?.icon || 'sparkles'} size={18}/></span>
    <div className="dc-text"><strong>{held.title}</strong><p>{held.body}</p><div className="dc-actions"><Button className="small" variant="secondary" onClick={act}>{held.cta} <ArrowRight size={14}/></Button><button type="button" className="link-button dc-later" onClick={dismiss}>Nanti saja</button></div></div>
    <button type="button" className="icon-btn dc-close" aria-label="Tutup saran" onClick={dismiss}><X size={16}/></button>
  </aside>;
}

/** "Perlu perhatian": at most three items, the rest behind one tap. A calm line when nothing needs attention. */
export function AttentionCluster({ items, onOpen, max = 3 }: { items: AttentionItem[]; onOpen: OpenFeature; max?: number }) {
  const [all, setAll] = useState(false);
  if (!items.length) return <p className="attention-calm"><Check size={15}/> Tidak ada yang perlu diurus sekarang.</p>;
  const shown = all ? items : items.slice(0, max);
  return <section className="attention" aria-label="Perlu perhatian">
    <h2 className="attention-title">Perlu perhatian</h2>
    <ul>{shown.map(item => <li key={item.key}><button type="button" className={`attention-row tone-${item.tone}`} onClick={() => onOpen(item.action)}><i aria-hidden="true"/><span><strong>{item.text}</strong>{item.detail && <small>{item.detail}</small>}</span><ChevronRight size={16} aria-hidden="true"/></button></li>)}</ul>
    {items.length > max && <button type="button" className="link-button attention-more" onClick={() => setAll(v => !v)}>{all ? 'Tampilkan lebih sedikit' : `${items.length - max} lainnya`}</button>}
  </section>;
}
export { attentionItems };

/** "Kenapa angka ini?": the parts of one number, shown on demand. */
export type ExplainRow = { label: string; value: number; sign?: '+' | '-' | '='; note?: string };
export function ExplainSheet({ open, onOpenChange, title, lead, rows, footer }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; lead: string; rows: ExplainRow[]; footer?: ReactNode }) {
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent title={title} className="explain-sheet">
    <p className="explain-lead">{lead}</p>
    <dl className="explain-rows">{rows.map(r => <div key={r.label} className={`explain-row ${r.sign === '=' ? 'is-total' : ''}`}><dt>{r.label}{r.note && <small>{r.note}</small>}</dt><dd>{r.sign === '-' ? '−' : r.sign === '+' ? '+' : ''}{rupiah(Math.abs(r.value))}</dd></div>)}</dl>
    {footer}
  </DialogContent></Dialog>;
}

/** "Yang bisa dilakukan di sini": the capabilities of one page, from the registry, as a compact sheet. */
export function PageHelp({ view, onOpen }: { view: string; onOpen: OpenFeature }) {
  const [open, setOpen] = useState(false);
  const page = featureById(view === 'advisor' ? 'insight' : view);
  const here = featuresOn(view === 'advisor' ? 'advisor' : view);
  if (!page || !here.length) return null;
  return <>
    <button type="button" className="icon-btn page-help-btn" aria-label="Yang bisa dilakukan di sini" title="Yang bisa dilakukan di sini" onClick={() => setOpen(true)}><CircleHelp size={18}/></button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Yang bisa dilakukan di sini" className="page-help-sheet">
      <p className="explain-lead">{page.description}</p>
      <div className="ph-list">{here.map(f => <button type="button" key={f.id} className="ph-row" onClick={() => { setOpen(false); onOpen(f.action, f.id); }}><span className="fs-icon"><FeatureIcon name={f.icon}/></span><span className="fs-text"><strong>{f.name}</strong><small>{f.description}</small></span><ChevronRight size={16} aria-hidden="true"/></button>)}</div>
      {page.help && <button type="button" className="link-button ph-help" onClick={() => { setOpen(false); onOpen({ kind: 'view', view: 'help', focus: page.help }); }}><CircleHelp size={14}/> Penjelasan lengkap di Tanya Jawab</button>}
    </DialogContent></Dialog>
  </>;
}

/** A short empty state that says what the feature is for, with one action. */
export function SmartEmpty({ icon, title, body, action }: { icon: string; title: string; body: string; action?: ReactNode }) {
  return <div className="smart-empty"><span className="se-icon"><FeatureIcon name={icon} size={22}/></span><strong>{title}</strong><p>{body}</p>{action}</div>;
}

const ORIENTATION = [
  { icon: Sparkles, title: 'Tampilan sekarang lebih fokus', body: 'Beranda menunjukkan yang penting dulu: uang yang aman dipakai, yang perlu diurus, dan aktivitas terakhir. Rincian tetap ada, tinggal ketuk.' },
  { icon: Search, title: 'Cari fitur apa pun', body: 'Ketuk ikon cari di atas (atau Ctrl/⌘+K di komputer) lalu tulis dengan bahasamu sendiri, misalnya “uang balik”, “tagihan bulanan”, atau “bunga”.' },
  { icon: Compass, title: 'Fitur lanjutan muncul saat relevan', body: 'Tidak ada fitur yang dihapus. Yang jarang dipakai ada di Lainnya › Jelajahi semua fitur, dan akan disarankan saat datamu membutuhkannya.' },
];
/** Three short notes for people who used 4.x, shown once per account. New accounts skip it (they had onboarding). */
export function Orientation({ show }: { show: boolean }) {
  const { user } = useApp();
  const usage = useUsage();
  const [step, setStep] = useState(0);
  const seen = usage.seen.includes('orientation-5.0');
  if (!show || seen || !user) return null;
  const close = () => writeUsage(user.uid, u => markSeen(u, 'orientation-5.0'));
  const s = ORIENTATION[step];
  return <Dialog open onOpenChange={o => { if (!o) close(); }}><DialogContent title="Dompet Ajaib 5.0" className="orientation-sheet">
    <div className="or-step" key={step}><span className="or-icon"><s.icon size={26}/></span><h3>{s.title}</h3><p>{s.body}</p></div>
    <div className="or-dots" aria-label={`Langkah ${step + 1} dari ${ORIENTATION.length}`}>{ORIENTATION.map((_, i) => <i key={i} className={i === step ? 'is-on' : ''}/>)}</div>
    <div className="or-actions"><button type="button" className="link-button" onClick={close}>Lewati</button><Button onClick={() => step < ORIENTATION.length - 1 ? setStep(step + 1) : close()}>{step < ORIENTATION.length - 1 ? 'Lanjut' : 'Mulai'}</Button></div>
  </DialogContent></Dialog>;
}
