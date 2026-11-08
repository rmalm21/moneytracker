/**
 * 9.4 Little sounds for Arena Catat, made on the phone with Web Audio (no sound files, nothing downloaded) and a
 * short vibration. Off with "Suara & getar perayaan" in Pengaturan → Tampilan (per device).
 * 9.5 Many more (taps, opening, colek, badges, the flame going out, the steps of "Cara main") and three for opening
 * Rekap: Drumroll, Kilau ajaib, Whoosh boom (pick one, or let them take turns).
 */
const KEY = 'dompet-ajaib:game-sound';
export function soundOn() { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setSoundOn(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* only a preference */ } }

let ctx: AudioContext | null = null, out: AudioNode | null = null;
function audio() {
  if (typeof window === 'undefined') return null;
  const A = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!A) return null;
  if (!ctx) {
    ctx = new A();
    // One gentle limiter for everything, so the big ones do not crackle on a phone speaker.
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6;
    comp.connect(ctx.destination); out = comp;
  }
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}
const dest = (c: AudioContext) => out || c.destination;
function tone(c: AudioContext, freq: number, at: number, length: number, type: OscillatorType = 'triangle', volume = 0.16, slideTo?: number) {
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + length);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  o.connect(g).connect(dest(c)); o.start(t); o.stop(t + length + 0.05);
}
function noise(c: AudioContext, at: number, length: number, opts: { type?: BiquadFilterType; from?: number; to?: number; volume?: number; fadeIn?: number } = {}) {
  const n = Math.max(1, Math.floor(c.sampleRate * length)), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + at;
  src.buffer = buf; f.type = opts.type || 'bandpass'; f.frequency.setValueAtTime(opts.from || 400, t);
  if (opts.to) f.frequency.exponentialRampToValueAtTime(opts.to, t + length);
  const v = opts.volume ?? 0.22, up = opts.fadeIn ?? 0.06;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + up); g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(f).connect(g).connect(dest(c)); src.start(t); src.stop(t + length + 0.05);
}
/** A soft "whoosh" of noise (the fire catching). */
const whoosh = (c: AudioContext, at: number, length = 0.5) => noise(c, at, length, { from: 400, to: 2400 });
/** A short drum hit. */
const kick = (c: AudioContext, at: number, volume = 0.5) => tone(c, 150, at, 0.32, 'sine', volume, 42);
const snare = (c: AudioContext, at: number, volume = 0.18) => { noise(c, at, 0.16, { type: 'highpass', from: 1800, volume, fadeIn: 0.004 }); tone(c, 220, at, 0.08, 'triangle', volume * 0.6); };
const sparkle = (c: AudioContext, at: number, count = 8, spread = 0.5) => { for (let i = 0; i < count; i++) tone(c, 1800 + Math.random() * 2600, at + Math.random() * spread, 0.18, 'sine', 0.035); };
const chord = (c: AudioContext, notes: number[], at: number, length: number, type: OscillatorType = 'triangle', volume = 0.08) => notes.forEach(f => tone(c, f, at, length, type, volume));

export type GameSound = 'lit' | 'mission' | 'level' | 'badge' | 'shield' | 'soft' | 'tick' | 'pop' | 'open' | 'poke' | 'achievement' | 'broken' | 'step' | 'crackle' | 'coin' | 'welcome' | 'note';
const VIBES: Record<GameSound, number[]> = {
  lit: [18, 40, 28], mission: [12], level: [20, 50, 20, 50, 40], badge: [30, 60, 30, 60, 60], shield: [25, 40, 25], soft: [10],
  tick: [6], pop: [8], open: [10], poke: [14, 30, 14], achievement: [20, 40, 20, 40, 50], broken: [60], step: [6], crackle: [10, 20, 8], coin: [8], welcome: [20, 40, 30, 40, 50], note: [12, 30, 12],
};
export function play(kind: GameSound) {
  if (!soundOn()) return;
  try { navigator.vibrate?.(VIBES[kind]); } catch { /* no vibration */ }
  const c = audio(); if (!c) return;
  try {
    switch (kind) {
      case 'lit': whoosh(c, 0, 0.45); [523, 659, 784].forEach((f, i) => tone(c, f, 0.18 + i * 0.07, 0.35)); sparkle(c, 0.4, 5, 0.3); break;
      case 'mission': tone(c, 880, 0, 0.18, 'sine', 0.12); tone(c, 1318, 0.08, 0.28, 'sine', 0.1); break;
      case 'level': [523, 659, 784, 1046, 1318].forEach((f, i) => tone(c, f, i * 0.09, 0.4, 'triangle', 0.14)); tone(c, 1568, 0.5, 0.7, 'sine', 0.08); kick(c, 0.45, 0.35); sparkle(c, 0.5, 10, 0.6); break;
      case 'badge': whoosh(c, 0, 0.35); [392, 523, 659, 784, 1046].forEach((f, i) => tone(c, f, 0.1 + i * 0.08, 0.5, 'square', 0.06)); [1046, 1318, 1568].forEach((f, i) => tone(c, f, 0.55 + i * 0.05, 0.8, 'sine', 0.07)); sparkle(c, 0.6, 10, 0.7); break;
      case 'shield': tone(c, 330, 0, 0.3, 'sine', 0.14); tone(c, 494, 0.12, 0.4, 'sine', 0.12); tone(c, 659, 0.24, 0.5, 'sine', 0.1); noise(c, 0.2, 0.5, { type: 'highpass', from: 5000, volume: 0.04 }); break;
      case 'tick': tone(c, 1500, 0, 0.05, 'square', 0.05); break;
      case 'pop': tone(c, 420, 0, 0.12, 'sine', 0.14, 900); break;
      case 'open': noise(c, 0, 0.32, { from: 300, to: 3200, volume: 0.12 }); tone(c, 660, 0.12, 0.2, 'sine', 0.07, 990); break;
      case 'poke': tone(c, 300, 0, 0.12, 'sine', 0.16, 600); tone(c, 600, 0.13, 0.16, 'sine', 0.14, 300); tone(c, 450, 0.3, 0.18, 'sine', 0.12, 700); break;
      case 'achievement': kick(c, 0, 0.3); chord(c, [523, 659, 784], 0.02, 0.5, 'triangle', 0.07); [784, 988, 1175, 1568].forEach((f, i) => tone(c, f, 0.18 + i * 0.07, 0.4, 'sine', 0.09)); chord(c, [1046, 1318, 1568], 0.5, 1, 'sine', 0.05); sparkle(c, 0.45, 14, 0.8); break;
      case 'broken': [392, 349, 311, 262].forEach((f, i) => tone(c, f, i * 0.16, 0.4, 'triangle', 0.1)); noise(c, 0.1, 0.9, { type: 'lowpass', from: 900, to: 200, volume: 0.06 }); break;
      case 'step': tone(c, 880, 0, 0.07, 'sine', 0.07); tone(c, 1320, 0.04, 0.09, 'sine', 0.05); break;
      case 'crackle': for (let i = 0; i < 7; i++) noise(c, Math.random() * 0.35, 0.03 + Math.random() * 0.03, { type: 'highpass', from: 2500 + Math.random() * 3000, volume: 0.08 + Math.random() * 0.08, fadeIn: 0.003 }); whoosh(c, 0, 0.3); break;
      case 'coin': tone(c, 988, 0, 0.08, 'square', 0.05); tone(c, 1319, 0.07, 0.25, 'square', 0.05); break;
      case 'welcome': whoosh(c, 0, 0.6); kick(c, 0.2, 0.35); [392, 523, 659, 784, 1046].forEach((f, i) => tone(c, f, 0.25 + i * 0.09, 0.5, 'triangle', 0.1)); chord(c, [523, 784, 1046, 1318], 0.75, 1.2, 'sine', 0.05); sparkle(c, 0.7, 14, 0.9); break;
      case 'note': tone(c, 784, 0, 0.14, 'sine', 0.1); tone(c, 1046, 0.09, 0.22, 'sine', 0.09); sparkle(c, 0.15, 4, 0.2); break;
      default: tone(c, 660, 0, 0.15, 'sine', 0.08);
    }
  } catch { /* audio is a nicety */ }
}

// ——— 9.5 Opening Rekap ———
export type RekapSound = 'gantian' | 'drumroll' | 'kilau' | 'boom' | 'mati';
export const REKAP_SOUNDS: { id: RekapSound; name: string; hint: string }[] = [
  { id: 'gantian', name: 'Gantian', hint: 'Tiga suara bergiliran tiap buka' },
  { id: 'drumroll', name: 'Drumroll', hint: 'Tabuhan drum lalu terompet pesta' },
  { id: 'kilau', name: 'Kilau ajaib', hint: 'Denting sihir naik berkilauan' },
  { id: 'boom', name: 'Whoosh boom', hint: 'Desir naik lalu dentum bass' },
  { id: 'mati', name: 'Tanpa suara', hint: 'Rekap dibuka tanpa suara' },
];
const RKEY = 'dompet-ajaib:rekap-sound', RTURN = 'dompet-ajaib:rekap-sound-turn';
export function rekapSound(): RekapSound { try { const v = localStorage.getItem(RKEY) as RekapSound | null; return v && REKAP_SOUNDS.some(s => s.id === v) ? v : 'gantian'; } catch { return 'gantian'; } }
export function setRekapSound(v: RekapSound) { try { localStorage.setItem(RKEY, v); } catch { /* preference */ } }
/** Plays the sound for opening Rekap (the chosen one, or the next in turn). `which` plays one to try it. */
export function playRekap(which?: Exclude<RekapSound, 'gantian' | 'mati'>) {
  let kind = which;
  if (!kind) {
    const pick = rekapSound(); if (pick === 'mati' || !soundOn()) return;
    if (pick === 'gantian') { let n = 0; try { n = Number(localStorage.getItem(RTURN) || 0); localStorage.setItem(RTURN, String((n + 1) % 3)); } catch { /* turn */ } kind = (['drumroll', 'kilau', 'boom'] as const)[n % 3]; }
    else kind = pick;
  }
  try { navigator.vibrate?.(kind === 'boom' ? [10, 40, 10, 40, 90] : kind === 'drumroll' ? [8, 20, 8, 20, 8, 20, 60] : [10, 30, 10, 30, 30]); } catch { /* no vibration */ }
  const c = audio(); if (!c) return;
  try {
    if (kind === 'drumroll') {
      // A snare roll that swells, a kick, then a bright fanfare chord.
      for (let i = 0; i < 18; i++) snare(c, i * 0.045, 0.05 + i * 0.008);
      kick(c, 0.82, 0.55); noise(c, 0.82, 1.1, { type: 'highpass', from: 6000, volume: 0.07, fadeIn: 0.005 });
      [523, 659, 784].forEach((f, i) => tone(c, f, 0.84 + i * 0.06, 0.3, 'sawtooth', 0.045));
      chord(c, [523, 659, 784, 1046], 1.04, 1.1, 'sawtooth', 0.035); chord(c, [1046, 1318], 1.04, 1.2, 'sine', 0.05);
    } else if (kind === 'kilau') {
      // A magic glissando going up, bells, and a glittering tail.
      [523, 587, 659, 784, 880, 1046, 1175, 1318, 1568, 1760, 2093].forEach((f, i) => tone(c, f, i * 0.045, 0.35, 'sine', 0.06));
      chord(c, [1046, 1318, 1568], 0.55, 1.4, 'sine', 0.05); chord(c, [523, 784], 0.55, 1.4, 'triangle', 0.04);
      sparkle(c, 0.5, 22, 1.2); noise(c, 0.45, 1.2, { type: 'highpass', from: 7000, volume: 0.03 });
    } else {
      // A rising whoosh, a deep boom, and a chord landing.
      noise(c, 0, 0.75, { from: 200, to: 6000, volume: 0.2, fadeIn: 0.6 });
      tone(c, 200, 0, 0.75, 'sawtooth', 0.03, 800);
      tone(c, 110, 0.75, 1.1, 'sine', 0.6, 32); kick(c, 0.75, 0.5); noise(c, 0.75, 0.6, { type: 'lowpass', from: 600, to: 120, volume: 0.18, fadeIn: 0.005 });
      chord(c, [392, 523, 659, 784], 0.82, 1.1, 'triangle', 0.06); sparkle(c, 0.9, 8, 0.6);
    }
  } catch { /* audio is a nicety */ }
}
