/**
 * 10.6 Asisten chat 5.0 — the master prompt for the financial assistant, checked on the accounts of bench/v102/state.mjs
 * (Dinda, Thursday 15 Oct 2026, 15.00, payday the 24th; wallets Jago, GoPay, Jenius, Mandiri, BRI, Krom, Cash; three
 * months of records, two debts, three receivables, three goals).
 *
 *   build('dev') / build('heldout') → cases in the bench/v102 format ({ id, fam, voice, turns: [{ say, check } | { save }] })
 *
 * Twelve families, from what the 10.5 assistant was seen to miss when every example of the master prompt was tried on
 * it (scratch notes, not here). The two splits are written apart: different words, things, people, amounts and sentence
 * shapes; only the account's own names (wallets, the people who owe or are owed, goals) are common. Expected sums are
 * worked out here from the sentence or straight from the ledger. Written before any 5.0 code; the held-out split is run
 * once, at the end. The master prompt's own example sentences are in the dev split only.
 */
import { accounts } from '../v102/state.mjs';

const TODAY = '2026-10-15';
const DATA = accounts[0].data;
const rp = n => `Rp${Math.round(n).toLocaleString('id-ID')}`;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const money = n => new RegExp(`${esc(rp(n))}(?![\\d.])`);
const day = n => { const d = new Date(`${TODAY}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

// ——— From the ledger ———
const catById = new Map(DATA.categories.map(c => [c.id, c]));
const catName = id => catById.get(id)?.name || '';
const CYCLE = ['2026-09-24', '2026-10-24'];
const spentIn = (name, [a, b]) => DATA.transactions.filter(t => t.type === 'expense' && t.date >= a && t.date <= b && (catName(t.categoryId) === name || catName(t.subcategoryId) === name)).reduce((n, t) => n + t.amount, 0);
const foodBudget = DATA.budgets.find(b => catName(b.categoryId) === 'Makan & Minum');
const FOOD_LEFT = foodBudget ? foodBudget.amount - spentIn('Makan & Minum', [CYCLE[0], TODAY]) : 0;
const lastSalary = DATA.transactions.filter(t => t.type === 'income' && (catName(t.categoryId) === 'Gaji' && !t.subcategoryId || catName(t.subcategoryId) === 'Gaji Bulanan')).sort((a, b) => b.date.localeCompare(a.date))[0]?.amount || 0;
const RECV = Object.fromEntries((DATA.receivables || []).filter(r => r.status !== 'paid').map(r => [r.person, r.remainingAmount]));
const DEBT = Object.fromEntries((DATA.debts || []).map(d => [d.name, d.outstandingAmount]));
const RECV_TOTAL = Object.values(RECV).reduce((n, v) => n + v, 0);

const NOT = { notRecord: true, notUnknown: true };
const one = (say, check, voice = 'santai') => ({ voice, turns: [{ say, check }] });
/** A conversation: strings are said, '#save' taps Simpan, { say, check } checks a turn on the way; `check` is the last one's. */
const dlg = (turns, check, voice = 'santai') => ({ voice, turns: turns.map((t, i) => t === '#save' ? { save: true } : { ...(typeof t === 'string' ? { say: t } : t), ...(i === turns.length - 1 ? { check } : {}) }) });
const CONGRATS = /selamat|mantap|keren|hebat|bangga|salut|good job|top|luar biasa|asik|yeay|alhamdulillah|syukur/i;

export const FAMILIES = {
  bukan: 'Bukan catatan: simulasi, keinginan, total, hiperbola',
  tanpa: 'Aksi tanpa nominal (ditanya, lalu dilengkapi)',
  piutang: 'Piutang dibayar vs bayar utang',
  kompleks: 'Transaksi kompleks (kembali, talangan, admin, masing-masing, dua dompet)',
  nominal: 'Nominal tanpa satuan & bahasa gaul',
  waktu: 'Tanggal relatif',
  hitung: 'Hitungan & simulasi',
  konteks: 'Konteks lanjutan & koreksi berlapis',
  fitur: 'Fitur & kemampuan',
  emosi: 'Emosi, curhat, candaan',
  kategori: 'Kategori dari tujuan',
  dasar: 'Dasar (yang sudah jalan tetap jalan)',
};

const SETS = {
  dev: {
    bukan: [
      one('kalau gue beli headset 400rb, sisa duit gue berapa', { ...NOT, any: [/uang bebas|sisa|tersisa/i] }),
      one('Kalau gue beli sepatu 500 ribu, sisa uang gue berapa?', { ...NOT, any: [/uang bebas|sisa|tersisa/i] }),
      one('misal gue jajan boba 25rb tiap hari seminggu habis berapa', { ...NOT, any: [money(175000)] }),
      one('Andai gue nggak beli kopi selama sebulan.', { ...NOT, any: [/kopi/i] }),
      one('Misalnya gaji gue naik 10 persen.', { ...NOT, any: [money(Math.round(lastSalary * 1.1)), money(Math.round(lastSalary * 0.1))] }),
      one('Gue pengen beli sepatu lagi.', { ...NOT, any: [/uang bebas|anggaran|harga|berapa/i] }),
      one('pengen banget ganti hp nih', { ...NOT }),
      one('Buset abis 200rb hari ini.', { ...NOT, any: [/tercatat|dicatat|catatan/i] }),
      one('gila minggu ini udah keluar sejuta lebih', { ...NOT, any: [/tercatat|dicatat|catatan/i] }),
      one('Rasanya pengen beli semua isi mall.', { ...NOT }),
      one('Kalau besok gue top up 100 ribu gimana?', { ...NOT }),
      one('misalnya tiap bulan nabung 1jt, setahun dapet berapa', { ...NOT, any: [money(12000000), /12 ?jt|12 juta/i] }),
      one('gimana kalau gue kurangin jajan 10rb sehari', { ...NOT, any: [money(300000), money(310000), money(70000)] }),
    ],
    tanpa: [
      dlg([{ say: 'Masukin uang lembur ke Mandiri.', check: { ask: true, none: [/^Saldo Mandiri/] } }, '750rb'], { rec: { kind: 'income', total: 750000, wallet: 'Mandiri', cat: 'Lembur' } }),
      dlg([{ say: 'Pindahin uang dari BRI ke Mandiri.', check: { ask: true, none: [/^Saldo BRI/] } }, '300rb'], { rec: { kind: 'transfer', total: 300000, wallet: 'BRI', to: 'Mandiri' } }),
      dlg([{ say: 'top up gopay dari jago', check: { ask: true } }, '100rb'], { rec: { kind: 'transfer', total: 100000, wallet: 'Jago', to: 'GoPay' } }),
      dlg([{ say: 'Gue tadi makan ayam geprek.', check: { ask: true, notUnknown: true } }, '25 ribu', 'GoPay'], { rec: { kind: 'expense', total: 25000, wallet: 'GoPay', cat: 'Makan & Minum', has: ['ayam geprek'] } }),
      dlg([{ say: 'barusan beli pulsa', check: { ask: true } }, '50rb'], { rec: { kind: 'expense', total: 50000, cat: 'Pulsa' } }),
      dlg([{ say: 'gajian udah masuk ke jago', check: { ask: true } }, '9jt'], { rec: { kind: 'income', total: 9000000, wallet: 'Jago', cat: 'Gaji' } }),
      dlg([{ say: 'isi saldo krom dari jago dong', check: { ask: true } }, '500rb'], { rec: { kind: 'transfer', total: 500000, wallet: 'Jago', to: 'Krom' } }),
      dlg([{ say: 'catet pengeluaran bensin tadi', check: { ask: true } }, '40rb'], { rec: { kind: 'expense', total: 40000, cat: 'Bensin' } }),
      dlg([{ say: 'tolong masukin bonus ke jenius', check: { ask: true } }, '2jt'], { rec: { kind: 'income', total: 2000000, wallet: 'Jenius', cat: 'Bonus' } }),
    ],
    piutang: [
      one('budi udah bayar utangnya', { rec: { kind: 'receivable_payment', total: RECV.Budi } }),
      one('dimas baru balikin setengah utangnya', { rec: { kind: 'receivable_payment', total: RECV.Dimas / 2 } }),
      one('sari ngembaliin duit gue 50rb', { rec: { kind: 'receivable_payment', total: 50000 } }),
      one('Temen gue bayar utangnya.', { notUnknown: true, ask: true, noKind: ['debt_payment', 'debt_new'] }),
      one('Temen gue baru balikin separuh utangnya.', { notUnknown: true, ask: true, noKind: ['debt_payment', 'debt_new'] }),
      one('Bayar cicilan 500 ribu dari total utang 2 juta.', { rec: { kind: 'debt_payment', total: 500000, count: 1 }, noKind: ['debt_new'] }),
      one('nyicil utang ke kak rina 500rb', { rec: { kind: 'debt_payment', total: 500000 } }),
      one('gue lunasin cicilan hp', { rec: { kind: 'debt_payment', total: DEBT['Cicilan HP'] } }),
      one('budi bayar utang 40rb ke jago', { rec: { kind: 'receivable_payment', total: 40000, wallet: 'Jago' } }),
    ],
    kompleks: [
      one('beli kaos 100rb tapi dikembaliin 20rb', { rec: { kind: 'expense', total: 80000, count: 1 } }),
      one('Bayar 100 ribu, tapi dikembaliin 20 ribu.', { rec: { kind: 'expense', total: 80000, count: 1 } }),
      one('gue bayarin dulu 200rb, nanti andi ganti 150rb', { acts: [{ kind: 'expense', total: 50000 }, { kind: 'receivable_new', total: 150000 }] }),
      one('Gue bayar dulu 200 ribu, nanti temen gue ganti 150 ribu.', { acts: [{ kind: 'expense', total: 50000 }, { kind: 'receivable_new', total: 150000 }] }),
      one('makan berlima 250rb, gue talangin semua', { acts: [{ kind: 'expense', total: 50000 }, { kind: 'receivable_new', total: 200000 }] }),
      one('tarik tunai 300rb dari jago kena biaya admin 6500', { acts: [{ kind: 'transfer', total: 300000, wallet: 'Jago', to: 'Cash' }], any: [/6\.500|6500/] }),
      one('Tarik tunai 200 ribu kena biaya admin 5 ribu.', { acts: [{ kind: 'transfer', total: 200000, to: 'Cash' }], any: [/5\.000|5000/] }),
      one('beli 4 buku masing-masing 35rb', { rec: { kind: 'expense', total: 140000 } }),
      one('Beli tiga barang masing-masing 25 ribu.', { rec: { kind: 'expense', total: 75000 } }),
      one('Beli sepatu 300 ribu pakai dua wallet.', { ask: true, notUnknown: true }),
      one('beli sepatu 300rb, 200rb pake jago 100rb pake gopay', { acts: [{ kind: 'expense', total: 200000, wallet: 'Jago' }, { kind: 'expense', total: 100000, wallet: 'GoPay' }] }),
      one('Tadi salah transfer terus uangnya balik.', { ...NOT }),
      one('beli makan 50rb dapet cashback 10rb', { acts: [{ kind: 'expense', total: 50000 }, { kind: 'income', total: 10000 }] }),
    ],
    nominal: [
      one('Tf dr bri ke mandiri 500.', { rec: { kind: 'transfer', total: 500000, wallet: 'BRI', to: 'Mandiri' } }),
      one('tf dr jago ke gopay 200', { rec: { kind: 'transfer', total: 200000, wallet: 'Jago', to: 'GoPay' } }),
      one('makan 25 parkir 5', { rec: { kind: 'expense', total: 30000, count: 2 } }),
      one('Bensin cepek.', { rec: { kind: 'expense', total: 100000, cat: 'Bensin' } }),
      one('kopi ceban', { rec: { kind: 'expense', total: 10000 } }),
      one('parkir goceng', { rec: { kind: 'expense', total: 5000, cat: 'Parkir' } }),
      one('pulsa goban', { rec: { kind: 'expense', total: 50000 } }),
      one('makan sepuluh rebu', { rec: { kind: 'expense', total: 10000 } }),
      one('sewa kos 1,2jt', { rec: { kind: 'expense', total: 1200000 } }),
      one('setengah juta buat servis motor', { rec: { kind: 'expense', total: 500000, cat: 'Kendaraan' } }),
    ],
    waktu: [
      one('bensin 50rb dua hari lalu', { rec: { kind: 'expense', total: 50000, date: day(2) } }),
      one('makan 30rb seminggu lalu', { rec: { kind: 'expense', total: 30000, date: day(7) } }),
      one('bayar listrik 300rb tiga hari yang lalu', { rec: { kind: 'expense', total: 300000, date: day(3) } }),
      one('nonton 75rb sabtu kemarin', { rec: { kind: 'expense', total: 75000, date: '2026-10-10' } }),
      one('beli buku 80rb tanggal 3', { rec: { kind: 'expense', total: 80000, date: '2026-10-03' } }),
      one('minggu depan mau bayar kos 1,5jt', { rec: { kind: 'plan_new', total: 1500000 } }),
    ],
    hitung: [
      one('Gaji 6,5 juta, pengeluaran 4 juta, berapa persen bisa gue tabung?', { ...NOT, all: [/38[,.]4|38[,.]5/], any: [money(2500000)] }),
      one('Gue punya 2 juta dan masih 20 hari sampai gajian.', { ...NOT, any: [money(100000)] }),
      one('sepatu 500rb diskon 20% terus diskon lagi 10%', { ...NOT, any: [money(360000)] }),
      one('Makan 125 ribu dibagi 3 orang.', { ...NOT, any: [money(41667)] }),
      one('gue mau beli hp 4jt, nabung 500rb sebulan berapa lama', { ...NOT, any: [/8 bulan/] }),
      one('berapa persen 750rb dari 5jt', { ...NOT, any: [/15 ?%|15 persen/] }),
      one('pengeluaran 3,2jt dari gaji 8jt itu berapa persen', { ...NOT, any: [/40 ?%|40 persen/] }),
    ],
    konteks: [
      dlg(['gue tadi makan bakso', '20rb', 'pake cash'], { rec: { kind: 'expense', total: 20000, wallet: 'Cash', cat: 'Makan & Minum', has: ['bakso'] } }),
      dlg(['budget makan sisa berapa', 'kalau gue pake 100rb?'], { ...NOT, any: [money(FOOD_LEFT - 100000)] }),
      dlg(['Budget makan gue masih berapa?', { say: 'Kalau gue pake 50 ribu?', check: { ...NOT, any: [money(FOOD_LEFT - 50000)] } }, 'Terus besok 75 ribu lagi.'], { ...NOT, any: [money(FOOD_LEFT - 125000)] }),
      dlg(['Tadi makan 30 ribu sama kopi 20 ribu.', 'Kopinya batal.', 'Yang makan bayarnya cash.'], { rec: { kind: 'expense', total: 30000, wallet: 'Cash', count: 1 } }),
      dlg(['makan 20rb, kopi 15rb, bensin 40rb', 'semua pakai cash kecuali bensin'], { acts: [{ kind: 'expense', total: 20000, wallet: 'Cash' }, { kind: 'expense', total: 15000, wallet: 'Cash' }, { kind: 'expense', total: 40000, notWallet: 'Cash' }] }),
      dlg(['makan 20rb, kopi 15rb, nonton 40rb', 'yang pertama sama kedua masuk kategori makan, sisanya hiburan'], { acts: [{ cat: 'Makan & Minum' }, { cat: 'Makan & Minum' }, { cat: 'Nongkrong & Hiburan' }] }),
      dlg([{ say: 'Gue mau beli HP 5 juta.', check: { notRecord: true } }, { say: 'Tapi yang 4 juta juga bagus.', check: { notRecord: true } }, 'Kalau nabung 500 ribu tiap bulan?'], { ...NOT, any: [/8 bulan/] }),
      dlg(['Catetin kopi 20 ribu dari cash.', 'Eh salah.', '25 ribu', 'Dari BRI aja.'], { rec: { kind: 'expense', total: 25000, wallet: 'BRI', count: 1 } }),
      dlg(['kopi 18rb', '#save', 'tanggalnya kemarin, bukan hari ini'], { upd: { target: 'last', date: day(1) } }),
    ],
    fitur: [
      one('Uang gue paling banyak ada di mana?', { notRecord: true, all: [/Jago/], any: [money(9500000)] }),
      one('Bisa catetin utang nggak?', { ...NOT, any: [/\bbisa\b/i], none: [/tidak punya piutang/i] }),
      one('bisa bikin anggaran ga sih', { ...NOT, any: [/\bbisa\b/i] }),
      one('Pindahin 500 ribu ke tabungan.', { notUnknown: true, noKind: ['expense'], any: [/Liburan Bali|Dana Darurat|Laptop Baru|tujuan dana|dompet/i] }),
      one('Gue mau pisahin duit buat kuliah.', { ...NOT, any: [/tujuan dana|anggaran|kantong/i] }),
      one('Bantu atur gaji gue.', { ...NOT, any: [/50|kebutuhan|tabung/i] }),
      one('Berapa yang harus gue sisihin tiap bulan?', { ...NOT, any: [/Liburan Bali|Laptop Baru|Dana Darurat|tujuan/i] }),
      dlg(['kopi 18rb', '#save', 'Hapus yang kemarin.'], { notUnknown: true, any: [/yang mana|pilih|mana yang/i] }),
      one('Gajian dah masuk.', { ask: true, chipsAny: [money(lastSalary), new RegExp(`${String(lastSalary / 1e6).replace('.', '[,.]')} ?jt`)] }),
      one('Temen gue masih utang berapa?', { notRecord: true, any: [money(RECV_TOTAL)] }),
      dlg(['makan 25rb', '#save', 'Hapus transaksi terakhir.'], { del: 'last' }),
    ],
    emosi: [
      one('Akhirnya gue berhasil nabung bulan ini.', { ...NOT, any: [CONGRATS] }),
      one('Seneng banget utang gue lunas.', { ...NOT, any: [CONGRATS] }),
      one('Gue nyesel beli barang itu.', { ...NOT }),
      one('Rasanya gaji gue kurang terus.', { ...NOT }),
      one('Gue iri liat orang lain udah punya banyak uang.', { ...NOT }),
      one('Gue takut nggak punya cukup uang buat masa depan.', { ...NOT }),
      one('Enak kali ya punya uang banyak.', { ...NOT }),
      one('Harga makanan sekarang mahal banget.', { ...NOT }),
      one('Miskin permanen gue kayaknya wkwk.', { ...NOT }),
      one('Capek banget kerja tapi tabungan segini-gini aja.', { ...NOT, intent: ['mood', 'curhat', 'tips', 'banter', 'smalltalk', 'talk'] }),
      one('gua kagak jadi beli sepatu', { ...NOT }),
    ],
    kategori: [
      one('Tlg kurangin saldo gopay 20rb buat kopi.', { rec: { kind: 'expense', total: 20000, wallet: 'GoPay', cat: 'Makan & Minum' } }),
      one('kasih ceban ke pengamen', { rec: { kind: 'expense', total: 10000, cat: 'Sosial & Sedekah' } }),
      one('seratus lima puluh ribu buat sepatu', { rec: { kind: 'expense', total: 150000, cat: 'Belanja' } }),
      one('potong saldo jago 50rb buat bensin', { rec: { kind: 'expense', total: 50000, wallet: 'Jago', cat: 'Transportasi' } }),
      one('pake jenius 300rb buat kursus', { rec: { kind: 'expense', total: 300000, wallet: 'Jenius', cat: 'Pendidikan' } }),
      one('sumbang 50rb buat masjid', { rec: { kind: 'expense', total: 50000, cat: 'Sosial & Sedekah' } }),
      one('duit 25rb buat potong rambut', { rec: { kind: 'expense', total: 25000, cat: 'Personal' } }),
    ],
    dasar: [
      one('makan siang 35rb pake gopay', { rec: { kind: 'expense', total: 35000, wallet: 'GoPay', cat: 'Makan Siang' } }),
      one('Tdi gw mkn 25rb.', { rec: { kind: 'expense', total: 25000, cat: 'Makan & Minum' } }),
      one('Spent 35k for lunch.', { rec: { kind: 'expense', total: 35000, cat: 'Makan & Minum' } }),
      one('w udh byr listrik 250rb', { rec: { kind: 'expense', total: 250000, cat: 'Listrik' } }),
      one('dapet cuan 300rb dari jualan', { rec: { kind: 'income', total: 300000, cat: 'Penjualan' } }),
      one('saldo gopay berapa', { notRecord: false, any: [money(650000)] }),
      one('Transfer 500 ribu dari Jago ke GoPay.', { rec: { kind: 'transfer', total: 500000, wallet: 'Jago', to: 'GoPay' } }),
      one('Makan 30 ribu cash, kopi 25 ribu GoPay, bensin 50 ribu BRI.', { acts: [{ total: 30000, wallet: 'Cash' }, { total: 25000, wallet: 'GoPay' }, { total: 50000, wallet: 'BRI' }] }),
      one('Gue kayaknya boros.', { ...NOT }),
      one('Lu bisa ngapain aja?', { ...NOT }),
    ],
  },
  heldout: {
    bukan: [
      one('andai beli speaker 750rb, uang gue masih sisa berapa', { ...NOT, any: [/uang bebas|sisa|tersisa/i] }),
      one('kalo aku beli monitor 1,8jt sisa duitku jadi brp', { ...NOT, any: [/uang bebas|sisa|tersisa/i] }),
      one('umpama beli cilok 10rb tiap hari selama seminggu totalnya berapa', { ...NOT, any: [money(70000)] }),
      one('seandainya gue stop ngopi sebulan penuh', { ...NOT, any: [/kopi/i] }),
      one('seandainya gajiku naik 20% jadi berapa', { ...NOT, any: [money(Math.round(lastSalary * 1.2)), money(Math.round(lastSalary * 0.2))] }),
      one('kepengen beli kamera baru deh', { ...NOT, any: [/uang bebas|anggaran|harga|berapa/i] }),
      one('pengen ganti laptop rasanya', { ...NOT }),
      one('anjir hari ini udah ngabisin 400rb', { ...NOT, any: [/tercatat|dicatat|catatan/i] }),
      one('pekan ini tekor 1,5jt kayaknya', { ...NOT, any: [/tercatat|dicatat|catatan/i] }),
      one('pengen ngeborong isi marketplace rasanya', { ...NOT }),
      one('kalo lusa isi saldo gopay 150rb dari jago gimana', { ...NOT }),
      one('misal nyisihin 750rb per bulan, 2 tahun jadi berapa', { ...NOT, any: [money(18000000), /18 ?jt|18 juta/i] }),
      one('kalo tiap hari hemat 15rb, sebulan dapet berapa', { ...NOT, any: [money(450000), money(465000)] }),
    ],
    tanpa: [
      dlg([{ say: 'tambahin uang lemburan ke bri', check: { ask: true, none: [/^Saldo BRI/] } }, '600rb'], { rec: { kind: 'income', total: 600000, wallet: 'BRI', cat: 'Lembur' } }),
      dlg([{ say: 'oper duit dari jago ke jenius', check: { ask: true, none: [/^Saldo Jago/] } }, '1jt'], { rec: { kind: 'transfer', total: 1000000, wallet: 'Jago', to: 'Jenius' } }),
      dlg([{ say: 'isi gopay pake jago', check: { ask: true } }, '75rb'], { rec: { kind: 'transfer', total: 75000, wallet: 'Jago', to: 'GoPay' } }),
      dlg([{ say: 'td aku makan seblak', check: { ask: true, notUnknown: true } }, '18rb', 'cash'], { rec: { kind: 'expense', total: 18000, wallet: 'Cash', cat: 'Makan & Minum', has: ['seblak'] } }),
      dlg([{ say: 'abis beli token listrik', check: { ask: true } }, '100rb'], { rec: { kind: 'expense', total: 100000, cat: 'Listrik' } }),
      dlg([{ say: 'thr udah cair ke mandiri', check: { ask: true } }, '5jt'], { rec: { kind: 'income', total: 5000000, wallet: 'Mandiri', cat: 'Gaji' } }),
      dlg([{ say: 'topup krom dari bri', check: { ask: true } }, '250rb'], { rec: { kind: 'transfer', total: 250000, wallet: 'BRI', to: 'Krom' } }),
      dlg([{ say: 'masukin ongkos parkir tadi', check: { ask: true } }, '5rb'], { rec: { kind: 'expense', total: 5000, cat: 'Parkir' } }),
      dlg([{ say: 'insentif udah masuk ke jago', check: { ask: true } }, '1,5jt'], { rec: { kind: 'income', total: 1500000, wallet: 'Jago', cat: 'Insentif' } }),
    ],
    piutang: [
      one('sari udah lunasin utangnya', { rec: { kind: 'receivable_payment', total: RECV.Sari } }),
      one('dimas transfer separuh utangnya', { rec: { kind: 'receivable_payment', total: RECV.Dimas / 2 } }),
      one('budi nyicil 30rb', { rec: { kind: 'receivable_payment', total: 30000 } }),
      one('temen aku udah balikin duitnya', { notUnknown: true, ask: true, noKind: ['debt_payment', 'debt_new'] }),
      one('kawan gue udah ngelunasin pinjamannya', { notUnknown: true, ask: true, noKind: ['debt_payment', 'debt_new'] }),
      one('cicil utang 300rb, total utangnya 2jt', { rec: { kind: 'debt_payment', total: 300000, count: 1 }, noKind: ['debt_new'] }),
      one('bayar ke kak rina 1jt', { rec: { kind: 'debt_payment', total: 1000000 } }),
      one('utang ke kak rina udah gue lunasin', { rec: { kind: 'debt_payment', total: DEBT['Pinjaman Kak Rina'] } }),
      one('dimas balikin 100rb ke gopay', { rec: { kind: 'receivable_payment', total: 100000, wallet: 'GoPay' } }),
    ],
    kompleks: [
      one('beli celana 150rb tapi dibalikin 30rb', { rec: { kind: 'expense', total: 120000, count: 1 } }),
      one('bayar 80rb terus dikembaliin 15rb', { rec: { kind: 'expense', total: 65000, count: 1 } }),
      one('aku talangin dulu 300rb, ntar sari ganti 200rb', { acts: [{ kind: 'expense', total: 100000 }, { kind: 'receivable_new', total: 200000 }] }),
      one('gue bayarin dulu 120rb, ntar temen gue gantiin 90rb', { acts: [{ kind: 'expense', total: 30000 }, { kind: 'receivable_new', total: 90000 }] }),
      one('nongkrong berempat 400rb, gue bayarin semua dulu', { acts: [{ kind: 'expense', total: 100000 }, { kind: 'receivable_new', total: 300000 }] }),
      one('narik tunai 500rb dari bri, biaya adminnya 7500', { acts: [{ kind: 'transfer', total: 500000, wallet: 'BRI', to: 'Cash' }], any: [/7\.500|7500/] }),
      one('ambil duit di atm 100rb kena biaya admin 2500', { acts: [{ kind: 'transfer', total: 100000, to: 'Cash' }], any: [/2\.500|2500/] }),
      one('beli 5 pulpen masing2 4rb', { rec: { kind: 'expense', total: 20000 } }),
      one('beli dua barang masing-masing 60rb', { rec: { kind: 'expense', total: 120000 } }),
      one('bayar laptop 5jt pake dua rekening', { ask: true, notUnknown: true }),
      one('beli tas 400rb, 250rb dari jenius 150rb dari gopay', { acts: [{ kind: 'expense', total: 250000, wallet: 'Jenius' }, { kind: 'expense', total: 150000, wallet: 'GoPay' }] }),
      one('tadi kesalahan transfer tapi duitnya udah dibalikin', { ...NOT }),
      one('jajan 30rb dapat cashback 5rb', { acts: [{ kind: 'expense', total: 30000 }, { kind: 'income', total: 5000 }] }),
    ],
    nominal: [
      one('pindahin jago ke krom 300', { rec: { kind: 'transfer', total: 300000, wallet: 'Jago', to: 'Krom' } }),
      one('tf gopay ke jenius 150', { rec: { kind: 'transfer', total: 150000, wallet: 'GoPay', to: 'Jenius' } }),
      one('nasgor 15 es teh 5', { rec: { kind: 'expense', total: 20000, count: 2 } }),
      one('tol ceban', { rec: { kind: 'expense', total: 10000, cat: 'Tol' } }),
      one('sabun goceng', { rec: { kind: 'expense', total: 5000 } }),
      one('beli buku dua puluh lima ribu', { rec: { kind: 'expense', total: 25000 } }),
      one('kontrakan 1,1jt', { rec: { kind: 'expense', total: 1100000 } }),
      one('service motor setengah juta', { rec: { kind: 'expense', total: 500000, cat: 'Kendaraan' } }),
      one('ojol goban', { rec: { kind: 'expense', total: 50000, cat: 'Transportasi' } }),
      one('jajan cilok seceng', { rec: { kind: 'expense', total: 1000 } }),
    ],
    waktu: [
      one('parkir 5rb 2 hari yg lalu', { rec: { kind: 'expense', total: 5000, date: day(2) } }),
      one('kemarin lusa ngopi 28rb', { rec: { kind: 'expense', total: 28000, date: day(2) } }),
      one('makan 40rb sepekan lalu', { rec: { kind: 'expense', total: 40000, date: day(7) } }),
      one('isi bensin 60rb empat hari lalu', { rec: { kind: 'expense', total: 60000, date: day(4) } }),
      one('beli kado 150rb jumat lalu', { rec: { kind: 'expense', total: 150000, date: '2026-10-09' } }),
      one('bulan depan mau bayar asuransi 400rb', { rec: { kind: 'plan_new', total: 400000 } }),
    ],
    hitung: [
      one('penghasilan 7jt, pengeluaran 5,6jt, berapa persen yang bisa ditabung', { ...NOT, all: [/20 ?%|20 persen/], any: [money(1400000)] }),
      one('uang sisa 900rb, 15 hari lagi gajian, sehari jatahnya berapa', { ...NOT, any: [money(60000)] }),
      one('jaket 400rb diskon 25% lalu diskon 10% lagi', { ...NOT, any: [money(270000)] }),
      one('tagihan 210rb bagi 4 orang', { ...NOT, any: [money(52500)] }),
      one('target laptop 12jt, nyisihin 1jt sebulan, berapa bulan', { ...NOT, any: [/12 bulan/] }),
      one('20 persen dari 3,5jt berapa', { ...NOT, any: [money(700000)] }),
      one('gaji 10jt, kepake 7,5jt, itu berapa persen', { ...NOT, any: [/75 ?%|75 persen/] }),
    ],
    konteks: [
      dlg(['td makan mie ayam', '17rb', 'pake gopay'], { rec: { kind: 'expense', total: 17000, wallet: 'GoPay', cat: 'Makan & Minum', has: ['mie ayam'] } }),
      dlg(['anggaran makan masih ada berapa', 'kalo kepake 80rb?'], { ...NOT, any: [money(FOOD_LEFT - 80000)] }),
      dlg(['sisa budget makan brp', { say: 'misal kepake 60rb', check: { ...NOT, any: [money(FOOD_LEFT - 60000)] } }, 'trus lusa 40rb lagi'], { ...NOT, any: [money(FOOD_LEFT - 100000)] }),
      dlg(['nasgor 25rb sama es teh 5rb', 'es tehnya ga jadi', 'nasgornya pake jago'], { rec: { kind: 'expense', total: 25000, wallet: 'Jago', count: 1 } }),
      dlg(['parkir 5rb, makan 30rb, bensin 50rb', 'semuanya pakai gopay kecuali makan'], { acts: [{ total: 5000, wallet: 'GoPay' }, { total: 30000, notWallet: 'GoPay' }, { total: 50000, wallet: 'GoPay' }] }),
      dlg(['kopi 25rb, makan 40rb, karaoke 100rb', 'yang pertama dan kedua kategori makan, yang ketiga hiburan'], { acts: [{ cat: 'Makan & Minum' }, { cat: 'Makan & Minum' }, { cat: 'Nongkrong & Hiburan' }] }),
      dlg([{ say: 'pengen beli laptop 12jt', check: { notRecord: true } }, { say: 'tapi yang 9jt juga oke', check: { notRecord: true } }, 'kalo nyisihin 1jt per bulan?'], { ...NOT, any: [/9 bulan/] }),
      dlg(['catat ngopi 22rb pake cash', 'eh keliru', '27rb', 'pake jenius aja'], { rec: { kind: 'expense', total: 27000, wallet: 'Jenius', count: 1 } }),
      dlg(['bakso 20rb', '#save', 'tanggalnya kemaren'], { upd: { target: 'last', date: day(1) } }),
    ],
    fitur: [
      one('uangku paling banyak nyimpen di mana', { notRecord: true, all: [/Jago/], any: [money(9500000)] }),
      one('bisa nyatet piutang nggak', { ...NOT, any: [/\bbisa\b/i], none: [/tidak punya piutang/i] }),
      one('bisa pasang target tabungan gak', { ...NOT, any: [/\bbisa\b/i] }),
      one('tolong pindahin 300rb ke tabungan', { notUnknown: true, noKind: ['expense'], any: [/Liburan Bali|Dana Darurat|Laptop Baru|tujuan dana|dompet/i] }),
      one('aku pengen misahin uang buat nikah', { ...NOT, any: [/tujuan dana|anggaran|kantong/i] }),
      one('tolong bagiin gaji aku biar rapi', { ...NOT, any: [/50|kebutuhan|tabung/i] }),
      one('sebulan idealnya nyisihin berapa ya', { ...NOT, any: [/Liburan Bali|Laptop Baru|Dana Darurat|tujuan|20 ?%/i] }),
      dlg(['teh 8rb', '#save', 'hapus transaksi yg kemarin'], { notUnknown: true, any: [/yang mana|pilih|mana yang/i] }),
      one('gajian dah masuk nih', { ask: true, chipsAny: [money(lastSalary), new RegExp(`${String(lastSalary / 1e6).replace('.', '[,.]')} ?jt`)] }),
      one('orang2 masih punya utang berapa ke aku', { notRecord: true, any: [money(RECV_TOTAL)] }),
      dlg(['bakso 22rb', '#save', 'apus yang barusan'], { del: 'last' }),
    ],
    emosi: [
      one('alhamdulillah bulan ini bisa nyisihin uang', { ...NOT, any: [CONGRATS] }),
      one('lega banget cicilan udah beres', { ...NOT, any: [CONGRATS] }),
      one('nyesel parah kemarin checkout barang ga penting', { ...NOT }),
      one('kok penghasilan gue ga pernah cukup ya', { ...NOT }),
      one('minder liat temen2 udah pada punya rumah', { ...NOT }),
      one('khawatir banget soal dana pensiun', { ...NOT }),
      one('andai aja gue sultan', { ...NOT }),
      one('biaya hidup makin gila mahalnya', { ...NOT }),
      one('bokek abadi gue kayaknya haha', { ...NOT }),
      one('kerja mulu tapi saldo gitu-gitu aja', { ...NOT, intent: ['mood', 'curhat', 'tips', 'banter', 'smalltalk', 'talk'] }),
      one('ga jadi beli jaket deh', { ...NOT }),
    ],
    kategori: [
      one('kurangi saldo cash 15rb buat es teh', { rec: { kind: 'expense', total: 15000, wallet: 'Cash', cat: 'Makan & Minum' } }),
      one('ngasih 20rb ke pengemis', { rec: { kind: 'expense', total: 20000, cat: 'Sosial & Sedekah' } }),
      one('dua ratus ribu buat celana', { rec: { kind: 'expense', total: 200000, cat: 'Belanja' } }),
      one('potong saldo bri 60rb buat isi bensin', { rec: { kind: 'expense', total: 60000, wallet: 'BRI', cat: 'Transportasi' } }),
      one('pakai gopay 250rb buat les bahasa inggris', { rec: { kind: 'expense', total: 250000, wallet: 'GoPay', cat: 'Pendidikan' } }),
      one('infaq 100rb ke musholla', { rec: { kind: 'expense', total: 100000, cat: 'Sosial & Sedekah' } }),
      one('keluar 35rb buat cukur rambut', { rec: { kind: 'expense', total: 35000, cat: 'Personal' } }),
    ],
    dasar: [
      one('makan malam 45rb pake jago', { rec: { kind: 'expense', total: 45000, wallet: 'Jago', cat: 'Makan Malam' } }),
      one('td sy sarapan 15rb', { rec: { kind: 'expense', total: 15000, cat: 'Makan & Minum' } }),
      one('paid 50k for dinner', { rec: { kind: 'expense', total: 50000, cat: 'Makan & Minum' } }),
      one('gw udh bayar wifi 300rb', { rec: { kind: 'expense', total: 300000, cat: 'Internet' } }),
      one('dpt duit 250rb dr jualan baju', { rec: { kind: 'income', total: 250000, cat: 'Penjualan' } }),
      one('sisa saldo cash brp', { any: [money(300000)] }),
      one('transfer 200rb dari jago ke jenius', { rec: { kind: 'transfer', total: 200000, wallet: 'Jago', to: 'Jenius' } }),
      one('ngopi 20rb gopay, makan 35rb cash, parkir 5rb jago', { acts: [{ total: 20000, wallet: 'GoPay' }, { total: 35000, wallet: 'Cash' }, { total: 5000, wallet: 'Jago' }] }),
      one('kayaknya aku boros deh', { ...NOT }),
      one('kamu bisa bantu apa aja', { ...NOT }),
    ],
  },
};

export function build(split) {
  const out = [];
  for (const [fam, list] of Object.entries(SETS[split])) list.forEach((c, i) => out.push({ id: `${fam}${i + 1}`, fam, ...c }));
  return out;
}
export const FACTS = { FOOD_LEFT, lastSalary, RECV, DEBT, RECV_TOTAL };
