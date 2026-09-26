/**
 * Where idle money could go, by risk profile and horizon. Returns are conservative long-run yearly
 * estimates for Indonesia, net of tax and fees (`ret` = the middle, `range` = what is typical), used
 * only to illustrate growth — not promises and not product advice. Real returns change with the market.
 */
import type { Experience, Horizon, RiskProfile } from './insight-profile.ts';

export type InstrumentKey = 'rdpu' | 'deposito' | 'sbn' | 'obligasi' | 'saham' | 'emas';
export type Instrument = { key: InstrumentKey; name: string; examples: string; ret: number; range: [number, number]; retNote: string; risk: 1 | 2 | 3 | 4; liquidity: string; why: string };

export const instruments: Record<InstrumentKey, Instrument> = {
  rdpu: { key: 'rdpu', name: 'Reksa dana pasar uang', examples: 'RDPU di aplikasi investasi terdaftar OJK', ret: .04, range: [.03, .05], retNote: 'bersih setelah biaya, mengikuti suku bunga', risk: 1, liquidity: 'Cair 1–2 hari kerja', why: 'Paling aman untuk uang yang bisa sewaktu-waktu dipakai, imbal hasil di atas tabungan biasa.' },
  deposito: { key: 'deposito', name: 'Deposito', examples: 'Deposito bank/BPR yang dijamin LPS', ret: .03, range: [.02, .04], retNote: 'setelah pajak bunga 20%', risk: 1, liquidity: 'Terkunci 1–12 bulan', why: 'Nilai pasti dan dijamin LPS (dalam batas bunga penjaminan).' },
  sbn: { key: 'sbn', name: 'SBN ritel', examples: 'ORI, SR, SBR, ST (dijamin negara)', ret: .055, range: [.05, .06], retNote: 'kupon setelah pajak 10%, tergantung seri', risk: 1, liquidity: 'Tenor 2–6 tahun, sebagian bisa dijual/dicairkan awal', why: 'Dijamin negara dengan kupon tetap/mengambang yang biasanya di atas deposito.' },
  obligasi: { key: 'obligasi', name: 'Reksa dana pendapatan tetap', examples: 'Reksa dana obligasi pemerintah/korporasi', ret: .055, range: [.04, .07], retNote: 'setelah biaya, bisa turun sementara', risk: 2, liquidity: 'Cair 2–7 hari kerja', why: 'Pertumbuhan stabil dari bunga obligasi, naik-turunnya kecil.' },
  saham: { key: 'saham', name: 'Saham / reksa dana indeks saham', examples: 'Reksa dana indeks (IDX30, LQ45) atau saham blue chip', ret: .08, range: [.05, .11], retNote: 'rata-rata jangka panjang; dalam setahun bisa minus 20% atau lebih', risk: 4, liquidity: 'Cair 2–7 hari kerja, nilainya naik-turun', why: 'Potensi tumbuh paling tinggi untuk jangka panjang; butuh kesabaran saat turun.' },
  emas: { key: 'emas', name: 'Emas', examples: 'Emas batangan atau emas digital resmi', ret: .06, range: [.03, .09], retNote: 'harga naik-turun, ada selisih harga jual-beli', risk: 3, liquidity: 'Mudah dijual, ada selisih harga jual-beli', why: 'Pelindung nilai saat inflasi tinggi atau pasar bergejolak.' },
};

const base: Record<RiskProfile, Partial<Record<InstrumentKey, number>>> = {
  konservatif: { rdpu: 40, deposito: 20, sbn: 30, emas: 10 },
  moderat: { rdpu: 20, sbn: 25, obligasi: 20, saham: 25, emas: 10 },
  agresif: { rdpu: 10, sbn: 15, obligasi: 10, saham: 55, emas: 10 },
};

/** Spread for the stock part across sectors (or simply one index fund that already covers them). */
export const equitySectors: { name: string; share: number; note: string }[] = [
  { name: 'Keuangan & perbankan', share: 30, note: 'Bank besar dengan laba stabil' },
  { name: 'Konsumer primer', share: 20, note: 'Makanan, minuman, kebutuhan harian — tahan krisis' },
  { name: 'Infrastruktur & telekomunikasi', share: 15, note: 'Jalan tol, menara, operator seluler' },
  { name: 'Energi & bahan baku', share: 15, note: 'Batu bara, nikel, migas — siklikal' },
  { name: 'Kesehatan', share: 10, note: 'Rumah sakit dan farmasi' },
  { name: 'Teknologi', share: 10, note: 'Pertumbuhan tinggi, paling fluktuatif' },
];

export type PlanItem = Instrument & { share: number; amount: number };
/** Allocation for a lump sum. Short horizons stay in cash-like instruments whatever the risk profile. */
/** Sharia-compliant names and examples for the same kinds of instruments. */
const syariahNames: Partial<Record<InstrumentKey, Pick<Instrument, 'name' | 'examples'>>> = {
  rdpu: { name: 'Reksa dana pasar uang syariah', examples: 'RDPU syariah di aplikasi terdaftar OJK' },
  deposito: { name: 'Deposito syariah', examples: 'Deposito mudharabah bank syariah (dijamin LPS)' },
  sbn: { name: 'SBSN ritel (sukuk)', examples: 'Sukuk Ritel (SR) dan Sukuk Tabungan (ST)' },
  obligasi: { name: 'Reksa dana sukuk / pendapatan tetap syariah', examples: 'Reksa dana sukuk negara/korporasi' },
  saham: { name: 'Saham syariah / reksa dana indeks syariah', examples: 'Indeks ISSI, JII, JII70' },
  emas: { name: 'Emas', examples: 'Emas batangan atau emas digital syariah' },
};
export const instrumentChoices = (Object.keys(instruments) as InstrumentKey[]).map(key => ({ key, name: instruments[key].name }));

export function allocation(risk: RiskProfile, horizon: Horizon, experience: Experience, amount: number, prefs: { syariah?: boolean; excluded?: string[] } = {}): PlanItem[] {
  let mix: Partial<Record<InstrumentKey, number>> = { ...base[risk] };
  if (horizon === 'short') mix = { rdpu: 60, deposito: 40 };
  else if (horizon === 'mid' && (mix.saham || 0) > 30) { const move = (mix.saham || 0) - 30; mix.saham = 30; mix.obligasi = (mix.obligasi || 0) + move; }
  // First-time investors start smaller in stocks; the rest goes to steadier funds.
  if (experience === 'none' && (mix.saham || 0) > 20) { const move = (mix.saham || 0) - 20; mix.saham = 20; mix.rdpu = (mix.rdpu || 0) + Math.round(move / 2); mix.obligasi = (mix.obligasi || 0) + move - Math.round(move / 2); }
  // Instruments the user doesn't want: share their part among the rest (money market as the last resort).
  const excluded = new Set(prefs.excluded || []);
  let removed = 0;
  for (const key of Object.keys(mix) as InstrumentKey[]) if (excluded.has(key)) { removed += mix[key] || 0; delete mix[key]; }
  const kept = Object.keys(mix) as InstrumentKey[];
  if (!kept.length) { const fallback = (Object.keys(instruments) as InstrumentKey[]).find(k => !excluded.has(k)) || 'rdpu'; mix = { [fallback]: 100 }; removed = 0; }
  else if (removed) { const total = kept.reduce((n, k) => n + (mix[k] || 0), 0); let given = 0; kept.forEach((k, i) => { const add = i === kept.length - 1 ? removed - given : Math.round(removed * (mix[k] || 0) / total); given += add; mix[k] = (mix[k] || 0) + add; }); }
  const items = (Object.entries(mix) as [InstrumentKey, number][]).filter(([, share]) => share > 0).map(([key, share]) => ({ ...instruments[key], ...(prefs.syariah ? syariahNames[key] : {}), share, amount: Math.round(amount * share / 100 / 1000) * 1000 }));
  return items.sort((a, b) => b.share - a.share);
}
export const blendedReturn = (items: { share: number; ret: number }[]) => items.reduce((n, i) => n + i.share / 100 * i.ret, 0);
/** Typical low and high yearly return for a mix. */
export const blendedRange = (items: { share: number; range: [number, number] }[]): [number, number] => [items.reduce((n, i) => n + i.share / 100 * i.range[0], 0), items.reduce((n, i) => n + i.share / 100 * i.range[1], 0)];
/** "4–8%" for a return range, widened to whole percents so it never looks more exact than it is. */
export const rangeText = ([low, high]: [number, number]) => { const a = Math.floor(low * 100 + 1e-9), b = Math.ceil(high * 100 - 1e-9); return a >= b ? `${Math.round(low * 100)}%` : `${a}–${b}%`; };

/** Future value of a lump sum plus monthly additions at a yearly return. */
export function futureValue(lump: number, monthly: number, yearlyReturn: number, years: number) {
  const r = yearlyReturn / 12, n = years * 12;
  const growth = Math.pow(1 + r, n);
  return Math.round(lump * growth + (r ? monthly * (growth - 1) / r : monthly * n));
}
/** What idle cash is worth in today's money after inflation. */
export const INFLATION = .03;
export const realValueIdle = (amount: number, years: number) => Math.round(amount / Math.pow(1 + INFLATION, years));
