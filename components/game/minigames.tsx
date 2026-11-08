'use client';
/**
 * 9.6 Mini games in Arena Catat (Pribadi): Putar Roda Harian (once a day, after today's flame is lit) and Tangkap Koin
 * (30 seconds: catch coins in the wallet, dodge bills and impulse buys). Rules and XP: lib/game.ts (spinWheel,
 * coinResult); the keeper saves the prize. Both open full screen over the app.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pause, X } from 'lucide-react';
import { useBackHandler } from '../back-guard';
import { Emoji } from '../emoji';
import { confetti } from './confetti';
import { gameActions, openMinigame, useGame, type CoinOutcome, type SpinOutcome } from './game-store';
import { useMiniGameStatus } from './minigame-status';
import { COIN_MISSION_XP, COIN_SECONDS, COIN_XP_CAP, coinMission, coinStars, SPIN_PRIZES, type CoinStats } from '@/lib/game';
import { todayInTimeZone } from '@/lib/period';
import { useApp } from '../app-provider';
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

// ——— Tangkap Koin 2.0 ———
type Kind = 'coin' | 'bag' | 'gem' | 'star' | 'bill' | 'shop' | 'burger' | 'coffee' | 'card' | 'magnet' | 'shield' | 'slow' | 'gift';
type Power = 'magnet' | 'shield' | 'slow';
const ITEMS: Record<Kind, { key: string; points: number; bad?: boolean; power?: Power | 'gift'; label: string }> = {
  coin: { key: '1fa99', points: 1, label: '+1' }, bag: { key: '1f4b0', points: 3, label: '+3' }, gem: { key: '1f48e', points: 5, label: '+5' }, star: { key: '2b50', points: 0, label: '' },
  bill: { key: '1f9fe', points: 0, bad: true, label: 'Tagihan!' }, shop: { key: '1f6cd', points: 0, bad: true, label: 'Boros!' }, burger: { key: '1f354', points: 0, bad: true, label: 'Jajan!' },
  coffee: { key: '2615', points: 0, bad: true, label: 'Ngopi lagi?' }, card: { key: '1f4b3', points: 0, bad: true, label: 'Paylater!' },
  magnet: { key: '1f9f2', points: 0, power: 'magnet', label: 'Magnet!' }, shield: { key: '1f6e1', points: 0, power: 'shield', label: 'Perisai!' }, slow: { key: '23f1', points: 0, power: 'slow', label: 'Lambat!' },
  gift: { key: '1f381', points: 0, power: 'gift', label: 'Kejutan!' },
};
const KINDS = Object.keys(ITEMS) as Kind[];
/** Three waves: payday rains coins, the end of the month rains bills. */
const WAVES = [
  { name: 'Gajian', hint: 'Koin lagi deras!', until: 13, speed: 1, gap: 640, w: { coin: 58, bag: 12, gem: 5, star: 2, bill: 7, shop: 6, burger: 5, coffee: 3, card: 0, magnet: 1, shield: 0.6, slow: 0.4, gift: 0 } },
  { name: 'Tengah bulan', hint: 'Godaan mulai banyak', until: 27, speed: 1.3, gap: 520, w: { coin: 48, bag: 9, gem: 5, star: 3, bill: 9, shop: 8, burger: 7, coffee: 5, card: 3, magnet: 1.2, shield: 1, slow: 0.8, gift: 0.8 } },
  { name: 'Tanggal tua', hint: 'Bertahan sampai gajian!', until: COIN_SECONDS, speed: 1.65, gap: 420, w: { coin: 40, bag: 7, gem: 7, star: 4, bill: 11, shop: 9, burger: 8, coffee: 6, card: 6, magnet: 1.4, shield: 1.4, slow: 1.2, gift: 1.2 } },
] as const;
const waveAt = (t: number) => WAVES.findIndex(w => t < w.until) === -1 ? WAVES.length - 1 : WAVES.findIndex(w => t < w.until);
const pickKind = (wave: number) => { const w = WAVES[wave].w as Record<Kind, number>; let n = Math.random() * KINDS.reduce((s, k) => s + w[k], 0); for (const k of KINDS) { n -= w[k]; if (n < 0) return k; } return 'coin' as Kind; };
type Drop = { kind: Kind; x: number; y: number; vy: number; spin: number; r: number; wob: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number };
type Float = { x: number; y: number; text: string; life: number; color: string; big?: boolean };
const HEARTS = 3, FEVER_AT = 12, FEVER_MS = 6000, POWER_MS = { magnet: 6000, slow: 5000 } as const;
type Hud = { score: number; hearts: number; left: number; combo: number; wave: number; fever: number; magnet: number; slow: number; shield: boolean; paused: boolean };
const HUD0: Hud = { score: 0, hearts: HEARTS, left: COIN_SECONDS, combo: 0, wave: 0, fever: 0, magnet: 0, slow: 0, shield: false, paused: false };

function CoinGame({ onClose }: { onClose: () => void }) {
  const st = useMiniGameStatus(), { account, personalProfile } = useApp(), g0 = useGame();
  const today = g0.today || todayInTimeZone(personalProfile?.timeZone);
  const mission = useMemo(() => coinMission(account?.uid || '', today), [account?.uid, today]);
  const missionDoneToday = g0.state?.coinMissionDay === today;
  const [phase, setPhase] = useState<'ready' | 'count' | 'play' | 'over'>('ready');
  const [count, setCount] = useState(3), [hud, setHud] = useState<Hud>(HUD0), [banner, setBanner] = useState<{ n: number; title: string; hint: string } | null>(null);
  const [result, setResult] = useState<{ stats: CoinStats; out: CoinOutcome | null; missionOk: boolean } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null), wrap = useRef<HTMLDivElement>(null), root = useRef<HTMLDivElement>(null), pausedRef = useRef(false);
  const images = useMemo(() => {
    if (typeof window === 'undefined') return {} as Record<string, HTMLImageElement>;
    const out: Record<string, HTMLImageElement> = {};
    for (const key of [...KINDS.map(k => ITEMS[k].key), '1f45b']) { const img = new Image(); img.src = `/emoji/${key}.webp`; out[key] = img; }
    return out;
  }, []);
  // A shake on a bad catch (restarted on the same element: a new element would lose the game's canvas).
  const shakeNow = () => { const el = root.current; if (!el) return; el.classList.remove('is-shaking'); void el.offsetWidth; el.classList.add('is-shaking'); };
  const setPaused = (p: boolean) => { pausedRef.current = p; setHud(h => ({ ...h, paused: p })); if (p) play('pop'); };

  function start() { setResult(null); setHud(HUD0); pausedRef.current = false; setPhase('count'); setCount(3); play('tick'); }
  useEffect(() => {
    if (phase !== 'count') return;
    if (count === 0) { play('go'); setPhase('play'); return; }
    const t = window.setTimeout(() => { setCount(n => n - 1); if (count > 1) play('tick'); }, 650);
    return () => window.clearTimeout(t);
  }, [phase, count]);
  useEffect(() => { if (!banner) return; const t = window.setTimeout(() => setBanner(null), 1800); return () => window.clearTimeout(t); }, [banner]);

  useEffect(() => {
    if (phase !== 'play') return;
    const cv = canvas.current, box = wrap.current; if (!cv || !box) return;
    const ctx = cv.getContext('2d')!; const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    const size = () => { W = box.clientWidth; H = box.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    size(); window.addEventListener('resize', size);
    const unit = Math.max(36, Math.min(56, W / 8.5)), font = getComputedStyle(document.body).fontFamily;
    const player = { x: W / 2, target: W / 2, w: unit * 1.5, y: H - unit * 1.35, tilt: 0, squash: 0 };
    let drops: Drop[] = [], sparks: Spark[] = [], floats: Float[] = [];
    const s: CoinStats = { score: 0, coins: 0, gems: 0, bestCombo: 0, dodged: 0, fevers: 0, powerups: 0 };
    let hearts = HEARTS, combo = 0, hurt = 0, fever = 0, magnet = 0, slow = 0, shield = false, wave = 0;
    let elapsed = 0, nextDrop = 300, last = performance.now(), raf = 0, ended = false, lastSecond = COIN_SECONDS, hudAt = 0;
    const keys = new Set<string>();
    setBanner({ n: 1, title: WAVES[0].name, hint: WAVES[0].hint });
    const setTarget = (clientX: number) => { const r = cv.getBoundingClientRect(); player.target = Math.max(player.w / 2, Math.min(W - player.w / 2, clientX - r.left)); };
    const onPointer = (e: PointerEvent) => setTarget(e.clientX);
    const onKey = (e: KeyboardEvent) => { if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { e.preventDefault(); if (e.type === 'keydown') keys.add(e.key); else keys.delete(e.key); } if (e.type === 'keydown' && (e.key === 'Escape' || e.key === 'p')) setPaused(!pausedRef.current); };
    const onVis = () => { if (document.hidden) setPaused(true); last = performance.now(); };
    cv.addEventListener('pointerdown', onPointer); cv.addEventListener('pointermove', onPointer);
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey); document.addEventListener('visibilitychange', onVis);
    const burst = (x: number, y: number, colors: readonly string[], n = 14, size = 2.6) => { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 240; sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 140, life: 1, color: colors[i % colors.length], size }); } };
    const say = (x: number, y: number, text: string, color: string, big = false) => floats.push({ x, y, text, life: big ? 1.5 : 1, color, big });
    const finish = () => {
      if (ended) return; ended = true;
      const missionOk = s[mission.stat] >= mission.target;
      const out = gameActions().coinDone(s.score, missionOk);
      play(out?.record ? 'jackpot' : coinStars(s.score) >= 2 ? 'achievement' : 'over');
      if (out?.record || coinStars(s.score) === 3) { confetti({ count: 220, colors: GOLD }); window.setTimeout(() => confetti({ count: 120, origin: { x: .5, y: .3 } }), 450); }
      setResult({ stats: { ...s }, out, missionOk }); setPhase('over');
    };
    const power = (p: Power, x: number, y: number) => {
      s.powerups++;
      if (p === 'magnet') { magnet = POWER_MS.magnet; play('gem'); say(x, y - 24, 'Magnet!', '#9be7ff'); }
      else if (p === 'slow') { slow = POWER_MS.slow; play('shield'); say(x, y - 24, 'Lambat!', '#b9c8ff'); }
      else { shield = true; play('shield'); say(x, y - 24, 'Perisai!', '#7dffc0'); }
    };
    const draw = (img: HTMLImageElement | undefined, x: number, y: number, sz: number, rot = 0) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      if (img?.complete && img.naturalWidth) ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz); else { ctx.fillStyle = '#f4c542'; ctx.beginPath(); ctx.arc(0, 0, sz / 2.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    };
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const real = Math.min(0.05, (now - last) / 1000); last = now; if (pausedRef.current || ended) return;
      const dt = real * (slow > 0 ? 0.5 : 1);
      elapsed += real;
      const wv = waveAt(elapsed);
      if (wv !== wave) { wave = wv; setBanner({ n: wave + 1, title: WAVES[wave].name, hint: WAVES[wave].hint }); play('note'); }
      const W0 = WAVES[wave], inWave = (elapsed - (wave ? WAVES[wave - 1].until : 0)) / (W0.until - (wave ? WAVES[wave - 1].until : 0));
      // Spawning.
      nextDrop -= real * 1000;
      if (nextDrop <= 0) {
        const kind = pickKind(wave), it = ITEMS[kind];
        const speed = (H / 720) * 175 * W0.speed * (1 + inWave * 0.15) * (it.bad ? 1.1 : it.power ? 0.85 : 1) * (0.85 + Math.random() * 0.3);
        drops.push({ kind, x: unit / 2 + Math.random() * (W - unit), y: -unit, vy: speed, spin: (Math.random() - .5) * 2.4, r: 0, wob: it.bad ? Math.random() * Math.PI * 2 : -1 });
        nextDrop = W0.gap * (fever > 0 ? 0.7 : 1) * (0.7 + Math.random() * 0.6);
      }
      if (keys.has('ArrowLeft') || keys.has('a')) player.target = Math.max(player.w / 2, player.target - 560 * real);
      if (keys.has('ArrowRight') || keys.has('d')) player.target = Math.min(W - player.w / 2, player.target + 560 * real);
      const dx = player.target - player.x; player.x += dx * Math.min(1, real * 14); player.tilt = Math.max(-.35, Math.min(.35, dx / 180)); player.squash = Math.max(0, player.squash - real * 5);
      // Falling things.
      const caught: Drop[] = [];
      drops = drops.filter(d => {
        const it = ITEMS[d.kind];
        if (magnet > 0 && !it.bad && d.y > H * 0.25) { d.x += (player.x - d.x) * Math.min(1, dt * 4); }
        d.y += d.vy * dt; d.r += d.spin * dt; if (d.wob >= 0) { d.wob += dt * 3; d.x += Math.sin(d.wob) * 40 * dt; }
        const reach = player.w * (magnet > 0 && !it.bad ? 0.75 : 0.55);
        if (Math.abs(d.x - player.x) < reach && d.y > player.y - unit * 0.75 && d.y < player.y + unit * 0.35) { caught.push(d); return false; }
        if (d.y > H + unit) { if (it.bad) s.dodged++; else if (!it.power && d.kind !== 'star') combo = 0; return false; }
        return true;
      });
      for (const d of caught) {
        const it = ITEMS[d.kind]; player.squash = 1;
        if (it.bad) {
          if (shield) { shield = false; play('shield'); burst(d.x, d.y, ['#7dffc0', '#ffffff'], 18); say(d.x, d.y - 20, 'Ditahan!', '#7dffc0'); s.dodged++; continue; }
          hearts--; combo = 0; fever = 0; hurt = 1; play('bonk'); shakeNow(); burst(d.x, d.y, ['#ff4d6d', '#ff8a8a', '#ffffff'], 18); say(d.x, d.y - 20, it.label, '#ff8a8a');
          if (hearts <= 0) { finish(); break; }
        } else if (it.power) {
          const p: Power = it.power === 'gift' ? (['magnet', 'shield', 'slow'] as Power[])[Math.floor(Math.random() * 3)] : it.power;
          if (it.power === 'gift' && Math.random() < 0.35) {
            s.powerups++; play('jackpot'); say(W / 2, H * 0.4, 'Hujan koin!', '#ffe58a', true);
            for (let i = 0; i < 10; i++) drops.push({ kind: 'coin', x: unit / 2 + Math.random() * (W - unit), y: -unit - i * 40, vy: (H / 720) * 230, spin: 0, r: 0, wob: -1 });
          } else power(p, d.x, d.y);
          burst(d.x, d.y, ['#9be7ff', '#ffffff', '#c39bff'], 20);
        } else if (d.kind === 'star') {
          if (hearts < HEARTS) { hearts++; play('heart'); say(d.x, d.y - 20, '+1 ❤', '#ff9bb0'); } else { s.score += 5; play('gem'); say(d.x, d.y - 20, '+5', '#ffe58a'); }
          burst(d.x, d.y, ['#ffe58a', '#fff', '#ffc24b'], 16);
        } else {
          combo++; s.bestCombo = Math.max(s.bestCombo, combo);
          if (combo === FEVER_AT && fever <= 0) { fever = FEVER_MS; s.fevers++; play('jackpot'); say(W / 2, H * 0.36, 'FEVER ×3!', '#ffb3f0', true); }
          const mult = fever > 0 ? 3 : Math.min(2, 1 + Math.floor(combo / 6)), pts = it.points * mult * (wave === 2 && d.kind === 'gem' ? 2 : 1); s.score += pts;
          if (d.kind === 'coin') s.coins++; if (d.kind === 'gem') s.gems++;
          d.kind === 'gem' ? play('gem') : playCatch(combo);
          burst(d.x, d.y, d.kind === 'gem' ? ['#9be7ff', '#fff', '#c39bff'] : GOLD, d.kind === 'coin' ? 10 : 18);
          say(d.x, d.y - 20, `+${pts}${mult > 1 ? ` ×${mult}` : ''}`, fever > 0 ? '#ffb3f0' : mult > 1 ? '#c8b6ff' : '#ffe58a');
        }
      }
      const ms = dt * 1000; fever = Math.max(0, fever - real * 1000); magnet = Math.max(0, magnet - real * 1000); slow = Math.max(0, slow - real * 1000); void ms;
      sparks = sparks.filter(p => { p.life -= real * 1.6; p.x += p.vx * real; p.y += p.vy * real; p.vy += 520 * real; return p.life > 0; });
      floats = floats.filter(f => { f.life -= real * 1.1; f.y -= 60 * real; return f.life > 0; });
      hurt = Math.max(0, hurt - real * 2.2);
      const left = Math.max(0, COIN_SECONDS - elapsed), sec = Math.ceil(left);
      if (sec !== lastSecond) { lastSecond = sec; if (sec <= 5 && sec > 0) play('tick'); }
      if (now - hudAt > 90) { hudAt = now; setHud({ score: s.score, hearts, left, combo, wave, fever, magnet, slow, shield, paused: false }); }
      // Drawing.
      ctx.clearRect(0, 0, W, H);
      if (fever > 0) { const hue = (now / 8) % 360; ctx.fillStyle = `hsla(${hue},90%,60%,.10)`; ctx.fillRect(0, 0, W, H); }
      if (slow > 0) { ctx.fillStyle = 'rgba(120,150,255,.10)'; ctx.fillRect(0, 0, W, H); }
      const glow = ctx.createRadialGradient(player.x, player.y + unit * 0.45, 4, player.x, player.y + unit * 0.45, player.w);
      glow.addColorStop(0, fever > 0 ? 'rgba(255,120,220,.55)' : 'rgba(255,200,80,.45)'); glow.addColorStop(1, 'rgba(255,200,80,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.ellipse(player.x, player.y + unit * 0.5, player.w, unit * 0.35, 0, 0, Math.PI * 2); ctx.fill();
      if (magnet > 0) { ctx.strokeStyle = `rgba(155,231,255,${0.25 + 0.15 * Math.sin(now / 90)})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(player.x, player.y, player.w * 0.95, Math.PI, 0); ctx.stroke(); }
      for (const d of drops) {
        const it = ITEMS[d.kind], sz = d.kind === 'coin' ? unit * 0.85 : it.power ? unit * 0.95 : unit;
        if (it.bad || it.power) { ctx.save(); ctx.shadowColor = it.bad ? 'rgba(255,60,90,.7)' : 'rgba(120,220,255,.85)'; ctx.shadowBlur = 18; draw(images[it.key], d.x, d.y, sz, d.r * 0.4); ctx.restore(); }
        else draw(images[it.key], d.x, d.y, sz, d.kind === 'coin' ? 0 : d.r * 0.3);
      }
      ctx.save(); ctx.translate(player.x, player.y); ctx.scale(1 + player.squash * 0.12, 1 - player.squash * 0.1); draw(images['1f45b'], 0, 0, player.w, player.tilt); ctx.restore();
      if (shield) { ctx.strokeStyle = 'rgba(125,255,192,.8)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(player.x, player.y, player.w * 0.62, unit * 0.62, 0, 0, Math.PI * 2); ctx.stroke(); }
      for (const p of sparks) { ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * p.life + 1, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1; ctx.textAlign = 'center';
      for (const f of floats) { ctx.font = `900 ${Math.round(unit * (f.big ? 0.7 : 0.42))}px ${font}`; ctx.globalAlpha = Math.min(1, f.life); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,8,40,.75)'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y); }
      ctx.globalAlpha = 1;
      if (hurt > 0) { const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, 'rgba(255,0,60,0)'); v.addColorStop(1, `rgba(255,0,60,${0.45 * hurt})`); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H); }
      if (left <= 0) finish();
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size); cv.removeEventListener('pointerdown', onPointer); cv.removeEventListener('pointermove', onPointer); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); document.removeEventListener('visibilitychange', onVis); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const timePct = Math.max(0, Math.min(100, hud.left / COIN_SECONDS * 100)), xpToday = COIN_XP_CAP - (st?.xpLeft ?? COIN_XP_CAP);
  const stars = result ? coinStars(result.stats.score) : 0, top = result?.out?.top || g0.state?.coinTop || [];
  return <div ref={root} className={`mg-overlay mg-coin wave-${hud.wave} ${hud.fever > 0 && phase === 'play' ? 'is-fever' : ''}`} role="dialog" aria-modal="true" aria-label="Tangkap Koin">
    <span className="mg-stars" aria-hidden="true"/><span className="mg-sky" aria-hidden="true"/>
    <div className="mg-hud">
      <button type="button" className="mg-close is-inline" onClick={() => { if (phase === 'play' && !hud.paused) setPaused(true); else onClose(); }} aria-label={phase === 'play' ? 'Jeda' : 'Tutup'}>{phase === 'play' ? <Pause size={18}/> : <X size={20}/>}</button>
      <span className="mg-score"><Emoji e="🪙"/><b>{hud.score}</b></span>
      {phase === 'play' && <span className="mg-wave">{WAVES[hud.wave].name}</span>}
      <span className="mg-hearts" aria-label={`${hud.hearts} nyawa`}>{Array.from({ length: HEARTS }, (_, i) => <i key={i} className={i < hud.hearts ? 'on' : ''}><Emoji e="❤️"/></i>)}</span>
    </div>
    <div className={`mg-timer ${hud.left <= 5 && phase === 'play' ? 'is-low' : ''}`} aria-hidden="true">{[13, 27].map(t => <span key={t} className="mg-tick" style={{ left: `${t / COIN_SECONDS * 100}%` }}/>)}<i style={{ width: `${phase === 'play' ? timePct : 100}%` }}/></div>
    {phase === 'play' && <div className="mg-powers">
      {hud.fever > 0 && <span className="mg-pw is-fever"><b>FEVER ×3</b><i style={{ width: `${hud.fever / FEVER_MS * 100}%` }}/></span>}
      {hud.magnet > 0 && <span className="mg-pw"><Emoji e="🧲"/><i style={{ width: `${hud.magnet / POWER_MS.magnet * 100}%` }}/></span>}
      {hud.slow > 0 && <span className="mg-pw"><Emoji e="⏱️"/><i style={{ width: `${hud.slow / POWER_MS.slow * 100}%` }}/></span>}
      {hud.shield && <span className="mg-pw"><Emoji e="🛡️"/></span>}
      {hud.combo >= 3 && hud.fever <= 0 && <span className="mg-combo-chip" key={hud.combo}>Beruntun {hud.combo}{hud.combo < FEVER_AT ? <small> · Fever di {FEVER_AT}</small> : null}</span>}
    </div>}
    {banner && phase === 'play' && <div className="mg-banner" key={banner.n}><small>Gelombang {banner.n}/3</small><strong>{banner.title}</strong><span>{banner.hint}</span></div>}
    <div className="mg-field" ref={wrap}><canvas ref={canvas} className="mg-canvas"/></div>
    {phase === 'play' && hud.paused && <div className="mg-card is-pause">
      <h2>Jeda</h2><p>Skor {hud.score} · {WAVES[hud.wave].name}</p>
      <div className="mg-row"><button type="button" className="mg-btn" onClick={onClose}>Keluar</button><button type="button" className="mg-btn is-gold" onClick={() => setPaused(false)}>Lanjut</button></div>
    </div>}
    {phase === 'ready' && <div className="mg-card is-intro">
      <span className="mg-card-ic"><Emoji e="🪙"/></span>
      <h2>Tangkap Koin</h2>
      <p>Geser dompetmu selama {COIN_SECONDS} detik, dari <b>gajian</b> sampai <b>tanggal tua</b>. Tangkap yang bikin kaya, hindari yang bikin boncos!</p>
      <div className="mg-legend-grid">
        <span><Emoji e="🪙"/>+1</span><span><Emoji e="💰"/>+3</span><span><Emoji e="💎"/>+5</span><span><Emoji e="⭐"/>nyawa</span>
        <span className="is-pw"><Emoji e="🧲"/>magnet</span><span className="is-pw"><Emoji e="🛡️"/>perisai</span><span className="is-pw"><Emoji e="⏱️"/>lambat</span><span className="is-pw"><Emoji e="🎁"/>kejutan</span>
        <span className="is-bad"><Emoji e="🧾"/><Emoji e="🛍️"/><Emoji e="🍔"/><Emoji e="☕"/><Emoji e="💳"/> hindari</span>
      </div>
      <div className={`mg-mission ${missionDoneToday ? 'is-done' : ''}`}><small>Misi hari ini {missionDoneToday ? '· selesai ✓' : `· +${COIN_MISSION_XP} XP`}</small><b>{mission.text}</b></div>
      <small className="mg-meta">Beruntun {FEVER_AT}× = Fever ×3 · Rekor <b>{st?.best || 0}</b> · XP hari ini {xpToday}/{COIN_XP_CAP}</small>
      <button type="button" className="mg-btn is-gold" onClick={start}>Mulai!</button>
    </div>}
    {phase === 'count' && <div className="mg-count" key={count}>{count || 'Go!'}</div>}
    {phase === 'over' && result && <div className="mg-card is-result">
      {result.out?.record && <span className="mg-record">Rekor baru!</span>}
      <span className="mg-stars-row" aria-label={`${stars} bintang`}>{[1, 2, 3].map(n => <i key={n} className={n <= stars ? 'on' : ''} style={{ '--i': n } as React.CSSProperties}><Emoji e="⭐"/></i>)}</span>
      <strong className="mg-final"><CountUp to={result.stats.score}/></strong>
      <div className="mg-stats">
        <span><Emoji e="🪙"/><b>{result.stats.coins}</b><small>koin</small></span><span><Emoji e="💎"/><b>{result.stats.gems}</b><small>permata</small></span>
        <span><Emoji e="🔥"/><b>{result.stats.bestCombo}</b><small>beruntun</small></span><span><Emoji e="🛡️"/><b>{result.stats.dodged}</b><small>dihindari</small></span>
      </div>
      <div className={`mg-mission ${result.missionOk ? 'is-done' : ''}`}><small>Misi hari ini</small><b>{result.missionOk ? '✓ ' : ''}{mission.text}</b><small>{result.missionOk ? (result.out?.missionXp ? `+${result.out.missionXp} XP bonus` : missionDoneToday ? 'Sudah dapat bonus hari ini' : 'XP hari ini sudah penuh') : `${Math.min(result.stats[mission.stat], mission.target)}/${mission.target}`}</small></div>
      <p className="mg-xp">{result.out ? result.out.xp ? `+${result.out.xp} XP` : 'XP hari ini sudah penuh. Main terus buat pecahin rekor!' : ''}</p>
      {top.length > 0 && <ol className="mg-top" aria-label="Skor terbaikmu">{top.map((n, i) => <li key={i} className={n === result.stats.score ? 'is-now' : ''}><small>#{i + 1}</small><b>{n}</b></li>)}</ol>}
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
