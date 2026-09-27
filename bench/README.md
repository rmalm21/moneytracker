# Benchmark Scan struk

A repeatable, **sanitized** benchmark for the on-device receipt reader. Every receipt in it is made up (shop names,
addresses and numbers included) and rendered by Chromium as a phone-like photo, so no real receipt photo is
committed and the set is the same on every machine.

## What is in it

- `receipts/fixtures.mjs`: 12 receipts (restaurant, café with notes and add-ons, minimarket with PPN included,
  supermarket with an item discount and a "PROMO GOPAY" footer, fuel, parking, food delivery, marketplace, two-line item
  names, discount-heavy, cashback, a 26-item long receipt) with the truth for each field, and the photo conditions:
  clean, blur, heavy blur, shadow, hard shadow, glare, angled, perspective, steep perspective, faded print, small in
  frame, low resolution, dark. 39 photos in total.
- `receipts/generate.mjs`: renders the photos and `truth.json` into `receipts/out/` (not committed).
- `receipts/run.mjs`: reads every photo with the app's own reader in Chromium, through the development-only page
  `/ocr-bench`, and scores it; `--compare a b` prints a field-level comparison of two runs.
- `receipts/score.mjs`: the scoring: merchant, date, time, exact grand total, item recall, exact item amounts,
  quantities, charges (a charge the reader marks as already inside the prices is not counted as extra), payment method,
  reconciliation, invented items, wrong totals, wrong totals the reader was confident about, and time.

## Running it

```bash
npm run dev                                   # in one terminal
node bench/receipts/generate.mjs              # once (needs Playwright; PLAYWRIGHT_MODULE / CHROMIUM if not installed)
node bench/receipts/run.mjs http://localhost:3000 v2
node bench/receipts/run.mjs --compare v1 v2
```

To measure an older version, check it out (a git worktree works), copy `app/ocr-bench/page.tsx` into it, run its dev
server on another port, and run `run.mjs` against that port with another label.

## Limits

The photos are rendered, not taken with a phone: they have no paper curl, no thermal fading pattern, no motion blur
and no real camera noise. The numbers show how versions compare on the same set and catch regressions; they are
not a promise of the same accuracy on every real receipt. See `receipts/RESULTS.md` for the latest comparison.
