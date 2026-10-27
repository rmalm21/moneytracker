# Catat otomatis: persiapan 6.0 (Bahasa umum 2.0 dan model NLP.js yang dilatih ulang)

Rilis aplikasi 5.11. Fokusnya bahasa yang benar-benar diketik orang dan masih salah dibaca oleh 5.10. Semuanya tetap berjalan di perangkat. Tidak ada model awan.

## Yang berubah

**Bahasa umum 2.0** (`lib/catat/language.ts`):
- **Kata kerja dari bahasa daerah dan Inggris.** "tuku / nuku / nukoni / tumbas / meuli" dibaca *beli*, dan "mbayar / mayar / paid / pay" dibaca *bayar*. Kata kerja daerah hanya dibaca begitu kalau posisinya memang kata kerja. "ngopi di tuku" tetap nama kedai, dan "go pay" tetap dompet.
- **Kata benda Jawa dan Inggris.** sego→nasi, iwak→ikan, electricity→listrik, shoes→sepatu, bill→tagihan, fuel→bensin, dan seterusnya.
- **Slang ketik.** "bli", "mamam", "mimik", "semalem/smlm" dikenali. Kata kerja "nge-" untuk kata atau tempat yang dikenal juga dibaca ("ngebensin", "ngegrab").
- **Sisa di sekitar nominal dibuang, nominalnya tidak diubah.** Contohnya "Rp 450.000,-", "25k an", "kira-kira 3rb", dan "sejuta?".
- **Cara bayar sebelum nama dompet bukan bagian keterangan.** Contohnya "pake debit mandiri", "via qris jago", "kartu debit jago".

**Tata bahasa** (`lib/quick-entry.ts`, `lib/quick-plan.ts`):
- **Ralat dengan "salah / nggak / no".** "bensin 50rb, salah, 40rb" dan "pulsa 3 jt? no, pulsa 30rb" kini menjadi satu entri yang sudah dikoreksi. Koma wajib ada, jadi "nggak jadi beli" dan "salah transfer" tidak pernah dianggap ralat.
- **"semalam" berarti kemarin**, kecuali untuk menginap ("hotel semalam" tetap hari ini).
- **"gopek" = 500.** "uang jajan" tetap utuh di keterangan.
- **Teman mengembalikan uang lewat transfer.** "dina transfer balik 30rb ke jago" dicatat sebagai pembayaran piutang, bukan transfer antardompet, dan nama orangnya ikut terisi.

**Engine B, NLP.js** (`lib/catat/nlp-corpus.ts`, `lib/catat/nlp-engine.ts`):
- **Korpus bertambah dari 209 ke 354 kalimat.** Semua kalimat baru ditulis dari nol, tanpa salinan dari set dev maupun set held-out.
- **Model diajari siapa melakukan apa.** Nama orang yang sudah tercatat diganti token pelaku (`{subjek} ngutang 20rb` = mereka berutang ke saya) atau token pihak lain (`ngutang ke {orang} 50rb` = saya berutang). "ke/dari/sama aku" menjadi satu ciri tersendiri. Sebelumnya model hanya melihat kumpulan kata, jadi kedua kalimat itu tidak bisa dibedakan.

## Hasil

`node bench/quick/run-v60.mjs`, dibandingkan dengan salinan beku 5.10 di `baseline-v510/`. State: `fixtures-v35state.mjs`.

| Set | 5.10 | 6.0 (persiapan) | Yakin tapi salah |
|---|---|---|---|
| v60dev (39) | 14/39 | 39/39 | 18 → 0 |
| v60heldout (28), run pertama dibekukan | 13/28 | 28/28 | 9 → 0 |
| v35dev (40) | 40/40 | 40/40 | 0 → 0 |
| v35heldout (20) | 18/20 | 18/20 | 1 → 1 |
| v35adv (23) | 23/23 | 23/23 | 0 → 0 |

**Shadow**, yaitu semua kalimat unik dari semua fixture (888 kalimat):
- 53 kalimat berubah.
- 22 di antaranya mengubah arti keuangan.
- Di luar set 6.0, arti yang berubah hanyalah nama orang yang kini terisi pada pembayaran piutang ("atuy bayar 5k" → orang: atuy). Tidak ada regresi.

**Kesepakatan NLP.js dengan tata bahasa** diukur pada set dev yang tidak dipakai untuk melatih (v60dev, v35dev, v35adv, v34dev, v33dev, glidev, v30–v32dev):
- 441/542 (81%) → 465/537 (87%) dari aksi yang mendapat bacaan niat.
- Peringatan "uang masuk atau keluar?" yang palsu: 0 → 0.
- Kesepakatan menentukan apakah jenis entri ditandai terverifikasi. Kalau keduanya berbeda, keputusan tetap di tata bahasa.

`npm test`: 669/669 lulus, termasuk `tests/catat-v60.test.mjs` yang memakai kalimat di luar set benchmark.

## Catatan jujur

- **Angka held-out terlalu optimistis.** Set itu ditulis sebelum pekerjaan ini, tetapi memakai keluarga kata yang sama dengan set dev (kata kerja daerah, ",-", qris, "semalam"). 28/28 tidak berarti semua kalimat nyata akan terbaca benar.
- **Output held-out sempat terlihat sebelum dibekukan.** Mode `--shadow` menampilkan output set held-out sebelum run pertamanya dibekukan. Run pertama langsung dibekukan setelah itu, tanpa perubahan apa pun di antaranya. Tidak ada aturan atau kalimat korpus yang disetel dari set held-out. Kalimat korpus yang terlalu mirip set held-out dibuang sebelum pelatihan.
- **Nama yang belum tercatat tidak terbantu.** Token pelaku hanya bekerja untuk nama yang sudah ada di catatan utang/piutang. Untuk nama baru ("budi minjem 50k"), NLP.js masih sering keliru arah, dan tata bahasa yang memutuskan.
- **Kasus yang masih gagal (sama seperti 5.10):** "gopay 65k ngopi tuku" (nama kedai di akhir kalimat) dan "gaming 50k di warnet jago".
