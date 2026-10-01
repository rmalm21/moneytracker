# Receipt Intelligence V3.0 "Dual-Vision": benchmark report (app 3.2)

Everything runs on the device. No image, text or result is uploaded anywhere: there is no Firebase Storage, and Gemini was
off for every run. The models and the WASM runtime are served by the app itself (`/ocr/…`), so there are no CDN calls.

**Read this first.** There are only **5 real receipts** in the tuning set and **1 held-out real image**. That is enough
to see that the direction is right, but not enough to state an accuracy for receipts in general. The synthetic sets are
regression checks only. They are **not** a real-world claim.

## 1. What changed (architecture, before → after)

| Part | V2.5 (app 3.0/3.1) | V3 (app 3.2) |
|---|---|---|
| OCR engine | Tesseract only | **PP-OCRv6** (PaddleOCR.js 0.4.2, official SDK) first, Tesseract as second opinion and fallback |
| Models | — | PP-OCRv6 `tiny` (6 MB det+rec) on devices < 8 GB RAM; `small` (31 MB) on ≥ 8 GB (`navigator.deviceMemory`) |
| Runtime | tesseract.js worker | + ONNX Runtime Web, WASM-only build (no WebGPU/JSEP), one thread, models freed after 3 idle min |
| Offline | Tesseract assets cache-first | all `/ocr/` assets cache-first in the service worker (`v11`), so a second scan needs no network |
| Screenshots | treated as paper photos (paper search, straightening) | detected (flat blocks ≥ 20 %, phone shape ≥ 1.7:1) and read as-is |
| Segments → rows | — | polygon slope + per-word height along the polygon edges + overlap-based row grouping; on a tie, rebuilt rows beat loose segments |
| Document layer | paper parser only | `lib/receipt-doc.ts`: family (paper / order screen), blocks, line roles, amount roles |
| E-commerce | none | order-screen reader (Shopee-style): platform vs store, crossed-out price kept as `originalPrice` and **never** paid, summary rows mapped to charges |
| Item gate | modifiers / boundaries | + quarantine for NPWP, address, postcode/city, phone, delivery/recipient, order/ref ids, count lines, payment-only labels, label:value lines as shop name |
| Routing | fixed ladder | `paddle-first`: PP-OCRv6 page read → (unsure crop) whole-photo PP-OCRv6 read → Tesseract as second opinion in the ladder → existing recovery ladder |

The engine interface (`OcrEngine.recognize → { native, rows, confidence }`) is unchanged, so Tesseract, PP-OCRv6 tiny
and PP-OCRv6 small are drop-in replacements for each other. If PP-OCRv6 cannot start (old browser, no WASM SIMD, out of
memory), the reader falls back to Tesseract automatically and the user sees no error.

Model source: official PP-OCRv6 exports from npm (`@arcships/light-ocr-model-ppocrv6-{tiny,small}`, Apache-2.0, SHA256
manifest), packed by `scripts/copy-ocr.mjs` into `public/ocr/paddle/v6-*/{det,rec}.tar`. Assets: Tesseract 16 MB,
ORT WASM 14 MB, PP-OCRv6 tiny 6 MB, small 31 MB. A phone downloads only the tier it uses, once.

## 2. Datasets

| Set | Images | Kind | Use |
|---|---|---|---|
| `realworld-dev` | 5 | genuine (4 paper photos: MR D.I.Y., Alfamidi, cafe, Wizzmie; 1 Alfamart app screenshot) | tuning |
| `realworld-heldout` | 1 run once, then moved to dev | genuine (Alfamart screenshot) | first-contact measurement |
| Synthetic V2.5 structure | 16 | rendered photos | regression |
| Synthetic original | 39 | rendered photos | regression |
| Text fixtures | 5 real transcriptions (redacted) + 1 synthetic Shopee order | text | unit tests |

The real images and their truth files are git-ignored (personal data). The truth was typed by hand from the receipt and
never copied from an OCR result. Each truth file has a `forbidden` list: texts that must never become an item (address,
phone, payment, buttons).

## 3. First contact: 4 real photos, before any V3 tuning

| Mode | Merchant | Total | Items found | Fake items | Wrong totals | Avg time |
|---|---|---|---|---|---|---|
| Tesseract (V2.5) | 25 % | 75 % | 72 % | 2 | 1 | 14.3 s |
| PP-OCRv6 tiny | 75 % | 75 % | 75 % | 1 | 1 | 6.3 s |
| PP-OCRv6 small | 75 % | 75 % | 88 % | 1 | 1 | 17.8 s |

PP-OCRv6 read the characters of all four receipts almost perfectly. Nearly every remaining error was *understanding*
(which line is an item, which is an address or a payment), not reading. That is what the document layer and the item
gate address.

## 4. Held-out first result (kept as is): Alfamart screenshot, run once

| Mode | Merchant | Total | Items | Reconciled | Fake items | Forbidden text as item |
|---|---|---|---|---|---|---|
| Tesseract | ✔ | ✔ | 100 % | ✔ | 0 | 1 |
| PP-OCRv6 tiny | ✔ | ✔ | 100 % | ✘ | 0 | 1 |
| PP-OCRv6 small | ✔ | ✔ | 100 % | ✘ | 1 | 1 |
| paddle-first | ✔ | ✔ | 100 % | ✔ | 0 | 1 |

All modes got the total right. All modes made the same understanding errors:
- "Ref. …" was glued to an item name.
- The "Total Diskon" line was counted a second time on top of the item discount.
- "Delivered at …" was taken as the branch.

These were fixed afterwards, and the image was then moved to the dev set. **There is no fresh held-out measurement of
the final engine.** One is needed (see §9).

## 5. Real-world dev: final engine (5 images)

| Mode | Merchant | Date | Total | Items | Amounts | Charges | Reconciled | Fake items | Forbidden as item | Wrong totals | Avg time |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Tesseract | 40 % | 80 % | 80 % | 88 % | 85 % | 100 % | 80 % | 2 | 1 | 1 | 10.6 s |
| PP-OCRv6 tiny | 80 % | 60 % | 100 % | 100 % | 100 % | 50 % | 80 % | 1 | 1 | 0 | 6.4 s |
| PP-OCRv6 small | 80 % | 80 % | 100 % | 100 % | 100 % | 67 % | 100 % | 0 | 0 | 0 | 13.7 s |
| **paddle-first (app default)** | **100 %** | **100 %** | **100 %** | **100 %** | **100 %** | **100 %** | **100 %** | **0** | **0** | **0** | **18.4 s** |

Confidently wrong totals: 0 in every mode. Original (crossed-out) price taken as paid: 0. Tesseract's wrong total was
the MR D.I.Y. photo: the paper is slanted, and rows from different lines were merged.

Relations (variant, SKU, notes, item discount) are weaker on real receipts: **40 %**. For example, the MR D.I.Y.
variant `DB024 - 12/60` and its SKU are not linked to the umbrella. Money is not affected, but these details still
need work.

## 6. Synthetic regression: no money regression

| Set | Mode | Merchant | Date | Total | Charges | Reconciled | Relations | Fake items | Wrong totals | Avg time |
|---|---|---|---|---|---|---|---|---|---|---|
| Structure 16 | Tesseract | 100 % | 94 % | 100 % | 100 % | 100 % | 93 % (3 wrong) | 0 | 0 | 2.3 s |
| Structure 16 | paddle-first | 100 % | 88 % | 100 % | 100 % | 100 % | **100 % (0 wrong)** | 0 | 0 | 5.7 s |
| Original 39 | Tesseract | 100 % | 97 % | 97 % | 88 % | 95 % | – | 0 | 1 | 3.3 s |
| Original 39 | paddle-first | 100 % | 92 % | **100 %** | **97 %** | **97 %** | – | 0 | **0** | 8.2 s |

The Tesseract path gives the same numbers as V2.5, so the parser did not regress. On the synthetic set, PP-OCRv6 reads
some dates and times less well than Tesseract (2 of 16 and 3 of 39). These are not money fields, and the review screen
already flags a missing date.

During tuning, one fake item appeared on `v25-modifier-faded`: the note "1 hangat 2 ice" was taken as an item. The cause
was that the loose PP-OCRv6 segments (name and price on separate lines) won a score tie against the rebuilt rows. That
tie now goes to the rows (`Recognized.segments`), and a test covers it.

## 7. Latency and memory

- **paddle-first on real photos: 18 s on average** in headless Chromium on this container's CPU. Measured with the
  `small` model, because the benchmark browser reports ≥ 8 GB.
  - Most of the time goes to the whole-photo re-read, which runs when the receipt edges are unclear (most real photos).
  - Phones with < 8 GB use `tiny`, which takes ~6 s per read here.
- **Synthetic photos: 5.7–8.2 s** (Tesseract: 2.3–3.3 s).
- **Memory:** one PP-OCRv6 instance at a time, one WASM thread, input side capped at 1280 px. The models are freed
  after 3 idle minutes.
  - `tiny` keeps the peak low enough for 4 GB phones.
  - If loading fails, the reader falls back to Tesseract.
- **First scan only:** the model download (6 MB tiny / 31 MB small + 14 MB runtime). After that, everything comes from
  the cache, offline too.

## 8. Safety rules held in every run

- **No fabricated values.** Every item, price and total comes from a line that was read. Arithmetic may only choose
  between prices that were actually read; it never invents one.
- **Forbidden texts are not counted as items.** In the final paddle-first run, 0 forbidden texts (address, phone,
  payment method, help/track buttons, order id, NPWP) became items.
- **Crossed-out e-commerce prices are not counted as paid.** They are shown as "Harga coret … · tidak dihitung".
- **Nothing is uploaded.** No image or OCR text leaves the device, and no receipt URL is ever public.

## 9. Remaining weaknesses (honest)

1. **The sample is too small.** 5 dev images and 1 held-out image cannot support a general accuracy claim. Needed:
   **≥ 30 dev and ≥ 10 held-out real images**, including:
   - a **real Shopee/Tokopedia order screenshot** (the e-commerce reader has only been tested on a synthetic one);
   - long minimarket receipts, faded thermal paper, receipts photographed at night;
   - restaurant bills with service charge and PB1.
2. **Relations on real receipts: 40 %.** Variant and SKU lines that sit under the name in a second column are not
   linked yet.
3. **Latency.** 18 s on a slanted real photo is long. The next step is to run the whole-photo read only when the first
   read lacks a merchant or date, or does not reconcile.
4. **Dates and times on synthetic photos with PP-OCRv6** are slightly worse than with Tesseract (88–92 % vs 94–97 %).
5. **No fresh held-out run of the final engine.** The single held-out image was used for tuning after its first run.

## 10. Commands

```
npm run dev
ENGINE=tesseract    SET=realworld-dev node bench/receipts/run.mjs http://localhost:3000 v3-tesseract
ENGINE=paddle-tiny  SET=realworld-dev node bench/receipts/run.mjs http://localhost:3000 v3-paddle-tiny
ENGINE=paddle-small SET=realworld-dev node bench/receipts/run.mjs http://localhost:3000 v3-paddle-small
ENGINE=paddle-first SET=realworld-dev node bench/receipts/run.mjs http://localhost:3000 v3-paddle-first
ENGINE=paddle-first SET=v25           node bench/receipts/run.mjs http://localhost:3000 v3set-paddle-first
ENGINE=paddle-first                   node bench/receipts/run.mjs http://localhost:3000 v3-39-paddle-first
```

Results are written to `bench/receipts/out/result-<label>.json` (not committed).
