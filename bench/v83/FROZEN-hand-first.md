## Chat v3 — hand (187 kasus)

| | 8.2 | sekarang |
|---|---|---|
| **Semua kasus** | 85/187 (45%) | 175/187 (94%) |
| **Rata-rata per keluarga** | 35% | 94% |
| · uang bebas / sisa uang | 1/10 (10%) | 9/10 (90%) |
| · saldo dompet | 2/6 (33%) | 6/6 (100%) |
| · jatah harian | 1/6 (17%) | 6/6 (100%) |
| · hitung nabung (bukan catatan) | 2/12 (17%) | 11/12 (92%) |
| · tanggal & hari tertentu | 7/14 (50%) | 10/14 (71%) |
| · total per kategori | 8/11 (73%) | 10/11 (91%) |
| · per toko | 6/7 (86%) | 7/7 (100%) |
| · persentase | 0/4 (0%) | 4/4 (100%) |
| · rincian per kategori | 2/5 (40%) | 5/5 (100%) |
| · mau hemat di mana | 2/4 (50%) | 4/4 (100%) |
| · skor kesehatan keuangan | 0/4 (0%) | 3/4 (75%) |
| · utang per nama | 2/6 (33%) | 6/6 (100%) |
| · piutang per orang | 2/5 (40%) | 5/5 (100%) |
| · tujuan dana per nama | 0/6 (0%) | 4/6 (67%) |
| · wish list per nama | 0/3 (0%) | 3/3 (100%) |
| · tagihan rutin per nama | 1/5 (20%) | 5/5 (100%) |
| · klaim kantor per nama | 2/3 (67%) | 3/3 (100%) |
| · salah ketik | 0/9 (0%) | 9/9 (100%) |
| · bahasa Inggris & campur | 1/9 (11%) | 9/9 (100%) |
| · bahasa daerah | 1/6 (17%) | 5/6 (83%) |
| · tetap jadi catatan | 20/20 (100%) | 20/20 (100%) |
| · regresi | 20/20 (100%) | 20/20 (100%) |
| · tanya susulan (2 giliran) | 5/12 (42%) | 11/12 (92%) |

Yang gagal:
· h23 kalau sebulan nabung sejuta, 3 tahun dapet brp: tanpa (?:Rp\s?36\.000\.000|Rp\s?36\s?(?:jt|juta))(?![\d.,]\d) — “Tips · Nih yang gue liat dari catatan lo: · Tagihan paling besar periode ini: Rp1.900.000 (41% pengeluaran lo). Pasang anggaran untuknya supaya ada ba”
· h25 tgl 1 kemarin gue ngabisin brp: tanpa (?:Rp\s?1\.565\.500|Rp\s?1,6\s?(?:jt|juta))(?![\d.,]\d) — “ tgl 1 kemarin gue ngabisin brp 1 Sep belum ada pengeluaran “ngabisin”.”
· h27 pas tanggal 4 habis brp: tanpa (?:Rp\s?287\.000|Rp\s?287\s?(?:rb|ribu))(?![\d.,]\d) — “ pas tanggal 4 habis brp 4 Okt belum ada pengeluaran “pas”.”
· h36 bensin sebulan kemarin brp: tanpa (?:Rp\s?533\.000|Rp\s?533\s?(?:rb|ribu))(?![\d.,]\d) — “ bensin sebulan kemarin brp Kemarin belum ada pengeluaran Bensin.”
· h57 skor keuanganku brp dari 100: tanpa \b75\b — “ skor keuanganku brp dari 100 Siklus ini belum ada pengeluaran Biaya Keuangan.”
· h69 dana daruratku ada brp: tidak paham; tanpa (?:Rp\s?3\.000\.000|Rp\s?3\s?(?:jt|juta))(?![\d.,]\d) — “Belum bisa dijawab. Coba:”
· h71 liburan bali kapan kekumpul: tanpa \b8\s?bulan — “Akhirnya libur! Mau jalan-jalan? Tentukan dulu batasnya biar Senin nggak nangis wkwk.”
· h91 duitku sik iso dinggo piro: tidak paham; tanpa (?:Rp\s?4\.200\.000|Rp\s?4,2\s?(?:jt|juta))(?![\d.,]\d) — “Yang itu belum bisa kujawab dari catatanmu. Coba tanya seperti ini:”
· h117 uang yang bener-bener bisa dipakai tuh berapa: tidak paham; tanpa (?:Rp\s?4\.200\.000|Rp\s?4,2\s?(?:jt|juta))(?![\d.,]\d) — “Pertanyaan tersebut belum dapat saya jawab dari catatan Anda. Silakan coba seperti ini:”
· h125 tanggal 6 kemarin beli apa: tanpa (?:Rp\s?57\.500|Rp\s?57,5\s?(?:rb|ribu))(?![\d.,]\d) — “Transaksi · Tanggal 6 kemarin 2 transaksi, keluar Rp144.000. · Solaria · Solaria Rp142.000 · Parkir · Parkir Rp2.000”
· h127 pengeluaran tanggal 14: tidak paham; tanpa (?:Rp\s?422\.500|Rp\s?422,5\s?(?:rb|ribu))(?![\d.,]\d) — “Mohon maaf, saya belum memahami maksudnya. Silakan coba seperti ini:”
· hs9 saldo gopay brp / kalau jago?: tanpa (?:Rp\s?9\.500\.000|Rp\s?9,5\s?(?:jt|juta))(?![\d.,]\d) — “ jago brp Pengeluaran pakai Jago siklus ini Rp3.001.000 (15 transaksi).”
