/**
 * 8.1 — "cara bikin anggaran", "gimana cara pasang PIN", "bisa backup data ga?": how to use a feature, answered from the
 * app's own Tanya Jawab (lib/help-content.ts, about a hundred entries), with its steps and a button to the menu.
 * Words are matched loosely (bikin = buat = membuat, nyembunyiin = sembunyi, backup = cadang).
 */
import { helpGroups, type HelpItem } from '../help-content.ts';
import { MODULES } from './modules.ts';

export type HowtoAnswer = { title: string; text: string; steps?: string[]; open?: { view: string; label: string } };
const ASK = /^(?:cara(?:nya)?|gimana\s+cara(?:nya)?|bagaimana\s+cara(?:nya)?|gmn\s+cara(?:nya)?|gmana\s+cara(?:nya)?|tutorial|langkah(?:-langkah)?|ajarin\s+(?:aku\s+|gue\s+)?cara|kasih\s+tau\s+cara)\b|\bcara(?:nya)?\s+(?:bikin|buat|membuat|pasang|memasang|ganti|mengganti|ubah|mengubah|hapus|menghapus|catat|mencatat|nyatet|tambah|menambah|nambah|pakai|pake|memakai|nyalain|nyalakan|matiin|matikan|backup|cadang|mencadangkan|export|ekspor|import|transfer|bagi|split|tutup|nutup|menutup|atur|ngatur|mengatur|setting|nyembunyiin|sembunyiin|menyembunyikan|scan|foto|kunci|ngunci|install|instal|masang|isi|top\s*up|pindah|arsip|geser|bikinin)\b|\b(?:bisa|bs)\s+(?:ga|gak|nggak|ngga|tidak)\s+(?:bikin|buat|export|ekspor|backup|cadang|ganti|pasang|kunci|sembunyiin|scan|split)\b/;
const STOP = new Set('ganti ubah mengganti mengubah pakai pake memakai cara caranya gimana bagaimana gmn gmana tutorial langkah tolong ajarin kasih tau aku gue gw saya dong ya yang di ke dari untuk buat bikin membuat sih nih deh sama dengan mau pengen bisa bs ga gak nggak ngga tidak apa itu ini kalau kalo terus lalu biar supaya agar aja saja juga lagi udah sudah ada nya mencatat catat nyatet sebuah satu'.split(' '));
/** Everyday words → the words Tanya Jawab uses. */
const SAME: Record<string, string[]> = {
  nyembunyiin: ['sembunyi', 'sensor'], sembunyiin: ['sembunyi', 'sensor'], menyembunyikan: ['sembunyi', 'sensor'], sensor: ['sembunyi', 'sensor'],
  backup: ['cadang', 'backup'], cadang: ['cadang'], mencadangkan: ['cadang'], ekspor: ['ekspor', 'cadang'], export: ['ekspor', 'cadang'],
  nutup: ['tutup', 'menutup'], tutup: ['tutup', 'menutup'], pasang: ['pasang', 'kunci'], kunci: ['kunci'], pin: ['pin'], sidik: ['sidik'],
  temen: ['teman'], teman: ['teman'], patungan: ['split', 'bagi'], split: ['split'], bill: ['split'], bil: ['split'],
  budget: ['anggaran'], bujet: ['anggaran'], anggaran: ['anggaran'], tagihan: ['tagihan', 'rutin'], rutin: ['rutin', 'tagihan'], langganan: ['rutin', 'tagihan'],
  utang: ['utang'], hutang: ['utang'], piutang: ['piutang'], pinjem: ['piutang'], cicilan: ['cicilan', 'utang'], klaim: ['klaim'], reimburse: ['klaim'],
  transfer: ['transfer'], pindah: ['transfer'], antar: ['antardompet', 'transfer'], dompet: ['dompet'], kantong: ['kantong'], darurat: ['darurat'],
  struk: ['struk', 'scan'], scan: ['scan', 'struk'], foto: ['foto', 'struk'], siklus: ['siklus'], gaji: ['gaji', 'siklus'], install: ['pasang', 'layar'], instal: ['pasang', 'layar'],
  notif: ['notifikasi'], notifikasi: ['notifikasi'], nominal: ['nominal'], kategori: ['kategori'], urutan: ['urutan', 'geser'], geser: ['geser', 'urutan'],
  saldo: ['saldo'], beda: ['berbeda'], cadangan: ['cadangan'], sisihin: ['menyisihkan', 'cadangan'], tema: ['tema', 'warna', 'palet'], warna: ['warna', 'palet'],
};
/** The verb asked ("bikin anggaran") → how a how-to entry starts ("Membuat …"). */
const VERBS: [RegExp, RegExp][] = [
  [/\b(?:bikin|buat|membuat|bikinin)\b/, /^membuat\b/], [/\b(?:catat|nyatet|nyatat|mencatat)\b/, /^mencatat\b/], [/\b(?:tutup|nutup|menutup)\b/, /^menutup\b/],
  [/\b(?:atur|ngatur|mengatur|setting)\b/, /^mengatur\b/], [/\b(?:geser|menggeser)\b/, /^menggeser\b/], [/\b(?:sembunyiin|nyembunyiin|menyembunyikan)\b/, /^menyembunyikan\b|^nominal\b/],
  [/\b(?:pasang|masang|kunci|ngunci)\b/, /^(?:mengunci|memasang)\b/], [/\b(?:bagi|split)\b/, /^membagi\b/], [/\b(?:tambah|nambah|menambah)\b/, /^menambah\b/], [/\b(?:backup|cadang|mencadangkan)\b/, /^mencadangkan\b/],
];
type Entry = { item: HelpItem; q: string; keys: string; a: string };
let entries: Entry[] | null = null;
const lower = (s: string) => s.toLocaleLowerCase('id-ID');
function all(): Entry[] {
  if (entries) return entries;
  const out: Entry[] = [], walk = (items: HelpItem[]) => items.forEach(item => { out.push({ item, q: lower(item.q), keys: lower(item.keywords || ''), a: lower(item.a) }); if (item.children) walk(item.children); });
  helpGroups.forEach(g => walk(g.items));
  return (entries = out);
}
const plain = (s: string) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
/** The first sentences of an answer, up to about 320 characters. */
function lead(a: string) {
  const sentences = plain(a).match(/[^.!?]+[.!?]+(?:\s|$)/g) || [plain(a)];
  let out = ''; for (const s of sentences) { if (out && (out + s).length > 320) break; out += s; }
  return out.trim();
}
export const asksHowto = (t: string) => ASK.test(t);

export function readHowto(t: string): HowtoAnswer | null {
  if (!ASK.test(t)) return null;
  const words = t.replace(/[^\p{L}\d\s]/gu, ' ').split(/\s+/).filter(w => w.length >= 3 && !STOP.has(w));
  if (!words.length) return null;
  const terms = words.map(w => SAME[w] || [w.replace(/^(?:meng|mem|men|me|ber|di|ter|nge|ng)(?=\p{L}{4,})/u, '').replace(/(?:kan|in|an|nya)$/u, '')].filter(x => x.length >= 3));
  let best: { e: Entry; score: number } | null = null;
  const verb = VERBS.find(([asked]) => asked.test(t))?.[1];
  for (const e of all()) {
    let score = 0, named = 0;
    for (const options of terms) {
      // Short words whole ("tema" is not "teman"); longer ones with any prefix ("catat" in "mencatat").
      const hit = (field: string) => options.some(o => new RegExp(`(?:^|[^\\p{L}])\\p{L}{0,4}${o}${o.length <= 4 ? '(?:nya|mu|ku)?(?![\\p{L}])' : ''}`, 'u').test(field));
      if (hit(e.q)) { score += 3; named++; } else if (hit(e.keys)) { score += 2; named++; } else if (hit(e.a)) score += 0.5;
    }
    // The entry that does what was asked ("bikin" → "Membuat …"); a how-to beats a definition of the same word.
    if (verb?.test(e.q)) score += 1.5;
    else if (/^(?:mencatat|membuat|mengatur|menutup|mengunci|memasang|menyembunyikan|mencadangkan|membagi|menggeser|menambah|menyisihkan)\b/.test(e.q)) score += 0.5;
    if (named >= Math.ceil(terms.length / 2) && (!best || score > best.score)) best = { e, score };
  }
  if (!best || best.score < 2) return null;
  const { item } = best.e;
  // A button to the menu: the entry's own, else the menu the question names ("anggaran" → Anggaran).
  const menu = item.go ? { view: item.go.view, label: item.go.label } : (() => { const m = MODULES.find(x => x.words.test(t)); return m ? { view: m.view, label: `Buka ${m.label}` } : undefined; })();
  return { title: plain(item.q), text: lead(item.a), ...(item.steps?.length ? { steps: item.steps.map(plain).slice(0, 6) } : {}), ...(menu ? { open: menu } : {}) };
}
