/**
 * 9.4 Little sounds for Arena Catat, made on the phone with Web Audio (no sound files, nothing downloaded) and a
 * short vibration. Off with "Suara & getar perayaan" in Pengaturan → Tampilan (per device).
 */
const KEY = 'dompet-ajaib:game-sound';
export function soundOn() { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } }
export function setSoundOn(on: boolean) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* only a preference */ } }

let ctx: AudioContext | null = null;
function audio() {
  if (typeof window === 'undefined') return null;
  const A = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!A) return null;
  ctx = ctx || new A();
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  return ctx;
}
function tone(c: AudioContext, freq: number, at: number, length: number, type: OscillatorType = 'triangle', volume = 0.16) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, c.currentTime + at);
  g.gain.setValueAtTime(0.0001, c.currentTime + at);
  g.gain.exponentialRampToValueAtTime(volume, c.currentTime + at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + length);
  o.connect(g).connect(c.destination); o.start(c.currentTime + at); o.stop(c.currentTime + at + length + 0.05);
}
/** A soft "whoosh" of noise (the fire catching). */
function whoosh(c: AudioContext, at: number, length = 0.5) {
  const n = Math.floor(c.sampleRate * length), buf = c.createBuffer(1, n, c.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.setValueAtTime(400, c.currentTime + at); f.frequency.exponentialRampToValueAtTime(2400, c.currentTime + at + length);
  g.gain.setValueAtTime(0.0001, c.currentTime + at); g.gain.exponentialRampToValueAtTime(0.22, c.currentTime + at + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + at + length);
  src.connect(f).connect(g).connect(c.destination); src.start(c.currentTime + at);
}
export type GameSound = 'lit' | 'mission' | 'level' | 'badge' | 'shield' | 'soft';
const VIBES: Record<GameSound, number[]> = { lit: [18, 40, 28], mission: [12], level: [20, 50, 20, 50, 40], badge: [30, 60, 30, 60, 60], shield: [25, 40, 25], soft: [10] };
export function play(kind: GameSound) {
  if (!soundOn()) return;
  try { navigator.vibrate?.(VIBES[kind]); } catch { /* no vibration */ }
  const c = audio(); if (!c) return;
  try {
    if (kind === 'lit') { whoosh(c, 0, 0.45); [523, 659, 784].forEach((f, i) => tone(c, f, 0.18 + i * 0.07, 0.35)); }
    else if (kind === 'mission') { tone(c, 880, 0, 0.18, 'sine', 0.12); tone(c, 1318, 0.08, 0.28, 'sine', 0.1); }
    else if (kind === 'level') { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(c, f, i * 0.09, 0.4, 'triangle', 0.14)); tone(c, 1568, 0.5, 0.7, 'sine', 0.08); }
    else if (kind === 'badge') { whoosh(c, 0, 0.35); [392, 523, 659, 784, 1046].forEach((f, i) => tone(c, f, 0.1 + i * 0.08, 0.5, 'square', 0.06)); [1046, 1318, 1568].forEach((f, i) => tone(c, f, 0.55 + i * 0.05, 0.8, 'sine', 0.07)); }
    else if (kind === 'shield') { tone(c, 330, 0, 0.3, 'sine', 0.14); tone(c, 494, 0.12, 0.4, 'sine', 0.12); tone(c, 659, 0.24, 0.5, 'sine', 0.1); }
    else tone(c, 660, 0, 0.15, 'sine', 0.08);
  } catch { /* audio is a nicety */ }
}
