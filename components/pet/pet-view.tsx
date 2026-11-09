'use client';
/**
 * 9.8 How a pet looks: its picture for its stage, the accessory it wears (placed on its head, eyes or neck), sleep,
 * the Legenda glow, and the little effects (hearts, food flying in, its special move). Used by the dock next to the
 * chat button and by the pet's panel.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Emoji, emojiKey } from '../emoji';
import { ACCESSORIES, PETS, stageOf, levelOf, type PetKind } from '@/lib/pet';

/** Where the head is on each picture (percent): the top of the head, the eyes, the neck. */
const ANCHOR: Record<string, { top: [number, number]; eyes: [number, number]; neck: [number, number] }> = {
  '1f431': { top: [50, 14], eyes: [50, 46], neck: [50, 90] },
  '1f408': { top: [24, 22], eyes: [22, 40], neck: [32, 56] },
  '1f408-200d-2b1b': { top: [27, 18], eyes: [25, 34], neck: [33, 52] },
  '1f436': { top: [50, 12], eyes: [50, 50], neck: [50, 90] },
  '1f415': { top: [19, 20], eyes: [19, 34], neck: [27, 50] },
  '1f415-200d-1f9ba': { top: [18, 13], eyes: [17, 28], neck: [26, 44] },
  '1f989': { top: [50, 8], eyes: [50, 30], neck: [50, 52] },
  '1f423': { top: [50, 12], eyes: [50, 34], neck: [50, 54] },
  '1f425': { top: [50, 15], eyes: [50, 35], neck: [50, 56] },
  '1f414': { top: [43, 12], eyes: [38, 48], neck: [50, 86] },
  '1f413': { top: [29, 10], eyes: [27, 25], neck: [34, 42] },
  '1f985': { top: [13, 34], eyes: [11, 44], neck: [20, 56] },
  '1f98e': { top: [50, 9], eyes: [50, 17], neck: [50, 30] },
};
const ACC_SPOT: Record<string, 'top' | 'eyes' | 'neck' | 'bow'> = { pita: 'bow', syal: 'neck', kacamata: 'eyes', topi: 'top', mahkota: 'top' };
/** 9.8 The pets, their food and accessories are drawn big (up to 112px, on sharp phone screens three times that), so they
 * come from 256px pictures in /public/pet instead of the 72px emoji set. */
export const HI_RES = new Set(['1f431', '1f408', '1f408-200d-2b1b', '1f436', '1f415', '1f415-200d-1f9ba', '1f989', '1f423', '1f425', '1f414', '1f413', '1f985', '1f98e',
  '1f380', '1f9e3', '1f576', '1f3a9', '1f451', '1f41f', '1f9b4', '1f997', '1f33d', '1f356', '1f99f']);
export function PetImg({ e, className = '' }: { e: string; className?: string }) {
  const key = emojiKey(e);
  if (!HI_RES.has(key)) return <Emoji e={e} className={className}/>;
  return <img src={`/pet/${key}.webp`} alt={e} width={256} height={256} className={`emoji ${className}`} draggable={false} decoding="async"/>;
}

export function PetSprite({ kind, growth, acc, size = 48, sleeping = false, fx = '', className = '' }: { kind: PetKind; growth: number; acc: string | null; size?: number; sleeping?: boolean; fx?: string; className?: string }) {
  const stage = stageOf(levelOf(growth)), emoji = PETS[kind].emoji[stage], a = ANCHOR[emojiKey(emoji)] || ANCHOR['1f431'];
  const wear = ACCESSORIES.find(x => x.id === acc), spot = wear ? ACC_SPOT[wear.id] : null;
  const at = spot === 'bow' ? [a.top[0] + 14, a.top[1] + 4] : spot ? a[spot] : null;
  return <span className={`pet-sprite kind-${kind} stage-${stage} ${sleeping ? 'is-asleep' : ''} ${fx ? `fx-${fx}` : ''} ${className}`} style={{ '--s': `${size}px` } as React.CSSProperties}>
    {stage === 3 && <span className="pet-aura" aria-hidden="true"/>}
    <span className="pet-body"><PetImg e={emoji}/>{wear && at && <span className={`pet-acc acc-${wear.id}`} style={{ left: `${at[0]}%`, top: `${at[1]}%` }} aria-hidden="true"><PetImg e={wear.emoji}/></span>}</span>
    {sleeping && <span className="pet-zzz" aria-hidden="true"><Emoji e="💤"/></span>}
  </span>;
}

export type FxKind = 'elus' | 'eat' | 'dance' | 'kaget' | 'level' | 'egg' | 'yarn' | 'ball' | 'spin' | 'flap' | 'fly' | 'rainbow';
type Part = { id: number; e: string; cls: string; style: React.CSSProperties };
export const SPECIAL_FX: Record<PetKind, FxKind> = { kucing: 'yarn', anjing: 'ball', hantu: 'spin', ayam: 'flap', elang: 'fly', tokek: 'rainbow' };
const LENGTH: Record<FxKind, number> = { elus: 900, eat: 1200, dance: 1600, kaget: 900, level: 1600, egg: 1200, yarn: 2200, ball: 2000, spin: 1800, flap: 1600, fly: 2600, rainbow: 2200 };
const v = (o: Record<string, string | number>) => o as React.CSSProperties;

/** The effects of one pet: a class on the sprite for a moment and little pictures flying around it. */
export function usePetFx() {
  const [fx, setFx] = useState<FxKind | ''>(''), [parts, setParts] = useState<Part[]>([]);
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach(t => window.clearTimeout(t)), []);
  const later = (ms: number, f: () => void) => { timers.current.push(window.setTimeout(f, ms)); };
  const run = useCallback((kind: FxKind, food = '') => {
    const id0 = Date.now() + Math.random(), add: Part[] = [];
    const p = (e: string, cls: string, style: Record<string, string | number> = {}) => add.push({ id: id0 + add.length / 100, e, cls, style: v(style) });
    if (kind === 'elus') for (let k = 0; k < 3; k++) p('❤️', 'p-up', { '--dx': `${(k - 1) * 16}px`, '--d': `${k * 0.12}s` });
    if (kind === 'eat') { p(food || '🍖', 'p-food'); for (let k = 0; k < 3; k++) p('✨', 'p-up is-small', { '--dx': `${(k - 1) * 14}px`, '--d': `${0.5 + k * 0.1}s` }); }
    if (kind === 'dance') for (let k = 0; k < 3; k++) p('🎵', 'p-up', { '--dx': `${(k - 1) * 22}px`, '--d': `${k * 0.25}s` });
    if (kind === 'kaget') p('❗', 'p-pop');
    if (kind === 'level') for (let k = 0; k < 8; k++) p(k % 2 ? '✨' : '⭐', 'p-burst', { '--a': `${k * 45}deg`, '--d': `${k * 0.03}s` });
    if (kind === 'egg') p('🥚', 'p-pop');
    if (kind === 'yarn') { p('🧶', 'p-roll'); for (let k = 0; k < 4; k++) p('🐾', 'p-paw', { '--x': `${-28 - k * 26}px`, '--d': `${0.3 + k * 0.22}s` }); }
    if (kind === 'ball') p('🎾', 'p-throw');
    if (kind === 'spin') ['✨', '🌙', '⭐', '✨'].forEach((e, k) => p(e, 'p-orbit', { '--a': `${k * 90}deg`, '--d': `${k * 0.08}s` }));
    if (kind === 'flap') for (let k = 0; k < 6; k++) p('🪶', 'p-feather', { '--dx': `${(k - 2.5) * 18}px`, '--d': `${k * 0.12}s`, '--r': `${(k % 2 ? 1 : -1) * 120}deg` });
    if (kind === 'fly') for (let k = 0; k < 4; k++) p('💨', 'p-up is-small', { '--dx': `${(k - 1.5) * 20}px`, '--d': `${k * 0.15}s` });
    if (kind === 'rainbow') { p('🦟', 'p-bug'); p('', 'p-tongue'); p('🌈', 'p-up', { '--d': '0.9s' }); }
    setFx(''); requestAnimationFrame(() => setFx(kind));
    setParts(list => [...list, ...add]);
    const ids = new Set(add.map(x => x.id));
    later(LENGTH[kind] + 200, () => { setParts(list => list.filter(x => !ids.has(x.id))); setFx(f => (f === kind ? '' : f)); });
  }, []);
  return { fx, parts, run };
}
export function PetParts({ parts }: { parts: Part[] }) {
  return <>{parts.map(x => <span key={x.id} className={`pet-part ${x.cls}`} style={x.style} aria-hidden="true">{x.e && <PetImg e={x.e}/>}</span>)}</>;
}
