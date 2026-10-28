# Minimarket receipts (made up, photographed in software)

No minimarket receipt photos with a licence that allows this use were found (HuggingFace, Kaggle, Mendeley; the one
CC BY 4.0 set on Roboflow needs an account). So these receipts are generated: the layouts real Indonesian chains and small
shops print, with invented shops, addresses and numbers, then "photographed" with the defects of a phone picture.

- `receipts.mjs`: the receipts. Five layouts: four-column rows with `HARGA JUAL / TOTAL / TUNAI / KEMBALI` and
  `PPN : DPP= … PPN= …`; four-column rows with `Total Item n`, `Total Disc.`, `Total Belanja`; a supermarket with
  weighed items (`0.582 KG x 59,900`), member discount and points; a convenience store in `Rp 12.500` with
  `2 @ Rp 8.000` rows; a small shop's 32-column printer with two-line items (`GULA PASIR 1KG` / `2 x 17.500 35.000`).
  Item discounts, cash with change or card/QRIS/e-wallet, PPN already in the prices.
- `photo.py`: thermal ink faded unevenly, paper tint, curl (rows bow) and crumple, the phone tilted along the paper
  (sideways only a little, as for a narrow receipt), rotation, a table under it, uneven light, a hand's shadow, glare,
  focus blur, shake, noise, low resolution, JPEG. Three levels: easy 35%, medium 45%, hard 20%.
- `build.mjs`: prints the receipts flat in Chromium, keeps every word's box, runs `photo.py`; output in the format of
  `bench/cord/convert.py`, so `bench/receipts/run.mjs` (SET_DIR) and the row-model scripts in `bench/cord` read it.

```
MINI_DIR=/tmp/mini node bench/minimarket/build.mjs mini-dev 101 60 dev
MINI_DIR=/tmp/mini node bench/minimarket/build.mjs mini-hold 202 60 hold     # also unseen products, shops and labels
MINI_DIR=/tmp/mini node bench/minimarket/build.mjs mini-train 303 200 train  # for the row model only
SET_DIR=/tmp/mini SET=mini-dev RESULTS_DIR=/tmp/mini-work node bench/receipts/run.mjs http://localhost:3000 v72-mini-dev
```

Limits: generated text is cleaner than a real printer's, the fonts are not the printers' own, and the layouts are as
well as they could be reconstructed. The numbers measure the reader on these layouts, not on real minimarket photos.
