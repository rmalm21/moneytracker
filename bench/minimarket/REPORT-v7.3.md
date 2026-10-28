# Scanner 7.3: faded thermal prints, and "sure" only when the numbers agree

The 7.2 hold-out set (`mini-hold`) had been looked at, so 7.3 used it for finding failures and made two new sets with
the defects of a thermal printer (`PHOTO_STYLE=thermal`: weaker bands of heat, dead dots of the print head, grainy
dots, wrinkle shading, fainter old prints):

| Set | Receipts | Use |
|---|---|---|
| `mini-dev2` (seed 505) | 60 | finding failures |
| `mini-hold2` (seed 606) | 60 | run once, first result frozen; its own products, shops, payment names and labels ("Uang Kembali", "Sisa", "Total Pembelian", "Disc Item", "JUMLAH", …) that no other set uses |

## Changes (`lib/receipt.ts`, tests in `tests/receipt-v4.test.mjs`)

Reading:
- an amount read half a row above its label ("120.000 / Bayar / 6.300 / Kembali", also "TRANSFER" or "QRIS"), and a
  count row ("Total Item : 4") before such a run taking none of its amounts;
- "Total Item", "Total Harga" and "JUMLAH" before another total are the subtotal, also when the two are equal;
- a price cut under the last item ("POT. HARGA") is that item's; "HEMAT" after the total is not counted again;
- 0 read as 8 or 6 on a faded print ("1 25,980 25,968"): the unit price and line total that agree with the fewest
  look-alike digits changed, a round amount preferred, with a note to the user;
- an item with a discount larger than the total is kept; "-500)"; a lone digit of noise after the amount; a weighed
  row without its amount is not an item ("KG x").

Checking (the "tinggi" mark):
- only when the items and the total agree within a rounding: Rp1-2 of tax, or a printed total that is a round hundred.
  Before, 0.2% was enough (Rp746 on a Rp373.209 receipt, enough for a misread digit);
- not when a digit was changed only to reach the total ("Pajak 22.728 dibetulkan jadi 72.728"), unless the amount paid
  says the same;
- not when the cash handed over minus the change is less than the total, unless total + change is a whole thousand
  (then the cash amount was the misread one);
- a non-round total one look-alike digit away from round items ("94,109" against 94,100) is read as 94,100, not sure.

## Results

**`mini-hold2`, first run, frozen** (7.3 as it was before this set was looked at):

| | 7.2 | 7.3 (frozen) |
|---|---|---|
| Total exact | 98% | 97% |
| Items found / amounts exact | 100% / 99% | 100% / 99% |
| Subtotal exact | 71% | **89%** |
| Paid / change exact | 87% / 81% | 83% / 81% |
| Receipt adds up | 93% | 93% |
| Fake items | 2 | 1 |
| Wrong totals (marked sure) | 1 (1) | 2 (1) |

On receipts it had not seen, 7.3 as first written only clearly improved the subtotal. The new labels were the weak
spot. **After** looking at this run, the fixes for its failures were added ("Disc Item", "DISC MEMBER CARD", "Sisa",
"Uang", "TotalPembelian" glued by the OCR, "JUMLAH" as subtotal, less cash than the total, a non-round total a digit
off). With them, the same 60 photos read: total 98%, subtotal 100%, paid 92%, change 96%, adds up 97%, 1 fake item,
**no wrong total marked sure** (before: 1). These are no longer unseen-receipt numbers.

**`mini-dev2`** (thermal, used for the changes): 7.2 → 7.3: amounts 97% → 99%, subtotal 84% → 97%, paid 97% → 98%,
total 98% both, quantity 100% → 98%, discounts 50% → 43%.

**CORD dev, end to end** (real receipts; used during 7.0-7.1, a check that nothing got worse):

| | 7.0 | 7.2 | 7.3 |
|---|---|---|---|
| Total exact | 97% | 99% | 99% |
| Items found | 90% | 94% | 95% |
| Item amounts exact | 85% | 91% | 92% |
| Receipt adds up | 86% | 93% | 93% |
| Fake items | 23 | 10 | 8 |
| Wrong totals marked sure | 1 | 0 | 0 |
| Average time | 8.6 s | 7.7 s | 7.4 s |

Re-reading the saved OCR of `cord-tune`, `cord-hold`, `cord-test` and the synthetic sets offline: the same or better.
The stricter "sure" costs 3 sure-and-right totals out of 504 right ones on the four CORD sets (they become "sedang"),
and removes one sure-and-wrong (`cord-test`; one more right total there too).

Honest notes:
- Still generated photos. The hardest one (`mini-dev2-037`, a long receipt on faded paper) the OCR cannot read at all.
- Discounts stay low on the minimarket sets: the reader keeps a member discount under the last item as a discount of the
  whole receipt, the answer key as the item's. The total is right either way.
- The row model is unchanged (see `REPORT-v7.2.md`).
