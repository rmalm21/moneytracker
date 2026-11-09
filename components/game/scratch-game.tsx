'use client';
/**
 * 9.7 Gosok Berhadiah: once all three of today's missions are done, a 3×3 card to scratch with a finger. Three of the
 * same symbol is the prize; the card of the day is fixed (lib/game.ts scratchGrid / scratchCard) and the prize is saved
 * as soon as the three are uncovered (or "Buka semua"). The week's cards show under it.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Lock, X } from 'lucide-react';
import { Emoji } from '../emoji';
import { confetti } from './confetti';
import { gameActions, useGame, type ScratchOutcome } from './game-store';
import { useMiniGameStatus } from './minigame-status';
import { useApp } from '../app-provider';
import { SCRATCH_PRIZES, scratchGrid, scratchIndex } from '@/lib/game';
import { play } from '@/lib/game-sound';
import { todayInTimeZone } from '@/lib/period';

const DAYS = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
type Spark = { id: number; x: number; y: number };

export function ScratchGame({ onClose }: { onClose: () => void }) {
  const st = useMiniGameStatus(), { account, personalProfile } = useApp(), g = useGame();
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  const grid = useMemo(() => scratchGrid(account?.uid || '', today), [account?.uid, today]);
  const win = useMemo(() => scratchIndex(account?.uid || '', today), [account?.uid, today]);
  const [out, setOut] = useState<ScratchOutcome | null>(null), [revealed, setRevealed] = useState(false), [open, setOpen] = useState<boolean[]>(() => Array(9).fill(false));
  const [sparks, setSparks] = useState<Spark[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null), done = useRef(false), last = useRef<{ x: number; y: number } | null>(null), ticks = useRef(0), opened = useRef<boolean[]>(Array(9).fill(false));
  const ready = Boolean(st?.scratchReady) && !revealed;
  const shown = revealed || Boolean(st?.scratched);
  const prize = out ? SCRATCH_PRIZES[out.index] : st?.scratchPrize || null;
  // The silver layer over the nine boxes.
  useEffect(() => {
    const cv = canvas.current; if (!cv || !ready) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = r.width * dpr; cv.height = r.height * dpr; const c = cv.getContext('2d')!; c.scale(dpr, dpr);
    const w = r.width / 3, h = r.height / 3, font = getComputedStyle(document.body).fontFamily;
    for (let k = 0; k < 9; k++) {
      const x = (k % 3) * w, y = Math.floor(k / 3) * h;
      const gr = c.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#cfd5dd'); gr.addColorStop(.5, '#f4f6f9'); gr.addColorStop(1, '#aeb7c3');
      c.fillStyle = gr; c.beginPath(); c.roundRect(x + 4, y + 4, w - 8, h - 8, 14); c.fill();
      c.fillStyle = 'rgba(80,90,105,.16)'; for (let s = -h; s < w; s += 12) { c.beginPath(); c.moveTo(x + 4 + Math.max(0, s), y + h - 4 - Math.max(0, -s)); c.lineTo(x + 4 + Math.min(w - 8, s + h), y + 4 + Math.max(0, s + h - (w - 8))); c.lineTo(x + 8 + Math.min(w - 8, s + h), y + 4 + Math.max(0, s + h - (w - 8))); c.lineTo(x + 8 + Math.max(0, s), y + h - 4 - Math.max(0, -s)); c.fill(); }
      c.fillStyle = '#6b7685'; c.font = `900 ${Math.round(w / 3.2)}px ${font}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x + w / 2, y + h / 2 + 2);
    }
  }, [ready]);
  const scratchAt = (clientX: number, clientY: number) => {
    const cv = canvas.current; if (!cv || done.current) return;
    const r = cv.getBoundingClientRect(), x = clientX - r.left, y = clientY - r.top, c = cv.getContext('2d')!;
    c.globalCompositeOperation = 'destination-out'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = Math.max(26, r.width / 11);
    c.beginPath(); const p = last.current || { x, y }; c.moveTo(p.x, p.y); c.lineTo(x, y); c.stroke(); last.current = { x, y };
    if (++ticks.current % 4 === 0) { const id = Math.random(); setSparks(list => [...list.slice(-8), { id, x, y }]); window.setTimeout(() => setSparks(list => list.filter(s => s.id !== id)), 600); }
    if (ticks.current % 6 === 0) { play('click'); check(); }
  };
  /** A box more than about half scratched opens fully; the three winning boxes open the prize. */
  function check() {
    const cv = canvas.current; if (!cv || done.current) return;
    const c = cv.getContext('2d')!, w = cv.width / 3, h = cv.height / 3; let changed = false;
    for (let k = 0; k < 9; k++) {
      if (opened.current[k]) continue;
      const d = c.getImageData((k % 3) * w + w * .15, Math.floor(k / 3) * h + h * .15, w * .7, h * .7).data; let clear = 0, n = 0;
      for (let q = 3; q < d.length; q += 4 * 23) { n++; if (d[q] === 0) clear++; }
      if (clear / n > .45) { opened.current[k] = true; changed = true; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect((k % 3) * w, Math.floor(k / 3) * h, w, h); c.restore(); play(grid[k] === win ? 'coin' : 'step'); }
    }
    if (changed) setOpen([...opened.current]);
    if (grid.every((v, k) => v !== win || opened.current[k])) reveal();
  }
  function reveal() {
    if (done.current) return; done.current = true;
    const res = gameActions().scratch(); setOut(res); setRevealed(true); setOpen(Array(9).fill(true));
    const big = res && (res.xp >= 40 || res.shield);
    play(big ? 'jackpot' : 'achievement'); confetti({ count: big ? 240 : 150 });
  }
  const prizeText = !prize ? '' : out ? (out.shield ? 'Perisai Api!' : `+${out.xp} XP`) : prize.label;
  return <div className="mg-overlay mg-scratch" role="dialog" aria-modal="true" aria-label="Gosok Berhadiah">
    <button type="button" className="mg-close" onClick={onClose} aria-label="Tutup"><X size={20}/></button>
    <div className="mg-spin-head"><small>Hadiah misi harian</small><h2>Gosok Berhadiah</h2>
      <p>{ready ? 'Semua misi hari ini tuntas! Gosok kotaknya, cari 3 simbol yang sama.' : shown ? 'Kartu hari ini sudah dibuka. Besok tuntaskan misi lagi ya!' : `Tuntaskan ${st?.missionsTotal ?? 3} misi hari ini buat membuka kartu. Baru ${st?.missionsDone ?? 0} selesai.`}</p></div>
    <div className={`gs-ticket is-grid ${ready ? '' : shown ? 'is-open' : 'is-locked'}`}>
      <div className="gs-grid">
        {grid.map((k, i) => { const p = SCRATCH_PRIZES[k], visible = shown || open[i]; return <span key={i} className={`gs-cell ${visible ? 'is-shown' : ''} ${shown && k === win ? 'is-win' : ''}`} style={{ '--i': i } as React.CSSProperties}>
          {visible || ready ? <><Emoji e={p.emoji}/><small>{p.shield ? 'Perisai' : p.label.replace(' XP', '')}</small></> : null}
        </span>; })}
      </div>
      {ready && <canvas ref={canvas} className="gs-cover" aria-label="Kartu gosok: gosok pakai jari" onPointerDown={e => { last.current = null; scratchAt(e.clientX, e.clientY); (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }} onPointerMove={e => { if (e.buttons || e.pointerType !== 'mouse') scratchAt(e.clientX, e.clientY); }} onPointerUp={() => { last.current = null; check(); }}/>}
      {ready && sparks.map(s => <i key={s.id} className="gs-spark" style={{ left: s.x, top: s.y }} aria-hidden="true"/>)}
      {!ready && !shown && <div className="gs-lock"><Lock size={22}/><b>{st?.missionsDone ?? 0}/{st?.missionsTotal ?? 3} misi</b><small>Kartu terbuka setelah semua misi tuntas</small></div>}
    </div>
    {shown && prize && <div className="mg-prize gs-result" role="status"><small>{out ? 'Hadiahmu hari ini' : 'Hadiah hari ini'}</small><strong><Emoji e={prize.emoji}/> {prizeText}</strong><span>{out?.shield ? 'Perisai menjaga apimu kalau kamu lupa mencatat sehari.' : out && prize.shield ? 'Perisaimu sudah penuh, jadi hadiahnya +30 XP.' : '3 simbol yang sama = hadiahmu.'}</span></div>}
    {ready && <button type="button" className="gs-all" onClick={reveal}>Buka semua</button>}
    <div className="gs-week" aria-label="Kartu minggu ini">{(st?.scratchWeek || []).map((d, i) => <span key={d.day} className={`${d.today ? 'is-today' : ''} ${d.emoji ? 'is-got' : ''} ${d.future ? 'is-future' : ''}`}><small>{DAYS[i]}</small>{d.emoji ? <Emoji e={d.emoji}/> : <i/>}</span>)}</div>
    <ul className="gs-odds">{SCRATCH_PRIZES.map(p => <li key={p.id}><Emoji e={p.emoji}/>{p.label}</li>)}</ul>
    <div className="mg-actions"><button type="button" className="mg-btn is-gold" onClick={onClose}>{shown ? 'Mantap!' : 'Tutup'}</button></div>
  </div>;
}
