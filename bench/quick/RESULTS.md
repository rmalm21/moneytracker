# Hasil benchmark Catat otomatis

192 kalimat, konteks tetap, hari ini = Sabtu 26 September 2026. `v1` = mesin sebelum 2.0 (commit `4a85e7e`),
dibaca seperti pratinjaunya dulu (dompet transfer yang kosong diisi dompet utama tanpa tanda). `v2` = `lib/quick-plan.ts`.

## Set utama (147 kalimat)

| Ukuran | v1 | v2 |
| --- | ---: | ---: |
| Kalimat benar seluruhnya | 76% | 100% |
| Jumlah aksi benar | 91% | 100% |
| Jenis tepat | 92% | 100% |
| Nominal tepat | 97% | 100% |
| Tanggal tepat | 82% | 100% |
| Dompet tepat | 84% | 100% |
| Dompet tujuan tepat | 92% | 100% |
| Catatan terkait tepat | 80% | 100% |
| Kategori tepat | 97% | 100% |
| Pemisahan kalimat benar | 82% | 100% |
| Konteks bersama / rujukan benar | 50% | 100% |
| Kalimat bukan catatan dibiarkan | 80% | 100% |
| Aksi palsu | 2 | 0 |
| Aksi terlewat | 13 | 0 |
| Keraguan ditandai | 18% | 100% |
| **Aksi salah tapi yakin** | **20** | **0** |

## Set uji terpisah (45 kalimat)

| Ukuran | v1 | v2, run pertama | v2, sekarang |
| --- | ---: | ---: | ---: |
| Kalimat benar seluruhnya | 73% | 91% | 100% |
| Jenis tepat | 89% | 94% | 100% |
| Tanggal tepat | 83% | 83% | 100% |
| Catatan terkait tepat | 67% | 86% | 100% |
| Konteks bersama / rujukan benar | 25% | 75% | 100% |
| Keraguan ditandai | 50% | 100% | 100% |
| **Aksi salah tapi yakin** | **9** | **3** | **0** |

Jujur soal angka ini:

- Set utama ditulis sambil membangun v2, jadi 100% di sana hanya berarti "semua kasus yang dipikirkan sudah
  ditangani", bukan akurasi di dunia nyata.
- Set uji terpisah ditulis setelah v2 selesai dan dijalankan sekali tanpa diubah: **91%, 3 aksi salah tapi yakin**
  (v1: 73%, 9). Empat bug yang ditemukannya lalu diperbaiki ("budi minjemin aku", talangan kantor + "diklaim", klaim
  cair lewat nama klaimnya, "senin kemarin"). Setelah itu set ini tidak lagi "belum pernah dilihat"; angka 100%-nya
  tidak boleh dibaca sebagai akurasi. Untuk pengukuran berikutnya, tulis set uji baru.
- Waktu baca: ±5 ms per kalimat di Node (v1 ±3 ms), tanpa dependensi baru.

## Batasan

Kalimat benchmark ditulis tangan, pendek, dan memakai konteks kecil. Kalimat asli bisa lebih panjang, ambigu, atau
memakai nama dompet dan orang yang mirip kata biasa. Mesin ini tetap aturan lokal; ketika ragu, ia menandai kolom
("Perlu dicek" / "Belum terbaca") dan meminta pilihan, bukan menebak.
