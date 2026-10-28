# Scanner 7.2: minimarket receipts

The receipts are generated (see `README.md`): no minimarket photos with a usable licence were found. Everything still
runs on the phone.

## Sets

| Set | Receipts | Use |
|---|---|---|
| `mini-dev` (seed 101) | 60 | finding failures, deciding changes |
| `mini-hold` (seed 202) | 60 | run once at the end, first result frozen; it also has products, shops and labels the other sets never use |
| `mini-train` (seed 303) | 200 | the row model only |

## What 7.1 got wrong

On the exact printed text (no OCR), 7.1 found 85% of the items and 67% of the receipts added up. The reasons:
- a short name with its size ("CLEO 1500ML", "AQUA 600ML") over its `1 x 6.000   6.000` row was not taken for a name, so
  the rows that followed paired with the wrong names; the size line rule glued "COCA COLA 390ML" to the item above;
- "ULTRA MILK CKLT 250" was read as an item of Rp250, "TISU PASEO 250S" as "2505";
- a shop name with a number ("BINTANG 24") was read as an amount, so the city became the shop;
- a weighed item (`0.582 KG x 59,900   34,862`) lost its name, and a voucher making the total smaller than the one item
  dropped the item;
- "POT. HARGA" under an item and "ANDA HEMAT" after the total were counted as extra discounts.

On the OCR of the photos it also met: the quantity of a four-column row not read ("AUTAN LOTION 50ML 9,900 59,400"),
"2 9,900" moved a row under its item, "17,700" read above "KEMBALIAN :", and the cashier code "2J08/DEWI" taken for
the first item's name. All of these are fixed in `lib/receipt.ts` (tests in `tests/receipt-v4.test.mjs`).

## Results

| | 7.1 dev | 7.2 dev | **7.1 hold** | **7.2 hold (frozen first run)** |
|---|---|---|---|---|
| Shop name | 88% | 100% | 93% | **100%** |
| Total exact | 100% | 100% | 100% | 100% |
| Items found | 96% | 100% | 98% | **100%** |
| Item amounts exact | 91% | 100% | 93% | **99%** |
| Quantity | 87% | 98% | 95% | 98% |
| Discounts right | 20% | 67% | 14% | 25% |
| Subtotal exact | 77% | 97% | 59% | 63% |
| Paid exact | 87% | 100% | 90% | 97% |
| Change exact | 87% | 100% | 92% | 92% |
| Receipt adds up | 88% | 100% | 90% | **100%** |
| Fake items | 7 | 0 | 6 | **2** |
| Wrong totals (marked sure) | 0 (0) | 0 (0) | 0 (0) | 0 (0) |
| Passes / average time | 2.3 / 8.0 s | 1.1 / 4.7 s | 2.0 / 7.8 s | 1.2 / 5.4 s |

Honest notes:
- **Generated photos are easier than real ones.** 7.1 already read every total; the OCR reads a rendered font cleanly.
  These numbers say the reader now understands these layouts, not how it does on a real faded Indomaret receipt.
- **Hold-only labels show the weak spots.** Subtotal 63%: "Total Item 8 234,400" equal to the total stays the total
  (right, but the subtotal is left empty), and "TOTAL HARGA" is not taken for a subtotal. Discounts 25%: "HEMAT : 1,000"
  after the total is counted as one more discount (the total is still right, the receipt still adds up). Two fake
  items: a cashier code joined to a row, and one hard photo whose rows were grouped wrong.
- **CORD dev, end to end** (a check that nothing got worse; these receipts were used to develop 7.0 and 7.1): total
  97% → 99%, items 90% → 94%, amounts 85% → 91%, adds up 86% → 93%, fake items 23 → 10, wrong totals marked sure 1 → 0,
  quantity 94% → 93% (7.0 → 7.2). Re-reading the saved texts of `cord-tune`, `cord-hold` and the synthetic sets offline:
  the same or better.

## The row model, trained again

Rows on real PP-OCRv6 segments, receipts with every row right (`bench/cord/rowlink-eval.mjs`, "V4 group"):

| Model | mini-dev | cord-dev |
|---|---|---|
| 7.0 model (CORD, 16-8) | 38/60 | 90/99 |
| CORD + minimarket OCR segments | 41/60 | 85/99 |
| CORD + all minimarket pairs (capped) | 39/60 | 80/99 |
| CORD, 48-24, other seeds | 39–51/60 | 85–91/99 |
| average of 5 CORD 48-24 models | 41/60 | 91/99 |

None was better on both sets in a way that did not depend on the random seed, and the best average is about 100 times
larger. The app keeps the 7.0 model; the reader keeps whichever rows fit the receipt, and on these sets it already
reads every item. `bench/cord/rowlink-train.py` reproduces the shipped model; `INCLUDE_MINI=1` adds the minimarket pairs.
