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
| `cord-test` | 100 | run once at the end, first result frozen; nothing was changed after it |

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
| Total exact | 85% | 96% | 78% | **86%** |
| Items found | 83% | 90% | 82% | **90%** |
| Item amounts exact | 77% | 84% | 76% | **86%** |
| Quantity | 93% | 94% | 91% | 92% |
| Tax / service / discount right | 61% | 74% | 64% | 68% |
| Payment method | 88% | 97% | 82% | 92% |
| Subtotal exact | 73% | 85% | 82% | 86% |
| Paid exact | 77% | 86% | 67% | 76% |
| Change exact | 67% | 79% | 51% | 67% |
| Receipt adds up | 75% | 86% | 69% | **82%** |
| Fake items | 22 | 23 | 42 | **34** |
| Wrong totals | 9 | 4 | 16 | **13** |
| **Wrong totals marked sure** | 3 | 2 | **3** | **5** |
| Average time | 9.1 s | 8.6 s | 9.8 s | 10.0 s |

Honest notes:
- **Wrong totals marked sure went from 3 to 5 on the test set.** Fewer totals are wrong overall (16 → 13), but two
  more of the remaining wrong ones are marked "tinggi". This is the first thing to look at next.
- Relations (notes and discounts under an item) stayed low (test 14% → 10%). CORD labels many sub-lines as notes that
  the reader keeps as their own lines; money is not affected.
- The slash rule (3) was added after the dev run. It was checked on the 39 synthetic receipts and the unit tests; the
  test run includes it.
- Synthetic regression sets: the 16 structure receipts read 100% on every field (relations 97% → 100%); the 39 original
  receipts are the same or better (charges 93% → 97%, adds up 95% → 97%), with one fake item more
  (`marketplace-heavyblur`, fixed by the slash rule).
- CORD is restaurants and shops in Indonesia photographed around 2019. Minimarket receipts and e-commerce screenshots
  are only in the small synthetic and real sets of V3.

## Commands

```
python bench/cord/convert.py <parquet folder> /tmp/cord
npm run dev
SET_DIR=/tmp/cord SET=cord-dev RESULTS_DIR=/tmp/cord-work node bench/receipts/run.mjs http://localhost:3000 v4-dev
CORD_DIR=/tmp/cord CORD_WORK=/tmp/cord-work node bench/cord/rawcov.mjs cord-dev 1280       # raw OCR, for the row model
node bench/cord/rowlink-data.mjs cord-train && python bench/cord/rowlink-train.py           # training
node bench/cord/rowlink-eval.mjs cord-dev                                                   # rows: rule vs model
```
