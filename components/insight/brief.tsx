'use client';
import { useState } from 'react';
import { ArrowDownLeft, BookOpen, CalendarClock, ChevronDown, Eye, HeartPulse, MessageCircle, Receipt, Send, ShoppingBag, TrendingUp, type LucideIcon } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';
import { ask, type Answer } from '@/lib/insight-v3/ask';
import type { InsightV3Report } from '@/lib/insight-v3';
import type { briefView, cycleView, ExplainStep } from '@/lib/insight-v3/view';

/** The page's short narrative: 2–4 lines, each one opens its source. */
export function FinancialBrief({ lines, known, onOpen, onExplain }: { lines: ReturnType<typeof briefView>; known: Set<string>; onOpen: (sig: string) => void; onExplain: () => void }) {
  return <div className="ix-brief">
    <ul>{lines.map((l, i) => <li key={i}>{known.has(l.source) ? <button type="button" className="ix-brief-link" onClick={() => onOpen(l.source)}>{l.text}</button> : l.text}</li>)}</ul>
    <button type="button" className="ix-secondary" onClick={onExplain}><BookOpen size={15} aria-hidden="true"/> Jelaskan siklus ini</button>
  </div>;
}

/** Tanya Insight: collapsed by default; a few questions that fit the current data; short answer first. */
export function AskInsight({ report, questions, known, onOpen }: { report: InsightV3Report; questions: string[]; known: Set<string>; onOpen: (sig: string) => void }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState(''), [answer, setAnswer] = useState<Answer | null>(null), [more, setMore] = useState(false);
  const run = (text: string) => { if (!text.trim()) return; setQ(text); setMore(false); setAnswer(ask(text, report)); };
  if (!open) return <button type="button" className="ix-ask-entry" onClick={() => setOpen(true)}><MessageCircle size={16} aria-hidden="true"/> Tanya tentang keuanganmu</button>;
  const unknown = answer?.intent === 'UNKNOWN';
  const evidence = answer?.evidence.filter(e => known.has(e)) || [];
  return <div className="ix-ask">
    <form onSubmit={e => { e.preventDefault(); run(q); }} className="ix-ask-form">
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Contoh: kenapa uang tersedia turun?" aria-label="Pertanyaan untuk Insight" autoFocus/>
      <button type="submit" aria-label="Tanya"><Send size={16}/></button>
    </form>
    {(!answer || unknown) && <div className="ix-chips" role="list" aria-label="Contoh pertanyaan">{unknown && <p className="ix-ask-unknown">Aku belum memahami pertanyaan itu. Coba salah satu ini:</p>}{questions.map(s => <button key={s} type="button" role="listitem" onClick={() => run(s)}>{s}</button>)}</div>}
    {answer && !unknown && <div className="ix-answer" role="status">
      <p className="ix-answer-head">{answer.simulation && <span className="ix-sim">Simulasi</span>}<strong>{answer.title}</strong></p>
      {answer.lines[0] && <p>{answer.lines[0]}</p>}
      {answer.lines.length > 1 && <ul>{answer.lines.slice(1, more ? undefined : 3).map((l, i) => <li key={i}>{l}</li>)}</ul>}
      <div className="ix-answer-foot">
        {answer.lines.length > 3 && <button type="button" className="link-button" aria-expanded={more} onClick={() => setMore(v => !v)}>{more ? 'Ringkas' : `Lihat detail (${answer.lines.length - 3})`}</button>}
        {evidence[0] && <button type="button" className="link-button" onClick={() => onOpen(evidence[0])}>Lihat bukti</button>}
        <button type="button" className="link-button" onClick={() => { setAnswer(null); setQ(''); }}>Tanya lagi</button>
      </div>
    </div>}
    <p className="ix-note">Tanya Insight hanya membaca datamu, memakai pola pertanyaan yang dikenalinya.</p>
  </div>;
}

const stepIcon: Record<ExplainStep['key'], LucideIcon> = { overall: HeartPulse, income: ArrowDownLeft, spending: ShoppingBag, cash: CalendarClock, obligations: Receipt, progress: TrendingUp, watch: Eye };

/**
 * "Jelaskan siklus ini": where the cycle stands, then one card per chapter. Each card says its status in a chip,
 * gives the one number that matters, compares it with what is usual, and keeps the rest one tap away.
 */
export function ExplainSheet({ steps, cycle, onClose }: { steps: ExplainStep[]; cycle: ReturnType<typeof cycleView>; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return <Dialog open onOpenChange={o => { if (!o) onClose(); }}><DialogContent title="Siklus ini" className="ix-sheet ix-explain">
    <div className="ix-cycle" aria-label={`Hari ke-${cycle.day} dari ${cycle.total}, ${cycle.daysLeft} hari lagi gajian`}>
      <div className="ix-cycle-top"><span><strong>Hari ke-{cycle.day}</strong> dari {cycle.total}</span><em>{cycle.daysLeft} hari lagi gajian</em></div>
      <i className="ix-cycle-bar" aria-hidden="true"><b style={{ width: `${Math.round(cycle.ratio * 100)}%` }}/></i>
      <small>{cycle.range}</small>
    </div>
    <ol className="ix-chapters">{steps.map((s, k) => {
      const Icon = stepIcon[s.key], isOpen = open === s.key;
      return <li key={s.key} className={`ix-chapter tone-${s.tone}`}>
        <header>
          <span className="ix-chapter-icon" aria-hidden="true"><Icon size={18}/></span>
          <h4><small>{k + 1} · </small>{s.title}</h4>
          <span className="ix-chapter-status">{s.status}</span>
        </header>
        {s.figure && <p className="ix-chapter-figure"><strong>{s.figure.value}</strong><span>{s.figure.caption}</span></p>}
        {s.bar && <div className="ix-chapter-bar">
          <i aria-hidden="true"><b style={{ width: `${Math.max(2, Math.round(s.bar.ratio * 100))}%` }}/>{s.bar.marker !== undefined && <u style={{ left: `${Math.round(s.bar.marker * 100)}%` }} title="hari ini"/>}</i>
          <small>{s.bar.label}{s.bar.marker !== undefined ? ' · │ hari ini' : ''}</small>
        </div>}
        <p className="ix-chapter-line">{s.line}</p>
        {s.details.length > 0 && <>
          <button type="button" className="ix-chapter-more" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : s.key)}>{isOpen ? 'Tutup rincian' : `Rincian (${s.details.length})`} <ChevronDown size={14} className={isOpen ? 'open' : ''} aria-hidden="true"/></button>
          {isOpen && <ul className="ix-chapter-details">{s.details.map((d, n) => <li key={n}>{d}</li>)}</ul>}
        </>}
      </li>;
    })}</ol>
    <p className="ix-note ix-explain-foot">Disusun dari catatanmu sendiri dengan aturan tetap, tanpa AI dan tanpa internet.</p>
  </DialogContent></Dialog>;
}
