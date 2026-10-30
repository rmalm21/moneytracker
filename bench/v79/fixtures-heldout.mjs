/**
 * 7.9 — held-out set: the same needs as the training document, in other words, other items, other people and other
 * amounts, plus everyday words the document does not list. Written before the engines changed and not used while
 * building; run once with --first (frozen). State: bench/chat/state.mjs (Thursday 15 Oct 2026; wallets Jago, GoPay,
 * Jenius, Mandiri, BRI, Krom, Cash; piutang Sinta, Dina, Atuy; utang Rudi, Aldi; anggaran Makan & Minum 1jt).
 * Before the first run, three sharing cases were changed from one card shape (a shared bill) to what they mean — your part
 * and the money out (`mine`, `out`) — since 7.8 already records an unnamed even split as your part only (Catat V4).
 */
import { C } from '../quick/fixtures-v68state.mjs';
const FOOD = 'expense.makan-minum', JAJAN = C('Jajan'), BAHAN = C('Bahan Makanan'), MINUM = C('Kopi & Minuman'), RUMAH = 'expense.rumah-kebutuhan', PERSONAL = 'expense.personal';
const BELANJA = 'expense.belanja', KESEHATAN = 'expense.kesehatan', PENDIDIKAN = 'expense.pendidikan', KERJA = 'expense.kerja', SOSIAL = 'expense.sosial-sedekah', HIBURAN = 'expense.nongkrong-hiburan';
const TAGIHAN = 'expense.tagihan', TRANSPORT = 'expense.transportasi', KENDARAAN = 'expense.kendaraan', BIAYA = 'expense.biaya-keuangan';
const TODAY = '2026-10-15', YDAY = '2026-10-14';
const one = (id, group, text, turn) => ({ id, group, turns: [{ text, ...turn }] });
const catat = (id, group, text, plan) => ({ id, group, catat: true, text, plan });
const say = (...res) => ({ say: res, record: false });

const VOCAB = [
  ...['tongseng', 'gudeg', 'pecel lele', 'mie aceh', 'bakso urat', 'nasi goreng kambing', 'sop kambing', 'ayam bakar madu', 'soto lamongan', 'lontong opor', 'mie godog', 'nasi jamblang'].map(w => [w, FOOD]),
  ...['cakwe', 'kue lapis', 'getuk', 'lemper', 'dorayaki', 'churros', 'kue putu', 'molen', 'kue sus', 'bakpia', 'cireng isi', 'kue cucur'].map(w => [w, JAJAN]),
  ...['daun bawang', 'jahe', 'kunyit', 'labu siam', 'terong', 'buncis', 'timun', 'jagung', 'kacang panjang', 'tahu putih', 'ayam fillet', 'santan'].map(w => [w, BAHAN]),
  ...['kopi aren', 'wedang jahe', 'bandrek', 'es doger', 'kombucha', 'sirup', 'es cappuccino', 'teh susu', 'jus melon', 'air kelapa'].map(w => [w, MINUM]),
  ...['blender', 'rice cooker', 'setrika', 'gorden', 'karpet', 'sikat wc', 'pewangi ruangan'].map(w => [w, RUMAH]),
  ...['hand body', 'lip balm', 'cat rambut', 'kutek', 'facial wash'].map(w => [w, PERSONAL]),
  ...['kemeja batik', 'kaos polos', 'sendal jepit', 'celana pendek'].map(w => [w, BELANJA]),
  ...['casing hp', 'tempered glass', 'mousepad', 'stylus'].map(w => [w, BELANJA]),
  ['ojek pangkalan', TRANSPORT], ['bajaj', TRANSPORT], ['tiket bus', TRANSPORT], ['ganti aki', KENDARAAN],
  ['buku tulis', PENDIDIKAN], ['pulpen', PENDIDIKAN], ['map plastik', [PENDIDIKAN, KERJA]], ['amplop', [PENDIDIKAN, KERJA, SOSIAL]],
  ['angpao', SOSIAL], ['tahlilan', SOSIAL],
  ['paku', RUMAH], ['semen', RUMAH], ['cat kayu', RUMAH],
];

export const cases = [
  // ——— Nominal dan jumlah ———
  catat('n1', 'nominal', 'hp 3jt 500rb', { n: 1, acts: [{ kind: 'expense', amount: 3500000 }] }),
  catat('n2', 'nominal', '3 roti @8rb', { n: 1, acts: [{ amount: 24000 }] }),
  catat('n3', 'nominal', 'sate 25rb dua, es jeruk 7rb tiga', { n: 2, acts: [{ amount: 50000 }, { amount: 21000 }] }),
  catat('n4', 'nominal', 'gula 2 kg, sekilo 18rb', { n: 1, acts: [{ amount: 36000, cat: BAHAN }] }),
  catat('n5', 'nominal', 'pizza 150rb, harganya udah termasuk pajak 10%', { n: 1, acts: [{ amount: 150000 }] }),
  catat('n6', 'nominal', 'sepatu 600rb diskon 10% maksimal 50rb', { n: 1, acts: [{ amount: 550000 }] }),
  catat('n7', 'nominal', 'jaket 300rb diskon 20% terus 5%', { n: 1, acts: [{ amount: 228000 }] }),
  catat('n8', 'nominal', 'nasi 12rb, teh 4rb, kerupuk 2rb, bayar cash', { n: 3, acts: [{ wallet: 'cash' }, { wallet: 'cash' }, { wallet: 'cash' }] }),
  catat('n9', 'nominal', 'pulsa 50rb, paid via gopay', { n: 1, acts: [{ amount: 50000, wallet: 'gopay' }] }),
  catat('n10', 'nominal', 'mie 15 telur 5 tunai', { n: 2, acts: [{ amount: 15000, wallet: 'cash' }, { amount: 5000, wallet: 'cash' }] }),
  catat('n11', 'nominal', 'beli bakso 25ewu', { n: 1, acts: [{ amount: 25000, cat: FOOD }] }),
  catat('n12', 'nominal', 'es teh 5, roti bakar 20', { n: 2, acts: [{ amount: 5000 }, { amount: 20000 }] }),

  // ——— Hitungan ———
  one('h1', 'hitung', '2 teh @7rb sama gorengan 10rb jadi berapa?', say(/24\.000/)),
  one('h2', 'hitung', 'belanja 87rb, uangnya 100rb, kembaliannya berapa?', say(/13\.000/)),
  one('h3', 'hitung', 'anggaran jajan 500rb udah kepake 320rb', say(/180\.000/)),
  one('h4', 'hitung', 'sisa duit 210rb buat 7 hari, per hari berapa?', say(/30\.000/)),
  one('h5', 'hitung', 'harga naik dari 20rb ke 25rb, naiknya berapa persen?', say(/25\s?%/)),
  one('h6', 'hitung', 'gaji 8jt, kalau disisihin 15% berapa?', say(/1\.200\.000/)),
  one('h7', 'hitung', 'netflix 65rb sebulan, setahun habis berapa?', say(/780\.000/)),
  one('h8', 'hitung', 'kalau tiap hari jajan 15rb, seminggu berapa?', say(/105\.000/)),
  one('h9', 'hitung', 'tas 400rb diskon 25% terus diskon lagi 10%, jadi berapa?', say(/270\.000/)),
  one('h10', 'hitung', 'diskon 30% maks 50rb, belanjanya 300rb, bayar berapa?', say(/250\.000/)),
  one('h11', 'hitung', 'utang 1jt, udah nyicil 200rb tiga kali, sisanya?', say(/400\.000/)),
  { id: 'h12', group: 'hitung', turns: [{ text: 'jus 18rb sama roti 22rb total berapa?', ...say(/40\.000/) }, { text: 'catat pakai gopay', plan: { n: 2, acts: [{ amount: 18000, wallet: 'gopay' }, { amount: 22000, wallet: 'gopay' }] } }] },
  { id: 'h13', group: 'hitung', turns: [{ text: 'budget transport 600rb kepake 450rb, sisanya?', ...say(/150\.000/) }, { text: 'kalau naik grab 40rb lagi?', ...say(/110\.000/) }] },
  one('h14', 'hitung', 'tolong hitungin doang ya, gak usah dicatat', say(/hitung/i)),
  one('h15', 'hitung', 'bill 300rb dibagi 50%, 30%, 20%', say(/150\.000/, /90\.000/, /60\.000/)),
  one('h16', 'hitung', 'patungan 20rb buat 3 orang', say(/6\.667/, /6\.666/)),
  one('h17', 'hitung', 'harganya udah include ppn 11%, totalnya 111rb, aslinya berapa?', say(/100\.000/)),
  one('h18', 'hitung', 'singkat aja, 500rb dikurangi 135rb', say(/365\.000/)),
  one('h19', 'hitung', 'beli 2 gratis 1, satuannya 15rb, bayar berapa?', say(/30\.000/)),
  one('h20', 'hitung', 'beli es teh 5rb, bayar pake 20rb', { plan: { n: 1, acts: [{ amount: 5000 }] }, intro: /15\.000/ }),

  // ——— Percakapan berlanjut ———
  { id: 'l1', group: 'lanjut', turns: [{ text: 'beli martabak 45rb' }, { text: 'pake cash, kemarin', plan: { n: 1, acts: [{ amount: 45000, wallet: 'cash', date: YDAY }] } }, { text: 'eh 40rb deng', plan: { n: 1, acts: [{ amount: 40000, wallet: 'cash', date: YDAY }] } }] },
  { id: 'l2', group: 'lanjut', turns: [{ text: 'ngopi 28rb pakai gopay' }, { text: 'bukan gopay, jenius. terus harganya 30rb', plan: { n: 1, acts: [{ amount: 30000, wallet: 'jenius' }] } }] },
  { id: 'l3', group: 'lanjut', turns: [{ text: 'makan siang 40rb' }, { text: 'catatan: rapat divisi', dismiss: false, plan: { n: 1, acts: [{ amount: 40000, note: /rapat divisi/i }] } }] },
  { id: 'l4', group: 'lanjut', turns: [{ text: 'makan 30rb, kopi 15rb, parkir 5rb', plan: { n: 3 } }, { text: 'yang ketiga gak jadi', dismiss: false, plan: { n: 2, acts: [{ amount: 30000 }, { amount: 15000 }] } }] },
  { id: 'l5', group: 'lanjut', turns: [{ text: 'nasi 20rb, es teh 5rb', plan: { n: 2 } }, { text: 'es tehnya 6rb', plan: { n: 2, acts: [{ amount: 20000 }, { amount: 6000 }] } }] },
  { id: 'l6', group: 'lanjut', turns: [{ text: 'bensin 30rb, tol 20rb pakai jago', plan: { n: 2 } }, { text: 'tolnya kemarin', plan: { n: 2, acts: [{ amount: 30000, date: TODAY }, { amount: 20000, date: YDAY }] } }] },
  { id: 'l7', group: 'lanjut', turns: [{ text: 'bayar parkir 5rb pakai gopay' }, { text: 'beli air 4rb juga, pake dompet yang sama', plan: { n: 1, acts: [{ amount: 4000, wallet: 'gopay' }] } }] },
  { id: 'l8', group: 'lanjut', turns: [{ text: 'ojol 25rb' }, { text: 'gopay.', plan: { n: 1, acts: [{ amount: 25000, wallet: 'gopay' }] } }] },
  { id: 'l9', group: 'lanjut', turns: [{ text: 'sinta pinjam 200rb' }, { text: '#save' }, { text: 'dia udah balikin 50rb ke jago', plan: { n: 1, acts: [{ kind: 'receivable_payment', amount: 50000, wallet: 'jago', person: 'sinta' }] } }] },
  { id: 'l10', group: 'lanjut', turns: [{ text: 'aku pinjam 500rb ke aldi' }, { text: 'ya, masuk bri', plan: { n: 1, acts: [{ kind: 'debt_new', amount: 500000, wallet: 'bri' }] } }] },
  { id: 'l11', group: 'lanjut', turns: [{ text: 'belanja indomaret 60rb, isinya sabun sama snack' }, { text: 'sabun 35rb, snack 25rb', plan: { n: 1, acts: [{ amount: 60000, lines: 2 }] } }] },
  { id: 'l12', group: 'lanjut', turns: [{ text: 'minggu depan mau beli helm 300rb' }, { text: 'eh udah kebeli barusan pakai jenius', plan: { n: 1, acts: [{ kind: 'expense', amount: 300000, wallet: 'jenius', date: TODAY }] } }] },
  { id: 'l13', group: 'lanjut', turns: [{ text: 'kalau beli kopi 20rb sama kue 15rb totalnya berapa?', ...say(/35\.000/) }, { text: 'yaudah catat pake cash', plan: { n: 2, acts: [{ wallet: 'cash' }, { wallet: 'cash' }] } }] },
  { id: 'l14', group: 'lanjut', turns: [{ text: 'makan 60rb pakai jago' }, { text: 'yang kepotong cuma 55rb sih', ...say(/55\.000/), dismiss: false }] },
  { id: 'l15', group: 'lanjut', turns: [{ text: 'beli tiket bioskop 50rb' }, { text: 'udah kesimpen apa belum ya?', ...say(/belum/i) }] },
  { id: 'l16', group: 'lanjut', turns: [{ text: 'es kopi 22rb pakai gopay' }, { text: 'eh btw anggaran sama saldo bedanya apa sih', ...say(/saldo/i) }, { text: 'oke balik lagi, ubah jadi 25rb', plan: { n: 1, acts: [{ kind: 'expense', amount: 25000, wallet: 'gopay' }] } }] },
  { id: 'l17', group: 'lanjut', turns: [{ text: 'bensin 50rb' }, { text: 'eh bukan itu maksudku', ...say(/nominal|dompet|tanggal/i), dismiss: false }] },
  { id: 'l18', group: 'lanjut', turns: [{ text: 'jajan 15rb sama parkir 2rb' }, { text: 'jajannya jangan dulu', dismiss: false, plan: { n: 1, acts: [{ amount: 2000 }] } }] },
  { id: 'l19', group: 'lanjut', turns: [{ text: 'kopi 18rb' }, { text: 'simpen sekarang ya', ...say(/simpan/i) }] },
  { id: 'l20', group: 'lanjut', turns: [{ text: 'kopi 18rb' }, { text: 'kopinya tadi 20rb kok', plan: { n: 1, acts: [{ kind: 'expense', amount: 20000 }] } }] },
  one('l21', 'lanjut', 'dina sama atuy udah bayar', say(/masing|berapa/i)),
  { id: 'l22', group: 'lanjut', turns: [{ text: 'klaim makan kantor udah di-approve', ...say(/diterima|masuk/i) }, { text: 'belum masuk', ...say(/belum/i) }] },
  { id: 'l23', group: 'lanjut', turns: [{ text: 'tolong transferin ke mama sekarang 200rb', plan: { n: 1, acts: [{ amount: 200000 }] }, intro: /aplikasi bank|transfer/i }] },
  one('l24', 'lanjut', 'lanjutin obrolan kita kemarin dong', say(/konteks|topik/i)),
  one('l25', 'lanjut', 'sering banget gue jajan boba belakangan ini', say(/boba|jajan/i)),
  one('l26', 'lanjut', 'koneksi error pas nyimpen tadi, coba ulang', say(/cek|riwayat|dua kali/i)),
  one('l27', 'lanjut', 'bisa bikinin pengingat langsung dari chat?', say(/ingetin|tulis|pengingat/i)),
  one('l28', 'lanjut', 'ubah catatan itu dong', say(/nominal|tanggal|dompet|catatan|mana/i)),
  one('l29', 'lanjut', 'pake sisa yang tadi aja', { record: false }),
  one('l30', 'lanjut', 'bayar pake budi', say(/budi/i)),
  { id: 'l31', group: 'lanjut', turns: [{ text: 'belanja 80rb' }, { text: 'dapet diskon 5rb', plan: { n: 1, acts: [{ amount: 75000 }] } }] },
  catat('l32', 'lanjut', 'kopi 20rb sama donat 15rb, tapi donatnya jangan dicatat', { n: 1, acts: [{ amount: 20000 }] }),
  one('l33', 'lanjut', 'temen gue katanya beli laptop 15jt, gila sih', { record: false }),
  one('l34', 'lanjut', 'kalau thr cair nanti, sisihin 1jt ya', say(/thr|nanti|cair/i)),
  one('l35', 'lanjut', 'rudi janji minggu depan mau bayar 100rb', { record: false }),
  { id: 'l36', group: 'lanjut', turns: [{ text: 'beli pulsa 25rb' }, { text: 'ganti catatannya jadi buat mama', dismiss: false, plan: { n: 1, acts: [{ amount: 25000, note: /mama/i }] } }] },
  { id: 'l37', group: 'lanjut', turns: [{ text: 'roti 10rb, susu 12rb, telur 25rb' }, { text: 'susunya hapus aja', dismiss: false, plan: { n: 2, acts: [{ amount: 10000 }, { amount: 25000 }] } }] },
  { id: 'l38', group: 'lanjut', turns: [{ text: 'rencana besok beli sepatu 250rb' }, { text: 'eh ternyata udah kubeli tadi pagi pake gopay', plan: { n: 1, acts: [{ kind: 'expense', amount: 250000, wallet: 'gopay', date: TODAY }] } }] },

  // ——— Pertanyaan konsep dan fitur ———
  one('f1', 'faq', 'apa bedanya anggaran sama saldo?', say(/saldo/i)),
  one('f2', 'faq', 'kok anggaran masih ada tapi duitnya tinggal dikit?', say(/saldo|uang/i)),
  one('f3', 'faq', 'kenapa total uang keluar lebih gede dari pengeluaran?', say(/transfer/i)),
  one('f4', 'faq', 'jadwal rutin sama rencana itu apa bedanya?', say(/rutin/i)),
  one('f5', 'faq', 'bedanya klaim sama pengeluaran biasa apa?', say(/klaim/i)),
  one('f6', 'faq', 'kenapa harus dicek dulu sebelum disimpan?', { ...say(/cek|salah|nominal/i), notIntent: ['undo'] }),
  one('f7', 'faq', 'fitur catat otomatis itu ngapain?', say(/catat/i)),
  one('f8', 'faq', 'bisa foto struk ga?', say(/struk/i)),
  one('f9', 'faq', 'split bill itu gunanya apa?', say(/bagi|split/i)),
  one('f10', 'faq', 'dompet yang diarsip itu kemana?', say(/arsip/i)),
  one('f11', 'faq', 'kalau aku hapus dompet, transaksinya ikut hilang ga?', say(/transaksi|riwayat/i)),
  one('f12', 'faq', 'saldo turun terus padahal ga jajan, kenapa ya?', say(/transfer/i)),
  one('f13', 'faq', 'saldo 1jt, sisa budget makan 300rb, berarti aman jajan 300rb kan?', say(/belum tentu/i)),
  one('f14', 'faq', 'baru tanggal 5 udah habis 800rb, bulan kemarin sebulan 1,5jt. lebih irit kan?', { record: false }),
  one('f15', 'faq', 'jualan hari ini dapet 300rb, itu untung bersih kan?', { intro: /laba|untung|biaya/i }),
  one('f16', 'faq', 'arsipin dompet krom dong', { record: false, notIntent: ['summary'] }),
  one('f17', 'faq', 'cukup ga duitku sampai tanggal 24?', { record: false, intent: ['payday', 'summary'] }),
  one('f18', 'faq', 'cari transaksi bensin', { record: false, answer: /bensin/i }),
  one('f19', 'faq', 'bulan ini lebih hemat dari bulan lalu nggak?', { record: false, notIntent: ['tips'] }),
  one('f20', 'faq', 'bisa pisahin dana titipan di dompet?', say(/isi dompet|titipan/i)),
  one('f21', 'faq', 'hari ini aku belum keluar duit sama sekali ya?', { record: false, answer: /35\.000/ }),

  // ——— Uang yang benar ———
  catat('m1', 'aman', 'belanja bulanan 300rb, 100rb pake cash sisanya gopay', { n: 2, acts: [{ amount: 100000, wallet: 'cash' }, { amount: 200000, wallet: 'gopay' }] }),
  catat('m2', 'aman', 'motor 20jt, dp 5jt pakai bri, sisanya kredit', { n: 1, acts: [{ kind: 'expense', amount: 5000000, wallet: 'bri' }] }),
  catat('m3', 'aman', 'bayar angsuran 1,2jt, pokoknya 1jt bunganya 200rb', { n: 2, acts: [{ kind: 'debt_payment', amount: 1000000 }, { kind: 'expense', amount: 200000 }] }),
  catat('m4', 'aman', 'checkout 250rb, katanya dapet cashback 25rb nanti', { n: 1, acts: [{ kind: 'expense', amount: 250000 }] }),
  catat('m5', 'aman', 'refund 30rb masuk gopay, barangnya rusak', { n: 1, acts: [{ kind: 'income', amount: 30000, wallet: 'gopay' }] }),
  one('m6', 'aman', 'baru ngajuin refund 45rb ke tokonya', say(/refund/i)),
  catat('m7', 'aman', 'makan siang client 250rb pakai jago, nanti direimburse kantor', { n: 1, acts: [{ kind: 'claim_new', amount: 250000, wallet: 'jago' }] }),
  catat('m8', 'aman', 'kantor udah transfer klaim 200rb, dari total 250rb', { n: 1, acts: [{ kind: 'claim_payment', amount: 200000 }] }),
  catat('m9', 'aman', 'papa kirim 500rb', { n: 1, acts: [{ kind: 'income', amount: 500000 }] }),
  catat('m10', 'aman', 'karaoke 400rb bagi rata berlima termasuk aku', { mine: 80000 }),
  catat('m11', 'aman', 'aku bayarin 300rb buat bertiga, bagi rata', { mine: 100000, out: 300000 }),
  catat('m12', 'aman', 'tagihan rina 200rb, dia baru bayar 50rb', { n: 1, acts: [{ kind: 'receivable_payment', amount: 50000, person: 'rina' }] }),
  catat('m13', 'aman', 'sinta masih utang 250rb, hari ini nyicil 100rb', { n: 1, acts: [{ kind: 'receivable_payment', amount: 100000, person: 'sinta' }] }),
  one('m14', 'aman', 'cashback 15rb tapi dalam bentuk poin', say(/poin/i)),
  one('m15', 'aman', 'sisihin 2jt di jago buat dana usaha', say(/isi dompet|pisah/i)),
  one('m16', 'aman', 'saldo gopay selisih 20rb, bikin transaksi aja biar sama', say(/samakan saldo|selisih/i)),
  one('m17', 'aman', 'sisa 15rb udah gue ikhlasin', { record: false }),
  catat('m18', 'aman', 'ganti layar hp 450rb', { n: 1, acts: [{ kind: 'expense', amount: 450000, cat: BELANJA }] }),
  catat('m19', 'aman', 'rendang 30rb', { n: 1, acts: [{ kind: 'expense', cat: FOOD }] }),
  catat('m20', 'aman', 'makan lembur 35rb', { n: 1, acts: [{ kind: 'expense', amount: 35000 }] }),
  catat('m21', 'aman', 'isi tabung gas 25rb', { n: 1, acts: [{ kind: 'expense', amount: 25000 }] }),
  catat('m22', 'aman', 'kopi 30rb masukin kategori nongkrong aja', { n: 1, acts: [{ amount: 30000, cat: HIBURAN }] }),
  one('m23', 'aman', 'total belanja 200rb, bayar cash 100rb, gopay 70rb', say(/30\.000/)),
  catat('m24', 'aman', 'kakak transfer 300rb', { n: 1, acts: [{ kind: 'income', amount: 300000 }] }),
  catat('m25', 'aman', 'ongkos makan 150rb bagi rata ke tiga temen, aku gak ikut makan', { mine: 0, out: 150000 }),
  catat('m26', 'aman', 'budget makan tambahin 300rb', { n: 1, acts: [{ kind: 'budget', amount: 1300000 }] }),
  catat('m27', 'aman', 'pakan kucing 20rb', { n: 1, acts: [{ kind: 'expense', notCat: KESEHATAN }] }),

  // ——— Kosakata di luar dokumen ———
  ...VOCAB.map(([w, cat], i) => catat(`k${i + 1}`, 'kosakata', `${w} 20rb`, { n: 1, acts: [{ kind: 'expense', amount: 20000, cat }] })),
];
