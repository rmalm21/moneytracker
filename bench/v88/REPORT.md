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
