# Asisten chat 5.0 (10.6) — master prompt untuk asisten keuangan

Set uji untuk "MASTER PROMPT — RETRAINING DOMPET AJAIB FINANCIAL ASSISTANT". Ditulis **sebelum** kode 5.0, dari
kelemahan 10.5 yang terlihat saat semua contoh master prompt dicoba (catatan probe di luar repo).

- `gen.mjs` — 12 keluarga, dua belahan yang ditulis terpisah (kata, barang, orang, nominal, dan bentuk kalimat beda):
  **dev** 115 kasus (berisi contoh-contoh dari master prompt sendiri) dan **held-out** 115 kasus.
- `run.mjs` — `SET=dev|heldout node bench/v106/run.mjs [--first] [--fails] [--only=10.5|sekarang]`.
  Tiap kasus jalan di dua akun `bench/v102/state.mjs` dan baru dihitung lulus kalau lulus di keduanya.
- `make-baseline.sh` — salinan `lib/` 10.5 (commit d7c4403) ke `baseline-v105/` (diabaikan git) sebagai patokan.

## Hasil

| | 10.5 | 10.6 |
|---|---|---|
| dev (dipakai selama pengerjaan) | 44/115 (38%) | 115/115 (100%) |
| **held-out, sekali jalan, dibekukan** (`FROZEN-heldout-first.md`) | 52/115 (45%) | **97/115 (84%)** |
| held-out setelah perbaikan pasca-uji | — | 115/115 (100%) — *bukan ukuran bersih lagi* |

Angka jujurnya adalah **97/115 (84%)** di held-out yang belum pernah dilihat. Setelah itu 18 kegagalannya dibaca dan
celah umumnya ditambal (akhiran -ku: "gajiku", "uangku"; sinonim "oper", "tambahin", "kepake", "dibalikin";
biaya admin setelah koma; "tekor" yang dikira typo "telor"; perasaan dengan kata lain). Karena held-out sudah
dibaca, 115/115 setelahnya **tidak** boleh dipakai sebagai ukuran kemampuan.

Sebagai pengganti, ada dua set kalimat baru (bukan dev, bukan held-out) yang ditulis saat itu juga dan dinilai manual:
yang pertama 64 kalimat sebelum held-out (dipakai untuk menemukan celah), yang kedua 37 kalimat sesudahnya:
sekitar 29/37 (≈78%) benar sebelum ditambal — sejalan dengan 84% di held-out.

## Bench lama (tidak boleh turun)

Semua bench chat & Catat otomatis sebelumnya dijalankan ulang di 10.6 dibanding 10.5: tidak ada kasus yang tadinya lulus
jadi gagal; v103 held-out +16 dan v1031 held-out +8 kasus jadi lulus. `npm test` 1018/1018.
