'use client';
import { useState } from 'react';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus, Shuffle } from 'lucide-react';
import { Dialog, DialogContent } from '../ui/dialog';
import type { heroView } from '@/lib/insight-v3/view';
import { help, levelPlain } from '@/lib/insight-v3/view';
import { dayMonth } from '@/lib/insight-v3/format';
import { HelpButton } from './section';

type Hero = ReturnType<typeof heroView>;
const dirIcon = { up: ArrowUpRight, down: ArrowDownRight, flat: Minus, mixed: Shuffle } as const;

/**
 * The financial state as ONE card: the score (overall condition), the direction (getting better or worse) and what
 * needs care right now (temporary, does not change the score), with one sentence that ties them together.
 * "Kenapa skor ini?" opens the strongest and weakest parts first; the full calculation is one more tap.
 */
export function InsightHero({ hero, onFullScore }: { hero: Hero; onFullScore: () => void }) {
  const [why, setWhy] = useState(false), [watchOpen, setWatchOpen] = useState(false), [dirOpen, setDirOpen] = useState(false);
  const Dir = dirIcon[hero.momentum.dir];
  return <section className={`ix-hero tone-${hero.tone}`} aria-label="Keadaan keuanganmu">
    <div className="ix-hero-main">
      <div className="ix-score" aria-label={`Skor kesehatan ${hero.score} dari 100, ${hero.label}`}>
        <strong>{hero.score}</strong><span><b>{hero.label}</b><small>skor kesehatan · dari 100</small></span>
        <HelpButton {...help.score}/>
      </div>
      <p className="ix-statement">{hero.statement}</p>
    </div>
    <div className="ix-hero-facts">
      <button type="button" className={`ix-fact dir-${hero.momentum.dir}`} onClick={() => setDirOpen(true)} aria-label={`Arah keuangan: ${hero.momentum.label}. ${hero.momentum.line} Ketuk untuk rincian.`}>
        <small>Arah</small><span><Dir size={15} aria-hidden="true"/> {hero.momentum.label}</span>
      </button>
      <button type="button" className={`ix-fact ${hero.watch.length ? 'is-watch' : 'is-calm'}`} onClick={() => setWatchOpen(true)} aria-label={`Yang perlu dijaga: ${hero.watch.length ? hero.watch.map(w => w.label).join(' dan ') : 'tidak ada'}. Ketuk untuk rincian.`}>
        <small>Perlu dijaga</small><span>{hero.watch.length ? hero.watch.map(w => w.label).join(' · ') : 'Tidak ada'}</span>
      </button>
    </div>
    <button type="button" className="ix-hero-why" aria-expanded={why} onClick={() => setWhy(v => !v)}>Kenapa skor ini? <ChevronDown size={15} className={why ? 'open' : ''} aria-hidden="true"/></button>
    {why && <div className="ix-hero-detail">
      {hero.delta && hero.delta.delta !== 0 && <p className="ix-delta-line">{hero.delta.delta > 0 ? 'Naik' : 'Turun'} {Math.abs(hero.delta.delta)} poin sejak {dayMonth(hero.delta.previous.d)}: {hero.delta.rows.slice(0, 3).map(r => `${r.label} ${r.change > 0 ? '+' : '−'}${Math.abs(r.change)}`).join(', ')}.</p>}
      {hero.why.strong.length > 0 && <div><small>Kuat di</small><ul>{hero.why.strong.map(p => <li key={p.label} className="good">+ {p.label} <em>{p.value}</em></li>)}</ul></div>}
      {hero.why.held.length > 0 && <div><small>Tertahan oleh</small><ul>{hero.why.held.map(p => <li key={p.label} className="held">− {p.label} <em>{p.value}</em></li>)}</ul></div>}
      <dl className="ix-numbers">{hero.numbers.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      <small className="ix-basis">{hero.basis}</small>
      <button type="button" className="link-button" onClick={onFullScore}>Lihat perhitungan lengkap</button>
    </div>}
    {dirOpen && <Dialog open onOpenChange={setDirOpen}><DialogContent title={`Arah keuangan: ${hero.momentum.label}`} className="ix-help-sheet">
      <p>{hero.momentum.line}</p>
      {hero.momentum.parts.length > 0 && <ul className="ix-plain-list">{hero.momentum.parts.map(p => <li key={p.key} className={p.good === true ? 'good' : p.good === false ? 'held' : ''}><b>{p.label}</b><span>{p.detail}</span></li>)}</ul>}
      <p className="ix-note">{help.momentum.text}</p>
    </DialogContent></Dialog>}
    {watchOpen && <Dialog open onOpenChange={setWatchOpen}><DialogContent title="Yang perlu dijaga" className="ix-help-sheet">
      <p className="ix-note">{help.watch.text}</p>
      <ul className="ix-plain-list">{hero.allPressures.map(p => <li key={p.domain} className={`lvl-${p.level}`}><b>{p.label} <em>{levelPlain[p.level]}</em></b><span>{p.reasons[0] || p.explain}</span></li>)}</ul>
    </DialogContent></Dialog>}
  </section>;
}
