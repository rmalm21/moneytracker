# Receipt Intelligence V4 (app 7.0): trained and measured on real receipts

Everything still runs on the phone: no image or text is uploaded, and no outside host is called. The new model is 328
numbers bundled with the app.

## Data

**CORD v2** (Clova AI, [CC BY 4.0](https://github.com/clovaai/cord)): real receipts from shops and restaurants in
Indonesia, photographed, with every word's box and text and a label per line. The publishers removed the shop's
name, address and date from the labels, so CORD measures items, charges, totals and payment amounts, not the shop or
the date.

| Set | Receipts | Use |
|---|---|---|
| `cord-train` | 400 (2 of the 4 published train files) | training the row model |
| `cord-dev` | 100 | finding failures, deciding changes |
| `cord-test` | 100 | run once at the end of 7.0, first result frozen; nothing was changed after it |
| `cord-tune`, `cord-hold` | 200 + 200 (halves of `cord-train`) | 7.1: finding failures, then run once at the end |

The dataset is not committed. `bench/cord/convert.py` turns the published parquet files into the benchmark's format.

## What V3 got wrong on real receipts

V3 had been measured on 5 real receipts. On the 100 dev receipts:
- **Reading:** 11% of totals never appeared in the OCR text at all. Reading the whole photo once (1.3 s) found more
  prices (95%) and totals (97%) than all of V3's passes together (93%, 89%; 9.1 s). The paper outline was "confident"
  but cut text off at the receipt's edges.
- **Rows:** a price on the right often joined the wrong name, or was put on a line of its own, when the photo was
  tilted or the paper curved. Even with perfect word boxes, V3's rule rebuilt every row right on only 60% of the
  receipts.

## What changed

1. **Whole photo when the cut is not complete** (`lib/receipt-ocr.ts`): when the reading of the cut paper does not add
   up, or misses the shop or the date, PP-OCRv6 also reads the whole photo and the better reading is kept, whatever
   the outline's confidence (V3 did this only for an unsure outline). An area the person set by hand is respected.
2. **Rows from a model trained on real receipts** (`lib/receipt-rowlink.ts`, weights in `receipt-rowlink-model.ts`):
   a 12-16-8-1 network decides, for each pair of text segments, whether they sit on the same printed row. Its inputs
   are the height overlap, the vertical offset against the receipt's own tilt, the gap and the letter size. It was
   trained on 116,257 pairs from the 400 training receipts, including copies sheared ±10% as if held at an angle.
   V3's rule rows stay a candidate, and the reader keeps whichever reading fits the receipt better.
3. **A number glued to a slash ends a code** (`lib/receipt.ts`): "INV/20260915/XYZ/551" is not a price of 551.

Rows on real OCR segments of the 99 dev receipts with labels: every row right on **87** receipts with the model, against
76 with V3's rule (same-row pairs: precision 97.9% vs 98.6%, recall 97.1% vs 89.6%).

## Results (PP-OCRv6 first, the app's default)

| | V3 dev | V4 dev | **V3 test** | **V4 test (frozen first run)** |
|---|---|---|---|---|
| Total exact | 86% | 97% | 80% | **88%** |
| Items found | 83% | 90% | 82% | **90%** |
| Item amounts exact | 78% | 85% | 78% | **88%** |
| Quantity | 93% | 94% | 91% | 92% |
| Tax / service / discount right | 61% | 74% | 64% | 68% |
| Payment method | 88% | 97% | 82% | 92% |
| Subtotal exact | 75% | 87% | 85% | 89% |
| Paid exact | 77% | 86% | 67% | 76% |
| Change exact | 67% | 79% | 51% | 67% |
| Receipt adds up | 75% | 86% | 69% | **82%** |
| Fake items | 22 | 23 | 42 | **34** |
| Wrong totals | 8 | 3 | 14 | **11** |
| **Wrong totals marked sure** | 2 | 1 | **1** | **3** |
| Average time | 9.1 s | 8.6 s | 9.8 s | 10.0 s |

**Corrected after release.** The first version of this table (and the 7.0 notes in the app) used answer keys with a
converter bug: an amount printed with cents ("58000.00") was read as 5,800,000. It changed the key of 2 dev, 2 test and
8 train receipts. The saved readings were scored again against the fixed keys; nothing was re-run. The test total went
from 78% → 86% to **80% → 88%**. One train receipt (`cord-train-0153`) has a typo in CORD's own label ("Rp 57,0000") and
was left as published.

Honest notes:
- **Wrong totals marked sure went from 1 to 3 on the test set.** Fewer totals are wrong overall (14 → 11), but two
  more of the remaining wrong ones are marked "tinggi". 7.1 (below) works on this.
- Relations (notes and discounts under an item) stayed low (test 14% → 10%). CORD labels many sub-lines as notes that
  the reader keeps as their own lines; money is not affected.
- The slash rule (3) was added after the dev run. It was checked on the 39 synthetic receipts and the unit tests; the
  test run includes it.
- Synthetic regression sets: the 16 structure receipts read 100% on every field (relations 97% → 100%); the 39 original
  receipts are the same or better (charges 93% → 97%, adds up 95% → 97%), with one fake item more
  (`marketplace-heavyblur`, fixed by the slash rule).
- CORD is restaurants and shops in Indonesia photographed around 2019. Minimarket receipts and e-commerce screenshots
  are only in the small synthetic and real sets of V3.

## 7.1: no confident wrong totals, fewer fake items

The test set had been seen once, so 7.1 used two new halves of the 400 train receipts: `cord-tune` (train 0–199) for
finding failures and `cord-hold` (train 200–399), run once at the end with the first result frozen.

Changes, all in the reader (`lib/receipt.ts`, tests in `tests/receipt-v4.test.mjs`):
1. **The total that explains the receipt wins.** When two printed totals differ, the one that the items, tax, service
   and payment add up to is chosen, and a total confirmed by the payment (cash or card) counts more.
2. **Never "sure" between two totals.** When two printed totals both fit, or disagree, and nothing paid settles it, the
   reading is not marked "tinggi" and asks the person to check.
3. **Summary words of real receipts are not items**: misread or shortened service and tax ("SUC CHG 6%", "P.Rest 10 %"),
   section titles in capitals ("FOOD", "BEVERAGES"; "Pet Food" stays an item), "ITEMS:1", "Net. Amt", "Balance due",
   "Netto", "S/B Total".
4. **A minus after the amount** ("Rounding 34-") is a negative amount, and **a choice after a dash** under a name
   ("BBQ Chicken / -Sedang 41,000") belongs to that item.

| `cord-hold`, 200 receipts, first run frozen | 7.0 | **7.1** |
|---|---|---|
| Total exact | 93% | **95%** |
| Items found | 95% | 94% |
| Item amounts exact | 91% | 91% |
| Tax / service / discount right | 72% | 77% |
| Subtotal exact | 84% | 94% |
| Paid exact | 85% | 83% |
| Change exact | 78% | 77% |
| Receipt adds up | 86% | **91%** |
| Fake items | 56 | **36** |
| Wrong totals | 13 | 10 |
| **Wrong totals marked sure** | 3 | **1** |
| Passes / average time | 2.2 / 8.8 s | 1.9 / 8.3 s |

Honest notes:
- **One wrong total is still marked sure** (`cord-train-0259`): the receipt says "Kembalian 0", a noisy extra pass read
  "0 3", and the vote kept change 3, so the total became Rp14,997 instead of Rp15,000. Off by Rp3, but still wrong.
- Items found 95% → 94%, paid 85% → 83% and change 78% → 77%: a few receipts where a pass chosen for a better total
  read the items or the payment worse (`cord-train-0214`: Rp100,000 paid lost).
- The row model of 7.0 was trained on all 400 train receipts, `cord-hold` included. It is the same in both columns, so
  the difference is the reader's; the absolute numbers are higher than on unseen receipts (compare the test set above).
- Re-reading the saved texts offline: dev wrong-and-sure 1 → 0; `cord-tune` 7 → 1 (that one is the label typo above).
  The synthetic regression sets read the same.

## Commands

```
python bench/cord/convert.py <parquet folder> /tmp/cord
npm run dev
SET_DIR=/tmp/cord SET=cord-dev RESULTS_DIR=/tmp/cord-work node bench/receipts/run.mjs http://localhost:3000 v4-dev
CORD_DIR=/tmp/cord CORD_WORK=/tmp/cord-work node bench/cord/rawcov.mjs cord-dev 1280       # raw OCR, for the row model
node bench/cord/rowlink-data.mjs cord-train && python bench/cord/rowlink-train.py           # training
node bench/cord/rowlink-eval.mjs cord-dev                                                   # rows: rule vs model
```
