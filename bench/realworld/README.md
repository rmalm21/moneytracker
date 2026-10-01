# Real-world receipt benchmark (V3)

Only genuine photos and screenshots go here: real receipts, invoices, transaction screenshots and order screens.
Generated or edited images do not belong here (they are `bench/receipts/fixtures*.mjs`, "synthetic-regression").
Augmented copies of a real image (blur, crop, compression) go in `augmented/` and are reported separately, never
counted as more unique receipts.

```
bench/realworld/
  realworld-dev/        images used while tuning (any name: shopee-1.jpg, mrdiy-1.jpg, …)
  realworld-dev.json    truth for them, written by hand (never copied from an OCR result)
  realworld-heldout/    images nobody looks at while tuning; run once, first result kept
  realworld-heldout.json
```

Images and truth files are git-ignored by default (they can hold names, phone numbers and addresses).

## Truth format (one entry per image)
```json
{
  "shopee-1.jpg": {
    "family": "ecommerce_order", "platform": "Shopee", "merchant": "Enchen Official Shop",
    "date": "2026-09-27", "time": "19:42", "total": 162733, "payment": "shopeepay",
    "charges": { "delivery": 6500, "discount": 57967, "fee": 2200 },
    "items": [["[Penawaran Kombo] ENCHEN Mini 6 Alat C...", 1, 212000, { "originalPrice": 699000 }]],
    "forbidden": ["Alamat Pengiriman", "Jalan Kenanga", "Butuh Bantuan", "Lacak", "DEBIT"],
    "quality": "ok"
  }
}
```
`forbidden`: texts that must never become an item (address, phone, payment, help buttons). `quality`: `ok` or
`insufficient` (kept in the report, never dropped).

## Run
```
npm run dev
ENGINE=tesseract    SET=realworld-dev node bench/receipts/run.mjs http://localhost:3000 rw-tess
ENGINE=paddle-tiny  SET=realworld-dev node bench/receipts/run.mjs http://localhost:3000 rw-paddle
ENGINE=paddle-first SET=realworld-dev node bench/receipts/run.mjs http://localhost:3000 rw-auto   # app default
SET=realworld-dev node bench/receipts/run.mjs --compare rw-tess rw-auto
```

## Status
At the time of V3.0 no usable real image was available in the project: the one real receipt photo received (a café
receipt seen inside the crop screen) is cut off on the right, so none of its amounts are visible; it is recorded as
`insufficient` and not used for any accuracy number.
