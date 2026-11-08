'use client';
/**
 * 9.6 Mini games in Arena Catat (Pribadi): Putar Roda Harian (once a day, after today's flame is lit) and Tangkap Koin
 * (30 seconds: catch coins in the wallet, dodge bills and impulse buys). Rules and XP: lib/game.ts (spinWheel,
 * coinResult); the keeper saves the prize. Both open full screen over the app.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useBackHandler } from '../back-guard';
import { Emoji } from '../emoji';
import { confetti } from './confetti';
import { gameActions, openMinigame, useGame, type CoinOutcome, type SpinOutcome } from './game-store';
import { useMiniGameStatus } from './minigame-status';
import { COIN_SECONDS, COIN_XP_CAP, SPIN_PRIZES } from '@/lib/game';
import { play, playCatch } from '@/lib/game-sound';

const GOLD = ['#ffe58a', '#f4c542', '#ffb800', '#fff6cc', '#ffffff', '#ff8a3d'];

export function MiniGames() {
  const { minigame } = useGame();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const close = () => openMinigame(null);
  useBackHandler(Boolean(minigame), close);
  if (!mounted || !minigame) return null;
  return createPortal(minigame === 'spin' ? <SpinGame onClose={close}/> : <CoinGame onClose={close}/>, document.body);
}

// ——— Putar Roda Harian ———
const SEG = 360 / SPIN_PRIZES.length;
const COLORS = [['#ff9a3c', '#ff5e3a'], ['#7c4dff', '#5b2fd6'], ['#2bd38a', '#13a36a'], ['#ff4d6d', '#d62f57'], ['#ffc24b', '#f29a00'], ['#3aa0ff', '#1f6fe0'], ['#ff6bd6', '#c23aa8'], ['#17c3b2', '#0e8f86']];
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

function SpinGame({ onClose }: { onClose: () => void }) {
  const st = useMiniGameStatus();
  const [phase, setPhase] = useState<'ready' | 'spinning' | 'done'>(() => st?.spun ? 'done' : 'ready');
  const [outcome, setOutcome] = useState<SpinOutcome | null>(null);
  const wheel = useRef<SVGGElement>(null), pointer = useRef<HTMLSpanElement>(null);
  const angle = useRef(0), raf = useRef(0);
  // An earlier spin today: the wheel rests on today's prize.
  useEffect(() => {
    if (st?.spun && st.prize) { const i = SPIN_PRIZES.indexOf(st.prize); angle.current = 360 - (i * SEG + SEG / 2); wheel.current?.setAttribute('transform', `rotate(${angle.current} 150 150)`); }
    return () => cancelAnimationFrame(raf.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  function spin() {
    if (phase !== 'ready') return;
    const out = gameActions().spin(); if (!out) return;
    setOutcome(out); setPhase('spinning'); play('go');
    const from = angle.current, jitter = (Math.random() - .5) * SEG * .6;
    const to = from + 360 * 6 + (((360 - (out.index * SEG + SEG / 2) + jitter) - from) % 360 + 360) % 360;
    const start = performance.now(), ms = 5200; let lastPeg = Math.floor(from / SEG);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      const p = reduce ? 1 : Math.min(1, (now - start) / ms), a = from + (to - from) * easeOut(p);
      angle.current = a; wheel.current?.setAttribute('transform', `rotate(${a} 150 150)`);
      const peg = Math.floor(a / SEG);
      if (peg !== lastPeg) { lastPeg = peg; play('click'); const el = pointer.current; if (el) { el.classList.remove('is-hit'); void el.offsetWidth; el.classList.add('is-hit'); } }
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else { setPhase('done'); const big = out.xp >= 50 || out.shield; play(big ? 'jackpot' : 'achievement'); confetti({ count: big ? 260 : 160, colors: GOLD }); if (big) window.setTimeout(() => confetti({ count: 140, origin: { x: .5, y: .3 } }), 450); }
    };
    raf.current = requestAnimationFrame(tick);
  }
  const prize = outcome ? SPIN_PRIZES[outcome.index] : st?.prize || null;
  const prizeText = !prize ? '' : outcome ? (outcome.shield ? 'Dapat Perisai Api!' : prize.shield ? 'Perisai penuh, jadi +50 XP' : `+${outcome.xp} XP`) : prize.shield ? 'Perisai Api' : `${prize.label} XP`;
  return <div className="mg-overlay mg-spin" role="dialog" aria-modal="true" aria-label="Putar Roda Harian">
    <span className="mg-rays" aria-hidden="true"/>
    <button type="button" className="mg-close" onClick={onClose} aria-label="Tutup"><X size={20}/></button>
    <div className="mg-spin-head">
      <small>Arena Catat · sekali sehari</small>
      <h2>Putar Roda Harian</h2>
      <p>{!st?.lit ? 'Nyalakan apimu hari ini dulu, baru roda bisa diputar.' : phase === 'done' ? 'Roda hari ini sudah diputar. Besok putar lagi ya!' : 'Api hari ini sudah nyala. Saatnya putar roda!'}</p>
    </div>
    <div className={`mg-wheel-wrap ${phase === 'spinning' ? 'is-spinning' : ''} ${phase === 'done' ? 'is-done' : ''}`}>
      <span className="mg-wheel-glow" aria-hidden="true"/>
      <span className="mg-pointer" ref={pointer} aria-hidden="true"/>
      <svg className="mg-wheel" viewBox="0 0 300 300" aria-hidden="true">
        <defs>
          {COLORS.map(([a, b], i) => <radialGradient key={i} id={`mgseg${i}`} cx="50%" cy="50%" r="60%"><stop offset="35%" stopColor={a}/><stop offset="100%" stopColor={b}/></radialGradient>)}
          <linearGradient id="mgrim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff3b0"/><stop offset=".5" stopColor="#e2a821"/><stop offset="1" stopColor="#8a5a00"/></linearGradient>
        </defs>
        <circle cx="150" cy="150" r="148" fill="url(#mgrim)"/>
        <circle cx="150" cy="150" r="136" fill="#1b0f33"/>
        <g ref={wheel}>
          {SPIN_PRIZES.map((p, i) => {
            const a0 = (i * SEG - 90) * Math.PI / 180, a1 = ((i + 1) * SEG - 90) * Math.PI / 180, r = 132;
            const d = `M150 150 L${150 + r * Math.cos(a0)} ${150 + r * Math.sin(a0)} A${r} ${r} 0 0 1 ${150 + r * Math.cos(a1)} ${150 + r * Math.sin(a1)} Z`;
            const mid = i * SEG + SEG / 2;
            return <g key={p.id}>
              <path d={d} fill={`url(#mgseg${i})`} stroke="rgba(255,255,255,.35)" strokeWidth="1.5"/>
              <g transform={`rotate(${mid} 150 150)`}>
                {p.shield ? <image href="/emoji/1f6e1.webp" x="132" y="34" width="36" height="36"/> : <text x="150" y="58" textAnchor="middle" className="mg-seg-n">{p.label}</text>}
                <text x="150" y={p.shield ? 84 : 76} textAnchor="middle" className="mg-seg-l">{p.shield ? 'PERISAI' : 'XP'}</text>
              </g>
            </g>;
          })}
          {SPIN_PRIZES.map((_, i) => { const a = (i * SEG - 90) * Math.PI / 180; return <circle key={i} cx={150 + 134 * Math.cos(a)} cy={150 + 134 * Math.sin(a)} r="4.5" className="mg-peg"/>; })}
        </g>
        {Array.from({ length: 24 }, (_, i) => { const a = (i * 15) * Math.PI / 180; return <circle key={i} cx={150 + 142 * Math.cos(a)} cy={150 + 142 * Math.sin(a)} r="3.2" className={`mg-bulb ${i % 2 ? 'b' : 'a'}`}/>; })}
      </svg>
      <button type="button" className="mg-hub" onClick={spin} disabled={phase !== 'ready' || !st?.ready}>{phase === 'spinning' ? '…' : phase === 'done' ? <Emoji e="🎁"/> : 'PUTAR'}</button>
    </div>
    {phase === 'done' && prize && <div className="mg-prize" role="status">
      <small>{outcome ? 'Hadiahmu hari ini' : 'Hadiah hari ini'}</small>
      <strong>{prizeText}</strong>
      <span>{outcome?.shield ? 'Perisai menjaga apimu kalau kamu lupa mencatat sehari.' : 'Besok putar lagi setelah api nyala.'}</span>
    </div>}
    <div className="mg-actions">
      {phase === 'ready' && st?.ready ? <button type="button" className="mg-btn is-gold" onClick={spin}>Putar sekarang!</button>
        : <button type="button" className="mg-btn" onClick={onClose} disabled={phase === 'spinning'}>{phase === 'done' ? 'Mantap!' : 'Tutup'}</button>}
    </div>
  </div>;
}

// ——— Tangkap Koin ———
type Kind = 'coin' | 'bag' | 'gem' | 'star' | 'bill' | 'shop' | 'burger' | 'coffee';
const ITEMS: Record<Kind, { key: string; points: number; bad?: boolean; weight: number; label: string }> = {
  coin: { key: '1fa99', points: 1, weight: 56, label: '+1' }, bag: { key: '1f4b0', points: 3, weight: 8, label: '+3' }, gem: { key: '1f48e', points: 5, weight: 5, label: '+5' },
  star: { key: '2b50', points: 0, weight: 3, label: '' }, bill: { key: '1f9fe', points: 0, bad: true, weight: 10, label: 'Tagihan!' },
  shop: { key: '1f6cd', points: 0, bad: true, weight: 7, label: 'Boros!' }, burger: { key: '1f354', points: 0, bad: true, weight: 6, label: 'Jajan!' },
  coffee: { key: '2615', points: 0, bad: true, weight: 5, label: 'Ngopi lagi?' },
};
const KINDS = Object.keys(ITEMS) as Kind[];
const pickKind = () => { let n = Math.random() * KINDS.reduce((t, k) => t + ITEMS[k].weight, 0); for (const k of KINDS) { n -= ITEMS[k].weight; if (n < 0) return k; } return 'coin' as Kind; };
type Drop = { kind: Kind; x: number; y: number; vy: number; spin: number; r: number; wob: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Float = { x: number; y: number; text: string; life: number; color: string };
const HEARTS = 3;

function CoinGame({ onClose }: { onClose: () => void }) {
  const st = useMiniGameStatus();
  const [phase, setPhase] = useState<'ready' | 'count' | 'play' | 'over'>('ready');
  const [count, setCount] = useState(3), [hud, setHud] = useState({ score: 0, hearts: HEARTS, left: COIN_SECONDS, combo: 0 });
  const [result, setResult] = useState<{ score: number; coins: number; gems: number; bestCombo: number; out: CoinOutcome | null } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null);
  const images = useMemo(() => {
    if (typeof window === 'undefined') return {} as Record<string, HTMLImageElement>;
    const out: Record<string, HTMLImageElement> = {};
    for (const key of [...KINDS.map(k => ITEMS[k].key), '1f45b']) { const img = new Image(); img.src = `/emoji/${key}.webp`; out[key] = img; }
    return out;
  }, []);
  const root = useRef<HTMLDivElement>(null);
  // A shake on a bad catch (restarted on the same element: a new element would lose the game's canvas).
  const shakeNow = () => { const el = root.current; if (!el) return; el.classList.remove('is-shaking'); void el.offsetWidth; el.classList.add('is-shaking'); };

  function start() { setResult(null); setHud({ score: 0, hearts: HEARTS, left: COIN_SECONDS, combo: 0 }); setPhase('count'); setCount(3); play('tick'); }
  // 3, 2, 1, go.
  useEffect(() => {
    if (phase !== 'count') return;
    if (count === 0) { play('go'); setPhase('play'); return; }
    const t = window.setTimeout(() => { setCount(n => n - 1); if (count > 1) play('tick'); }, 650);
    return () => window.clearTimeout(t);
  }, [phase, count]);

  // The game itself, on a canvas.
  useEffect(() => {
    if (phase !== 'play') return;
    const cv = canvas.current, box = wrap.current; if (!cv || !box) return;
    const ctx = cv.getContext('2d')!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const size = () => { W = box.clientWidth; H = box.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); window.addEventListener('resize', size);
    const unit = Math.max(36, Math.min(56, W / 8.5));
    const player = { x: W / 2, target: W / 2, w: unit * 1.45, y: H - unit * 1.35, tilt: 0 };
    let drops: Drop[] = [], sparks: Spark[] = [], floats: Float[] = [];
    let score = 0, hearts = HEARTS, combo = 0, bestCombo = 0, coins = 0, gems = 0, hurt = 0;
    let elapsed = 0, nextDrop = 0, last = performance.now(), raf = 0, ended = false, paused = false, lastSecond = COIN_SECONDS;
    const keys = new Set<string>();
    const setTarget = (clientX: number) => { const r = cv.getBoundingClientRect(); player.target = Math.max(player.w / 2, Math.min(W - player.w / 2, clientX - r.left)); };
    const onPointer = (e: PointerEvent) => { if (e.type === 'pointerdown' || e.buttons || e.pointerType !== 'mouse') setTarget(e.clientX); if (e.pointerType === 'mouse' && e.type === 'pointermove') setTarget(e.clientX); };
    const onKey = (e: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { e.preventDefault(); if (e.type === 'keydown') keys.add(e.key); else keys.delete(e.key); } };
    const onVis = () => { paused = document.hidden; last = performance.now(); };
    cv.addEventListener('pointerdown', onPointer); cv.addEventListener('pointermove', onPointer);
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); document.addEventListener('visibilitychange', onVis);
    const burst = (x: number, y: number, colors: string[], n = 14) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 220; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: 1, color: colors[i % colors.length] }); } };
    const finish = () => {
      if (ended) return; ended = true;
      const out = gameActions().coinDone(score);
      play(out?.record ? 'jackpot' : 'over');
      if (out?.record) { confetti({ count: 240, colors: GOLD }); window.setTimeout(() => confetti({ count: 140, origin: { x: .5, y: .3 } }), 450); }
      setResult({ score, coins, gems, bestCombo, out }); setPhase('over');
    };
    const draw = (img: HTMLImageElement | undefined, x: number, y: number, s: number, rot = 0, alpha = 1) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(rot);
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, -s / 2, -s / 2, s, s);
      else { ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.arc(0, 0, s / 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); last = now; if (paused || ended) return;
      elapsed += dt; const progress = Math.min(1, elapsed / COIN_SECONDS);
      // Spawning: faster and quicker as the half minute goes on.
      nextDrop -= dt * 1000;
      if (nextDrop <= 0) {
        const kind = pickKind(), bad = ITEMS[kind].bad;
        const speed = (H / 720) * (170 + 290 * progress) * (bad ? 1.12 : 1) * (0.85 + Math.random() * 0.3);
        drops.push({ kind, x: unit / 2 + Math.random() * (W - unit), y: -unit, vy: speed, spin: (Math.random() - .5) * 2.4, r: 0, wob: bad ? Math.random() * Math.PI * 2 : -1 });
        nextDrop = (720 - 400 * progress) * (0.7 + Math.random() * 0.6);
      }
      // The wallet follows the finger (or the arrow keys), leaning as it moves.
      if (keys.has('ArrowLeft') || keys.has('a')) player.target = Math.max(player.w / 2, player.target - 520 * dt);
      if (keys.has('ArrowRight') || keys.has('d')) player.target = Math.min(W - player.w / 2, player.target + 520 * dt);
      const dx = player.target - player.x; player.x += dx * Math.min(1, dt * 14); player.tilt = Math.max(-.35, Math.min(.35, dx / 180));
      // Falling things: caught, missed, or still falling.
      const caught: Drop[] = [];
      drops = drops.filter(d => {
        d.y += d.vy * dt; d.r += d.spin * dt; if (d.wob >= 0) { d.wob += dt * 3; d.x += Math.sin(d.wob) * 40 * dt; }
        const near = Math.abs(d.x - player.x) < player.w * 0.55 && d.y > player.y - unit * 0.75 && d.y < player.y + unit * 0.35;
        if (near) { caught.push(d); return false; }
        if (d.y > H + unit) { if (!ITEMS[d.kind].bad && d.kind !== 'star') combo = 0; return false; }
        return true;
      });
      for (const d of caught) {
        const it = ITEMS[d.kind];
        if (it.bad) {
          hearts--; combo = 0; hurt = 1; play('bonk'); shakeNow(); burst(d.x, d.y, ['#ff4d6d', '#ff8a8a', '#ffffff'], 18);
          floats.push({ x: d.x, y: d.y - 20, text: it.label, life: 1, color: '#ff8a8a' });
          if (hearts <= 0) { finish(); break; }
        } else if (d.kind === 'star') {
          if (hearts < HEARTS) { hearts++; play('heart'); floats.push({ x: d.x, y: d.y - 20, text: '+1 ❤', life: 1, color: '#ff9bb0' }); }
          else { score += 5; play('gem'); floats.push({ x: d.x, y: d.y - 20, text: '+5', life: 1, color: '#ffe58a' }); }
          burst(d.x, d.y, ['#ffe58a', '#fff', '#ffc24b'], 16);
        } else {
          combo++; bestCombo = Math.max(bestCombo, combo);
          const mult = Math.min(3, 1 + Math.floor(combo / 8)), pts = it.points * mult; score += pts;
          if (d.kind === 'coin') coins++; if (d.kind === 'gem') gems++;
          d.kind === 'gem' ? play('gem') : playCatch(combo);
          burst(d.x, d.y, d.kind === 'gem' ? ['#9be7ff', '#fff', '#c39bff'] : GOLD, d.kind === 'coin' ? 10 : 18);
          floats.push({ x: d.x, y: d.y - 20, text: `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, life: 1, color: mult > 1 ? '#ffb3f0' : '#ffe58a' });
          if (combo > 0 && combo % 8 === 0) floats.push({ x: W / 2, y: H * 0.38, text: `Combo ×${Math.min(3, 1 + combo / 8)}!`, life: 1.4, color: '#ffb3f0' });
        }
      }
      sparks = sparks.filter(p => { p.life -= dt * 1.6; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 520 * dt; return p.life > 0; });
      floats = floats.filter(f => { f.life -= dt * 1.1; f.y -= 60 * dt; return f.life > 0; });
      hurt = Math.max(0, hurt - dt * 2.2);
      const left = Math.max(0, COIN_SECONDS - elapsed), sec = Math.ceil(left);
      if (sec !== lastSecond) { lastSecond = sec; if (sec <= 5 && sec > 0) play('tick'); }
      setHud(h => (h.score === score && h.hearts === hearts && Math.ceil(h.left) === sec && h.combo === combo) ? h : { score, hearts, left, combo });
      // Drawing.
      ctx.clearRect(0, 0, W, H);
      const glow = ctx.createRadialGradient(player.x, player.y + unit * 0.45, 4, player.x, player.y + unit * 0.45, player.w);
      glow.addColorStop(0, 'rgba(255,200,80,.45)'); glow.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(player.x, player.y + unit * 0.5, player.w, unit * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      for (const d of drops) { if (ITEMS[d.kind].bad) { ctx.save(); ctx.shadowColor = 'rgba(255,60,90,.65)'; ctx.shadowBlur = 16; draw(images[ITEMS[d.kind].key], d.x, d.y, unit, d.r * 0.4); ctx.restore(); } else draw(images[ITEMS[d.kind].key], d.x, d.y, d.kind === 'coin' ? unit * 0.85 : unit, d.kind === 'coin' ? 0 : d.r * 0.3); }
      draw(images['1f45b'], player.x, player.y, player.w, player.tilt);
      for (const p of sparks) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 2.6 * p.life + 1, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.textAlign = 'center'; ctx.font = `900 ${Math.round(unit * 0.42)}px ${getComputedStyle(document.body).fontFamily}`;
      for (const f of floats) { ctx.globalAlpha = Math.min(1, f.life); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,8,40,.75)'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
      ctx.globalAlpha = 1;
      if (hurt > 0) { const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, 'rgba(255,0,60,0)'); v.addColorStop(1, `rgba(255,0,60,${0.45 * hurt})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }
      if (left <= 0) finish();
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); cv.removeEventListener('pointerdown', onPointer); cv.removeEventListener('pointermove', onPointer); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); document.removeEventListener('visibilitychange', onVis); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const timePct = Math.max(0, Math.min(100, hud.left / COIN_SECONDS * 100));
  return <div ref={root} className="mg-overlay mg-coin" role="dialog" aria-modal="true" aria-label="Tangkap Koin">
    <span className="mg-stars" aria-hidden="true"/>
    <div className="mg-hud">
      <button type="button" className="mg-close is-inline" onClick={onClose} aria-label="Tutup"><X size={20}/></button>
      <span className="mg-score"><Emoji e="🪙"/><b>{hud.score}</b></span>
      <span className="mg-hearts" aria-label={`${hud.hearts} nyawa`}>{Array.from({ length: HEARTS }, (_, i) => <i key={i} className={i < hud.hearts ? 'on' : ''}><Emoji e="❤️"/></i>)}</span>
    </div>
    <div className={`mg-timer ${hud.left <= 5 && phase === 'play' ? 'is-low' : ''}`} aria-hidden="true"><i style={{ width: `${phase === 'play' ? timePct : 100}%` }}/></div>
    {phase === 'play' && hud.combo >= 3 && <span className="mg-combo" key={hud.combo}>Beruntun {hud.combo}</span>}
    <div className="mg-field" ref={wrap}><canvas ref={canvas} className="mg-canvas"/></div>
    {phase === 'ready' && <div className="mg-card">
      <span className="mg-card-ic"><Emoji e="🪙"/></span>
      <h2>Tangkap Koin</h2>
      <p>Geser dompetmu buat nangkep koin selama {COIN_SECONDS} detik. Hindari tagihan dan jajan boros, 3 kali kena, selesai!</p>
      <ul className="mg-legend">
        <li><Emoji e="🪙"/> +1</li><li><Emoji e="💰"/> +3</li><li><Emoji e="💎"/> +5</li><li><Emoji e="⭐"/> nyawa</li>
        <li className="is-bad"><Emoji e="🧾"/><Emoji e="🛍️"/><Emoji e="🍔"/><Emoji e="☕"/> hindari</li>
      </ul>
      <small className="mg-meta">Rekor kamu: <b>{st?.best || 0}</b> · XP hari ini {COIN_XP_CAP - (st?.xpLeft ?? COIN_XP_CAP)}/{COIN_XP_CAP}</small>
      <button type="button" className="mg-btn is-gold" onClick={start}>Mulai!</button>
    </div>}
    {phase === 'count' && <div className="mg-count" key={count}>{count || 'Go!'}</div>}
    {phase === 'over' && result && <div className="mg-card is-result">
      {result.out?.record && <span className="mg-record">Rekor baru!</span>}
      <small>Skor kamu</small>
      <strong className="mg-final"><CountUp to={result.score}/></strong>
      <div className="mg-stats"><span><Emoji e="🪙"/><b>{result.coins}</b><small>koin</small></span><span><Emoji e="💎"/><b>{result.gems}</b><small>permata</small></span><span><Emoji e="🔥"/><b>{result.bestCombo}</b><small>beruntun</small></span></div>
      <p className="mg-xp">{result.out ? result.out.xp ? `+${result.out.xp} XP` : 'XP hari ini sudah penuh. Main terus buat pecahin rekor!' : ''}</p>
      <small className="mg-meta">Rekor: <b>{result.out?.best ?? Math.max(result.score, st?.best || 0)}</b> · XP hari ini {COIN_XP_CAP - (st?.xpLeft ?? COIN_XP_CAP)}/{COIN_XP_CAP}</small>
      <div className="mg-row"><button type="button" className="mg-btn" onClick={onClose}>Selesai</button><button type="button" className="mg-btn is-gold" onClick={start}>Main lagi</button></div>
    </div>}
  </div>;
}

function CountUp({ to }: { to: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now(), ms = 900; let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); setN(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [to]);
  return <>{n}</>;
}
