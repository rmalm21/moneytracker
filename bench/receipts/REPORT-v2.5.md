# Receipt Intelligence V2.5 — benchmark report (app 3.0)

Local engine only (Tesseract on the device); Gemini was off for every run. All receipts are synthetic and sanitized
(fixtures*.mjs), rendered as phone-like photos by generate.mjs. Results: `bench/receipts/out/result-<label>.json`
(not committed; regenerate with the commands below).

## Sets
| Set | Photos | Purpose |
|---|---|---|
| Original (fixtures.mjs) | 39 | V2 baseline, frozen before any V2.5 change (`v2-baseline`) |
| V2.5 structure (fixtures-v25.mjs) | 16 | modifiers, item boundary, multi-line name, item discount, bill voucher, thermal retail |
| Held-out (fixtures-holdout.mjs) | 8 | written after tuning, run **once** (`holdout-v25`) |

## Original 39 photos: V2 vs V2.5 (no regression)
| Metric | V2 | V2.5 |
|---|---|---|
| Merchant / date / time | 100 / 97 / 100 % | 100 / 97 / 100 % |
| Grand total exact | 97 % | 97 % |
| Item recall / item amount / qty | 100 / 99 / 100 % | 100 / 99 / 100 % |
| Charges / payment / reconciled | 88 / 100 / 95 % | 88 / 100 / 95 % |
| False items · wrong totals · confident-wrong | 0 · 1 · 0 | 0 · 1 · 0 |
| Avg passes · needed extra passes | 1.5 · 15 % | 1.5 · 15 % |
| Avg time | 3.9 s | 3.7 s |

A mid-development run (`v25-dev1`) had one false item (ES TEH MANIS taken as a note); fixed before the final run.

## V2.5 structure set (16 photos): V2 parser vs V2.5
| Metric | V2 | V2.5 |
|---|---|---|
| Relations correct (modifier owner, item discount, variant, SKU, company, outlet) | 25 % | 93 % |
| Wrong relations **not** marked "Perlu dicek" | 32 | 3 |
| Charges exact | 71 % | 100 % |
| Total exact · reconciled · false items | 100 % · 100 % · 0 | 100 % · 100 % · 0 |
| Date | 94 % | 94 % (one OCR misread 27→21, both versions) |
| Avg passes · time | 1.6 · 3.1 s | 1.1 · 2.5 s |

The 3 remaining unflagged wrong relations are all on `thermal-lowres` / `thermal-perspective`: variant/SKU digits
corrupted by OCR at low resolution (e.g. `DB024` → `08824`, `9038568` → `9638568`). Money is unaffected.

## Held-out (8 photos, run once)
Merchant, date, time, total, items, amounts, qty, charges, payment, reconciliation: **100 %**. False items 0,
confident-wrong totals 0. **Relations 75 %**, 2 wrong: the note “kurang manis” on the martabak receipt (clean and blur)
was dropped instead of attached (the word “kurang” was not known as a note word). It was never turned into an item or
money. Fixed afterwards (with a test) — this fix has **not** been measured on fresh held-out data.

## What changed
* Parser: line roles (header candidates → brand / company / outlet / address / payment brand), modifier model with a
  score, hard item boundary (a note never starts the next item's name), notes of unclear owner kept but marked
  `modifiersUnsure`, multi-line names, discount ownership decided after the whole list is read, variant codes kept as
  printed (and marked when O/0 or I/1 sit side by side), SKUs on the qty row.
* Fusion: evidence-weighted votes (pass weight × clarity of the source line), not a head count.
* Runtime: a recovery ladder with early exit, a pass/time budget, letter-height-driven enlargement (small print gets a
  zoomed whole-page pass and larger region crops), a step-by-step trace and a plain failure location (Debug OCR).
* Review: notes under the item, chips to remove them, one-tap “Catatan ini untuk item ini?” / “Kode terbaca kurang
  jelas”, and the eye shows where a value came from (read directly / computed / edited by hand).
* Saved receipt and Split Bill keep notes, variant, SKU, company and outlet; notes never change any amount.

## Commands
```
SET=v25 node bench/receipts/generate.mjs        # also SET=holdout; no SET = original set
node bench/receipts/run.mjs http://localhost:3000 <label>
node bench/receipts/run.mjs --compare v2-baseline v25-final
SET=v25 node bench/receipts/run.mjs --compare v25set-v2baseline v25set-final
```
