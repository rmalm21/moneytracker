/**
 * 7.9 Arithmetic asked in words (the training document's "Perhitungan matematis" and "Matematika lanjutan"): answered,
 * never recorded. "3 kopi @18rb sama roti 12rb berapa?", "total 250rb, bayar 300rb, kembali berapa?", "325rb buat 13
 * hari, sehari berapa?", "400rb jadi 500rb naik berapa persen?", "gaji 6jt, tabung 20% berapa?", "langganan 54rb sebulan
 * setahun berapa?", "budget 1,2jt terpakai 875rb" (and then "kalau makan lagi 80rb?"), "bill 275rb bagi 40%, 35%, 25%",
 * "patungan 10rb untuk 3 orang, bagi rata sampai rupiah", "belanja 100rb dan 50rb, diskon total 30rb dibagi proporsional".
 * A sum of things bought keeps its sentence, so "oke catat tunai" can turn it into cards.
 */
import { findAmounts, type QuickContext } from '../quick-entry.ts';
import { parseQuickPlan } from '../quick-plan.ts';
import { calculate, calcText } from './calc.ts';

export type WordMath = {
  text: string; title: string; hero: { label: string; value: string }; lines?: { label: string; value: string }[]; why: string; chips?: string[];
  /** The result, for "kalau dibagi 2?". */ number: number;
  /** What is left of a budget, a debt or money: "kalau makan lagi 80rb?" takes from it. */ remain?: number;
  /** The things summed, as a sentence to record ("oke catat tunai"). */ plan?: string;
};

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const rp = (n: number) => `${n < 0 ? '−' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
const AMT = String.raw`(?:rp\.?\s*)?\d+(?:[.,]\d+)*\s*(?:rb|ribu|rebu|k|jt|juta)\b`;
const value = (s: string) => findAmounts(lower(s)).find(a => a.value > 0)?.value || 0;
const WORDS: Record<string, number> = { satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10 };
const NUM = String.raw`(\d+|satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh)`;
const count = (s: string) => /^\d+$/.test(s) ? Number(s) : WORDS[s] || 0;
const pctText = (r: number) => `${(Math.round(r * 1000) / 10).toLocaleString('id-ID')}%`;
const ASK = /\b(?:berapa|brp|brapa|totalnya|jadinya|hitung(?:in|kan)?|itung(?:in)?)\b|\?\s*$/;
/** Even parts to the rupiah: the remainder goes one rupiah at a time to the first parts. */
const parts = (total: number, n: number) => { const base = Math.floor(total / n), r = Math.round(total - base * n); return Array.from({ length: n }, (_, i) => base + (i < r ? 1 : 0)); };

export function readWordMath(input: string, ctx: QuickContext, memory: { remain?: number; last?: string }): WordMath | null {
  const t = lower(input).replace(/\s+/g, ' ').replace(/[!.]+$/, '').trim();
  const amounts = findAmounts(t).filter(a => a.value > 0);
  const out = (o: Omit<WordMath, 'title'> & { title?: string }): WordMath => ({ title: 'Hitungan', ...o });

  // "jawab singkat aja, 250rb kurang 87rb": the calculation after the request.
  const brief = t.match(/^(?:jawab|bales|balas|kasih tau)?\s*(?:singkat|pendek|cepet|cepat)(?:\s+(?:aja|saja))?\s*,?\s*(.+)$/);
  if (brief) { const c = calculate(brief[1].replace(/\s*(?:berapa|=)\s*\??$/, '')); if (c) return out({ text: calcText(c), hero: { label: c.expression, value: calcText(c) }, why: 'Dihitung dari angka yang kamu tulis.', number: c.value }); }

  // What is left after some of it went: "budget 1,2jt terpakai 875rb", "utang 500rb, bayar 125rb dua kali, sisa?".
  const left = t.match(new RegExp(String.raw`^(?:(?:budget|anggaran|bujet|limit|jatah|utang|hutang|pinjaman|pinjem|pinjam|saldo|duit|uang|sisa)\s*(?:[\p{L}]+\s+)?)(${AMT})\s*,?\s*(?:udah\s+|sudah\s+|baru\s+)?(?:terpakai|kepake|kepakai|dipakai|kepotong|habis|kebayar|dibayar|bayar|nyicil|dicicil|cicil|keluar)\s+(${AMT})(?:\s+(${NUM.slice(1, -1)})\s*(?:kali|x))?(?:\s*[,.]?\s*(?:sisa(?:nya)?(?:\s+(?:utang|budget|anggaran))?\s*(?:berapa|brp)?))?\s*\??$`, 'u'));
  if (left) {
    const total = value(left[1]), each = value(left[2]), k = left[3] ? count(left[3]) : 1, remain = total - each * k;
    return out({ title: 'Sisa', text: `Sisanya ${rp(remain)}${remain < 0 ? ' (sudah lewat)' : ''}.`, hero: { label: `${rp(total)} − ${k > 1 ? `${k} × ${rp(each)}` : rp(each)}`, value: rp(remain) }, why: `${rp(total)} dikurangi ${k > 1 ? `${k} kali ${rp(each)} = ${rp(each * k)}` : rp(each)}. Ini hitungan dari angka yang kamu tulis, belum memperhitungkan komitmen lain.`, number: remain, remain, chips: ['kalau dibagi 10 hari?'] });
  }
  // "kalau makan lagi 80rb?", "ada rencana makan 100rb juga", "kalau naik grab 40rb lagi?": from what was left.
  if (memory.remain !== undefined && memory.last === 'calc' && amounts.length === 1 && /\b(?:kalau|kalo|klo|lagi|juga|rencana|terus|trus|tambah|nambah|ada)\b/.test(t) && !/\b(?:hari|bagi|kali|persen|%)\b/.test(t)) {
    // "kalau …" only imagines it: what is left stays as it was; "ada rencana …" takes it.
    const a = amounts[0].value, remain = memory.remain - a, planned = /\brencana\b/.test(t), maybe = /\b(?:kalau|kalo|klo|misal(?:nya)?|seandainya)\b/.test(t);
    return out({ title: 'Sisa', text: `${planned ? 'Setelah rencana itu diperhitungkan' : 'Kalau jadi'}, sisanya ${rp(remain)}${remain < 0 ? ', sudah lewat' : ''}.`, hero: { label: `${rp(memory.remain)} − ${rp(a)}`, value: rp(remain) }, why: `Sisa sebelumnya ${rp(memory.remain)} dikurangi ${rp(a)}.${maybe ? ' Ini baru andai-andai, jadi sisa sebelumnya tetap dipakai untuk hitungan berikutnya.' : ''}`, number: remain, remain: maybe ? memory.remain : remain });
  }
  // A day's share: "325rb cukup buat 13 hari, sehari berapa?", "sisa 225rb buat 9 hari?", "budget tersisa 300rb, sampai gajian 10 hari lagi".
  const daily = t.match(new RegExp(String.raw`(${AMT})\s*,?\s*(?:cukup\s+|harus\s+cukup\s+)?(?:buat|untuk|utk|selama|sampai|sampe)\s+(?:gajian\s+)?(\d+)\s*hari(?:\s+lagi)?`));
  if (daily && (ASK.test(t) || /\b(?:sisa|tersisa|budget|anggaran|cukup|gajian)\b/.test(t))) {
    const a = value(daily[1]), n = Number(daily[2]), per = Math.floor(a / n);
    return out({ title: 'Per hari', text: `Kalau dibagi rata ${n} hari, sekitar ${rp(per)} per hari.`, hero: { label: `${rp(a)} ÷ ${n} hari`, value: `${rp(per)}/hari` }, why: `${rp(a)} dibagi ${n}, dibulatkan ke bawah supaya cukup. Pastikan ${n} hari itu sudah termasuk hari ini atau belum.`, number: per });
  }
  // Change: "total 250rb, bayar 300rb, kembali berapa?", "belanja 87rb, uangnya 100rb, kembaliannya berapa?".
  const change = t.match(new RegExp(String.raw`(${AMT}).*?\b(?:bayar|uang(?:nya)?|duit(?:nya)?|kasih|dikasih|pakai|pake)\s+(?:pake\s+|pakai\s+)?(${AMT}).*?\bkembali(?:an|annya|nya)?\b`));
  if (change) {
    const price = value(change[1]), paid = value(change[2]);
    if (paid >= price) return out({ title: 'Kembalian', text: `Kembaliannya ${rp(paid - price)}.`, hero: { label: `${rp(paid)} − ${rp(price)}`, value: rp(paid - price) }, why: `Uang yang diberikan ${rp(paid)} dikurangi harga ${rp(price)}.`, number: paid - price });
  }
  // Percent change: "400rb jadi 500rb naik berapa persen?", "harga naik dari 20rb ke 25rb", "bulan lalu nol, sekarang 50rb".
  if (/\b(?:persen|%)\b|persen/.test(t) && /\b(?:naik|turun|kenaikan|penurunan|beda|selisih)\b/.test(t)) {
    const zero = /\b(?:nol|0|kosong)\b/.test(t) && amounts.length === 1;
    if (zero) { const b = amounts[0].value; return out({ title: 'Kenaikan', text: `Naik ${rp(b)}. Persentasenya tidak bisa dihitung karena angka awalnya nol.`, hero: { label: `${rp(0)} → ${rp(b)}`, value: `+${rp(b)}` }, why: 'Persentase kenaikan = selisih dibagi angka awal. Angka awal nol tidak bisa jadi pembagi.', number: b }); }
    if (amounts.length === 2) {
      const [a, b] = [amounts[0].value, amounts[1].value], d = b - a;
      return out({ title: d >= 0 ? 'Kenaikan' : 'Penurunan', text: `${d >= 0 ? 'Naik' : 'Turun'} ${rp(Math.abs(d))}, yaitu ${pctText(Math.abs(d) / a)} dari ${rp(a)}.`, hero: { label: `${rp(a)} → ${rp(b)}`, value: `${d >= 0 ? '+' : '−'}${pctText(Math.abs(d) / a)}` }, why: `Selisih ${rp(Math.abs(d))} dibagi angka awal ${rp(a)}.`, number: Math.abs(d) / a * 100 });
    }
  }
  // A share of an amount: "gaji 6jt, tabung 20% berapa?", "gaji 8jt, kalau disisihin 15% berapa?".
  const share = t.match(new RegExp(String.raw`(${AMT})\s*,?\s*(?:kalau\s+|kalo\s+)?(?:mau\s+)?(?:di)?(?:tabung|nabung|sisih(?:in|kan)|simpan|investasi(?:in)?|zakat(?:in)?|ambil|potong|alokasi(?:in|kan)?)\s+(\d+(?:[.,]\d+)?)\s*(?:%|persen)`));
  if (share) {
    const a = value(share[1]), p = Number(share[2].replace(',', '.')), part = Math.round(a * p / 100);
    return out({ title: `${p}% dari ${rp(a)}`, text: `${p}% dari ${rp(a)} = ${rp(part)}. Sisanya ${rp(a - part)}.`, hero: { label: `${p}% × ${rp(a)}`, value: rp(part) }, lines: [{ label: 'Disisihkan', value: rp(part) }, { label: 'Sisanya', value: rp(a - part) }], why: `${rp(a)} dikali ${p}%.`, number: part });
  }
  // Over a longer time: "30rb sehari, sebulan berapa?", "54rb sebulan setahun berapa?", "tiap hari 15rb, seminggu berapa?".
  const per = t.match(new RegExp(String.raw`(${AMT})\s*(?:sehari|per\s?hari|tiap\s+hari|setiap\s+hari|seminggu|per\s?minggu|sebulan|per\s?bulan|tiap\s+bulan)|(?:sehari|tiap\s+hari|setiap\s+hari|seminggu|sebulan|tiap\s+bulan)\s+(?:[\p{L}]+\s+){0,2}(${AMT})`, 'u'));
  const to = t.match(/\b(seminggu|sebulan|setahun|per\s?minggu|per\s?bulan|per\s?tahun)\b\s*(?:habis\s+)?(?:berapa|brp|\?|$)/);
  if (per && to && ASK.test(t)) {
    const a = value(per[1] || per[2]), from = /hari/.test(per[0]) ? 'hari' : /minggu/.test(per[0]) ? 'minggu' : 'bulan', goal = /minggu/.test(to[1]) ? 'minggu' : /bulan/.test(to[1]) ? 'bulan' : 'tahun';
    const F: Record<string, Record<string, number[]>> = { hari: { minggu: [7], bulan: [30, 31], tahun: [365] }, minggu: { bulan: [4], tahun: [52] }, bulan: { tahun: [12] } };
    const k = F[from]?.[goal];
    if (k) {
      const vals = k.map(x => a * x), label = { hari: 'hari', minggu: 'minggu', bulan: 'bulan' }[from];
      return out({ title: `Se${goal}`, text: k.length > 1 ? `Kalau ${k[0]} hari, totalnya ${rp(vals[0])}. Kalau ${k[1]} hari, ${rp(vals[1])}. Ini simulasi, belum dicatat.` : `${rp(a)} × ${k[0]} ${label} = ${rp(vals[0])}${goal === 'tahun' && from === 'bulan' ? ' untuk 12 bulan dengan tarif tetap' : ''}.`, hero: { label: `${rp(a)} × ${k[0]}`, value: rp(vals[0]) }, why: `${rp(a)} per ${label} dikali ${k.join(' atau ')} ${label} dalam se${goal}.`, number: vals[0] });
    }
  }
  // Divided by percentages: "bill 275rb bagi 40%, 35%, 25%".
  const pcts = [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map(m => Number(m[1].replace(',', '.')));
  if (amounts.length === 1 && pcts.length >= 2 && /\bbagi\b|\bdibagi\b/.test(t) && Math.abs(pcts.reduce((n, p) => n + p, 0) - 100) < 0.01) {
    const total = amounts[0].value, each = pcts.map(p => Math.round(total * p / 100));
    each[0] += total - each.reduce((n, v) => n + v, 0);
    return out({ title: 'Dibagi persen', text: `${each.map(rp).join(', ')}. Jumlahnya ${rp(total)}.`, hero: { label: `${rp(total)} dibagi ${pcts.map(p => `${p}%`).join(' · ')}`, value: rp(total) }, lines: each.map((v, i) => ({ label: `${pcts[i]}%`, value: rp(v) })), why: 'Tiap bagian = total dikali persennya; selisih pembulatan masuk ke bagian pertama.', number: each[0] });
  }
  // A total discount shared out by value: "belanja 100rb dan 50rb, diskon total 30rb dibagi proporsional".
  const prop = t.match(new RegExp(String.raw`(?:diskon|potongan)(?:\s+total)?\s+(${AMT}).*\bproporsional\b|\bproporsional\b.*(?:diskon|potongan)(?:\s+total)?\s+(${AMT})`));
  if (prop && amounts.length >= 3) {
    const off = value(prop[1] || prop[2]), items = amounts.filter(a => a.value !== off).map(a => a.value), sum = items.reduce((n, v) => n + v, 0);
    const cuts = items.map(v => Math.round(off * v / sum)); cuts[0] += off - cuts.reduce((n, v) => n + v, 0);
    return out({ title: 'Diskon proporsional', text: items.map((v, i) => `Barang ${i + 1}: diskon ${rp(cuts[i])}, jadi ${rp(v - cuts[i])}`).join('. ') + '.', hero: { label: `Diskon ${rp(off)} dari ${rp(sum)}`, value: rp(sum - off) }, lines: items.map((v, i) => ({ label: `${rp(v)} − ${rp(cuts[i])}`, value: rp(v - cuts[i]) })), why: 'Diskon dibagi sesuai besar tiap harga: bagian diskon = diskon × harga ÷ total harga.', number: sum - off });
  }
  // Even parts to the rupiah: "patungan 10rb untuk 3 orang", "100rb dibagi tiga orang".
  const even = t.match(new RegExp(String.raw`(${AMT})\s*(?:di)?(?:bagi|untuk|buat|utk)\s+(?:rata\s+)?(?:ke\s+)?${NUM}\s*orang`));
  if (even && amounts.length === 1 && !/\b(?:gue|aku|saya|gw)\s+(?:bayar|bayarin|nalangin)\b/.test(t)) {
    const total = amounts[0].value, n = count(even[2]);
    if (n >= 2 && n <= 20) {
      const each = parts(total, n);
      return out({ title: `Dibagi ${n} orang`, text: `${each.map(rp).join(', ')}. Total tetap ${rp(total)}.`, hero: { label: `${rp(total)} ÷ ${n}`, value: `${rp(each[n - 1])}/orang` }, lines: each.map((v, i) => ({ label: `Orang ${i + 1}`, value: rp(v) })), why: `${rp(total)} dibagi ${n}. ${total % n ? `Sisa ${rp(total - Math.floor(total / n) * n)} dibagikan satu rupiah ke orang pertama${total % n > 1 ? ' dan seterusnya' : ''}.` : 'Habis dibagi rata.'}`, number: each[n - 1], chips: [`catat bagianku ${Math.round(each[0] / 1000) === each[0] / 1000 ? `${each[0] / 1000}rb` : rp(each[0])}`] });
    }
  }
  // The price before tax: "harganya udah include ppn 11%, totalnya 111rb, aslinya berapa?".
  const incl = t.match(new RegExp(String.raw`(?:include|termasuk|incl)\s+(?:ppn|pajak|tax|pb1)\s+(\d+(?:[.,]\d+)?)\s*%`));
  if (incl && amounts.length === 1 && ASK.test(t)) {
    const p = Number(incl[1].replace(',', '.')), total = amounts[0].value, base = Math.round(total / (1 + p / 100));
    return out({ title: 'Sebelum pajak', text: `Harga sebelum pajak ${rp(base)}, pajaknya ${rp(total - base)}.`, hero: { label: `${rp(total)} ÷ ${(1 + p / 100).toLocaleString('id-ID')}`, value: rp(base) }, lines: [{ label: 'Dasar', value: rp(base) }, { label: `Pajak ${p}%`, value: rp(total - base) }], why: `Kalau tarif ${p}% dikenakan pada harga dasar, harga dasar = total ÷ (1 + ${p}%).`, number: base });
  }
  // A sum of things bought: "3 kopi @18rb sama roti 12rb berapa?", "kalau makan 35rb sama parkir 3rb total berapa?",
  // "tas 400rb diskon 25% terus diskon lagi 10%, jadi berapa?", "beli 2 gratis 1, satuannya 15rb, bayar berapa?".
  if (amounts.length && /\b(?:berapa|brp|brapa)\b/.test(t) && !/\b(?:pengeluaran|pemasukan|saldo|sisa anggaran|habis berapa kali|berapa kali)\b/.test(t)) {
    const body = t.replace(/^(?:kalau|kalo|klo|misal(?:nya)?|coba)\s+/, '').replace(/\s*,?\s*(?:total(?:nya)?|jadi(?:nya)?|semua(?:nya)?|bayar(?:nya)?)?\s*(?:jadi\s+)?(?:berapa|brp|brapa)\s*(?:ya|sih|dong)?\s*\??$/, '').replace(/\s*\?$/, '').trim();
    let plan: ReturnType<typeof parseQuickPlan> | null = null;
    try { plan = parseQuickPlan(body, ctx); } catch { plan = null; }
    const acts = plan?.actions || [];
    if (acts.length && acts.every(a => a.result.kind === 'expense' && a.result.amount > 0)) {
      const total = acts.reduce((n, a) => n + a.result.amount, 0);
      const lines = acts.map(a => ({ label: a.result.preset.description || 'Barang', value: rp(a.result.amount) }));
      const calc = acts.length === 1 ? acts[0].result.calc : undefined;
      return out({ title: 'Total', text: acts.length > 1 ? `Totalnya ${rp(total)}.` : `Jadinya ${rp(total)}.`, hero: { label: calc || acts.map(a => rp(a.result.amount)).join(' + '), value: rp(total) }, lines: acts.length > 1 ? lines : undefined, why: acts.map(a => `${a.result.preset.description || 'Barang'}: ${a.result.calc ? `${a.result.calc} = ` : ''}${rp(a.result.amount)}`).join('. ') + '.', number: total, plan: body, chips: ['catat', 'catat pakai tunai'] });
    }
  }
  return null;
}
