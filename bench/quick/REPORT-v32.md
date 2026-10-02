# Catat otomatis V3.2 — Relationship, Direction & Multi-Action report (app 4.2)

V3.2 answers **who did what to whom, for what, when — and where one action ends and the next begins**. Everything is
local and deterministic: no text leaves the device, no cloud AI. V3.1 is frozen in `bench/quick/baseline-v31/` for the
comparison (`node bench/quick/run-v30.mjs v31`).

## 1. Architecture

```
text → clause split at commas / joining words (V2.5)
     → anchor segmentation inside each piece (lib/catat/segment.ts)        "kopi 20k jago | bensin 80k krom"
     → per clause: corrections & negations (incl. "eh ke budi", "bukan ngutang")
     → relationship reading (lib/catat/relations.ts): verb role → subject / object / counterparty / purpose
       → RelationshipNode {debtor, creditor, amount, purpose, sourceText, confidence} → user's perspective
     → grammar parse re-read in the relation's kind (purpose blanked out) → record link only when safe
     → Bug Catcher (V3.0 entity + V3.1 temporal + V3.2 relation/segment classes) → fields, "Kenapa?", trace
     → Action Graph: dates carry forward until overridden, "dia/doi" → the one person already named
     → NLP.js consensus (V3.0) on top — it never flips a relation the grammar read with a clear verb
```

## 2. Verb role model (`VerbRole`)

| Class | Verbs (examples) | Debtor | Creditor | Money |
|---|---|---|---|---|
| borrow | ngutang, utang, pinjam, minjem, kasbon | subject | after ke / sama / dari, else **you** | to subject |
| lend | minjemin, pinjemin, talangin, bayarin, kasih pinjem | object | subject (default you) | from subject |
| passive | dipinjemin, diutangin, ditalangin | subject (default you) | agent after verb | to subject |
| repay | bayar/nyicil + utang, balikin, ngembaliin, lunasin | subject | after ke / sama, else **you** | from subject |
| repaid | dibayar, dibalikin, dilunasin | agent after verb | you | to you |
| possession | "utang gue ke aldi", "utang atuy ke gue" | owner | after ke | — |

User aliases (gue, gw, gua, aku, saya, ane) are the user and are never stored as a person. A subject is the word before
the verb, past small and time words ("atuy tadi ngutang", "kmrn atuy bayar"). No subject → the user (implicit).
Debtor and creditor both other people → **third party**: nothing is recorded and the card says so.

User perspective: debtor = you → `debt_new` / `debt_payment`; creditor = you → `receivable_new` / `receivable_payment`.
A repayment is never a new debt or receivable, and a lend/repay is one money movement (no double counting).

## 3. Purpose

`buat / untuk / utk / guna / demi` start the purpose; it runs until an amount, a date/time word, a wallet, "ke/dari/sama +
someone" or a loan verb. It is its own field (`result.purpose`, field `Untuk`), never the person, never a second action.
Card: **"Atuy berutang ke kamu · Untuk: Ngedate"**. A receivable stores it as its *Keperluan*; a new debt carries it in
its name ("Pinjaman Aldi untuk Beli Bensin") — the debt's notes stay the person's own (existing guard test).
"pinjemin 50k buat budi" with no other name: Budi is the borrower, not a purpose.

## 4. Repayments and records

"atuy bayar utang 12k" → `receivable_payment` (income). Linked only when exactly one open record of that person exists
(Sinta → r1). Two records (Dina: Bensin, Makan) → asked: "Piutang yang mana: Dina (Bensin) atau Dina (Makan)?". None →
"Belum ada piutang Atuy yang tercatat. Pilih “Pemasukan” di bawah, atau catat dulu piutangnya." — never somebody else's
record (this was caught in the browser smoke test and fixed).

## 5. Multi-action segmentation

Between every two money amounts each possible cut is scored: words that only modify the amount before (wallet, "di
kantor", time, a date in the sentence's date style) stay left; content words start the right part; a financial verb
(+1), a person + loan verb (+2) or a date change (+0.5) at the cut is a strong anchor. Both sides must read as a complete
action with an amount. Never split: charges (pajak, service, admin, ongkir, diskon, dp…), a count ("beli 2 ayam 20k"),
a purpose, a monthly amount, or one-record sentences (saldo, tujuan dana, rencana, jadwal). Date style: a sentence that
starts with a date puts dates before items ("kmrn kopi 20k **hari ini** bensin 80k"), otherwise after
("ayam dbesto 13k **kmrin** parkir 2k di kantor **hri ini** …"). Dates then carry forward until overridden.

Trace example:
```
segmentasi: 3 nominal di “ayam dbesto 13k kmrin parkir 2k di kantor hri ini atuy bayar utang 12k”; gaya tanggal di belakang barang
  antara nominal 1 dan 2: [ayam dbesto 13k | kmrin parkir 2k] skor 0 (kata kerja “parkir”) · [ayam dbesto 13k kmrin | parkir 2k] skor 1.5 (kata kerja “parkir”, pergantian tanggal)
  dipotong sebelum “parkir” (skor 1.5)
  antara nominal 2 dan 3: [parkir 2k | di kantor hri ini atuy bayar utang 12k] skor -2 · … · [parkir 2k di kantor hri ini | atuy bayar utang 12k] skor 2.5 (orang + kata kerja “atuy bayar”, pergantian tanggal) · [parkir 2k di kantor hri ini atuy | bayar utang 12k] skor 0.5 · …
  dipotong sebelum “atuy” (skor 2.5)
relasi klausa 2: kata kerja “bayar” → repay (pelaku: subject, berutang: subject, pemberi: target, uang dari subjek)
relasi klausa 2: subjek: atuy → Atuy; berutang: Atuy; pemberi: kamu
relasi klausa 2: sudut pandang kamu: receivable_payment (Atuy) · verified
```

## 6. Required regressions (exact engine output, today 15 Okt 2026)

| Kalimat | Hasil |
|---|---|
| `atuy ngutang 12k` | receivable_new · Rp12.000 · Atuy · 2026-10-15 |
| `atuy ngutang 12k buat ngedate` | receivable_new · Rp12.000 · Atuy · Untuk: Ngedate · 2026-10-15 |
| `atuy ngutang 12k kmrn` | receivable_new · Rp12.000 · Atuy · 2026-10-14 |
| `kmrn atuy bayar utang 12k` | receivable_payment · Rp12.000 · Atuy · 2026-10-14 — tanya: link |
| `gue ngutang 12k ke aldi` | debt_new · Rp12.000 · Aldi · 2026-10-15 |
| `ngutang ke aldi` | debt_new · nominal ditanya · Aldi · 2026-10-15 — tanya: amount |
| `ngutang 12k ke aldi` | debt_new · Rp12.000 · Aldi · 2026-10-15 |
| `ayam dbesto 13k kmrin parkir 2k di kantor hri ini atuy bayar utang 12k` | expense · Rp13.000 · Ayam · D'Besto · 2026-10-14<br>expense · Rp2.000 · Parkir · Kantor · 2026-10-15<br>receivable_payment · Rp12.000 · Atuy · 2026-10-15 — tanya: link |

Also: "atuy ngutang 12k ke aldi" → nothing recorded, "ini utang Atuy ke Aldi, bukan utang atau piutangmu".

## 7. "Kenapa?"

- "Atuy dikenali sebagai orang yang berutang karena namanya muncul sebelum kata “ngutang”."
- "“Ngedate” adalah keperluannya (setelah “buat”), bukan nama orang dan bukan transaksi kedua."
- "Kamu yang berutang karena “aku” muncul sebelum “ngutang”; Aldi pemberi pinjamannya karena muncul setelah “ke”."
- "Jago adalah dompet, bukan orang: uangnya keluar dari dompet itu." ("atuy ngutang 12k dari jago")

## 8. Bug Catcher — new classes

SUBJECT_DIRECTION_MISMATCH, DEBT_RECEIVABLE_DIRECTION_MISMATCH, REPAYMENT_AS_NEW_DEBT, REPAYMENT_AS_NEW_RECEIVABLE,
PERSON_SWALLOWED_BY_PURPOSE, PURPOSE_SWALLOWED_BY_PERSON, USER_SUBJECT_IGNORED, THIRD_PERSON_SUBJECT_IGNORED (relation vs
the grammar's first reading; repaired by the relation), MULTIPLE_FINANCIAL_ANCHORS_IN_ONE_ACTION and
LIKELY_UNSPLIT_MULTI_ACTION (an action still holding two amounts with their own heads; reported, amount marked to check).
Each is covered in `tests/catat-v32.test.mjs`.

## 9. Held-out — first run (v32-heldout-first, 45 sentences, frozen in `bench/quick/heldout-first/v30-v32heldout-*.json`)

Written after V3.2 was built, run once. New names (Rian, Nisa, Dodi), new verbs and phrasing.

| Ukuran | v31 | v3 |
| --- | ---: | ---: |
| Kalimat benar seluruhnya | 44% | 100% |
| Jumlah aksi benar | 78% | 100% |
| Tepat: kind | 85% (39/46) | 100% (56/56) |
| Tepat: amount | 100% (45/45) | 100% (55/55) |
| Tepat: date | 75% (6/8) | 100% (11/11) |
| Tepat: wallet | 100% (4/4) | 100% (7/7) |
| Tepat: link | 100% (4/4) | 100% (4/4) |
| Tepat: person | 60% (21/35) | 100% (39/39) |
| Tepat: purpose | 0% (0/5) | 100% (5/5) |
| Koreksi tepat | 67% | 100% |
| Pemisahan tepat | 36% | 100% |
| Aksi palsu / terlewat | 1 / 10 | 0 / 0 |
| Keraguan ditandai | 50% | 100% |
| Aksi salah tapi yakin | 2 | 0 |
| Entitas salah tapi yakin | 6 | 0 |
| Relasi salah tapi yakin | 6 | 0 |
| Jam salah tapi yakin | 0 | 0 |
| Tanggal salah tapi yakin | 0 | 0 |
| Tepat [date] | 43% | 100% |
| Debitur (yang berutang) tepat | 66% | 100% |
| Kreditur (pemberi pinjaman) tepat | 77% | 100% |
| Arah dari sudut pandang kamu tepat | 86% | 100% |
| Arah pembayaran utang/piutang tepat | 56% | 100% |
| Relasi tepat (jenis + orang + keperluan) | 54% | 100% |
| Relasi utang/piutang salah tapi yakin | 7 | 0 |
| Batas aksi tepat (bertanda segmentation) | 21% | 100% |
| Jumlah aksi tanpa kata sambung tepat | 10% | 100% |
| Tanggal per aksi tepat | 85% | 100% |
| Orang per aksi tepat | 50% | 100% |
| Segmentasi salah tapi yakin | 0 | 0 |
| Tepat [relation] | 64% | 100% |
| Tepat [purpose] | 0% | 100% |
| Tepat [repayment] | 0% | 100% |
| Tepat [possession] | 50% | 100% |
| Tepat [third] | 0% | 100% |
| Tepat [pronoun] | 0% | 100% |
| Tepat [negation] | 100% | 100% |
| Pertanyaan tepat | 0% | 100% |
| Tanya yang tidak perlu | 25 | 0 |
| Uang tercatat dobel | 0 | 0 |

Waktu per kalimat: v31 23.79 ms (P95 51.21) · v3 9.55 ms (P95 22.14)

Safety targets met on the first run: confident-wrong relationship **0**, duplicate money **0**, phantom actions **0**.

## 10. Development set (v32-dev, 65 sentences — tuned on, development numbers)

| Ukuran | v31 | v3 |
| --- | ---: | ---: |
| Kalimat benar seluruhnya | 38% | 100% |
| Jumlah aksi benar | 77% | 100% |
| Tepat: kind | 81% (51/63) | 100% (77/77) |
| Tepat: amount | 100% (61/61) | 100% (74/74) |
| Tepat: date | 78% (7/9) | 100% (14/14) |
| Tepat: wallet | 100% (5/5) | 100% (7/7) |
| Tepat: link | 83% (5/6) | 100% (6/6) |
| Tepat: person | 61% (28/46) | 100% (53/53) |
| Tepat: purpose | 10% (1/10) | 100% (11/11) |
| Tepat: subject | 0% (0/3) | 100% (3/3) |
| Koreksi tepat | 67% | 100% |
| Pemisahan tepat | 33% | 100% |
| Aksi palsu / terlewat | 2 / 14 | 0 / 0 |
| Keraguan ditandai | 60% | 100% |
| Aksi salah tapi yakin | 6 | 0 |
| Entitas salah tapi yakin | 9 | 0 |
| Relasi salah tapi yakin | 7 | 0 |
| Jam salah tapi yakin | 0 | 0 |
| Tanggal salah tapi yakin | 0 | 0 |
| Tepat [date] | 25% | 100% |
| Debitur (yang berutang) tepat | 67% | 100% |
| Kreditur (pemberi pinjaman) tepat | 78% | 100% |
| Arah dari sudut pandang kamu tepat | 82% | 100% |
| Arah pembayaran utang/piutang tepat | 46% | 100% |
| Relasi tepat (jenis + orang + keperluan) | 51% | 100% |
| Relasi utang/piutang salah tapi yakin | 11 | 0 |
| Batas aksi tepat (bertanda segmentation) | 22% | 100% |
| Jumlah aksi tanpa kata sambung tepat | 0% | 100% |
| Tanggal per aksi tepat | 86% | 100% |
| Orang per aksi tepat | 40% | 100% |
| Segmentasi salah tapi yakin | 1 | 0 |
| Tepat [relation] | 46% | 100% |
| Tepat [purpose] | 0% | 100% |
| Tepat [repayment] | 0% | 100% |
| Tepat [possession] | 50% | 100% |
| Tepat [third] | 0% | 100% |
| Tepat [pronoun] | 0% | 100% |
| Tepat [negation] | 50% | 100% |
| Pertanyaan tepat | 0% | 100% |
| Tanya yang tidak perlu | 28 | 1 |
| Uang tercatat dobel | 0 | 0 |
Waktu per kalimat: v31 20.9 ms (P95 29.09) · v3 8.54 ms (P95 14.8)


## 11. No regressions (V3.2 combined engine, after all fixes)

| Set | Kalimat benar | Aksi salah-yakin | Relasi utang/piutang salah-yakin | Segmentasi salah-yakin | Palsu / terlewat | Uang dobel |
|---|---:|---:|---:|---:|---:|---:|
| v32dev | 100% | 0 | 0 | 0 | 0 | 0 |
| v32heldout | 100% | 0 | 0 | 0 | 0 | 0 |
| v31dev | 100% | 0 | 0 | 0 | 0 | 0 |
| v31heldout | 100% | 0 | 0 | 0 | 0 | 0 |
| v30dev | 100% | 0 | 0 | 0 | 0 | 0 |
| v30heldout | 100% | 0 | 0 | 0 | 0 | 0 |
| v25 | 100% | 0 | 0 | – | 0 | 0 |
| holdout25 | 100% | 0 | 0 | – | 0 | 0 |
| orig | 100% | 0 | 0 | 0 | 0 | 0 |

`npm test`: 394 pass, 0 fail (13 new V3.2 tests).

## 12. Fixes after the held-out run (they make those cases development data)

- "malem / mlem" → "malam" (h34 read "Malem Martabak" as the description; the fixture did not score it).
- Repayment of a person with no record no longer offers another person's record (browser smoke test).
- A new debt keeps its purpose in its name, not in the person's notes (existing guard test).

## 13. Honest limits

- The held-out set was written by the same author as the engine; 100% on it is a strong sign, not proof on real typing.
- Segmentation only cuts between money amounts with a unit or ≥ 1.000 ("kopi 20 jago bensin 80 krom" stays one action
  with two amounts to check); number words are not anchors.
- "utang X" with no "ke" is read as X's debt and marked to check.
- A repayment of a receivable created in the same message cannot be linked yet (it is not saved); it is asked.
- "dia / doi" resolves only when exactly one person was named before; otherwise the person is asked.
