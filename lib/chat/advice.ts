/**
 * 10.0 Asisten 3.0 — advice for real life, and the feature that fits, worked out from the person's own records where it
 * can be: money left until payday turned into a daily amount, a salary split 50/30/20 in rupiah, an emergency fund sized
 * from their own monthly spending, where the money went, too many treats (with an offer to set a budget), subscriptions,
 * investing basics (never a product to buy), impulse buying, and the app's own help for forgetting to record or for typing
 * too much (Pengingat, Scan struk, Impor mutasi, Catat otomatis).
 */
import { findAmounts } from '../quick-entry.ts';
import type { Data } from '../types';
import { vo } from './fun.ts';
import type { Voice } from './voice.ts';

export type Advice = { title: string; text: string; steps?: string[]; chips?: string[]; open?: { view: string; label: string; target?: string }; offer?: string; tone?: 'good' | 'warn' | 'info' };
type AdviceData = Pick<Data, 'categories' | 'transactions' | 'receivables' | 'funds'> & Partial<Pick<Data, 'recurring'>>;
type Ctx = { data: AdviceData; today: string; cycle: { start: string; end: string } };

const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const days = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 864e5);

/** Spending per main category in a window, biggest first. */
function byCategory(ctx: Ctx, start: string, end: string) {
  const by = new Map<string, number>();
  for (const x of ctx.data.transactions) {
    if (x.type !== 'expense' || x.date < start || x.date >= end) continue;
    const c = ctx.data.categories.find(k => k.id === x.categoryId); const name = c?.name || 'Lainnya';
    by.set(name, (by.get(name) || 0) + x.amount);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1]);
}
/** What a usual month costs: the last 90 days of spending, per 30 days. */
function monthly(ctx: Ctx) {
  const from = new Date(`${ctx.today}T00:00:00Z`); from.setUTCDate(from.getUTCDate() - 90);
  const start = from.toISOString().slice(0, 10);
  let total = 0, first = ctx.today;
  for (const x of ctx.data.transactions) if (x.type === 'expense' && x.date >= start && x.date <= ctx.today) { total += x.amount; if (x.date < first) first = x.date; }
  return total / Math.max(30, days(first, ctx.today) + 1) * 30;
}
const TREAT_WORDS: [RegExp, string, RegExp][] = [
  [/\b(?:jajan|ngemil|cemilan|snack)\b/, 'jajan', /jajan/i], [/\b(?:kopi|ngopi|coffee)\b/, 'kopi', /kopi/i], [/\bboba\b/, 'boba', /boba|minuman/i],
  [/\b(?:nongkrong|hangout)\b/, 'nongkrong', /nongkrong/i], [/\b(?:checkout|belanja\s+online|shopee|tokopedia)\b/, 'belanja online', /belanja|marketplace/i],
  [/\b(?:gofood|grabfood|pesan\s+antar|delivery)\b/, 'pesan antar', /delivery|pesan antar/i],
];

/** Feelings said with it ("duitku abis terus nih sedih"): the chat listens first (the mood reply), advice can follow. */
const FEELING = /\b(?:sedih|stres|stress|pusing|puyeng|galau|capek|cape|nangis|kesel|sebel|takut|panik|cemas|bete|huhu|hiks|frustasi|depresi|nyesel)\b/;
/** Another period than this pay cycle ("uangku agustus lari ke mana"): answered by the question engine for that period. */
const OTHER_PERIOD = /\b(?:januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|bulan\s+(?:lalu|kemarin)|minggu\s+(?:lalu|kemarin)|tahun\s+(?:ini|lalu|kemarin)|kemarin|tahun\s+\d{4})\b/;
export function readAdvice(t: string, ctx: Ctx, v: Voice): Advice | null {
  const a = findAmounts(t).filter(x => x.value > 0)[0];
  // Money left until payday: "uang tinggal 300rb sampai gajian gimana", "duit tinggal 150rb masih 9 hari lagi gajian".
  if (a && /\b(?:uang|duit|saldo|dana)\w*\s+(?:aku\s+|gue\s+|ku\s+)?(?:tinggal|sisa|cuma|cuman|tersisa|tinggal\s+cuma)\b/.test(t) && /\b(?:gajian|gaji|sampai|sampe|hari|akhir\s+bulan|minggu)\b/.test(t)) {
    const said = t.match(/\b(\d{1,2})\s*hari\b/), left = said ? Number(said[1]) : Math.max(1, days(ctx.today, ctx.cycle.end));
    const each = Math.floor(a.value / left / 500) * 500;
    return { title: 'Bertahan sampai gajian', tone: 'warn', text: vo(v, {
      santai: `${rp(a.value)} untuk ${left} hari berarti sekitar ${rp(each)} per hari. Bisa kok, asal dijaga:`,
      sopan: `${rp(a.value)} untuk ${left} hari berarti sekitar ${rp(each)} per hari. Beberapa langkah yang bisa membantu:`,
      singkat: `${rp(each)} per hari selama ${left} hari.`,
      gaul: `${rp(a.value)} buat ${left} hari = ${rp(each)} sehari. Masih bisa, asal disiplin:`,
      barbar: `${rp(a.value)} buat ${left} hari = ${rp(each)} sehari, bos. Puasa gaya hidup dulu:`,
    }), steps: v === 'singkat' ? undefined : ['Prioritaskan makan, transport kerja, dan tagihan yang jatuh tempo.', 'Masak atau bawa bekal; jajan dan pesan antar dipending dulu.', 'Cek apa ada piutang yang bisa ditagih atau barang yang bisa dijual.', 'Catat semuanya biar sisa per harinya kelihatan.'], chips: ['sisa uang bebas berapa', 'siapa yang belum bayar'] };
  }
  // A salary split: "gaji 5jt idealnya dibagi gimana" → 50/30/20 in rupiah.
  if (a && /\b(?:gaji|penghasilan|pendapatan|income|uang\s+bulanan)(?:ku|mu|nya)?\b/.test(t) && /\b(?:dibagi|bagi|bagiin|alokasi|alokasiin|atur|ngatur|pembagian|split|pos)\b/.test(t)) {
    const need = a.value * 0.5, want = a.value * 0.3, save = a.value * 0.2;
    return { title: 'Bagi gaji 50/30/20', text: vo(v, {
      santai: `Pakai patokan 50/30/20 buat ${rp(a.value)}:`, sopan: `Dengan patokan 50/30/20 untuk ${rp(a.value)}:`, singkat: `50/30/20 dari ${rp(a.value)}:`, gaul: `Pake rumus 50/30/20 buat ${rp(a.value)}:`,
    }), steps: [`Kebutuhan (makan, kos, transport, tagihan): ${rp(need)}`, `Keinginan (jajan, nongkrong, hiburan): ${rp(want)}`, `Tabungan & dana darurat: ${rp(save)}, disisihkan di awal begitu gajian`, 'Kalau cicilan atau kos makan porsi besar, kurangi pos keinginan dulu, bukan tabungan.'], chips: ['budgeting baru', 'mau bikin tabungan'] };
  }
  // An emergency fund: how big, from the person's own monthly spending.
  // ("dana darurat aku brp" asks how much is in the fund: the fund itself answers that.)
  if (/\bdana\s+darurat\b/.test(t) && (/\b(?:ideal|idealnya|aman|cukup|seharusnya|harusnya|sebaiknya|minimal|perlu|butuh)\b/.test(t) || /\bberapa\b/.test(t) && !/\bdana\s+darurat(?:ku|\s+(?:aku|ku|gue|gw|saya|kamu|sekarang|udah|sudah))\b/.test(t)) && !/\b(?:kurang|terkumpul|udah\s+berapa|progres|kapan\s+(?:kekumpul|tercapai))\b/.test(t)) {
    const m = monthly(ctx), fund = ctx.data.funds.find(f => /darurat/i.test(f.name));
    return { title: 'Dana darurat ideal', text: vo(v, {
      santai: `Patokannya 3–6 kali pengeluaran bulanan. Pengeluaranmu sekitar ${rp(m)} sebulan, jadi dana daruratmu idealnya ${rp(m * 3)} sampai ${rp(m * 6)}. Lajang dan kerja tetap cukup 3×; punya tanggungan atau penghasilan nggak tetap, 6× ke atas.`,
      sopan: `Patokannya 3–6 kali pengeluaran bulanan. Dengan pengeluaran sekitar ${rp(m)} per bulan, dana darurat ideal Anda ${rp(m * 3)} hingga ${rp(m * 6)}.`,
      singkat: `3–6× pengeluaran bulanan: ${rp(m * 3)}–${rp(m * 6)}.`,
      gaul: `Rumusnya 3–6 kali pengeluaran bulanan. Lo abis sekitar ${rp(m)} sebulan, jadi idealnya ${rp(m * 3)}–${rp(m * 6)}.`,
    }) + (fund ? ` ${vo(v, { santai: `Tujuan dana “${fund.name}” sekarang ${rp(fund.currentAmount || 0)}.`, sopan: `Tujuan dana “${fund.name}” saat ini ${rp(fund.currentAmount || 0)}.`, singkat: `Sekarang ${rp(fund.currentAmount || 0)}.`, gaul: `Tujuan dana “${fund.name}” lo sekarang ${rp(fund.currentAmount || 0)}.` })}` : ''),
    chips: fund ? ['progres dana darurat', 'tips nabung'] : ['mau bikin tabungan', 'tips nabung'], open: { view: 'funds', label: 'Buka Tujuan dana' } };
  }
  // "aku boros banget ya", "kayaknya aku boros deh": the numbers first, then where to start.
  if (!a && !/\b(?:hari\s+apa|kapan|tanggal|minggu|bulan|hari\s+ini|kemarin|jam|di\s*mana|dimana|kenapa|knp|apa)\b/.test(t) && (/\b(?:aku|gue|gw|saya)\s+(?:(?!paling\b)\w+\s+)?(?:boros|terlalu\s+boros|kebanyakan\s+keluar)\b|\bboros\s+(?:banget|bgt|parah|amat)\b/.test(t)) && !/\b(?:ga|gak|nggak|ngga|enggak|tidak)\s*(?:sih|ya)?\s*$|\b(?:boros|hemat)\s+(?:ga|gak|nggak|ngga)\b/.test(t)) {
    const rows = byCategory(ctx, ctx.cycle.start, ctx.cycle.end), total = rows.reduce((n, [, x]) => n + x, 0), passed = Math.max(1, days(ctx.cycle.start, ctx.today) + 1), usual = monthly(ctx);
    const pace = total / passed * 30, top = rows[0];
    const verdict = usual && pace > usual * 1.1 ? 'lebih cepat dari biasanya' : usual && pace < usual * 0.9 ? 'masih lebih hemat dari biasanya' : 'kurang lebih seperti biasanya';
    return { title: 'Seberapa boros?', tone: pace > usual * 1.1 ? 'warn' : 'info', text: vo(v, {
      santai: `Siklus ini kamu udah keluar ${rp(total)} dalam ${passed} hari, ${verdict}.${top ? ` Paling banyak di ${top[0]} (${rp(top[1])}).` : ''} Mau mulai dari situ?`,
      sopan: `Pada siklus ini pengeluaran Anda ${rp(total)} dalam ${passed} hari, ${verdict}.${top ? ` Terbesar di ${top[0]} (${rp(top[1])}).` : ''}`,
      singkat: `${rp(total)} dalam ${passed} hari, ${verdict}.`,
      gaul: `Siklus ini lo udah abis ${rp(total)} dalam ${passed} hari, ${verdict}.${top ? ` Paling banyak di ${top[0]} (${rp(top[1])}).` : ''} Mulai rem dari situ?`,
      barbar: `${rp(total)} ludes dalam ${passed} hari, bos, ${verdict}.${top ? ` Juaranya ${top[0]} (${rp(top[1])}).` : ''} Rem dari situ dulu.`,
    }), chips: ['kasih tips hemat', 'budgeting baru', 'pengeluaran terbesar bulan ini'] };
  }
  // Forgetting to record: Pengingat harian and the Arena streak.
  if (/\b(?:lupa|kelupaan|kelupa|ga\s+inget|nggak\s+inget|suka\s+lupa)\b/.test(t) && /\b(?:catat|nyatet|nyatat|mencatat|ngisi|input|nyatet\w*|pengeluaran|transaksi)\b/.test(t)) return { title: 'Biar nggak lupa nyatet', text: vo(v, {
    santai: 'Nyalakan Pengingat harian di Pengaturan → Pengingat: tiap malam aku ingetin kalau hari itu belum ada catatan. Ditambah api di Arena Catat, biar seru jaga streak-nya.',
    sopan: 'Silakan aktifkan Pengingat harian di Pengaturan → Pengingat: setiap malam Anda akan diingatkan bila belum mencatat. Streak di Arena Catat juga membantu menjaga kebiasaan.',
    singkat: 'Pengaturan → Pengingat: nyalakan pengingat harian.',
    gaul: 'Nyalain Pengingat harian di Pengaturan → Pengingat, tiap malem gue colek kalau belum nyatet. Plus jaga api streak di Arena Catat biar seru.',
  }), open: { view: 'settings', label: 'Buka Pengingat', target: 'reminders' }, chips: ['males ngetik satu-satu', 'arena catat'] };
  // Typing every record is too much: one sentence for many, Scan struk, Impor mutasi.
  if (/\b(?:males|malas|mager|ribet|repot|capek|cape|lama)\b/.test(t) && /\b(?:ngetik|ketik|nyatet|nyatat|catat|input|satu[\s-]?satu|nulis)\b/.test(t)) return { title: 'Nyatet lebih cepat', text: vo(v, {
    santai: 'Ada tiga jalan pintas:', sopan: 'Ada tiga cara yang lebih cepat:', singkat: 'Tiga cara cepat:', gaul: 'Ada tiga jalan pintas nih:',
  }), steps: ['Tulis beberapa sekaligus dalam satu pesan: “kopi 20rb, parkir 5rb, makan siang 35rb pakai gopay”.', 'Scan struk: foto struknya, barang dan totalnya kebaca sendiri.', 'Impor mutasi: unggah mutasi bank/e-wallet (CSV, Excel, PDF), semua baris masuk sekaligus.'], chips: ['kopi 20rb, parkir 5rb', 'foto struk aja bisa?'], open: { view: 'inbox', label: 'Buka Impor mutasi' } };
  // Paying for friends or lending: Piutang and Split Bill.
  if (/\b(?:bayarin|bayarain|nalangin|talangin|nombokin|minjemin|ngutangin|minjamin)\b.*\b(?:temen|teman|kawan|orang)\b|\b(?:temen|teman|kawan)\w*\b.*\b(?:minjem|minjam|ngutang|pinjam|pinjem|utang|hutang)\b/.test(t) && !a) {
    const open = ctx.data.receivables.filter(r => r.status !== 'paid' && r.remainingAmount > 0), owed = open.reduce((n, r) => n + r.remainingAmount, 0);
    return { title: 'Uang yang dipinjam teman', text: vo(v, {
      santai: `Catat sebagai piutang biar nggak lupa siapa yang belum bayar${open.length ? ` (sekarang ${open.length} orang, total ${rp(owed)})` : ''}. Kalau bayarnya patungan, pakai Split Bill: bagian tiap orang langsung jadi piutang.`,
      sopan: `Silakan dicatat sebagai piutang${open.length ? ` (saat ini ${open.length} orang, total ${rp(owed)})` : ''}. Untuk tagihan bersama, gunakan Split Bill.`,
      singkat: `Catat jadi piutang${open.length ? ` (${rp(owed)} belum kembali)` : ''}. Patungan: Split Bill.`,
      gaul: `Catet jadi piutang biar nggak lupa siapa yang belum balikin${open.length ? ` (sekarang ${open.length} orang, ${rp(owed)})` : ''}. Kalau patungan, pake Split Bill.`,
    }), chips: ['siapa yang belum bayar', 'minjemin andi 100rb'], open: { view: 'receivables', label: 'Buka Piutang' } };
  }
  // Where the money went: the biggest categories this pay cycle.
  if (/\b(?:uang|duit)\w*\s+(?:\w+\s+)?(?:lari|pergi|kabur|kemana|ke\s+mana|abis\s+(?:buat|kemana|ke\s+mana)|habis\s+(?:buat|kemana))\b|\b(?:cepet|cepat)\s+(?:banget\s+|bgt\s+|amat\s+)?(?:abis|habis|ludes)(?:nya)?\b|\b(?:ludes|abis|habis)\s+(?:mulu|terus|melulu)\b|\bkemana\s+aja\s+(?:uang|duit)\b/.test(t) && !OTHER_PERIOD.test(t) && !FEELING.test(t)) {
    const top = byCategory(ctx, ctx.cycle.start, ctx.cycle.end).slice(0, 3), total = byCategory(ctx, ctx.cycle.start, ctx.cycle.end).reduce((n, [, x]) => n + x, 0);
    return { title: 'Uangmu ke mana', text: top.length ? vo(v, {
      santai: 'Siklus ini paling banyak lari ke sini (kategori terbesar):', sopan: 'Pada siklus ini pengeluaran terbesar ada di kategori berikut:', singkat: 'Kategori terbesar siklus ini:', gaul: 'Siklus ini duit lo paling banyak kabur ke sini:',
    }) : 'Belum ada pengeluaran di siklus ini.', steps: top.map(([name, x]) => `${name}: ${rp(x)} (${Math.round(x / total * 100)}%)`), chips: ['kasih tips hemat', 'budgeting baru'], open: { view: 'analytics', label: 'Buka Analisis' } };
  }
  // Subscriptions piling up.
  if (/\b(?:langganan|streaming|subscription|subscriptions)\b/.test(t) && /\b(?:banyak|numpuk|kebanyakan|mahal|bengkak|boros|berat)\b/.test(t)) {
    const subs = ctx.data.categories.filter(c => /langganan/i.test(c.name)).map(c => c.id), ids = new Set([...subs, ...ctx.data.categories.filter(c => subs.includes(c.parentId || '')).map(c => c.id)]);
    let spent = 0; for (const x of ctx.data.transactions) if (x.type === 'expense' && x.date >= ctx.cycle.start && x.date < ctx.cycle.end && (ids.has(x.categoryId || '') || ids.has(x.subcategoryId || ''))) spent += x.amount;
    const rec = (ctx.data.recurring || []).filter(r => /netflix|spotify|youtube|disney|vidio|prime|langganan|icloud|google|apple|canva|chatgpt/i.test(r.name || ''));
    return { title: 'Langganan numpuk', text: vo(v, {
      santai: `Langganan siklus ini ${rp(spent)}${rec.length ? `, dengan ${rec.length} jadwal rutin` : ''}. Coba cek satu-satu: yang sebulan terakhir nggak dibuka, berhentikan dulu. Sisanya pasang di Jadwal rutin biar tagihannya kelihatan sebelum jatuh tempo.`,
      sopan: `Pengeluaran langganan siklus ini ${rp(spent)}. Sebaiknya hentikan langganan yang tidak dipakai sebulan terakhir, dan catat sisanya di Jadwal rutin.`,
      singkat: `Langganan: ${rp(spent)}. Hentikan yang jarang dipakai.`,
      gaul: `Langganan lo siklus ini ${rp(spent)}. Yang sebulan nggak dibuka, stop aja dulu. Sisanya taruh di Jadwal rutin.`,
    }), chips: ['langganan apa aja', 'bikin jadwal rutin'], open: { view: 'recurring', label: 'Buka Jadwal rutin' } };
  }
  // Investing: the basics, never a product.
  if (/\b(?:investasi|invest|investing|saham|reksa\s*dana|reksadana|deposito|obligasi|sbn|crypto|kripto|bitcoin)\b/.test(t) && /\b(?:apa|mending|atau|bagus|cocok|gimana|bagaimana|mulai|pemula|aman|untung|pilih|mana)\b/.test(t) && !a) return { title: 'Mulai investasi', text: vo(v, {
    santai: 'Aku nggak bisa nyaranin produk tertentu, tapi urutan amannya begini:', sopan: 'Saya tidak dapat menyarankan produk tertentu, namun urutan yang aman sebagai berikut:', singkat: 'Bukan saran produk. Urutannya:', gaul: 'Gue nggak bisa nyaranin produk, tapi urutan amannya gini:',
  }), steps: ['Dana darurat dulu (3–6× pengeluaran bulanan), simpan di tempat yang gampang dicairkan.', 'Butuh dalam 1–3 tahun: reksa dana pasar uang atau deposito (risiko rendah).', 'Jangka menengah: obligasi/SBN atau reksa dana pendapatan tetap.', 'Jangka panjang (5 tahun+): saham atau reksa dana indeks, siap nilainya naik-turun.', 'Cek izin OJK, jangan tergiur untung pasti, dan mulai kecil dulu.'], chips: ['dana darurat idealnya berapa', 'mau bikin tabungan'] };
  // Impulse buying.
  if (/\b(?:impulsif|impulsive|laper\s+mata|lapar\s+mata|kalap|khilaf\s+belanja|boros\s+belanja|checkout\s+terus|gampang\s+(?:tergoda|kegoda)|tergoda\s+diskon)\b/.test(t)) return { title: 'Biar nggak kalap belanja', text: vo(v, {
    santai: 'Beberapa trik yang ampuh:', sopan: 'Beberapa cara yang efektif:', singkat: 'Triknya:', gaul: 'Trik yang ampuh nih:',
  }), steps: ['Aturan 24 jam: masukkan dulu ke Wish list, beli besok kalau masih pengen.', 'Hapus kartu dan paylater yang tersimpan di aplikasi belanja.', 'Matikan notifikasi promo dan flash sale.', 'Pasang anggaran Belanja, cek sisanya sebelum checkout.'], chips: ['budgeting baru', 'buka wish list'], open: { view: 'wishlist', label: 'Buka Wish list' } };
  // Keeping at it: reminders and the streak.
  if (/\b(?:disiplin|konsisten|rajin|istiqomah|rutin|terbiasa|kebiasaan)\b/.test(t) && /\b(?:catat|nyatet|nyatat|mencatat|keuangan|tiap\s+hari)\b/.test(t) && !a) return { title: 'Biar konsisten nyatet', text: vo(v, {
    santai: 'Bikin jadi kebiasaan kecil:', sopan: 'Jadikan kebiasaan kecil:', singkat: 'Caranya:', gaul: 'Bikin jadi kebiasaan kecil:',
  }), steps: ['Nyalakan Pengingat harian (Pengaturan → Pengingat).', 'Jaga api streak di Arena Catat: tiap hari nyatet, apinya tetap nyala.', 'Catat langsung setelah bayar, cukup satu kalimat di chat.', 'Seminggu sekali buka Laporan, biar kelihatan hasilnya.'], chips: ['arena catat', 'ringkasan bulan ini'], open: { view: 'settings', label: 'Buka Pengingat', target: 'reminders' } };
  // Too many treats: how many and how much this cycle, and an offer to set a budget for it.
  const treat = /\b(?:kebanyakan|terlalu\s+(?:banyak|sering)|keseringan|sering\s+banget)\b/.test(t) || /\b(?:terus|mulu|melulu|tiap\s+hari|tiap\s+hari)\b/.test(t) ? TREAT_WORDS.find(([re]) => re.test(t)) : undefined;
  if (treat && !a) {
    const [, word, like] = treat;
    const ids = new Set(ctx.data.categories.filter(c => like.test(c.name)).map(c => c.id));
    let n = 0, sum = 0; for (const x of ctx.data.transactions) if (x.type === 'expense' && x.date >= ctx.cycle.start && x.date < ctx.cycle.end && (ids.has(x.subcategoryId || '') || ids.has(x.categoryId || '') || like.test(x.description || ''))) { n++; sum += x.amount; }
    return { title: `${word.charAt(0).toUpperCase()}${word.slice(1)} siklus ini`, tone: 'warn', text: n ? vo(v, {
      santai: `Siklus ini ${word} ${n} kali, total ${rp(sum)}. Pasang anggaran ${word} biar ada remnya? Atau coba kurangi jadi 2–3 kali seminggu.`,
      sopan: `Pada siklus ini ${word} tercatat ${n} kali, total ${rp(sum)}. Bagaimana bila dibuatkan anggaran ${word}?`,
      singkat: `${n}× ${word}, ${rp(sum)}. Pasang anggaran?`,
      gaul: `Siklus ini lo ${word} ${n} kali, ${rp(sum)}. Pasang anggaran ${word} yuk biar ada remnya.`,
      barbar: `${n} kali ${word} siklus ini, ${rp(sum)}, bos! Pasang anggaran ${word} sekarang juga.`,
    }) : vo(v, { santai: `Belum ada catatan ${word} siklus ini. Mau pasang anggaran ${word} dari sekarang?`, sopan: `Belum ada catatan ${word} pada siklus ini. Ingin membuat anggaran ${word}?`, singkat: `Belum tercatat. Pasang anggaran ${word}?`, gaul: `Belum ada catatan ${word} siklus ini. Pasang anggaran ${word} dari sekarang?` }),
    chips: [`bikin anggaran ${word}`, 'kasih tips hemat'], offer: `bikin anggaran ${word}` };
  }
  // Saving for something: pay yourself first, and a tujuan dana.
  const goal = t.match(/\b(?:tips|cara|gimana|bagaimana|biar\s+bisa|bingung)\b.*\b(?:nabung|menabung|ngumpulin\s+(?:uang|duit))\b(?:.*\b(?:buat|untuk|utk)\s+(?:beli\s+)?([\p{L} ]{2,24}))?/u)
    || (/\b(?:nabung|menabung)\b.*\b(?:bingung|mulai\s+dari\s+mana|gimana\s+caranya|caranya)\b/.test(t) ? ([t] as unknown as RegExpMatchArray) : null);
  if (goal) {
    const what = goal[1]?.trim();
    return { title: what ? `Nabung buat ${what}` : 'Tips nabung', text: vo(v, {
      santai: `${what ? `Buat ${what}, k` : 'K'}uncinya nabung di awal, bukan dari sisa:`, sopan: `${what ? `Untuk ${what}, k` : 'K'}uncinya menabung di awal, bukan dari sisa:`, singkat: 'Nabung di awal, bukan dari sisa:', gaul: `${what ? `Buat ${what}, k` : 'K'}uncinya nabung duluan, bukan dari sisa:`,
    }), steps: ['Tentukan target dan tenggatnya, lalu bikin tujuan dana: per bulannya langsung kelihatan.', 'Begitu gajian, transfer dulu ke rekening/kantong tabungan (10–20% gaji).', 'Pisahkan rekening tabungan dari rekening jajan.', 'Pasang anggaran untuk kategori terbesarmu biar ada sisa yang bisa ditabung.'], chips: [what ? `mau nabung buat ${what}` : 'mau bikin tabungan', 'budgeting baru'], offer: what ? `mau nabung buat ${what}` : 'mau bikin tabungan' };
  }
  return null;
}
