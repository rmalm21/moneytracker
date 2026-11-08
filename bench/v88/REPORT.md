# 8.8 — Import categorization benchmark

Made-up statement lines in the shapes e-wallets and banks print (no real account data), each with the starter category
it should get. The import planner runs with the starter categories and **no history**, so this measures only what the
reader knows by itself (the person's own past choices come first in the app and are not measured here).

- `import-cat-dev.json` (99 lines): used to tune.
- `import-cat-heldout.json` (80 lines, other places and phrasings): written **before** any 8.8 change; run for the 8.7
  baseline and once after tuning. Its misses were looked at only after that run.
- Runner: `node bench/v88/import-cat.mjs dev|heldout [root]` (`SHOW=1` lists the misses).

| Run | Set | Right | Right main category, other sub | Wrong | No guess |
|---|---|---|---|---|---|
| 8.7 (frozen baseline) | dev | 79 (79.8%) | 9 | 7 | 4 |
| 8.7 (frozen baseline) | held-out | 64 (80.0%) | 4 | 5 | 7 |
| 8.8, tuned on dev | dev | 99 (100%) | 0 | 0 | 0 |
| **8.8, held-out run once** | **held-out** | **65 (81.3%)** | 4 | 5 | 6 |
| 8.8 after adding the held-out misses' brands (post-hoc, not a measurement) | held-out | 80 (100%) | 0 | 0 | 0 |

What this says, honestly:

- The 8.8 list of places (brands and plain words like "apotek", "laundry", "bioskop") fixes the places it knows; it barely
  helps with places it has not heard of: **80.0% → 81.3%** on the held-out set.
- After that one run, the brands the held-out set missed (Circle K, FamilyMart, GoSend, Dropbox, Blibli, TikTok Shop, H&M,
  iBox, Sociolla, Garuda, Ruangguru, Gong Cha, Informa, A&W, "warung tegal") and other well-known brands were added. The
  100% after that is post-hoc and says nothing about new places.
- The held-out set was written by the same author as the reader, so even the plain words chosen for the reader may lean
  towards it. Real gains for unknown local places come from the person's own choices (a brand's category is reused).

Real files (the owner's GoPay and Krom PDFs, checked on the device only, counts only, with the starter categories and no
history): rows needing a category that got one — GoPay 31 → 32 of 57, Krom 33 → 33 of 38. In Krom, 12 "Cashback Bonus"
rows moved from Gaji (wrong, because of "bonus") to Penghasilan Keuangan / Cashback. The rest of GoPay's rows without a
guess are local places named only by their name.

Catat otomatis is untouched (the list lives in `lib/import/places.ts`, used only by the import), so its benchmarks were
not re-run.

## Round 2 (still 8.8): everyday words

The first round was mostly brands. Round 2 is the plain, everyday lines a bank or e-wallet shows: "Isi ulang galon",
"Bayar kos", "Iuran RT", "SPP", "Fotokopi", "Servis AC", "Kondangan", "Arisan", "Ganti oli", "Klinik gigi", and so on.

- `import-cat-dev2.json` (55 lines): used to tune.
- `import-cat-heldout2.json` (52 lines, other words for the same kinds of spending): written **before** the round-2
  changes; run for the baseline and once after tuning. Its misses were looked at only after that run.
- Runner: `node bench/v88/import-cat.mjs dev2|heldout2 [root]`.

| Run | Set | Right | Right main category, other sub | Wrong | No guess |
|---|---|---|---|---|---|
| 8.8 round 1 (frozen baseline) | dev2 | 39 (70.9%) | 10 | 5 | 1 |
| 8.8 round 1 (frozen baseline) | held-out 2 | 36 (69.2%) | 10 | 3 | 3 |
| round 2, tuned on dev2 | dev2 | 55 (100%) | 0 | 0 | 0 |
| **round 2, held-out 2 run once** | **held-out 2** | **48 (92.3%)** | 3 | 1 | 0 |
| round 2 after moving groceries below coffee (post-hoc, not a measurement) | held-out 2 | 49 (94.2%) | 2 | 1 | 0 |

The round-1 sets stay at 100% (dev 99/99, held-out 80/80, both post-hoc for round 1) after round 2.

What this says, honestly:

- Everyday words generalise better than brands: **69.2% → 92.3%** on lines the rules never saw, because the same words
  ("galon", "kos", "servis", "iuran") come back in other phrasings.
- The one post-hoc change: "Kopi susu gula aren" went to groceries because "gula" was matched before "kopi"; groceries now
  come after the coffee rule. That moves held-out 2 to 94.2%, which is not a measurement.
- Still wrong after that: "Masker wajah" → Obat (a face mask is skincare here, a medical mask is health; the line does not
  say which). Two lines get the right main category with another sub (lipstick, eyeglasses).

### Also in round 2 (no benchmark: behaviour, covered by tests)

- **Import focus** (Semua / Tanpa transfer / Merchant saja), remembered on the device. On the owner's real files (counts
  only): GoPay 84 rows → 57 without transfers → 55 merchant rows; Krom 43 → 38 → 12 (Krom's interest tax lines, named
  just "Pajak", are bank lines and are left out of Merchant saja).
- **Same place, same category**: changing one row's category changes the other rows of the same place in the file
  ("Mie Gacoan Bintaro" and "Mie Gacoan Ciputat"), not rows whose category the person set by hand. On the owner's real
  GoPay file, 34 of its 55 merchant rows belong to 11 places that appear 2+ times.
- **Reading**: "50.000,-", "50.000 (D)" / "(K)", and statements running from December into January (the year changes).
