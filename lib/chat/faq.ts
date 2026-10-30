/**
 * 7.9 What the chat answers in words, from the training document: what things mean in the app ("budget sama saldo beda
 * apa?", "arsip dompet itu apa?"), what it can and cannot do ("transferin ke Dika sekarang", "bikinin jadwal lewat chat"),
 * money that is not money yet ("Bimo bilang besok bakal lunasin", "ajuin refund", "cashback koin"), someone else's purchase,
 * and asking back when a word could mean two things ("pake Joni", "pake sisanya"). Nothing here records anything; a few
 * answers hand a question or a card to Catat otomatis (`plan`).
 */
import { effects, metrics, transactionExpense } from '../accounting.ts';
import { suggestCategory } from '../categorize.ts';
import { findAmounts, walletsIn } from '../quick-entry.ts';
import type { Data } from '../types';
import type { ChatContext, ChatMemory, SayLine } from './engine.ts';

export type FaqAnswer = {
  intent: 'faq' | 'clarify' | 'payday' | 'question' | 'plan';
  text?: string; title?: string; chips?: string[]; lines?: SayLine[]; tone?: 'good' | 'warn' | 'info'; note?: string;
  /** A sentence handed to Catat otomatis instead (a question to answer, or a card). */ plan?: string; intro?: string;
  memory?: Partial<ChatMemory>;
};

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dm = (s: string) => D(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const amountOf = (t: string) => findAmounts(t).find(a => a.value > 0);
const PEOPLE = String.raw`(?:temen|teman|kawan|sahabat|adik|adek|kakak|abang|om|tante|bos|atasan|tetangga|sepupu|pacar)(?:\s+(?:gue|gw|aku|saya|ku))?`;
const FAMILY = /^(?:mama|mamah|mami|papa|papah|papi|ibu|bapak|ayah|bunda|kakak|kak|abang|adik|adek|om|tante|nenek|kakek|mertua|pacar|suami|istri)$/;

/** Spending of one thing (or all of it) from the 1st to today, this month and the same days last month. */
export function compareMonths(ctx: ChatContext, subject?: string) {
  const [y, m, d] = ctx.today.split('-').map(Number);
  const start = iso(new Date(Date.UTC(y, m - 1, 1))), end = iso(new Date(Date.UTC(y, m - 1, d + 1)));
  const prevStart = iso(new Date(Date.UTC(y, m - 2, 1))), prevLast = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const prevEnd = iso(new Date(Date.UTC(y, m - 2, Math.min(d, prevLast) + 1)));
  const guess = subject ? suggestCategory({ text: subject, item: subject, amount: 20000, type: 'expense' }, { categories: ctx.data.categories, history: [] }) : null;
  const catId = guess?.subcategoryId || guess?.categoryId;
  const matches = (t: Data['transactions'][number]) => !subject || (catId ? t.categoryId === catId || t.subcategoryId === catId : false) || lower(`${t.description} ${t.merchant} ${t.notes}`).includes(lower(subject));
  const sum = (a: string, b: string) => ctx.data.transactions.filter(t => t.date >= a && t.date < b && matches(t)).reduce((n, t) => n + transactionExpense(t), 0);
  const now = sum(start, end), before = sum(prevStart, prevEnd);
  const label = catId ? ctx.data.categories.find(c => c.id === catId)?.name || subject : subject;
  return { now, before, label, range: `1–${d}`, monthNow: D(start).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' }), monthBefore: D(prevStart).toLocaleDateString('id-ID', { month: 'short', timeZone: 'UTC' }) };
}
export function compareAnswer(ctx: ChatContext, subject?: string): FaqAnswer {
  const c = compareMonths(ctx, subject), d = c.now - c.before, what = c.label ? `untuk ${c.label}` : '';
  const verdict = !c.before && !c.now ? 'Dua-duanya belum ada catatan.' : !c.before ? `Bulan lalu di rentang yang sama belum ada catatan${what ? ` ${what}` : ''}.` : d > 0 ? `Lebih boros ${rp(d)} (${Math.round(d / c.before * 100)}%).` : d < 0 ? `Lebih hemat ${rp(-d)} (${Math.round(-d / c.before * 100)}%).` : 'Sama persis.';
  return { intent: 'faq', title: 'Dibandingkan bulan lalu', text: `Dibandingkan di rentang hari yang setara${what ? ` ${what}` : ''}. ${verdict}`, lines: [{ label: `${c.range} ${c.monthNow}`, value: rp(c.now) }, { label: `${c.range} ${c.monthBefore}`, value: rp(c.before) }], chips: subject ? [`pengeluaran ${subject} bulan ini berapa`] : ['ringkasan bulan ini'], memory: { topic: 'compare', subject } };
}

/** Why balances went down without spending: money moved out that is not spending, this pay period. */
function balanceDown(ctx: ChatContext): FaqAnswer {
  const kinds: [string, (t: Data['transactions'][number]) => boolean][] = [
    ['Pindah ke dompet lain', t => t.type === 'transfer'], ['Bayar utang', t => t.type === 'debt_payment'], ['Meminjamkan ke orang', t => t.type === 'receivable_issue'],
    ['Talangan kantor', t => t.type === 'claim_advance'], ['Penyesuaian saldo', t => t.type === 'adjustment' && (t as { adjustmentDirection?: string }).adjustmentDirection === 'out'],
  ];
  const txs = ctx.data.transactions.filter(t => t.date >= ctx.cycle.start && t.date < ctx.cycle.end);
  const lines = kinds.map(([label, test]) => ({ label, value: txs.filter(test).reduce((n, t) => n + Math.max(0, -Object.values(effects(t)).filter(v => v < 0).reduce((a, v) => a + v, 0) || t.amount), 0) })).filter(l => l.value > 0);
  const base = 'Saldo bisa turun tanpa belanja karena transfer keluar, talangan, bayar utang, meminjamkan uang, atau penyesuaian saldo. Bukan berarti datanya rusak.';
  return { intent: 'faq', title: 'Kenapa saldo turun?', text: lines.length ? `${base} Periode ini yang tercatat:` : `${base} Periode ini belum ada yang seperti itu; coba Periksa Data di Pengaturan → Kontrol keuangan.`, lines: lines.map(l => ({ label: l.label, value: rp(l.value) })), chips: ['ringkasan bulan ini'] };
}

type Rule = [RegExp, (m: RegExpMatchArray, t: string, ctx: ChatContext, memory: ChatMemory) => FaqAnswer | null];
const say = (text: string, chips?: string[], title?: string): FaqAnswer => ({ intent: 'faq', text, chips, title });
const ask = (text: string, chips?: string[], memory?: Partial<ChatMemory>): FaqAnswer => ({ intent: 'clarify', text, chips, memory });

const RULES: Rule[] = [
  // ——— What things mean ———
  [/\b(?:budget|anggaran|bujet)\b.*\bsaldo\b.*\b(?:beda|bedanya|perbedaan|sama aja|sama gak|sama nggak)\b|\b(?:beda|bedanya|perbedaan)\b.*\b(?:budget|anggaran|bujet)\b.*\bsaldo\b|\b(?:beda|bedanya|perbedaan)\b.*\bsaldo\b.*\b(?:budget|anggaran|bujet)\b|\bsaldo\b.*\b(?:budget|anggaran|bujet)\b.*\b(?:beda|bedanya)\b/,
    () => say('Saldo itu uang yang tercatat di dompetmu. Anggaran (budget) itu batas belanja untuk kategori dan periode tertentu. Sisa anggaran bukan uang yang dipisahkan, jadi belum tentu ada saldonya.', ['cek semua anggaran', 'saldo semua dompet berapa'], 'Anggaran vs saldo')],
  [/\b(?:budget|anggaran|bujet)\b.*\b(?:sisa|masih ada|masih banyak)\b.*\b(?:saldo|uang|duit)(?:nya)?\b.*\b(?:dikit|sedikit|tipis|kurang|habis|tinggal)\b/,
    () => say('Anggaran bukan saldo yang disisihkan otomatis. Saldo bisa terpakai untuk transfer, talangan, cicilan, atau kebutuhan di luar kategori anggaran itu.', ['ringkasan bulan ini', 'cek semua anggaran'], 'Anggaran vs saldo')],
  [/\buang keluar\b.*\b(?:beda|lebih (?:gede|besar|banyak))\b.*\bpengeluaran\b|\bpengeluaran\b.*\b(?:beda|lebih)\b.*\buang keluar\b|\b(?:total|semua)\s+uang keluar\b.*\bpengeluaran\b/,
    () => say('Uang keluar termasuk transfer ke dompet lain, talangan untuk orang atau kantor, dan bayar utang. Pengeluaran hanya belanja dan biaya milikmu sendiri, jadi angkanya bisa lebih kecil.', ['ringkasan bulan ini'], 'Uang keluar vs pengeluaran')],
  [/\b(?:rutin|jadwal rutin|transaksi rutin)\b.*\brencana\b.*\b(?:beda|bedanya)\b|\brencana\b.*\brutin\b.*\b(?:beda|bedanya)\b|\b(?:beda|bedanya)\b.*\brutin\b.*\brencana\b|\b(?:beda|bedanya)\b.*\brencana\b.*\brutin\b/,
    () => say('Rutin itu jadwal yang berulang, misalnya bayar wifi tiap tanggal 5. Rencana itu kebutuhan sekali di tanggal tertentu. Keduanya belum mengubah saldo sampai benar-benar dicatat.', ['bayar wifi 300rb tiap tanggal 5', 'rencana beli sepatu 400rb tanggal 25'], 'Rutin vs rencana')],
  [/\bklaim\b.*\b(?:beda|bedanya)\b|\b(?:beda|bedanya|perbedaan)\b.*\bklaim\b/,
    () => say('Klaim itu talangan yang nanti diganti kantor. Uangnya keluar dulu, tapi bukan beban pribadimu. Waktu klaim cair, itu penggantian, bukan penghasilan baru.', ['klaim makan meeting 180rb dari jago'], 'Klaim kantor')],
  [/\b(?:kenapa|knp|ngapain|buat apa|kok)\b.*\b(?:cek|dicek|periksa|diperiksa)\b.*\b(?:simpan|disimpan|save|nyimpen)\b|\b(?:harus|perlu)\s+(?:di)?cek\b.*\b(?:simpan|disimpan)\b/,
    () => say('Supaya nominal, tanggal, dompet, dan dampaknya ke tagihan atau utang nggak salah. Aku membaca kalimat, jadi sesekali bisa keliru; kamu yang memutuskan.', undefined, 'Kenapa dicek dulu')],
  [/\bcatat otomatis\b.*\b(?:buat apa|apa(?:an)?|ngapain|gunanya|fungsinya|itu)\b|\b(?:apa itu|fitur)\s+catat otomatis\b/,
    () => say('Catat otomatis membaca kalimat seperti “beli kopi 25rb dari GoPay”, lalu menyiapkan isian yang bisa kamu cek sebelum disimpan. Di chat ini juga sama: tulis saja seperti biasa.', ['beli kopi 25rb dari gopay'], 'Catat otomatis')],
  [/\bbisa\s+(?:nanya|tanya|bertanya|ditanya)\b.*\b(?:keuangan|uang|duit|pengeluaran|saldo|anggaran)\b/,
    () => say('Bisa. Misalnya “pengeluaran bulan ini berapa”, “saldo GoPay berapa”, “sisa anggaran makan berapa”, atau “kapan terakhir isi bensin”.', ['pengeluaran bulan ini berapa', 'saldo semua dompet berapa'], 'Tanya')],
  [/\b(?:scan|foto|baca|pindai|upload|motret)\s+(?:struk|nota|bon|receipt)\b|\bstruk\b.*\b(?:bisa|gimana|caranya|dibaca)\b/,
    () => say('Bisa. Di Catat otomatis ada tombol foto struk: struk dibaca di HP-mu dan rinciannya disiapkan. Hasilnya tetap dicek dulu, apalagi kalau fotonya buram atau totalnya nggak cocok.', undefined, 'Foto struk')],
  [/\bsplit\s*bil+\b.*\b(?:buat apa|apa|gunanya|fungsinya|itu|gimana)\b/,
    () => say('Split Bill untuk membagi tagihan dan melacak bagian tiap orang, termasuk yang baru bayar sebagian. Di chat bisa langsung, misalnya “makan 100rb aku 60rb dika 40rb”.', ['makan 100rb aku 60rb dika 40rb'], 'Split Bill')],
  [/\b(?:pisah(?:in|kan)?|misah(?:in)?|memisahkan|bedain)\b.*\b(?:uang|dana|duit)\b.*\b(?:pribadi|lain|titipan|usaha|bisnis)\b|\b(?:dana|uang)\s+titipan\b.*\b(?:dompet|pisah|bisa)\b/,
    () => say('Bisa lewat Isi dompet: buka dompetnya, lalu Pisahkan isi untuk menandai sebagian saldo sebagai milikmu yang disisihkan atau titipan orang lain. Saldo di bank tetap satu, bagiannya jadi penanda.', undefined, 'Isi dompet')],
  [/\b(?:arsip|diarsip|diarsipkan)\b.*\bdompet\b.*\b(?:apa|itu|kemana|ke mana|gimana)\b|\bdompet\b.*\b(?:arsip|diarsip|diarsipkan)\b.*\b(?:apa|itu|kemana|ke mana|gimana)\b|\barsip dompet\b/,
    () => say('Dompet yang diarsip tidak aktif dipakai dan tidak muncul di pilihan dompet, tapi riwayatnya tetap ada. Dompetnya tersimpan di bagian Arsip di halaman Dompet dan bisa dipulihkan kapan saja.', undefined, 'Arsip dompet')],
  [/\b(?:hapus|dihapus|menghapus|apus)\b.*\bdompet\b.*\b(?:riwayat|transaksi|hilang|history|ilang)\b|\bdompet\b.*\b(?:dihapus|dihapusin)\b.*\b(?:riwayat|transaksi|hilang|ilang)\b/,
    () => say('Transaksinya tetap tersimpan di riwayat; dompetnya hanya ditandai sudah dihapus. Kalau masih mungkin dipakai lagi, lebih aman diarsip.', undefined, 'Hapus dompet')],
  [/^(?:tolong\s+)?(?:arsip(?:kan|in)?|hapus(?:in|kan)?|delete|apus(?:in)?)\s+(?:dompet|wallet|rekening)\b/,
    () => ({ ...say('Arsip dan hapus dompet dilakukan di halaman Dompet: buka dompetnya, lalu pilih Arsipkan atau Hapus. Dari chat aku nggak mengubah dompet, supaya kamu bisa lihat dampaknya dulu.', ['buka dompet'], 'Dompet'), intent: 'clarify' })],
  [/\b(?:kenapa|kok|knp)\b.*\bsaldo\b.*\b(?:turun|berkurang|kurang|habis|menipis)\b|\bsaldo\b.*\b(?:turun|berkurang)\b.*\b(?:padahal|tapi)\b/, (_m, _t, ctx) => balanceDown(ctx)],
  [/\bsaldo\b.*\b(?:budget|anggaran)\b.*\b(?:berarti|jadi|artinya)\b.*\b(?:bebas|aman|boleh|bisa)\b|\b(?:budget|anggaran)\b.*\bsisa\b.*\b(?:berarti|artinya)\b.*\b(?:bebas|aman|boleh)\b/,
    () => say('Belum tentu. Sisa anggaran bukan bukti semua saldo bebas dipakai: perlu lihat uang yang disisihkan, tagihan, dan kebutuhan sampai akhir periode.', ['ringkasan bulan ini', 'kapan gajian?'], 'Belum tentu')],
  [/\b(?:baru|masih)\s+(?:tanggal|tgl)\s+(\d{1,2})\b.*\b(?:hemat|irit|boros)\b|\b(?:hemat|irit|boros)\b.*\b(?:kan|nggak|gak|ga|ya)\s*\??$/,
    (m, t) => /\b(?:bulan lalu|bulan kemarin|kemarin)\b/.test(t) && findAmounts(t).length >= 2 ? say(`Belum bisa dibandingkan langsung, karena bulan ini belum lengkap${m[1] ? ` (baru sampai tanggal ${m[1]})` : ''}. Bandingkan rentang yang setara dulu, misalnya tanggal 1–${m[1] || 'hari ini'} di kedua bulan.`, ['bulan ini lebih boros dari bulan lalu?'], 'Periode belum setara') : null],
  [/\b(?:lebih\s+)?(?:boros|hemat|irit)\b.*\b(?:dari|dibanding|daripada|ketimbang)\b.*\b(?:bulan lalu|bulan kemarin)\b|\bbandingin\b.*\bbulan lalu\b|\bbandingkan\b.*\bbulan lalu\b/,
    (_m, t, ctx, memory) => { const subject = t.match(/\b(?:bandingin|bandingkan)\s+(?!sama\b|dengan\b|bulan\b)(\p{L}+)/u)?.[1] || (memory.topic === 'overdo' ? memory.subject : undefined); return compareAnswer(ctx, subject && !/^(?:pengeluaran|belanja|uang|duit)$/.test(subject) ? subject : undefined); }],
  [/\bcukup\b.*\b(?:sampai|sampe|hingga)\s+(?:tanggal|tgl)\s+(\d{1,2})\b/, (m, _t, ctx) => {
    const day = Number(m[1]);
    if (day === ctx.salaryDay) return { intent: 'payday' };
    const [y, mo, d] = ctx.today.split('-').map(Number), target = new Date(Date.UTC(y, day > d ? mo - 1 : mo, day)), days = Math.max(1, Math.round((target.getTime() - D(ctx.today).getTime()) / 864e5));
    const free = metrics(ctx.data as Data, ctx.cycle.start, ctx.cycle.end, ctx.salaryDay, new Date(`${ctx.today}T12:00:00`)).free;
    return { intent: 'faq', title: `Sampai tanggal ${day}`, text: `Uang bebasmu ${rp(free)} untuk ${days} hari, sekitar ${rp(Math.max(0, free) / days)} per hari. Ini perkiraan dari catatan sekarang, belum termasuk tagihan yang belum dicatat.`, chips: ['kapan gajian?', 'ringkasan bulan ini'] };
  }],
  [/\bhari ini\b.*\b(?:nggak|gak|ga|belum|tidak|engga)\b.*\b(?:belanja|keluar\s+(?:duit|uang)|jajan|ngeluarin|pengeluaran)\b|\b(?:belum|nggak|gak)\s+(?:keluar|ngeluarin)\s+(?:duit|uang)\b.*\bhari ini\b/,
    () => ({ intent: 'question', plan: 'pengeluaran hari ini berapa' })],
  [/^(?:tolong\s+)?(?:cari(?:kan|in)?|tampil(?:in|kan)|tunjuk(?:in|kan))\s+(?:transaksi|catatan)?\s*(.+)$|^(?:lihat|liat)\s+transaksi\s+(.+)$/,
    (m) => { const what = (m[1] || m[2]).replace(/\b(?:dong|ya|deh|aja)\b/g, '').replace(/\s+/g, ' ').trim(); return what ? { intent: 'question', plan: `pengeluaran ${what} berapa`, memory: { topic: 'question' } } : null; }],
  [/^pengeluaran\b.*\b(?:jangan|ga|gak|nggak|tanpa)\s+(?:termasuk|masuk|ngitung|hitung)\s+transfer\b/,
    (_m, t) => { const q = t.replace(/\s*,?\s*(?:jangan|ga|gak|nggak|tanpa)\s+(?:termasuk|masuk|ngitung|hitung)\s+transfer\b/, '').replace(/\b(?:di)\s+(?=\p{L})/u, 'pakai ').replace(/\b(?:aja|saja)\b/g, '').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim(); return { intent: 'question', plan: `${q}${/\b(?:hari|minggu|bulan|tahun)\b/.test(q) ? '' : ' bulan ini'} berapa`, intro: 'Transfer antardompet memang tidak dihitung sebagai pengeluaran.' }; }],
  [/^(?:yang\s+)?(?:di atas|diatas|lebih dari|di bawah|dibawah|kurang dari)\s+(?:rp\.?\s*)?\d/,
    () => ask('Aku belum bisa menyaring transaksi berdasarkan nominal di chat. Buka menu Transaksi dan pakai pencarian atau filternya, ya.', ['buka transaksi'])],
  [/\b(?:kok|kenapa)\b.*\b(?:pengeluaran|pemasukan|transaksi|catatan)\b.*\b(?:tahun lalu|bulan lalu|minggu lalu)\b.*\b(?:nol|kosong|0|ga ada|gak ada|nggak ada)\b/,
    () => say('Bisa jadi memang belum ada catatan di periode itu, atau riwayatnya belum dicatat di aplikasi. Nol di sini artinya belum ada transaksi yang tercatat, bukan data rusak.', ['pengeluaran bulan ini berapa'], 'Belum ada catatan')],

  [/\b(?:udah|sudah|dah)\s+(?:gue|gw|aku|saya)?\s*(?:catat|dicatat|catet|kucatat|dicatet)\b.*\b(?:kategori|masuk mana|masuk apa|masuk ke mana)\b/,
    (_m, t, ctx) => {
      const item = t.replace(/\b(?:udah|sudah|dah)\b.*$/, '').replace(/(?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k|jt|juta)?/g, ' ').replace(/\b(?:tadi|kemarin|beli|bayar|yang|yg)\b/g, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
      const g = item ? suggestCategory({ text: item, item, amount: 20000, type: 'expense' }, { categories: ctx.data.categories, history: ctx.data.transactions }) : null;
      const cat = g ? ctx.data.categories.find(c => c.id === (g.subcategoryId || g.categoryId)) : undefined, parent = cat?.parentId ? ctx.data.categories.find(c => c.id === cat.parentId) : undefined;
      return say(cat ? `${cap(item)} biasanya masuk ${cat.name}${parent ? ` (${parent.name})` : ''}. Nggak kubuat transaksi baru; kategorinya bisa dilihat atau diganti di riwayat transaksi.` : 'Nggak kubuat transaksi baru. Kategorinya bisa dilihat atau diganti di riwayat transaksi.', ['buka transaksi'], 'Kategori');
    }],
  [/^(?:dapet|dapat|ada|pakai|pake)?\s*(?:diskon|potongan|disc)\s+(?:rp\.?\s*)?\d[\d.,]*\s*(?:rb|ribu|k)?\s*(?:aja|ya|deh)?$/,
    () => ask('Diskon untuk belanja yang mana? Tulis sekalian belanjanya, misalnya “belanja 150rb diskon 10rb”.', ['belanja 150rb diskon 10rb'])],

  // ——— What the chat can and cannot do ———
  [/^(?:tolong\s+)?(?:transfer(?:in|kan)|kirim(?:in|kan)|bayar(?:in|kan))\b(?!.*\d)/,
    () => ask('Aku nggak bisa mentransfer uang. Aku bisa bantu menyiapkan catatannya: tulis nominalnya, misalnya “transfer 200rb ke Dika”. Transfer uangnya tetap lewat aplikasi bank atau e-wallet, ya.', ['transfer 200rb ke dika'])],
  [/\b(?:bikin(?:in)?|buat(?:in)?|tambah(?:in)?|pasang(?:in)?)\s+(?:jadwal|pengingat|reminder|rutin)\b|\b(?:jadwal|pengingat|reminder)\b.*\b(?:lewat|dari|di)\s+chat\b/,
    () => say('Bisa. Tulis rinciannya, misalnya “bayar wifi 300rb tiap tanggal 5” untuk jadwal rutin, atau “ingetin bayar kos tanggal 1” untuk pengingat. Nanti kusiapkan kartunya untuk kamu simpan.', ['bayar wifi 300rb tiap tanggal 5', 'ingetin bayar kos tanggal 1'], 'Jadwal & pengingat')],
  [/\b(?:lanjut(?:in|kan)?|terusin|nerusin)\b.*\b(?:omongin|obrolan|bahas(?:an)?|ngobrol|chat|cerita)\b.*\b(?:kemarin|kemaren|minggu lalu|sebelumnya|lalu|waktu itu)\b/,
    () => ask('Aku belum punya konteks yang cukup dari obrolan itu. Sebut topik atau transaksinya dulu, nanti kita lanjut dari situ.')],
  [/\b(?:sinyal|koneksi|internet|jaringan|wifi)\b.*\b(?:putus|ilang|hilang|error|jelek|lemot|mati|down)\b|\bgagal\s+(?:simpan|nyimpen|disimpan|kesimpen)\b/,
    () => ask('Cek dulu apakah transaksi tadi sudah masuk, supaya tidak tercatat dua kali. Lihat di riwayat atau tanya “pengeluaran hari ini berapa”.', ['pengeluaran hari ini berapa', 'buka transaksi'])],
  [/^(?:jangan|jgn)\s+(?:di)?hapus\b.*\b(?:ubah|ganti|edit)\b/,
    () => ask('Oke, nggak kuhapus. Bagian mana yang mau diubah: nominal, dompet, tanggal, atau catatannya?', ['tanggalnya kemarin', 'jadi 25rb'])],
  [/^(?:tolong\s+)?(?:ubah|ganti|edit|koreksi|benerin)\s+(?:transaksi|catatan|data)(?:\s*(?:itu|ini|tadi|nya|yang tadi))?(?:\s+(?:dong|ya|deh))?$/,
    (_m, _t, _c, memory) => ask(memory.plan?.status === 'pending' ? 'Mau ubah apa: nominal, dompet, tanggal, atau catatannya?' : 'Mau ubah tanggalnya ke kemarin, atau pindah dompet? Bilang saja, misalnya “kemarin” atau “pakai jago”.', ['kemarin', 'pakai jago'], { pendingQ: 'field' })],

  // ——— Money that is not money yet ———
  [/\bcashback\b.*\b(?:koin|poin|point|coins?|saldo toko|voucher|reward)\b/,
    (_m, t) => { const kind = t.match(/\b(koin|poin|point|coins?|saldo toko|voucher|reward)\b/)?.[1] || 'koin'; const word = /^(?:point|poin)$/.test(kind) ? 'poin' : /^coins?$/.test(kind) ? 'koin' : kind; return say(`Itu ${word}${/toko/.test(t) ? '' : ' toko'}, belum sama dengan saldo uang di dompet. Nggak kucatat sebagai uang masuk, dan saldo dompetmu tetap.`, undefined, 'Bukan uang'); }],
  [/\b(?:ajuin|ngajuin|mengajukan|minta|request|ngeklaim)\s+refund\b|\brefund(?:nya)?\b.*\b(?:diajukan|masih proses|diproses|nunggu|menunggu|pending)\b/,
    () => say('Berarti refund masih diajukan. Uangnya belum masuk, jadi belum kutambahkan ke saldo. Nanti kalau sudah masuk, bilang “refund 80rb masuk jago”.', ['refund 80rb masuk jago'], 'Refund diajukan')],
  [/^(?:kalau|kalo|klo|nanti kalau|nanti kalo)\s+(?:nanti\s+)?(bonus|thr|gaji|gajian|klaim|uang|duit|transferan|komisi)(?:\s+\p{L}+)?\s+(?:udah\s+)?(?:masuk|cair|turun|datang)\b.*\b(?:sisih(?:in|kan)|tabung|nabung|simpan|pindah(?:in)?|transfer|nyisihin)\b/u,
    (m, t) => { const a = amountOf(t); return { intent: 'clarify', text: `Itu rencana setelah ${m[1]} benar-benar masuk. Belum ada saldo yang dipindahkan sekarang.${a ? ' Mau kubuatkan pengingatnya?' : ''}`, chips: a ? ['boleh', 'nggak dulu'] : undefined, memory: a ? { offer: `ingetin sisihin ${a.text.trim()} kalau ${m[1]} masuk` } : {} }; }],
  [/^(\p{L}+)\s+(?:bilang\s+|janji\s+|katanya\s+)?(?:besok\s+|nanti\s+|lusa\s+|minggu depan\s+|bulan depan\s+)?(?:bakal|mau|akan|janji|pengen|siap)\s+(?:bayar|lunasin|ngelunasin|transfer|balikin|nyicil|ganti|ngembaliin)\b|^(\p{L}+)\s+(?:janji|bilang)\b.*\b(?:bayar|lunasin|transfer|balikin)\b/u,
    (m, t) => { const who = cap(m[1] || m[2]); if (/^(?:aku|gue|gw|saya|kamu|kita|nanti|besok|kalau|kalo)$/i.test(who)) return null; const when = t.match(/\b(besok|lusa|minggu depan|bulan depan|tanggal \d{1,2})\b/)?.[1] || 'besok', a = amountOf(t);
      return { intent: 'clarify', text: `Itu janji pembayaran dari ${who}, belum uang diterima. Mau kusiapkan pengingat untuk ${when}?`, chips: ['boleh', 'nggak dulu'], memory: { offer: `ingetin tagih ${lower(who)}${a ? ` ${a.text.trim()}` : ''} ${when}`, person: lower(who) } }; }],
  [/^(?:aku\s+|gue\s+|gw\s+|saya\s+)?belum\s+(?:bayar|dibayar|lunas|transfer)(?:\s+(?:kok|sih|ya|nih|apa-apa))?$/,
    () => ask('Oke, belum kucatat sebagai uang keluar. Kalau perlu, aku bisa siapkan pengingatnya, misalnya “ingetin bayar listrik tanggal 20”.', ['ingetin bayar listrik tanggal 20'])],
  [/\b(?:udah|sudah)\s+(?:bayar|beli)\b.*\bbelum\s+(?:dicatat|kecatat|dicatet|tercatat)\b/,
    () => ask('Oke, kucatat sekarang. Bayar apa dan berapa? Misalnya “bayar listrik 300rb pakai jago kemarin”.')],
  [/\b(?:ikhlas(?:in|kan)?|relain|relakan|anggap lunas|biarin aja|gak usah dibayar|nggak usah dibayar|putihkan|diputihkan)\b/,
    (_m, t) => { const a = amountOf(t); return say(`Itu pengurangan kewajiban tanpa uang masuk${a ? `, bukan pembayaran masuk ${rp(a.value)}` : ''}. Di halaman Utang & Piutang, pilih piutangnya lalu kurangi sisanya (diputihkan).`, undefined, 'Diikhlaskan'); }],
  [/\b(?:pisah(?:in|kan)|sisih(?:in|kan)|alokasi(?:in|kan))\b.*\b(?:buat|untuk)\s+(?:bisnis|usaha|dana usaha|modal|titipan|kantor|jualan)\b/,
    () => ({ intent: 'clarify', title: 'Milik siapa?', text: 'Dana itu uang milikmu yang disisihkan, atau titipan milik pihak lain? Nama “bisnis” saja belum menentukan kepemilikannya. Kalau milikmu, pakai Pisahkan isi di halaman dompetnya: saldonya tetap di dompet yang sama, cuma ditandai.', chips: ['uangku sendiri, buat modal', 'titipan orang lain'] })],
  [/^(?:uang|duit)(?:ku)?\s+(?:gue|aku|saya|sendiri)\b.*\b(?:modal|usaha|bisnis)\b|^uangku sendiri\b/,
    () => say('Berarti tetap uangmu, hanya dialokasikan untuk modal. Jangan diperlakukan sebagai titipan orang lain. Tandai dengan Pisahkan isi di dompetnya supaya tidak tercampur.', undefined, 'Uang sendiri')],
  [/\bsaldo\b.*\b(?:beda|selisih|kurang|lebih|ga cocok|gak cocok|nggak cocok|nggak sama|gak sama)\b.*\b(?:bikin|buat|catat|tambah)(?:in)?\b.*\b(?:transaksi|biar|supaya)\b/,
    () => say('Lebih baik telusuri selisihnya dulu. Kalau memang perlu, pakai Cocokkan saldo di dompetnya, supaya tercatat sebagai penyesuaian dengan alasan yang jelas, bukan belanja.', ['saldo semua dompet berapa'], 'Selisih saldo')],
  [/\bklaim(?:nya)?\b.*\b(?:disetujui|di-?approve|diapprove|di-?acc|diacc|acc|diterima kantor|lolos|udah oke)\b/,
    () => ask('Disetujui belum berarti uangnya masuk. Penggantiannya sudah diterima?', ['udah masuk', 'belum'], { pendingQ: 'claim' })],
  [/\b(?:kantor|dinas)\b.*\b(?:dikasih|kasih|dapet|dapat)\s+uang\s+dinas\b|\buang dinas\b.*\b(?:kepake|kepakai|terpakai|habis)\b/,
    (_m, t) => { const a = findAmounts(t).filter(x => x.value > 0); if (a.length < 2) return null; const rest = a[0].value - a[1].value; return ask(`Ada sisa ${rp(rest)}. Apakah uang dinas ini harus dipertanggungjawabkan dan sisanya dikembalikan, atau tunjangan yang tetap milikmu?`, ['harus dikembalikan', 'tunjangan, milikku']); }],
];

/** Someone else's purchase, told as a story: "Dika katanya beli HP 5jt kemarin, mahal juga ya". */
function story(t: string, ctx: ChatContext): FaqAnswer | null {
  const m = t.match(new RegExp(String.raw`^(?:si\s+)?(${PEOPLE}|\p{L}{3,})\s+(?:katanya\s+|kemarin\s+|baru\s+|udah\s+|tadi\s+)*(?:katanya\s+)?(?:beli|belanja|bayar|ganti|checkout)\b(.*)$`, 'u'));
  if (!m || !/\bkatanya\b|\b(?:mahal|murah|gila|keren|wah|anjir|anjay|parah)\b.*\b(?:ya|sih|juga|banget|bgt)\b|\bgila sih\b/.test(t)) return null;
  const who = m[1];
  if (/^(?:aku|gue|gw|saya|kita|tadi|kemarin|udah|baru|mau|pengen)$/.test(who) || walletsIn(who, ctx.quick.wallets).length || FAMILY.test(who) && !/\bkatanya\b/.test(t)) return null;
  const a = amountOf(t), name = cap(who.replace(/\s+(?:gue|gw|aku|saya|ku)$/, ' kamu'));
  return { intent: 'clarify', text: `${a && a.value >= 1e6 ? 'Lumayan besar. ' : ''}Itu cerita tentang pembelian ${name}, jadi tidak kuanggap sebagai pengeluaranmu.`, chips: ['ringkasan bulan ini'] };
}
/** "X sama Y udah bayar" without amounts: how much each, and into which wallet. */
function bothPaid(t: string): FaqAnswer | null {
  const m = t.match(/^(\p{L}{3,})\s+(?:sama|dan|&|ama)\s+(\p{L}{3,})\s+(?:udah|sudah|baru)\s+(?:bayar|transfer|lunas|balikin|nyicil)(?:\s+(?:semua|semuanya))?$/u);
  if (!m || /^(?:aku|gue|saya|kamu)$/.test(m[1])) return null;
  return { intent: 'clarify', text: `Masing-masing bayar berapa dan masuk ke dompet mana? Misalnya “${m[1]} 50rb ke jago, ${m[2]} 30rb tunai”.`, memory: { pendingQ: 'who', people: [m[1], m[2]] } };
}
/** "kebanyakan ngopi", "belanja mulu", "boros banget gue minggu ini": an offer to look, no judging. */
function overdo(t: string): FaqAnswer | null {
  const period = t.match(/\b(hari ini|minggu ini|bulan ini|belakangan ini|akhir-akhir ini)\b/)?.[1];
  const too = t.match(/\b(?:kebanyakan|keseringan|sering banget|terlalu sering|kebanyakan|kebablasan)\s+(?:gue\s+|aku\s+)?(\p{L}+)(?:\s+(\p{L}+))?/u);
  const often = t.match(/\b(ngopi|jajan|belanja|checkout|makan di luar|nongkrong|gofood|grabfood|boba|ojol)\s+(?:mulu|terus|melulu|lagi lagi)\b/);
  const soMuch = t.match(/\b(?:sering banget|keseringan)\s+(?:gue\s+|aku\s+)?(?:jajan\s+)?(\p{L}+)/u);
  const wasteful = /\bboros\s+(?:banget|bgt|parah)\b.*\b(?:gue|aku|saya)\b|\b(?:gue|aku|saya)\s+boros\s+(?:banget|bgt|parah)\b/.test(t);
  if (!too && !often && !soMuch && !wasteful) return null;
  let word = (too?.[1] === 'jajan' && too[2] ? too[2] : too?.[1]) || often?.[1] || (soMuch?.[1] === 'jajan' ? t.match(/jajan\s+(\p{L}+)/u)?.[1] : soMuch?.[1]) || '';
  word = word === 'ngopi' ? 'kopi' : word;
  const when = period && period !== 'belakangan ini' && period !== 'akhir-akhir ini' ? period : 'bulan ini';
  if (wasteful || word === 'belanja' || word === 'checkout' || !word) {
    return { intent: 'clarify', text: wasteful ? `Kita lihat dulu keluarnya paling banyak di mana. Mau cek pengeluaran ${when}?` : `Mau kita cek belanja yang paling besar dulu? Biar kelihatan mana yang bisa dikurangi.`, chips: [`pengeluaran ${when} berapa`, `pengeluaran terbesar ${when}`], memory: { offer: wasteful ? `pengeluaran ${when} berapa` : `pengeluaran terbesar ${when}`, topic: 'overdo' } };
  }
  return { intent: 'clarify', text: `Mau lihat total ${word} ${when} atau dibandingkan dengan bulan lalu?`, chips: [`pengeluaran ${word} ${when} berapa`, `bandingin ${word} sama bulan lalu`], memory: { offer: `pengeluaran ${word} ${when} berapa`, topic: 'overdo', subject: word } };
}
/** "pake Joni", "pake BCA aja", "pake sisanya", "pake uang usaha gue", "pake titipan kantor" with no card waiting. */
function unknownWallet(t: string, ctx: ChatContext): FaqAnswer | null {
  const m = t.match(/^(?:bayar(?:nya)?\s+)?(?:pake|pakai|pakek|pk|via|lewat)\s+(.+?)(?:\s+(?:aja|saja|deh|ya|dong))*$/);
  if (!m || walletsIn(m[1], ctx.quick.wallets).length || findAmounts(m[1]).length) return null;
  const what = m[1].trim(), live = ctx.data.wallets.filter(w => !w.isArchived && !w.isDeleted && w.isSpendable !== false).slice(0, 4).map(w => `pakai ${lower(w.name)}`);
  if (/^(?:sisa|sisanya|sisa yang tadi|yang tadi|yang itu)\b/.test(what)) return ask('“Sisanya” yang mana: sisa saldo di dompet, atau sisa pembayaran utang? Mau dipakai untuk apa?', live);
  if (/\btitipan\b/.test(what)) return ask(`Titipan ${what.replace(/^titipan\s*/, '') || 'itu'} adalah dana milik pihak lain, bukan uangmu. Mau dipakai untuk apa, dan dari dompet mana? Kalau dipakai, perlu persetujuan atau penggantian nanti.`, live);
  if (/\b(?:usaha|bisnis|modal|kantor)\b/.test(what)) return ask(`${cap(what)} itu disimpan di dompet mana? Pilih dompetnya, atau tandai dulu dengan Pisahkan isi di halaman dompet.`, live);
  if (what.split(' ').length === 1 && !/^(?:kartu|cash|tunai|qris|debit|kredit|transfer)$/.test(what)) return ask(`“${cap(what)}” itu nama orang atau nama dompet? Dompet bernama ${cap(what)} belum ada di daftarmu.`, live);
  return null;
}

export function readFaq(t: string, ctx: ChatContext, memory: ChatMemory): FaqAnswer | null {
  for (const [re, answer] of RULES) { const m = t.match(re); if (m) { const a = answer(m, t, ctx, memory); if (a) return a; } }
  return story(t, ctx) || bothPaid(t) || overdo(t) || (memory.plan?.status === 'pending' ? null : unknownWallet(t, ctx));
}
