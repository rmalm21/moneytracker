/**
 * 10.7 Daftar bertanggal — a list of transactions grouped under date headers, typed or pasted into Catat otomatis or the
 * chat ("Tolong catat transaksi berikut: 27 November 2026 - Potong rambut … Rp60.000 …"). Written before the 10.7 code,
 * from the shape of a real request (its own names and amounts are not used here).
 *
 * Every list is read on "today" = Saturday 28 November 2026. An item is
 *   [kind, amount, date, category?, subcategory?, { wallet?, to? }?]
 * where category/subcategory may list alternatives with "|" and '' means "not checked".
 * dev: 12 lists in the shapes of the request and the usual variations; heldout: 12 lists written separately (other
 * header formats, bullets, words, places and amounts). The held-out set is run once, at the end.
 */
export const TODAY = '2026-11-28';
const dev = [
  { id: 'dev1', fam: 'permintaan', text: `Tolong catat transaksi berikut:

24 November 2026

- Cukur rambut Barbershop Juragan Rp45.000
- Jajan Warung Bu Siti Rp6.000
- Jajan cilok kuah Rp8.000
- Transaksi Plaza Senayan Rp42.300
- Jajan Warkop Bang Udin Rp4.000
- Makan nasi bebek Cak Mat Rp18.000

23 November 2026

- Jajan cireng isi Rp10.000
- Biaya admin transfer Rp2.500
- Transfer ke rekening Jago sendiri Rp75.000 (mutasi antar dompet, bukan pengeluaran)

22 November 2026

- Jajan Mie Ayam Pakde Rp15.000
- Belanja Alfamart Rp32.000

Sesuaikan kategori masing-masing transaksi dan gunakan tanggal yang tercantum, bukan tanggal hari ini.`, items: [
    ['expense', 45000, '2026-11-24', 'Personal', 'Potong Rambut'], ['expense', 6000, '2026-11-24', 'Makan & Minum', 'Jajan'], ['expense', 8000, '2026-11-24', 'Makan & Minum', 'Jajan'],
    ['expense', 42300, '2026-11-24'], ['expense', 4000, '2026-11-24', 'Makan & Minum', 'Jajan'], ['expense', 18000, '2026-11-24', 'Makan & Minum'],
    ['expense', 10000, '2026-11-23', 'Makan & Minum', 'Jajan'], ['expense', 2500, '2026-11-23', 'Biaya Keuangan', 'Biaya Transfer|Admin Bank'], ['transfer', 75000, '2026-11-23', '', '', { to: 'Jago' }],
    ['expense', 15000, '2026-11-22', 'Makan & Minum', 'Jajan'], ['expense', 32000, '2026-11-22'],
  ] },
  { id: 'dev2', fam: 'hari+bulan singkat', text: `Catat ya:
Kamis, 26 Nov 2026
• Ojek ke kantor 18rb
• Kopi susu 22rb
Jumat, 27 Nov 2026
• Parkir 5rb
• Makan siang padang 28rb`, items: [
    ['expense', 18000, '2026-11-26', 'Transportasi', 'Ojek|Taxi / Online'], ['expense', 22000, '2026-11-26', 'Makan & Minum', 'Kopi & Minuman'],
    ['expense', 5000, '2026-11-27', 'Transportasi', 'Parkir'], ['expense', 28000, '2026-11-27', 'Makan & Minum', 'Makan Siang'],
  ] },
  { id: 'dev3', fam: 'tanggal angka', text: `26/11/2026:
1. Bensin 30.000
2. Laundry 24.000
25/11/2026:
1. Token listrik 100.000`, items: [
    ['expense', 30000, '2026-11-26', 'Transportasi', 'Bensin'], ['expense', 24000, '2026-11-26', 'Rumah & Kebutuhan', 'Laundry'], ['expense', 100000, '2026-11-25', 'Tagihan', 'Listrik'],
  ] },
  { id: 'dev4', fam: 'kemarin/hari ini', text: `Kemarin:
- sarapan bubur 12rb
- grab pulang 35rb
Hari ini:
- makan siang 25rb pakai GoPay`, items: [
    ['expense', 12000, '2026-11-27', 'Makan & Minum', 'Sarapan'], ['expense', 35000, '2026-11-27', 'Transportasi', 'Taxi / Online|Ojek'], ['expense', 25000, '2026-11-28', 'Makan & Minum', 'Makan Siang', { wallet: 'GoPay' }],
  ] },
  { id: 'dev5', fam: 'dompet untuk semua', text: `Semua pakai Mandiri
27 November 2026
- Nasi goreng 20rb
- Es teh 5rb`, items: [
    ['expense', 20000, '2026-11-27', 'Makan & Minum', '', { wallet: 'Mandiri' }], ['expense', 5000, '2026-11-27', 'Makan & Minum', '', { wallet: 'Mandiri' }],
  ] },
  { id: 'dev6', fam: 'tanpa tanggal', text: `Tolong catat pengeluaran hari ini:
- Pulsa 50rb
- Fotokopi 3rb
- Gorengan 6rb`, items: [
    ['expense', 50000, '2026-11-28', 'Tagihan', 'Pulsa'], ['expense', 3000, '2026-11-28', 'Pendidikan', 'Print / Fotokopi'], ['expense', 6000, '2026-11-28', 'Makan & Minum', 'Jajan'],
  ] },
  { id: 'dev7', fam: 'pemasukan', text: `25 November 2026
- Gaji masuk Rp8.500.000 ke Jago
- Bayar kos Rp1.200.000`, items: [
    ['income', 8500000, '2026-11-25', 'Gaji', '', { wallet: 'Jago' }], ['expense', 1200000, '2026-11-25', 'Rumah & Kebutuhan|Tagihan', 'Sewa / Kost'],
  ] },
  { id: 'dev8', fam: 'tgl saja', text: `Tgl 24:
- Martabak manis 35rb
- Tol dalam kota 12rb
Tgl 25:
- Servis motor 150rb`, items: [
    ['expense', 35000, '2026-11-24', 'Makan & Minum'], ['expense', 12000, '2026-11-24', 'Transportasi', 'Tol'], ['expense', 150000, '2026-11-25', 'Kendaraan', 'Service'],
  ] },
  { id: 'dev9', fam: 'transfer + admin', text: `27 November 2026
- Transfer dari BRI ke Mandiri Rp200.000
- Biaya admin Rp6.500`, items: [
    ['transfer', 200000, '2026-11-27', '', '', { wallet: 'BRI', to: 'Mandiri' }], ['expense', 6500, '2026-11-27', 'Biaya Keuangan'],
  ] },
  { id: 'dev10', fam: 'format nominal', text: `Senin, 23 November 2026
- Mie ayam Rp 15.000
- Teh botol 6k
- Parkir motor Rp2.000`, items: [
    ['expense', 15000, '2026-11-23', 'Makan & Minum'], ['expense', 6000, '2026-11-23', 'Makan & Minum'], ['expense', 2000, '2026-11-23', 'Transportasi', 'Parkir'],
  ] },
  { id: 'dev11', fam: 'tanpa tahun + perintah di akhir', text: `21 November
- Beli buku tulis 15rb
- Print tugas 4rb
tolong pakai tanggal itu ya`, items: [
    ['expense', 15000, '2026-11-21', 'Pendidikan', 'Alat Tulis|Buku'], ['expense', 4000, '2026-11-21', 'Pendidikan', 'Print / Fotokopi'],
  ] },
  { id: 'dev12', fam: 'tanpa poin', text: `26 November 2026
Jajan batagor Rp10.000
Jajan es campur Rp8.000`, items: [
    ['expense', 10000, '2026-11-26', 'Makan & Minum', 'Jajan'], ['expense', 8000, '2026-11-26', 'Makan & Minum', 'Jajan'],
  ] },
];
const heldout = [
  { id: 'h1', fam: 'permintaan', text: `Bantu catat dong:

=== 20 November 2026 ===
– Cukur Rambut Sinar Rp40.000
– Jajan Kedai Mas Joko Rp9.000
– Transaksi Grand Indonesia Rp61.200

=== 21 November 2026 ===
– Biaya transfer BI-Fast Rp2.500
– Transfer ke rekening BRI sendiri Rp100.000 (pindah dompet)
– Belanja Superindo Rp58.000

Kategorinya sesuaikan aja ya`, items: [
    ['expense', 40000, '2026-11-20', 'Personal', 'Potong Rambut'], ['expense', 9000, '2026-11-20', 'Makan & Minum', 'Jajan'], ['expense', 61200, '2026-11-20'],
    ['expense', 2500, '2026-11-21', 'Biaya Keuangan', 'Biaya Transfer|Admin Bank'], ['transfer', 100000, '2026-11-21', '', '', { to: 'BRI' }], ['expense', 58000, '2026-11-21'],
  ] },
  { id: 'h2', fam: 'hari (tgl/bln)', text: `Selasa (24/11)
▪ Gojek ke stasiun 23rb
▪ Teh tarik 15rb
Rabu (25/11)
▪ Nasi uduk 12rb
▪ Parkir mall 8rb`, items: [
    ['expense', 23000, '2026-11-24', 'Transportasi', 'Ojek|Taxi / Online'], ['expense', 15000, '2026-11-24', 'Makan & Minum', 'Kopi & Minuman'],
    ['expense', 12000, '2026-11-25', 'Makan & Minum'], ['expense', 8000, '2026-11-25', 'Transportasi', 'Parkir'],
  ] },
  { id: 'h3', fam: 'tanggal strip + 1)', text: `24-11-2026
1) Bensin Pertamax 50.000
2) Cuci motor 20.000
25-11-2026
1) Tagihan internet 350.000`, items: [
    ['expense', 50000, '2026-11-24', 'Transportasi', 'Bensin'], ['expense', 20000, '2026-11-24', 'Kendaraan', 'Cuci Kendaraan'], ['expense', 350000, '2026-11-25', 'Tagihan', 'Internet'],
  ] },
  { id: 'h4', fam: 'kemarin/hari ini kecil', text: `kemarin
* lontong sayur 13rb
* angkot 5rb
hari ini
* kopi tubruk 7rb pake cash`, items: [
    ['expense', 13000, '2026-11-27', 'Makan & Minum'], ['expense', 5000, '2026-11-27', 'Transportasi', 'Transportasi Umum'], ['expense', 7000, '2026-11-28', 'Makan & Minum', 'Kopi & Minuman', { wallet: 'Cash' }],
  ] },
  { id: 'h5', fam: 'dompet di akhir', text: `27 Nov
- Bakso 18rb
- Jus alpukat 15rb
Semuanya pakai GoPay`, items: [
    ['expense', 18000, '2026-11-27', 'Makan & Minum', '', { wallet: 'GoPay' }], ['expense', 15000, '2026-11-27', 'Makan & Minum', '', { wallet: 'GoPay' }],
  ] },
  { id: 'h6', fam: 'tanpa tanggal', text: `Catat pengeluaran berikut:
- Paket data 75rb
- Sabun cuci 12rb
- Seblak 15rb`, items: [
    ['expense', 75000, '2026-11-28', 'Tagihan', 'Paket Data'], ['expense', 12000, '2026-11-28', 'Rumah & Kebutuhan'], ['expense', 15000, '2026-11-28', 'Makan & Minum'],
  ] },
  { id: 'h7', fam: 'pemasukan', text: `26 November 2026
- Terima bonus Rp1.000.000
- Bayar arisan Rp200.000`, items: [
    ['income', 1000000, '2026-11-26', 'Gaji', 'Bonus'], ['expense', 200000, '2026-11-26'],
  ] },
  { id: 'h8', fam: 'tanggal saja', text: `Tanggal 23:
- Pempek 25rb
- Ongkos ojek 10rb
Tanggal 24:
- Ganti oli 65rb`, items: [
    ['expense', 25000, '2026-11-23', 'Makan & Minum'], ['expense', 10000, '2026-11-23', 'Transportasi', 'Ojek|Taxi / Online'], ['expense', 65000, '2026-11-24', 'Kendaraan', 'Oli'],
  ] },
  { id: 'h9', fam: 'transfer + admin', text: `23 November 2026
- Pindah dana dari Jago ke GoPay Rp150.000
- Biaya admin Rp1.000`, items: [
    ['transfer', 150000, '2026-11-23', '', '', { wallet: 'Jago', to: 'GoPay' }], ['expense', 1000, '2026-11-23', 'Biaya Keuangan'],
  ] },
  { id: 'h10', fam: 'format nominal', text: `Minggu, 22 Nov 2026
- Roti bakar Rp 20.000
- Air mineral 4k
- Tol Rp 9.500`, items: [
    ['expense', 20000, '2026-11-22', 'Makan & Minum'], ['expense', 4000, '2026-11-22', 'Makan & Minum'], ['expense', 9500, '2026-11-22', 'Transportasi', 'Tol'],
  ] },
  { id: 'h11', fam: 'tanpa tahun + perintah di akhir', text: `19 November
- Beli pulpen 6rb
- Fotokopi KTP 2rb
pakai tanggal itu`, items: [
    ['expense', 6000, '2026-11-19', 'Pendidikan', 'Alat Tulis'], ['expense', 2000, '2026-11-19', 'Pendidikan', 'Print / Fotokopi'],
  ] },
  { id: 'h12', fam: 'tanpa poin', text: `25 November 2026
Jajan pisang goreng Rp5.000
Jajan kue cubit Rp10.000`, items: [
    ['expense', 5000, '2026-11-25', 'Makan & Minum', 'Jajan'], ['expense', 10000, '2026-11-25', 'Makan & Minum', 'Jajan'],
  ] },
];
export const build = set => set === 'heldout' ? heldout : dev;
