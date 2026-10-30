/**
 * 8.0 — the chat connected to every menu of the app. "buka anggaran", "ke menu target", "mana wishlist" open that menu;
 * "utang gue berapa", "siapa aja yang belum bayar", "langganan apa aja", "target tabungan gimana", "wishlist gue",
 * "klaim yang belum cair", "dompet gue apa aja" are answered from the person's own data, with a button to the menu.
 * Records ("utang ke budi 50rb") never come here: an amount in the message goes to Catat otomatis.
 */
import type { Data } from '../types';
import type { Voice } from './voice.ts';

const rp = (n: number) => `Rp${Math.round(n).toLocaleString('id-ID')}`;
type Line = { label: string; value: string; tone?: 'up' | 'down' | 'warn' | 'good' };
type Bar = { label: string; value: string; ratio: number; tone?: 'good' | 'warn' | 'bad'; note?: string };
export type ModuleAnswer = { title: string; text: string; hero?: { label: string; value: string; note?: string }; lines?: Line[]; bars?: Bar[]; chips?: string[]; open: { view: string; label: string } };
export type ModuleData = Partial<Pick<Data, 'wallets' | 'budgets' | 'funds' | 'debts' | 'receivables' | 'claims' | 'recurring' | 'wishlist' | 'categories' | 'drafts' | 'plannedTransactions' | 'transactions'>>;

/** Every menu, the most specific words first ("laporan utang" before "utang" and "laporan"). */
export const MODULES: { view: string; label: string; words: RegExp }[] = [
  { view: 'owedReport', label: 'Laporan utang & piutang', words: /\blaporan\s+(?:utang|hutang|piutang)\b|\b(?:utang|hutang)\s*(?:dan|&|sama)?\s*piutang\b/ },
  // Not an order about a schedule ("stop langganan spotify bulan depan", "naik jadi 35rb mulai bulan depan").
  { view: 'upcoming', label: 'Arus Kas Mendatang', words: /^(?!.*\b(?:stop|berhenti|batal(?:in|kan)?|hapus|ubah|ganti|naik|turun|jadi|mulai|pause|matiin|tambah|bikin|buat)\b)(?:.*)\b(?:tagihan|bayaran|cicilan|langganan|pengeluaran|pemasukan)\b.*\b(?:minggu\s+depan|bulan\s+depan|besok|lusa|mendatang|ke\s*depan|nanti|bakal|akan\s+datang|dalam\s+\d+\s+hari|yang\s+akan)\b|\b(?:yang\s+)?(?:jatuh\s+tempo|harus\s+dibayar)\b/ },
  { view: 'wallets', label: 'Dompet', words: /\b(?:kekayaan\s+bersih|net\s*worth|total\s+(?:aset|harta|kekayaan)|aset\s*(?:aku|gue|saya|ku)?\s+berapa|harta\s*(?:aku|gue|saya|ku)?\s+berapa)\b/ },
  { view: 'funds', label: 'Tujuan dana', words: /\bdana\s+darurat\b.*\b(?:cukup|tahan|berapa\s+bulan|aman)\b/ },
  { view: 'owedArchive', label: 'Arsip utang & piutang', words: /\barsip\s+(?:utang|hutang|piutang)\b/ },
  { view: 'cycles', label: 'Riwayat Siklus', words: /\b(?:riwayat\s+siklus|siklus\s+(?:lalu|sebelumnya)|tutup\s+buku)\b/ },
  { view: 'upcoming', label: 'Arus Kas Mendatang', words: /\b(?:arus\s+kas|cash\s*flow|jatuh\s+tempo)\b/ },
  { view: 'inbox', label: 'Perlu Dikonfirmasi', words: /\b(?:perlu\s+dikonfirmasi|inbox|kotak\s+masuk|draf|draft)\b/ },
  { view: 'health', label: 'Periksa Data', words: /\b(?:periksa\s+data|cek\s+data|data\s+(?:rusak|dobel|ganda))\b/ },
  { view: 'splitbill', label: 'Split Bill', words: /\b(?:split\s*bill|split\s*bil|patungan|bagi\s+tagihan)\b/ },
  { view: 'wishlist', label: 'Wish list', words: /\b(?:wish\s*list|wislis|daftar\s+keinginan|barang\s+impian)\b/ },
  { view: 'claims', label: 'Klaim kantor', words: /\b(?:klaim|reimburse(?:ment)?|reimbursement)\b/ },
  { view: 'receivables', label: 'Piutang', words: /\bpiutang\b|\bsiapa\s+(?:aja\s+|saja\s+)?yang\s+(?:masih\s+)?(?:utang|ngutang|hutang|minjem|pinjem|pinjam|belum\s+(?:bayar|balikin|lunas))|\b(?:utang|ngutang|hutang|minjem|pinjem|pinjam)\s+(?:ke|sama|ama)\s+(?:aku|gue|gw|saya)\b/ },
  { view: 'debts', label: 'Utang', words: /\b(?:utang|hutang|cicilan|pinjaman|paylater)\b/ },
  { view: 'funds', label: 'Tujuan dana', words: /\b(?:tujuan\s+dana|target(?:\s+tabungan)?|tabungan|dana\s+darurat|kantong)\b/ },
  { view: 'recurring', label: 'Rutin', words: /\b(?:rutin|langganan|berulang|subscription|tagihan\s+bulanan)\b/ },
  { view: 'calendar', label: 'Kalender Keuangan', words: /\bkalender\b/ },
  { view: 'forecast', label: 'Proyeksi', words: /\b(?:proyeksi|prediksi|forecast)\b/ },
  { view: 'analytics', label: 'Analisis', words: /\b(?:analisis|analisa|grafik|statistik|chart)\b/ },
  { view: 'report', label: 'Laporan', words: /\b(?:laporan|report|rekap)\b/ },
  { view: 'advisor', label: 'Insight', words: /\b(?:insight|wawasan)\b/ },
  { view: 'budgets', label: 'Anggaran', words: /\b(?:anggaran|budget|bujet)\b/ },
  { view: 'categories', label: 'Kategori', words: /\bkategori\b/ },
  { view: 'wallets', label: 'Dompet', words: /\b(?:dompet|rekening)\b/ },
  { view: 'transactions', label: 'Transaksi', words: /\b(?:transaksi|riwayat|mutasi)\b/ },
  { view: 'settings', label: 'Pengaturan', words: /\b(?:pengaturan|setting(?:s|an)?|setelan|tema)\b/ },
  { view: 'help', label: 'Tanya Jawab', words: /\b(?:tanya\s+jawab|bantuan|faq|panduan)\b/ },
  { view: 'dashboard', label: 'Beranda', words: /\b(?:beranda|home|dashboard|halaman\s+(?:utama|depan))\b/ },
];
/** "buka anggaran", "ke menu dompet", "pindah ke laporan", "tunjukin wishlist", "menu kategori mana?" */
const OPEN = /^(?:tolong\s+|coba\s+|mau\s+|pengen\s+|bisa\s+)?(?:buka(?:in|kan)?|bukain|ke|pergi\s+ke|pindah\s+ke|masuk\s+ke|balik\s+ke|kembali\s+ke|tampil(?:kan|in)|tunjuk(?:in|kan)|antar(?:in)?\s+ke|menu)\b|\b(?:menu|halaman)\s+\S+\s+(?:mana|di\s*mana|dimana)\b|\b(?:di\s*mana|dimana)\s+(?:menu|halaman)\b/;
/** "buka X" / "ke menu X": opening, not asking about it. */
export const opensMenu = (t: string) => OPEN.test(t) && !ASK.test(t.replace(/\b(?:mana|di\s*mana|dimana)\b/g, ''));
const ASK = /\b(?:berapa|apa\s+aja|apa\s+saja|siapa\s+(?:aja|saja)?|gimana|bagaimana|sampai\s+mana|udah\s+(?:berapa|sampai)|masih|sisa|daftar|list|kapan|mana\s+aja|progress|progres|ada\s+berapa|total|belum\s+(?:lunas|bayar|dikonfirmasi)|ada\s+(?:ga|gak|nggak|apa)|cukup|tahan)\b|\?$/;
const ME = String.raw`(?:aku|gue|gw|saya|ku|mu)?`;

export function readModule(t: string, data: ModuleData, today: string, v: Voice): ModuleAnswer | null {
  const target = MODULES.find(m => m.words.test(t));
  if (!target) return null;
  const go = { view: target.view, label: `Buka ${target.label}` };
  // Opening a menu.
  if (OPEN.test(t) && !ASK.test(t.replace(/\b(?:mana|di\s*mana|dimana)\b/g, ''))) return { title: target.label, text: say(v, `Siap, ini menu ${target.label}. Ketuk tombolnya buat buka.`, `Baik, silakan ketuk tombol di bawah untuk membuka menu ${target.label}.`, `Gas, ini menu ${target.label}. Pencet tombolnya ya.`, `Menu ${target.label}:`), open: go };
  // "tagihan bulan depan", "ada draf?": asking already, without a question word.
  if (!ASK.test(t) && !/^ada\b/.test(t) && target.view !== 'upcoming') return null;
  const answer = answerFor(target.view, t, data, today, v);
  return answer ? { ...answer, open: go } : null;
}

function answerFor(view: string, t: string, d: ModuleData, today: string, v: Voice): Omit<ModuleAnswer, 'open'> | null {
  const days = (date: string) => Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 864e5);
  const when = (date: string) => { if (!date) return ''; const n = days(date); return n < 0 ? `lewat ${-n} hari` : n === 0 ? 'hari ini' : n === 1 ? 'besok' : `${n} hari lagi`; };
  if (view === 'debts') {
    const open = (d.debts || []).filter(x => x.status !== 'paid' && x.outstandingAmount > 0).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
    if (!open.length) return { title: 'Utang', text: say(v, 'Nggak ada utang yang belum lunas. Mantap, bebas utang! 🎉', 'Tidak ada utang yang belum lunas. Luar biasa.', 'Lo bebas utang, bro! Mantul 🎉', 'Tidak ada utang.'), chips: ['ringkasan bulan ini'] };
    const total = open.reduce((n, x) => n + x.outstandingAmount, 0);
    return { title: 'Utang', text: say(v, `Masih ada ${open.length} utang, totalnya ${rp(total)}.`, `Terdapat ${open.length} utang yang belum lunas dengan total ${rp(total)}.`, `Utang lo masih ${open.length}, total ${rp(total)}. Semangat nyicil!`, `${open.length} utang, ${rp(total)}.`), hero: { label: 'Sisa semua utang', value: rp(total) }, lines: open.slice(0, 6).map(x => ({ label: x.name || x.provider, value: `${rp(x.outstandingAmount)}${x.dueDate ? ` · ${when(x.dueDate)}` : ''}`, tone: x.dueDate && days(x.dueDate) < 0 ? 'warn' as const : undefined })), chips: ['ringkasan bulan ini'] };
  }
  if (view === 'receivables') {
    const open = (d.receivables || []).filter(x => x.status !== 'paid' && x.remainingAmount > 0).sort((a, b) => b.remainingAmount - a.remainingAmount);
    if (!open.length) return { title: 'Piutang', text: say(v, 'Nggak ada yang masih utang ke kamu. Semua udah lunas 👍', 'Tidak ada piutang yang belum dibayar.', 'Ga ada yang ngutang ke lo. Aman!', 'Tidak ada piutang.') };
    const total = open.reduce((n, x) => n + x.remainingAmount, 0), people = [...new Set(open.map(x => x.person))];
    return { title: 'Piutang', text: say(v, `${people.length} orang masih utang ke kamu, totalnya ${rp(total)}.`, `${people.length} orang masih memiliki utang kepada Anda, total ${rp(total)}.`, `${people.length} orang masih ngutang ke lo, total ${rp(total)}. Tagih gih wkwk.`, `${people.length} orang, ${rp(total)}.`), hero: { label: 'Belum dibayar', value: rp(total) }, lines: open.slice(0, 6).map(x => ({ label: x.person, value: `${rp(x.remainingAmount)}${x.description ? ` · ${x.description}` : ''}`.slice(0, 48) })) };
  }
  if (view === 'funds' && /\bdana\s+darurat\b/.test(t)) {
    const fund = (d.funds || []).find(f => f.kind === 'emergency' || /darurat/i.test(f.name));
    const since = (() => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() - 90); return x.toISOString().slice(0, 10); })();
    const spent90 = (d.transactions || []).filter(x => x.type === 'expense' && x.date > since && x.date <= today).reduce((n, x) => n + x.amount, 0), monthly = spent90 / 3;
    if (!fund) return { title: 'Dana darurat', text: say(v, 'Belum ada dana darurat. Mau bikin? Tulis “bikin dana darurat”.', 'Belum ada dana darurat.', 'Belum punya dana darurat, bro. Bikin yuk.', 'Belum ada.'), chips: ['cara bikin dana darurat'] };
    const months = monthly > 0 ? fund.currentAmount / monthly : 0;
    return { title: 'Dana darurat', text: say(v, `Dana daruratmu ${rp(fund.currentAmount)}${monthly ? `, cukup sekitar ${months.toFixed(1).replace('.', ',')} bulan pengeluaran (rata-rata ${rp(monthly)}/bulan)` : ''}. Yang sering disarankan 3–6 bulan.`, `Dana darurat Anda ${rp(fund.currentAmount)}${monthly ? `, setara sekitar ${months.toFixed(1).replace('.', ',')} bulan pengeluaran` : ''}.`, `Dana darurat lo ${rp(fund.currentAmount)}${monthly ? `, tahan ±${months.toFixed(1).replace('.', ',')} bulan` : ''}.`, `${rp(fund.currentAmount)}${monthly ? ` ≈ ${months.toFixed(1)} bulan` : ''}.`) };
  }
  if (view === 'funds') {
    const list = (d.funds || []).filter(x => !x.isArchived);
    if (!list.length) return { title: 'Tujuan dana', text: say(v, 'Belum ada tujuan dana. Mau bikin? Bilang aja, misalnya “pengen nabung buat liburan 5jt”.', 'Belum ada tujuan dana. Anda dapat membuatnya, misalnya “ingin menabung untuk liburan 5jt”.', 'Belum ada target nih. Bikin yuk, contoh “pengen nabung buat liburan 5jt”.', 'Belum ada tujuan dana.'), chips: ['pengen nabung buat liburan 5jt'] };
    const saved = list.reduce((n, x) => n + x.currentAmount, 0), goal = list.reduce((n, x) => n + x.targetAmount, 0);
    return { title: 'Tujuan dana', text: say(v, `Terkumpul ${rp(saved)} dari ${rp(goal)} di ${list.length} tujuan.`, `Terkumpul ${rp(saved)} dari target ${rp(goal)} pada ${list.length} tujuan dana.`, `Udah kekumpul ${rp(saved)} dari ${rp(goal)}. Gas terus!`, `${rp(saved)} / ${rp(goal)}.`), bars: list.slice(0, 6).map(x => { const ratio = x.targetAmount > 0 ? x.currentAmount / x.targetAmount : 0; return { label: x.name, value: `${rp(x.currentAmount)} / ${rp(x.targetAmount)}`, ratio, tone: ratio >= 1 ? 'good' as const : undefined, note: x.targetDate ? `target ${when(x.targetDate)}` : undefined }; }) };
  }
  if (view === 'wishlist') {
    const list = (d.wishlist || []).filter(x => x.status === 'active').sort((a, b) => a.priority - b.priority);
    if (!list.length) return { title: 'Wish list', text: say(v, 'Wish list-mu masih kosong. Lagi pengen apa nih?', 'Wish list Anda masih kosong.', 'Wish list lo kosong. Lagi ngincer apa?', 'Wish list kosong.') };
    return { title: 'Wish list', text: say(v, `Ada ${list.length} barang yang kamu incar.`, `Terdapat ${list.length} barang di wish list Anda.`, `${list.length} barang lagi lo incer nih.`, `${list.length} barang.`), bars: list.slice(0, 6).map(x => ({ label: x.name, value: `${rp(x.saved)} / ${rp(x.price)}`, ratio: x.price > 0 ? x.saved / x.price : 0 })) };
  }
  if (view === 'recurring') {
    const list = (d.recurring || []).filter(x => x.active).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
    if (!list.length) return { title: 'Rutin', text: say(v, 'Belum ada transaksi rutin. Bisa dibuat dari menu Rutin.', 'Belum ada transaksi rutin.', 'Belum ada yang rutin nih.', 'Belum ada.') };
    const monthly = list.filter(x => x.type === 'expense').reduce((n, x) => n + (x.frequency === 'weekly' ? x.amount * 52 / 12 : x.frequency === 'yearly' ? x.amount / 12 : x.amount), 0);
    return { title: 'Rutin', text: say(v, `Ada ${list.length} transaksi rutin. Pengeluaran rutinnya sekitar ${rp(monthly)} sebulan.`, `Terdapat ${list.length} transaksi rutin, dengan pengeluaran rutin sekitar ${rp(monthly)} per bulan.`, `${list.length} yang rutin, keluarnya ±${rp(monthly)}/bulan.`, `${list.length} rutin, ±${rp(monthly)}/bln.`), lines: list.slice(0, 6).map(x => ({ label: x.name, value: `${rp(x.amount)} · ${when(x.nextDate)}` })) };
  }
  if (view === 'claims') {
    const open = (d.claims || []).filter(x => !['paid', 'rejected'].includes(x.status) && (x.remainingAmount || x.amount) > 0);
    if (!open.length) return { title: 'Klaim kantor', text: say(v, 'Nggak ada klaim yang belum cair.', 'Tidak ada klaim yang belum dibayar.', 'Klaim lo udah cair semua.', 'Tidak ada.') };
    const total = open.reduce((n, x) => n + (x.remainingAmount || x.amount), 0);
    return { title: 'Klaim kantor', text: say(v, `${open.length} klaim belum cair, totalnya ${rp(total)}.`, `${open.length} klaim belum dibayar, total ${rp(total)}.`, `${open.length} klaim masih nyangkut, total ${rp(total)}.`, `${open.length} klaim, ${rp(total)}.`), hero: { label: 'Belum cair', value: rp(total) }, lines: open.slice(0, 6).map(x => ({ label: x.name, value: `${rp(x.remainingAmount || x.amount)}${x.expectedPaymentDate ? ` · ${when(x.expectedPaymentDate)}` : ''}` })) };
  }
  if (view === 'owedReport') {
    const owe = (d.debts || []).filter(x => x.status !== 'paid').reduce((n, x) => n + x.outstandingAmount, 0), owed = (d.receivables || []).filter(x => x.status !== 'paid').reduce((n, x) => n + x.remainingAmount, 0), net = owed - owe;
    return { title: 'Utang & piutang', text: say(v, `Utangmu ${rp(owe)}, piutangmu ${rp(owed)}. ${net >= 0 ? `Bersihnya orang lain masih utang ${rp(net)} ke kamu.` : `Bersihnya kamu masih utang ${rp(-net)}.`}`, `Utang Anda ${rp(owe)} dan piutang ${rp(owed)}, selisih bersih ${rp(Math.abs(net))} ${net >= 0 ? 'di pihak Anda' : 'yang perlu Anda bayar'}.`, `Utang lo ${rp(owe)}, piutang lo ${rp(owed)}. ${net >= 0 ? `Bersihnya orang masih ngutang ${rp(net)} ke lo.` : `Bersihnya lo masih ngutang ${rp(-net)}.`}`, `Utang ${rp(owe)} · piutang ${rp(owed)}.`), lines: [{ label: 'Utangmu', value: rp(owe), tone: owe ? 'down' : undefined }, { label: 'Piutangmu', value: rp(owed), tone: owed ? 'up' : undefined }, { label: 'Bersih', value: `${net < 0 ? '−' : ''}${rp(Math.abs(net))}`, tone: net >= 0 ? 'good' : 'warn' }] };
  }
  if (view === 'upcoming') {
    const range = /\bbesok\b/.test(t) ? 1 : /\blusa\b/.test(t) ? 2 : /\bminggu\s+depan\b|\bseminggu\b/.test(t) ? 7 : (Number(t.match(/dalam\s+(\d+)\s+hari/)?.[1]) || 30), until = (n: number) => { const x = new Date(`${today}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
    const end = until(range), soon: { label: string; date: string; amount: number; income: boolean }[] = [];
    for (const r of (d.recurring || []).filter(x => x.active && x.nextDate > today && x.nextDate <= end)) soon.push({ label: r.name, date: r.nextDate, amount: r.amount, income: r.type === 'income' });
    for (const p of (d.plannedTransactions || []).filter(x => x.status === 'planned' && x.date > today && x.date <= end)) soon.push({ label: p.title, date: p.date, amount: p.amount, income: p.type === 'income' });
    for (const x of (d.debts || []).filter(x => x.status !== 'paid' && x.dueDate > today && x.dueDate <= end && x.installmentAmount > 0)) soon.push({ label: /^cicilan\b/i.test(x.name) ? x.name : `Cicilan ${x.name}`, date: x.dueDate, amount: x.installmentAmount, income: false });
    soon.sort((a, b) => a.date.localeCompare(b.date));
    const span = range === 1 ? 'besok' : range === 2 ? 'sampai lusa' : range === 7 ? 'seminggu ke depan' : `${range} hari ke depan`, out = soon.filter(x => !x.income).reduce((n, x) => n + x.amount, 0);
    if (!soon.length) return { title: 'Mendatang', text: say(v, `Nggak ada tagihan atau rencana ${span}. Aman!`, `Tidak ada tagihan atau rencana ${span}.`, `Ga ada tagihan ${span}, santuy.`, `Tidak ada ${span}.`) };
    return { title: 'Mendatang', text: say(v, `Ada ${soon.length} yang jatuh tempo ${span}, keluarnya ${rp(out)}.`, `Terdapat ${soon.length} jadwal ${span} dengan pengeluaran ${rp(out)}.`, `${soon.length} tagihan ${span}, total keluar ${rp(out)}. Siapin duitnya!`, `${soon.length} jadwal, ${rp(out)}.`), lines: soon.slice(0, 8).map(x => ({ label: x.label, value: `${x.income ? '+' : ''}${rp(x.amount)} · ${when(x.date)}`, tone: x.income ? 'up' as const : undefined })) };
  }
  if (view === 'categories') {
    const all = (d.categories || []).filter(c => !c.isArchived), top = all.filter(c => !c.parentId && c.type === 'expense'), income = all.filter(c => !c.parentId && c.type === 'income');
    if (!top.length) return { title: 'Kategori', text: say(v, 'Belum ada kategori pengeluaran.', 'Belum ada kategori pengeluaran.', 'Belum ada kategori, bro.', 'Belum ada.') };
    return { title: 'Kategori', text: say(v, `Kamu punya ${top.length} kategori pengeluaran dan ${income.length} kategori pemasukan.`, `Anda memiliki ${top.length} kategori pengeluaran dan ${income.length} kategori pemasukan.`, `Kategori lo: ${top.length} pengeluaran, ${income.length} pemasukan.`, `${top.length} pengeluaran, ${income.length} pemasukan.`), lines: top.slice(0, 10).map(c => ({ label: `${c.icon || ''} ${c.name}`.trim(), value: `${all.filter(x => x.parentId === c.id).length} sub` })) };
  }
  if (view === 'inbox') {
    const waiting = (d.drafts || []).filter(x => x.status === 'pending');
    if (!waiting.length) return { title: 'Perlu Dikonfirmasi', text: say(v, 'Nggak ada yang menunggu dikonfirmasi. Beres!', 'Tidak ada yang menunggu konfirmasi.', 'Ga ada yang nunggu dikonfirmasi, aman.', 'Tidak ada.') };
    return { title: 'Perlu Dikonfirmasi', text: say(v, `Ada ${waiting.length} catatan yang menunggu dikonfirmasi.`, `Terdapat ${waiting.length} catatan yang menunggu konfirmasi.`, `${waiting.length} catetan nunggu dikonfirmasi tuh.`, `${waiting.length} menunggu.`), lines: waiting.slice(0, 6).map(x => ({ label: x.name, value: `${rp(x.amount)} · ${when(x.plannedDate)}` })) };
  }
  if (view === 'splitbill') {
    const open = (d.receivables || []).filter(x => x.splitBillId && x.status !== 'paid' && x.remainingAmount > 0);
    if (!open.length) return { title: 'Split Bill', text: say(v, 'Semua patungan sudah lunas. 👍', 'Semua patungan sudah lunas.', 'Patungan udah lunas semua.', 'Lunas semua.') };
    const total = open.reduce((n, x) => n + x.remainingAmount, 0);
    return { title: 'Split Bill', text: say(v, `${open.length} bagian patungan belum dibayar, totalnya ${rp(total)}.`, `${open.length} bagian patungan belum dibayar, total ${rp(total)}.`, `${open.length} orang belum bayar patungan, total ${rp(total)}. Tagih!`, `${open.length} belum bayar, ${rp(total)}.`), lines: open.slice(0, 6).map(x => ({ label: x.person, value: `${rp(x.remainingAmount)}${x.description ? ` · ${x.description}` : ''}`.slice(0, 48) })) };
  }
  if (view === 'wallets' && /\b(?:kekayaan|net\s*worth|aset|harta)\b/.test(t)) {
    const assets = (d.wallets || []).filter(w => !w.isArchived && !w.isDeleted && w.includeInNetWorth !== false).reduce((n, w) => n + w.cachedBalance, 0);
    const owe = (d.debts || []).filter(x => x.status !== 'paid').reduce((n, x) => n + x.outstandingAmount, 0), owed = (d.receivables || []).filter(x => x.status !== 'paid').reduce((n, x) => n + x.remainingAmount, 0);
    const net = assets + owed - owe;
    return { title: 'Kekayaan bersih', text: say(v, `Kekayaan bersihmu sekitar ${rp(net)}: saldo ${rp(assets)}, ditambah piutang ${rp(owed)}, dikurangi utang ${rp(owe)}.`, `Kekayaan bersih Anda sekitar ${rp(net)}.`, `Kekayaan bersih lo ±${rp(net)}.`, `${rp(net)}.`), hero: { label: 'Kekayaan bersih', value: rp(net) }, lines: [{ label: 'Saldo dompet', value: rp(assets) }, { label: 'Piutang', value: rp(owed), tone: 'up' }, { label: 'Utang', value: rp(owe), tone: 'down' }] };
  }
  if (view === 'wallets' && new RegExp(String.raw`\bdompet\s*${ME}\s*(?:apa\s+(?:aja|saja)|ada\s+berapa|mana\s+aja|list|daftar)\b`).test(t)) {
    const list = (d.wallets || []).filter(w => !w.isArchived && !w.isDeleted).sort((a, b) => b.cachedBalance - a.cachedBalance);
    const total = list.reduce((n, w) => n + w.cachedBalance, 0);
    return { title: 'Dompet', text: say(v, `Kamu punya ${list.length} dompet, total ${rp(total)}.`, `Anda memiliki ${list.length} dompet dengan total ${rp(total)}.`, `Dompet lo ada ${list.length}, total ${rp(total)}.`, `${list.length} dompet, ${rp(total)}.`), lines: list.slice(0, 8).map(w => ({ label: w.name, value: rp(w.cachedBalance), tone: w.isSpendable ? undefined : 'good' as const })) };
  }
  return null;
}
const say = (v: Voice, santai: string, sopan: string, gaul: string, singkat: string) => v === 'sopan' ? sopan : v === 'gaul' || v === 'barbar' ? gaul : v === 'singkat' ? singkat : santai;
