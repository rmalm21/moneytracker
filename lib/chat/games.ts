/**
 * 8.1 — small games in the chat, in every style: suit (batu–gunting–kertas), a coin, a die, a random number,
 * "pilihin dong, A atau B?", and tebak angka (1–10, three tries). A game that waits for the next move keeps its state
 * in the chat memory for one reply. The draws are not secret randomness: a hash of the message and the turn, so a
 * conversation can be replayed.
 */
import type { Voice } from './voice.ts';
import { pickVar } from './persona.ts';
import { vo, type ByVoice } from './fun.ts';

export type GameState = { kind: 'suit' } | { kind: 'angka'; secret: number; tries: number };
export type GameReply = { text: string; chips?: string[]; game?: GameState };
/** A number from 0 to n−1, from the message and the turn. */
const draw = (seed: string, n: number) => { let h = 2166136261; for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) % n; };
const pv = (v: Voice, m: ByVoice<string[]>, turn: number) => pickVar(vo(v, m), turn);

const SUIT = /\b(?:suit|suwit|batu\s+gunting\s+kertas|gunting\s+batu\s+kertas|kertas\s+gunting\s+batu|rock\s+paper\s+scissors|janken)\b/;
const HAND = /\b(batu|gunting|kertas|rock|paper|scissors)\b/;
const HANDS = ['batu', 'gunting', 'kertas'] as const;
const EN: Record<string, (typeof HANDS)[number]> = { rock: 'batu', scissors: 'gunting', paper: 'kertas' };
const COIN = /\b(?:lempar|lemparin|tos|flip)\s+(?:koin|coin|uang\s+logam)\b|\bangka\s+(?:atau|apa)\s+gambar\b|\bcoin\s*flip\b/;
const DICE = /\b(?:lempar|kocok|lemparin|roll)\s+(?:dadu|dice)\b|\bdadu\s+(?:dong|yuk)\b/;
const NUMBER_GAME = /\b(?:main\s+)?tebak(?:-|\s)?(?:tebakan\s+)?angka\b/;
const RANDOM = /\b(?:angka|nomor|number)\s+(?:acak|random)\b|\brandom\s+(?:angka|nomor|number)\b|\bacak\s+angka\b/;
const CHOOSE = /\b(?:pilih(?:in|kan)?|bantu\s+pilih|mending|enakan|bagusan|lebih\s+(?:baik|enak|bagus)|which)\b/;

/** A game asked for, or a move in the one going on. */
export function readGame(t: string, raw: string, v: Voice, turn: number, state?: GameState): GameReply | null {
  const seed = `${raw}|${turn}`;
  // A move in the game going on.
  if (state?.kind === 'suit') { const hand = t.match(HAND); if (hand) return playSuit(EN[hand[1]] || hand[1] as (typeof HANDS)[number], v, turn, seed); }
  if (state?.kind === 'angka') { const n = t.match(/^(?:angka\s+|nomor\s+|kalau\s+|mungkin\s+)?(\d{1,2})(?:\s*(?:\?|deh|kah|ya))?$/); if (n) return guessNumber(+n[1], state, v, turn); }
  if (SUIT.test(t)) {
    const hand = t.match(HAND);
    if (hand && !/^\s*(?:suit|suwit)\s*(?:yuk|ayo|dong|kuy)?\s*$/.test(t) && !/batu\s+gunting\s+kertas/.test(t)) return playSuit(EN[hand[1]] || hand[1] as (typeof HANDS)[number], v, turn, seed);
    return { text: pv(v, { santai: ['Ayo! Pilih: batu, gunting, atau kertas? ✊✌️✋', 'Siap, suit! Kamu pilih apa: batu, gunting, kertas?'], sopan: ['Baik. Silakan pilih: batu, gunting, atau kertas.'], gaul: ['Gas suit! Batu, gunting, apa kertas? ✊✌️✋', 'Ayo, yang kalah traktir WKWK. Pilih!'], singkat: ['Batu, gunting, kertas?'], barbar: ['Sini lawan gue, kalah traktir anjir ✊✌️✋ Pilih!'] }, turn), chips: ['batu', 'gunting', 'kertas'], game: { kind: 'suit' } };
  }
  if (COIN.test(t)) {
    const side = draw(seed, 2) ? 'angka' : 'gambar';
    return { text: `${pv(v, { santai: ['Koin dilempar… 🪙', 'Ting! 🪙'], sopan: ['Koin dilempar… 🪙'], gaul: ['Lempar… 🪙', 'Ting ting 🪙'], singkat: ['🪙'], barbar: ['Lempar, anjir… 🪙'] }, turn)} Hasilnya: ${side}!`, chips: ['lempar koin lagi', 'lempar dadu'] };
  }
  if (DICE.test(t)) {
    const face = 1 + draw(seed, 6);
    return { text: `${pv(v, { santai: ['Dadu dikocok… 🎲', 'Klotak klotak… 🎲'], sopan: ['Dadu dilempar… 🎲'], gaul: ['Kocok… 🎲'], singkat: ['🎲'], barbar: ['Kocok, bangsat… 🎲'] }, turn)} Keluar angka ${face}!`, chips: ['lempar dadu lagi', 'lempar koin'] };
  }
  if (NUMBER_GAME.test(t)) {
    const secret = 1 + draw(seed, 10);
    return { text: pv(v, { santai: ['Oke! Aku udah pilih angka 1 sampai 10. Tebak, kamu punya 3 kesempatan 🤔', 'Siap! Angkanya antara 1–10. Coba tebak (3 kali kesempatan).'], sopan: ['Baik. Saya sudah memilih angka 1 sampai 10. Silakan menebak, ada 3 kesempatan.'], gaul: ['Gue udah pilih angka 1–10. Tebak, 3 kesempatan ya 🤔'], singkat: ['Angka 1–10. Tebak (3 kali).'], barbar: ['Gue udah pilih angka 1–10. Tebak, 3 kali doang, jangan bego WKWK.'] }, turn), game: { kind: 'angka', secret, tries: 0 } };
  }
  if (RANDOM.test(t)) {
    const range = t.match(/(\d+)\s*(?:-|sampai|sampe|hingga|s\/d|ke)\s*(\d+)/), lo = range ? Math.min(+range[1], +range[2]) : 1, hi = range ? Math.max(+range[1], +range[2]) : 100;
    const n = lo + draw(seed, Math.max(1, hi - lo + 1));
    return { text: `${vo(v, { santai: 'Angka acaknya:', sopan: 'Angka acak:', gaul: 'Nih angkanya:', singkat: '', barbar: 'Nih, anjir:' })} ${n} (${lo}–${hi}).`.trim(), chips: ['angka acak lagi'] };
  }
  // "pilihin dong, bakso atau mie ayam?", "mending nasi padang apa warteg"
  if (CHOOSE.test(t) && /\b(?:atau|ato|apa|vs)\b/.test(t)) {
    const body = t.replace(/^.*?\b(?:pilih(?:in|kan)?|bantu\s+pilih(?:in)?|mending|enakan|bagusan|lebih\s+(?:baik|enak|bagus))\b\s*(?:dong|donk|deh|yuk|ya|aku|gue|gw|saya|antara)?\s*[,:]?\s*/, '').replace(/[?!.]+$/, '');
    const options = body.split(/\s*(?:,|\batau\b|\bato\b|\bvs\.?\b|\bapa\b(?!\s+aja))\s*/).map(s => s.replace(/^(?:yang\s+|beli\s+|makan\s+)/, '').trim()).filter(s => s && s.split(' ').length <= 5);
    if (options.length >= 2 && options.length <= 6) {
      const pick = options[draw(seed, options.length)];
      return { text: `${pv(v, { santai: [`Aku pilih ${pick}!`, `Hmm… ${pick} aja!`], sopan: [`Saya memilih ${pick}.`], gaul: [`${pick} lah!`, `Gas ${pick}!`], singkat: [`${pick}.`], barbar: [`${pick} lah anjir, gitu aja bingung WKWK.`, `${pick}, udah jangan mikir lama, bangsat.`] }, turn)} ${vo(v, { santai: 'Ini cuma pilihan acak ya, tetap ikuti kata hatimu (dan dompetmu) 😄', sopan: '(Pilihan ini acak.)', gaul: 'Acak doang sih, sesuaiin sama dompet lo WKWK.', singkat: '(acak)', barbar: 'Acak doang, yang penting duit lo cukup, goblok.' })}`, chips: ['pilihin lagi'] };
    }
  }
  return null;
}
function playSuit(hand: (typeof HANDS)[number], v: Voice, turn: number, seed: string): GameReply {
  const mine = HANDS[draw(seed, 3)], i = HANDS.indexOf(hand), j = HANDS.indexOf(mine);
  const outcome = i === j ? 'seri' : (i + 1) % 3 === j ? 'menang' : 'kalah';
  const icon = { batu: '✊', gunting: '✌️', kertas: '✋' };
  const said = outcome === 'seri'
    ? pv(v, { santai: ['Seri! Sekali lagi?'], sopan: ['Hasilnya seri. Ingin bermain lagi?'], gaul: ['Seri cuy! Lagi?'], singkat: ['Seri.'], barbar: ['Seri, anjir. Lagi!'] }, turn)
    : outcome === 'menang'
      ? pv(v, { santai: ['Kamu menang! 🎉 Hebat juga.', 'Yah, aku kalah 😭 Kamu menang!'], sopan: ['Anda menang 🎉'], gaul: ['Lo menang! 🎉 Curang ya? WKWK'], singkat: ['Kamu menang.'], barbar: ['Bangsat, lo menang 😭 Hoki doang itu WKWK.'] }, turn)
      : pv(v, { santai: ['Aku menang! 😎 Kamu kalah, wkwk. Lagi?', 'Hehe, kamu kalah! Mau balas dendam?'], sopan: ['Saya menang kali ini. Ingin bermain lagi?'], gaul: ['Gue menang! 😎 Lo kalah WKWK, traktir ya.'], singkat: ['Kamu kalah.'], barbar: ['Lo kalah, cupu WKWKWK 😎 Traktir gue, anjir.'] }, turn);
  return { text: `${icon[hand]} ${hand} vs ${icon[mine]} ${mine}. ${said}`, chips: ['batu', 'gunting', 'kertas'], game: { kind: 'suit' } };
}
function guessNumber(n: number, state: Extract<GameState, { kind: 'angka' }>, v: Voice, turn: number): GameReply {
  const tries = state.tries + 1;
  if (n === state.secret) return { text: pv(v, { santai: [`Benar! Angkanya ${n} 🎉 Kamu nebak dalam ${tries} kali.`], sopan: [`Tepat, angkanya ${n} 🎉`], gaul: [`Bener anjir, ${n}! 🎉 ${tries} kali tebak.`], singkat: [`Benar: ${n}.`], barbar: [`Bangsat, bener ${n} 🎉 Tumben otak lo jalan WKWK.`] }, turn), chips: ['main tebak angka lagi'] };
  if (tries >= 3) return { text: pv(v, { santai: [`Yah, kesempatannya habis 😅 Angkanya ${state.secret}.`], sopan: [`Kesempatan habis. Angkanya ${state.secret}.`], gaul: [`Abis kesempatan WKWK. Angkanya ${state.secret}.`], singkat: [`Habis. Angkanya ${state.secret}.`], barbar: [`Kalah lo, cupu WKWK. Angkanya ${state.secret}.`] }, turn), chips: ['main tebak angka lagi'] };
  const dir = state.secret > n ? vo(v, { santai: 'lebih besar', sopan: 'lebih besar', gaul: 'lebih gede', singkat: 'lebih besar', barbar: 'lebih gede, anjir' }) : vo(v, { santai: 'lebih kecil', sopan: 'lebih kecil', gaul: 'lebih kecil', singkat: 'lebih kecil', barbar: 'lebih kecil, bego' });
  return { text: `${vo(v, { santai: `Bukan ${n}. Angkanya ${dir}!`, sopan: `Bukan ${n}. Angkanya ${dir}.`, gaul: `Bukan ${n}, angkanya ${dir}!`, singkat: `Bukan. ${dir}.`, barbar: `Salah! Angkanya ${dir}.` })} (${3 - tries} kesempatan lagi)`, game: { ...state, tries } };
}
