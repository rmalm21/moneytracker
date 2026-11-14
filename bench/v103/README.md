# 10.3 Asisten chat 4.0 — kalimat bebas

`gen.mjs` membuat 12 keluarga × 140 kalimat per split (dev / held-out, daftar kata dan bentuk kalimat berbeda),
ditambah 80 kalimat tulisan tangan per split (`hand-dev.mjs`, `hand-heldout.mjs`). Tiap kasus dijalankan di dua akun
(`bench/v102/state.mjs`) dan baru dihitung benar kalau benar di keduanya.

    sh bench/v103/make-baseline.sh            # 10.2 (07d309a) ke bench/v103/baseline-v102 (gitignore)
    SET=dev node bench/v103/run.mjs --fails --fields
    SET=heldout node bench/v103/run.mjs --first   # sekali saja; hasilnya dibekukan di FROZEN-heldout-first.md

## Hasil

| | 10.2 | 10.3 |
|---|---|---|
| dev (dipakai untuk menyetel) | 1526/1760 (86.7%) | 1760/1760 (100%) |
| held-out, sekali, dibekukan | 1295/1760 (73.6%) | 1477/1760 (83.9%) |

Held-out per keluarga ada di `FROZEN-heldout-first.md`. Yang naik: dompet salah ketik 0 → 120/140, susulan chat dengan
salah ketik 80 → 136/140, tulisan tangan 65 → 71/80. Yang tidak berubah dan masih lemah: antardompet tanpa kata kerja
transfer (47/140) dan kata seru/gaul yang ikut masuk nama (20/140); keduanya tidak terlihat di dev.

## Catatan kejujuran

- Kedua split (dan kalimat tulisan tangan) ditulis oleh orang yang sama yang menulis mesinnya; held-out tidak buta
  terhadap penulisnya. Bentuk kalimat held-out sempat terbaca saat menulis generator sebelum korpus pembaca kalimat dibuat.
- Korpus latih pembaca kalimat (`scripts/tagger-corpus.mjs`) tidak memakai satu pun kata held-out (selain nama dompet dan
  angka) dan tidak memakai satu pun salah ketik benchmark, dev maupun held-out; `assertClean` menghentikan build bila ada.
- Dua perbaikan penilai dibuat sebelum held-out dijalankan: subkategori yang namanya disebut kasus dihitung benar, dan
  kasus tanpa jenis menerima catatan uang apa pun (piutang dibayar, dsb.). Patokan 10.2 diukur ulang setelahnya.
- Ambang yakin pembaca kalimat dipilih dari kalimat dev dan jebakan buatan sendiri (bukan held-out). Pada 30+12 jebakan
  (kata asli yang mirip nama dompet), 41/47 tetap tidak diubah; yang masih diubah memang mirip salah ketik
  (“copay”, “topay”, “jeniu”, “gopal”, “kromo”).
