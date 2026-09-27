# Hasil benchmark Scan struk: V1 vs V2

39 foto struk sintetis yang sama (lihat `bench/README.md`), 27 September 2026. V1 = versi 2026.09.25-78, V2 = Receipt
Intelligence 2.0 (2026.09.25-79). Keduanya dibaca dengan kode aplikasi masing-masing di Chromium, di server yang sama.

| Ukuran | V1 | V2 |
| --- | ---: | ---: |
| Nama tempat | 87% | 100% |
| Tanggal persis | 85% | 97% |
| Jam | 92% | 100% |
| Grand total persis | 87% | 97% |
| Item terdeteksi (recall) | 84% | 100% |
| Nominal item persis | 74% | 99% |
| Jumlah (qty) | 98% | 100% |
| Biaya tambahan tepat (pajak, biaya, ongkir, diskon) | 48% | 88% |
| Cara bayar | 77% | 100% |
| Struk cocok (rekonsiliasi) | 77% | 95% |
| Item palsu (jumlah seluruh foto) | 11 | 0 |
| Total salah (jumlah foto) | 5 | 1 |
| Total salah tetapi ditandai yakin | 0 | 0 |
| Waktu baca, median / terlama | 3,4 s / 8,5 s | 3,4 s / 13,6 s |

- Tidak ada satu foto pun yang memburuk di ukuran mana pun (termasuk semua foto bersih): V2 tidak mengorbankan struk
  yang sudah terbaca baik.
- Satu total yang masih salah (swalayan dengan bayangan tajam): dua angka salah baca sekaligus (total dan diskon
  member), jadi tidak ada satu perbaikan yang membuat struk cocok. V2 tidak memaksakan angka: total ditandai
  **Perlu dicek**, dan pembacaan ulang angka total (Rp152.700, yang benar) ditawarkan sebagai pilihan satu ketuk.
- Waktu median sama. Foto yang sulit dibaca lebih lama (bacaan tambahan yang tertarget), dengan batas waktu yang
  sama seperti V1; struk yang langsung cocok berhenti setelah satu kali baca.
- Waktu diukur di server pengembangan, bukan di HP; di HP semuanya lebih lambat, dengan perbandingan yang serupa.
- Foto sintetis lebih bersih daripada foto HP sungguhan (tanpa kertas melengkung, tinta pudar alami, atau goyangan
  kamera). Angka ini untuk membandingkan versi dan menangkap kemunduran, bukan janji akurasi untuk semua struk.
