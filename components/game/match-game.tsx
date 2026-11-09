'use client';
/**
 * 9.7 Cocok Cuan on screen: swipe (or tap two) neighbouring pieces to line up three of a kind. The rules are in
 * lib/match3.ts; this animates them: the swap, the pop, the fall, the chains, tagihan paid off, the Palu and Acak
 * helpers, a pause menu, the end bonus, and a hint after a quiet moment.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, X } from 'lucide-react';
import { Emoji } from '../emoji';
import { confetti } from './confetti';
import { gameActions, useGame, type ArcadeOutcome } from './game-store';
import { useMiniGameStatus } from './minigame-status';
import { useApp } from '../app-provider';
import { adjacent, BILL, BILL_POINTS, BOMB, clearOnce, COLS, countBills, endBonus, fall, findMove, hammer, hasMove, isBill, MATCH_BILLS, MATCH_MOVES, MATCH_STAR, matchStars, newBoard, PIECES, ROWS, shuffle, swapCells, validSwap, type Board, type Cell, type Ctx, type Step, type Tile } from '@/lib/match3';
import { matchMission } from '@/lib/game';
import { play, playCatch } from '@/lib/game-sound';
import { todayInTimeZone } from '@/lib/period';

const sleep = (ms: number) => new Promise(r => window.setTimeout(r, ms));
type Pop = { id: number; x: number; y: number; text: string; big?: boolean; bill?: boolean };
const ICONS = ['🪙', '💵', '💎', '💰', '💳', '🐷'];
const tileEmoji = (t: Tile) => t.kind === BOMB ? '💥' : t.kind === BILL ? '🧾' : ICONS[t.kind];
const tileName = (t: Tile) => t.kind === BOMB ? 'Bom Cuan' : t.kind === BILL ? 'Tagihan' : PIECES[t.kind].name;
const BILL_RATE = 0.025;
type Stats = { bestChain: number; specials: number; bombs: number; collect: number; bills: number };
const STATS0: Stats = { bestChain: 0, specials: 0, bombs: 0, collect: 0, bills: 0 };

export function MatchGame({ onClose }: { onClose: () => void }) {
  const st = useMiniGameStatus(), { account, personalProfile } = useApp(), g = useGame();
  const today = g.today || todayInTimeZone(personalProfile?.timeZone);
  const mission = useMemo(() => matchMission(account?.uid || '', today), [account?.uid, today]);
  const ctx = useRef<Ctx>({ rand: Math.random, id: 1, billRate: BILL_RATE });
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [board, setBoard] = useState<Board>(() => newBoard(ctx.current, ROWS, COLS, MATCH_BILLS));
  const [popping, setPopping] = useState<Set<number>>(new Set()), [fresh, setFresh] = useState<Set<number>>(new Set());
  const [sel, setSel] = useState<Cell | null>(null), [hint, setHint] = useState<[Cell, Cell] | null>(null), [bad, setBad] = useState<number | null>(null);
  const [score, setScore] = useState(0), [moves, setMoves] = useState(MATCH_MOVES), [pops, setPops] = useState<Pop[]>([]), [banner, setBanner] = useState('');
  const [tools, setTools] = useState({ palu: 1, acak: 1 }), [armed, setArmed] = useState(false), [paused, setPaused] = useState(false);
  const [prog, setProg] = useState<Stats>(STATS0);
  const [result, setResult] = useState<{ score: number; out: ArcadeOutcome | null; missionOk: boolean; wasDone: boolean; stats: Stats; bonus: number } | null>(null);
  const busy = useRef(false), stats = useRef<Stats>({ ...STATS0 }), scoreRef = useRef(0), movesRef = useRef(MATCH_MOVES), wrap = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(48);
  useEffect(() => {
    const fit = () => { const w = Math.min(window.innerWidth - 24, 430), h = (window.innerHeight - 300) / ROWS * COLS; setCell(Math.max(34, Math.floor(Math.min(w, h) / COLS))); };
    fit(); window.addEventListener('resize', fit); return () => window.removeEventListener('resize', fit);
  }, []);
  // A hint after five quiet seconds.
  useEffect(() => {
    if (phase !== 'play' || busy.current || paused) return;
    setHint(null); const t = window.setTimeout(() => setHint(findMove(board)), 5000);
    return () => window.clearTimeout(t);
  }, [board, phase, paused]);

  function start() {
    ctx.current = { rand: Math.random, id: 1, billRate: BILL_RATE };
    setBoard(newBoard(ctx.current, ROWS, COLS, MATCH_BILLS)); setScore(0); scoreRef.current = 0; setMoves(MATCH_MOVES); movesRef.current = MATCH_MOVES;
    setResult(null); setProg({ ...STATS0 }); setTools({ palu: 1, acak: 1 }); setArmed(false); setPaused(false); setSel(null);
    stats.current = { ...STATS0 }; busy.current = false; setPhase('play'); play('go');
  }
  const pop = (x: number, y: number, text: string, big = false, bill = false) => { const id = Math.random(); setPops(p => [...p, { id, x, y, text, big, bill }]); window.setTimeout(() => setPops(p => p.filter(q => q.id !== id)), big ? 1300 : 900); };
  const shake = async (t: Tile | null) => { setBad(t?.id ?? null); play('bonk'); await sleep(260); setBad(null); };

  /** Plays out a clearing and everything it sets off: pop, fall, chain after chain. */
  async function cascade(first: Step | null, start: Board, chain0: number, bonus = false): Promise<{ board: Board; chains: number }> {
    let b = start, chain = chain0, chains = 0;
    for (let step = first; step; step = clearOnce(b, ctx.current, ++chain)) {
      chains++;
      const ids = new Set(step.cleared.map(([r, c]) => b[r][c]?.id).filter((x): x is number => x !== undefined));
      setPopping(ids);
      if (step.fired.includes('bomb')) { play('jackpot'); confetti({ count: 120, colors: ['#ffe58a', '#7dffc0', '#9be7ff', '#ffffff'] }); }
      else if (step.fired.length) play('badge'); else playCatch(chain + 2);
      const cx = step.cleared.reduce((n, [, c]) => n + c, 0) / step.cleared.length, cy = step.cleared.reduce((n, [r]) => n + r, 0) / step.cleared.length;
      pop((cx + .5) * cell, (cy + .5) * cell, `+${step.points}`);
      const billAt = step.cleared.find(([r, c]) => isBill(b[r][c]));
      if (billAt) { pop((billAt[1] + .5) * cell, Math.max(.3, billAt[0] - .25) * cell, step.bills > 1 ? `${step.bills} tagihan lunas!` : 'Lunas!', false, true); play('coin'); }
      if (!bonus && chain >= 2) pop(COLS * cell / 2, ROWS * cell * .38, chain >= 4 ? `Kombo ×${chain}! Cuan!` : `Kombo ×${chain}`, true);
      if (step.created.some(c => c.tile.special === 'bomb')) { stats.current.bombs++; pop(COLS * cell / 2, ROWS * cell * .5, 'Bom Cuan!', true); }
      stats.current.specials += step.created.length; stats.current.bills += step.bills;
      if (mission.stat === 'collect' && mission.kind !== undefined) stats.current.collect += step.byKind[mission.kind] || 0;
      scoreRef.current += step.points; setScore(scoreRef.current);
      await sleep(210);
      setPopping(new Set()); setBoard(step.board); await sleep(90);
      const before = new Set(step.board.flat().filter(Boolean).map(t => t!.id));
      b = fall(step.board, ctx.current);
      setFresh(new Set(b.flat().filter(t => t && !before.has(t.id)).map(t => t!.id))); setBoard(b);
      await sleep(260);
      if (chain > 30) break;
    }
    setFresh(new Set()); setProg({ ...stats.current });
    return { board: b, chains };
  }
  /** No move left: mix the pieces. */
  async function settle(b: Board) {
    if (hasMove(b)) return b;
    setBanner('Nggak ada langkah, diacak!'); play('pop'); await sleep(600); const next = shuffle(b, ctx.current); setBoard(next); await sleep(300); setBanner('');
    return next;
  }

  async function trySwap(a: Cell, z: Cell) {
    if (busy.current || phase !== 'play' || paused || !adjacent(a, z)) return;
    const ta = board[a[0]][a[1]], tz = board[z[0]][z[1]];
    if (isBill(ta) || isBill(tz)) { setSel(null); await shake(isBill(ta) ? ta : tz); return; }
    busy.current = true; setSel(null); setHint(null);
    const swapped = swapCells(board, a, z); setBoard(swapped); play('tick'); await sleep(170);
    if (!validSwap(board, a, z)) { setBoard(board); await shake(ta); busy.current = false; return; }
    const r = await cascade(clearOnce(swapped, ctx.current, 1, [a, z]), swapped, 1);
    stats.current.bestChain = Math.max(stats.current.bestChain, r.chains); setProg({ ...stats.current });
    const b = await settle(r.board);
    movesRef.current -= 1; setMoves(movesRef.current);
    if (movesRef.current <= 0) await finishUp(b); else busy.current = false;
  }
  async function useHammer(at: Cell) {
    if (busy.current || !tools.palu || phase !== 'play') return;
    busy.current = true; setArmed(false); setTools(t => ({ ...t, palu: 0 })); setSel(null); setHint(null); play('bonk');
    const r = await cascade(hammer(board, at), board, 1);
    await settle(r.board); busy.current = false;
  }
  async function useShuffle() {
    if (busy.current || !tools.acak || phase !== 'play' || paused) return;
    busy.current = true; setArmed(false); setTools(t => ({ ...t, acak: 0 })); setSel(null); setHint(null);
    setBanner('Diacak!'); play('pop'); await sleep(450);
    setBoard(shuffle(board, ctx.current)); await sleep(300); setBanner(''); busy.current = false;
  }
  /** The moves are done: the specials left go off as a bonus, then the result. */
  async function finishUp(b: Board) {
    const before = scoreRef.current, eb = endBonus(b);
    if (eb) { setBanner('Bonus akhir! Spesial sisa meledak'); play('jackpot'); await sleep(800); setBanner(''); await cascade(eb, b, 2, true); }
    finish(scoreRef.current, scoreRef.current - before);
  }
  function finish(total: number, bonus: number) {
    const s = stats.current;
    const missionOk = mission.stat === 'collect' ? s.collect >= mission.target : mission.stat === 'bomb' ? s.bombs >= mission.target : mission.stat === 'bills' ? s.bills >= mission.target : s.bestChain >= mission.target;
    const wasDone = Boolean(st?.match.missionDone);
    const out = gameActions().arcadeDone('match', total, missionOk);
    const stars = matchStars(total);
    play(out?.record ? 'jackpot' : stars >= 2 ? 'achievement' : 'over');
    if (out?.record || stars === 3) confetti({ count: 220 });
    setResult({ score: total, out, missionOk, wasDone, stats: { ...s }, bonus }); setPhase('over'); busy.current = false;
  }

  // Swipe a piece, or tap one then a neighbour (or tap one with the Palu ready).
  const drag = useRef<{ cell: Cell; x: number; y: number; done: boolean } | null>(null);
  const down = (r: number, c: number) => (e: React.PointerEvent) => { drag.current = { cell: [r, c], x: e.clientX, y: e.clientY, done: false }; };
  const move = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || d.done || armed) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y; if (Math.max(Math.abs(dx), Math.abs(dy)) < cell * .35) return;
    d.done = true; const [r, c] = d.cell, to: Cell = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
    if (to[0] >= 0 && to[0] < ROWS && to[1] >= 0 && to[1] < COLS) void trySwap(d.cell, to);
  };
  const up = () => {
    const d = drag.current; drag.current = null; if (!d || d.done || busy.current || paused) return;
    if (armed) { void useHammer(d.cell); return; }
    const t = board[d.cell[0]][d.cell[1]];
    if (isBill(t)) { setSel(null); void shake(t); return; }
    if (sel && adjacent(sel, d.cell)) void trySwap(sel, d.cell); else { setSel(sel && sel[0] === d.cell[0] && sel[1] === d.cell[1] ? null : d.cell); play('click'); }
  };

  const tiles = board.flatMap((row, r) => row.map((t, c) => t && { t, r, c })).filter(Boolean) as { t: Tile; r: number; c: number }[];
  const pct = Math.min(100, score / MATCH_STAR[2] * 100);
  const progress = mission.stat === 'collect' ? prog.collect : mission.stat === 'bomb' ? prog.bombs : mission.stat === 'bills' ? prog.bills : prog.bestChain;
  const isHint = (r: number, c: number) => hint?.some(([y, x]) => y === r && x === c);
  const missionNote = (r: NonNullable<typeof result>) => !r.missionOk ? `${Math.min(progress, mission.target)}/${mission.target}`
    : r.out?.missionXp ? `+${r.out.missionXp} XP bonus misi` : r.wasDone ? 'Bonus misi hari ini sudah diambil' : 'XP hari ini sudah penuh, bonusnya nggak nambah lagi';
  return <div className="mg-overlay mg-match" role="dialog" aria-modal="true" aria-label="Cocok Cuan">
    <div className="mg-hud">
      <button type="button" className="mg-close is-inline" onClick={() => { if (phase === 'play' && !paused) { setPaused(true); setArmed(false); play('pop'); } else onClose(); }} aria-label={phase === 'play' ? 'Jeda' : 'Tutup'}>{phase === 'play' ? <Pause size={18}/> : <X size={20}/>}</button>
      <span className="mg-score"><Emoji e="💵"/><b>{score.toLocaleString('id-ID')}</b></span>
      <span className="m3-moves" aria-label={`${moves} langkah lagi`}><b>{moves}</b><small>langkah</small></span>
    </div>
    <div className="m3-starbar" aria-hidden="true"><i style={{ width: `${pct}%` }}/>{MATCH_STAR.map(s => <span key={s} className={score >= s ? 'on' : ''} style={{ left: `${s / MATCH_STAR[2] * 100}%` }}><Emoji e="⭐"/></span>)}</div>
    {phase === 'play' && <div className={`m3-mission ${progress >= mission.target ? 'is-done' : ''}`}>{mission.kind !== undefined ? <Emoji e={ICONS[mission.kind]}/> : <Emoji e={mission.stat === 'bills' ? '🧾' : mission.stat === 'bomb' ? '💥' : '🔥'}/>}<span>{mission.text}</span><b>{Math.min(progress, mission.target)}/{mission.target}</b></div>}
    <div className={`m3-board-wrap ${phase !== 'play' || paused ? 'is-idle' : ''} ${armed ? 'is-armed' : ''}`} ref={wrap}>
      <div className="m3-board" style={{ width: cell * COLS, height: cell * ROWS, '--cell': `${cell}px` } as React.CSSProperties} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { drag.current = null; }}>
        {Array.from({ length: ROWS * COLS }, (_, k) => <span key={k} className="m3-slot" style={{ left: (k % COLS) * cell, top: Math.floor(k / COLS) * cell }}/>)}
        {tiles.map(({ t, r, c }) => <button type="button" key={t.id} className={`m3-tile ${t.special ? `sp-${t.special}` : ''} ${isBill(t) ? 'is-bill' : ''} ${popping.has(t.id) ? 'is-pop' : ''} ${fresh.has(t.id) ? 'is-new' : ''} ${sel && sel[0] === r && sel[1] === c ? 'is-sel' : ''} ${isHint(r, c) ? 'is-hint' : ''} ${bad === t.id ? 'is-bad' : ''}`}
          style={{ transform: `translate(${c * cell}px, ${r * cell}px)` }} onPointerDown={down(r, c)} aria-label={tileName(t)}>
          <Emoji e={tileEmoji(t)}/>
          {(t.special === 'h' || t.special === 'v') && <i className="m3-bolt" aria-hidden="true"><Emoji e="⚡"/></i>}
        </button>)}
        {pops.map(p => <span key={p.id} className={`m3-pop ${p.big ? 'is-big' : ''} ${p.bill ? 'is-bill' : ''}`} style={{ left: p.x, top: p.y }}>{p.text}</span>)}
        {banner && <span className="m3-banner">{banner}</span>}
      </div>
    </div>
    {phase === 'play' && <div className="m3-tools">
      <button type="button" className={`m3-tool ${armed ? 'is-armed' : ''}`} disabled={!tools.palu} onClick={() => { if (!tools.palu || busy.current) return; setArmed(a => !a); setSel(null); play('click'); }} aria-pressed={armed}><Emoji e="🔨"/><span>Palu</span><b>{tools.palu}</b></button>
      <button type="button" className="m3-tool" disabled={!tools.acak} onClick={() => void useShuffle()}><Emoji e="🔀"/><span>Acak</span><b>{tools.acak}</b></button>
      <span className="m3-bills" title="Tagihan di papan"><Emoji e="🧾"/><b>{countBills(board)}</b><small>tagihan</small></span>
    </div>}
    {phase === 'play' && <small className="m3-help">{armed ? 'Ketuk satu koin atau tagihan buat dipalu. Ketuk Palu lagi buat batal.' : `Geser satu koin ke sebelahnya. Tagihan lunas kalau ada yang pecah di sebelahnya (+${BILL_POINTS}).`}</small>}
    {phase === 'play' && paused && <div className="mg-card is-pause">
      <span className="mg-card-ic"><Emoji e="⏸️"/></span>
      <h2>Jeda dulu</h2>
      <p>Skor <b>{score.toLocaleString('id-ID')}</b> · sisa <b>{moves}</b> langkah</p>
      <div className="mg-row"><button type="button" className="mg-btn" onClick={onClose}>Keluar</button><button type="button" className="mg-btn" onClick={start}>Ulang</button><button type="button" className="mg-btn is-gold" onClick={() => { setPaused(false); play('click'); }}>Lanjut</button></div>
    </div>}
    {phase === 'ready' && <div className="mg-card is-intro">
      <span className="mg-card-ic"><Emoji e="💵"/></span>
      <h2>Cocok Cuan</h2>
      <p>Geser koin, uang, dan permata biar <b>3 sejajar</b>. Kamu punya <b>{MATCH_MOVES} langkah</b>, kumpulkan skor sebanyak-banyaknya dan lunasi tagihan!</p>
      <div className="mg-legend-grid m3-legend">
        <span><b><Emoji e="⚡"/> 4 sejajar</b><small>Petir: hapus 1 baris</small></span><span><b><Emoji e="🔥"/> Bentuk L/T</b><small>Ledakan 3×3</small></span>
        <span><b><Emoji e="💥"/> 5 sejajar</b><small>Bom Cuan: sapu 1 jenis</small></span><span><b><Emoji e="🧾"/> Tagihan</b><small>Lunas kalau ada yang pecah di sebelahnya</small></span>
        <span><b><Emoji e="🔨"/> Palu & Acak</b><small>Alat bantu, 1× tiap main</small></span><span><b><Emoji e="🎆"/> Bonus akhir</b><small>Spesial sisa meledak</small></span>
      </div>
      <div className={`mg-mission ${st?.match.missionDone ? 'is-done' : ''}`}><small>Misi hari ini {st?.match.missionDone ? '· selesai ✓' : '· +5 XP'}</small><b>{mission.text}</b></div>
      <small className="mg-meta">Bintang di {MATCH_STAR.map(s => s.toLocaleString('id-ID')).join(' · ')} · Rekor <b>{(st?.match.best || 0).toLocaleString('id-ID')}</b> · XP hari ini {(st ? st.match.cap - st.match.xpLeft : 0)}/{st?.match.cap ?? 25}</small>
      <button type="button" className="mg-btn is-gold" onClick={start}>Mulai!</button>
    </div>}
    {phase === 'over' && result && <div className="mg-card is-result">
      {result.out?.record && <span className="mg-record">Rekor baru!</span>}
      <span className="mg-stars-row" aria-label={`${matchStars(result.score)} bintang`}>{[1, 2, 3].map(n => <i key={n} className={n <= matchStars(result.score) ? 'on' : ''} style={{ '--i': n } as React.CSSProperties}><Emoji e="⭐"/></i>)}</span>
      <strong className="mg-final">{result.score.toLocaleString('id-ID')}</strong>
      {result.bonus > 0 && <small className="m3-bonus">termasuk bonus akhir +{result.bonus.toLocaleString('id-ID')}</small>}
      <div className="mg-stats"><span><Emoji e="🔥"/><b>{result.stats.bestChain}</b><small>kombo terpanjang</small></span><span><Emoji e="⚡"/><b>{result.stats.specials}</b><small>spesial dibuat</small></span><span><Emoji e="🧾"/><b>{result.stats.bills}</b><small>tagihan lunas</small></span><span><Emoji e="💥"/><b>{result.stats.bombs}</b><small>Bom Cuan</small></span></div>
      <div className={`mg-mission ${result.missionOk ? 'is-done' : ''}`}><small>Misi hari ini</small><b>{result.missionOk ? '✓ ' : ''}{mission.text}</b><small>{missionNote(result)}</small></div>
      <p className="mg-xp">{result.out ? result.out.xp ? `+${result.out.xp} XP` : 'XP hari ini sudah penuh. Main terus buat pecahin rekor!' : ''}</p>
      {(result.out?.top || []).length > 0 && <ol className="mg-top" aria-label="Skor terbaikmu">{result.out!.top.map((n, k) => <li key={k} className={n === result.score ? 'is-now' : ''}><small>#{k + 1}</small><b>{n.toLocaleString('id-ID')}</b></li>)}</ol>}
      <div className="mg-row"><button type="button" className="mg-btn" onClick={onClose}>Selesai</button><button type="button" className="mg-btn is-gold" onClick={start}>Main lagi</button></div>
    </div>}
  </div>;
}
