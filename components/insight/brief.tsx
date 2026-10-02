'use client';
import { useState } from 'react';
import { BookOpen, ChevronDown, MessageCircle, Send } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';
import { ask, type Answer } from '@/lib/insight-v3/ask';
import type { InsightV3Report } from '@/lib/insight-v3';
import type { briefView, explainView } from '@/lib/insight-v3/view';

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

/** "Jelaskan siklus ini": a short story in order, opened in a full sheet. */
export function ExplainSheet({ sections, onClose }: { sections: ReturnType<typeof explainView>; onClose: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return <Dialog open onOpenChange={o => { if (!o) onClose(); }}><DialogContent title="Siklus ini" className="ix-sheet ix-explain">
    <ol className="ix-story-steps">{sections.map((s, i) => <li key={s.title}>
      <span className="ix-step-no" aria-hidden="true">{i + 1}</span>
      <div><h4>{s.title}</h4><p>{s.lines[0]}</p>
        {s.lines.length > 1 && (open === s.title ? <ul>{s.lines.slice(1).map((l, k) => <li key={k}>{l}</li>)}</ul> : <button type="button" className="link-button" onClick={() => setOpen(s.title)}>Selengkapnya <ChevronDown size={13} aria-hidden="true"/></button>)}
      </div>
    </li>)}</ol>
    <p className="ix-note">Disusun dari catatanmu sendiri dengan aturan tetap, tanpa AI dan tanpa internet.</p>
  </DialogContent></Dialog>;
}
