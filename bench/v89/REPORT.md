# 8.9 spike: an on-device embedding model (Transformers.js) for import categories

Not in the app. A measurement to decide whether a ~130 MB model is worth downloading on the phone.

- `import-cat-heldout3.json` (75 made-up lines the 8.8 rules may not know): written **before** any model was run.
- `baseline-8.8-heldout3.txt`: the 8.8 rules, run once (`node bench/v89/import-cat-rules.mjs heldout3`).
- `spike-knn.mjs`: nearest labeled examples. The examples are the words the rules already know (`places.ts`,
  `categorize.ts`), labeled through the category names. It needs `@huggingface/transformers` (4.3.2), which is **not** a
  dependency of the app: install it in a scratch folder to re-run.
- `spike-e5-heldout3.txt`: the held-out run (once). The 0.88 threshold was chosen on the older sets before this run;
  0.86 and 0.90 are shown for information only.

Models (q8 ONNX + tokenizer): Xenova/multilingual-e5-small ≈ 129 MB, Xenova/paraphrase-multilingual-MiniLM-L12-v2 ≈ 129 MB.
MiniLM was clearly worse on the older sets (50–67% alone against 70–87% for e5) and was dropped. Describing a category by
its name only (no examples) was poor for both (34–58% right, 33–54% wrong on dev/dev2).

| Run (held-out 3, 75 lines) | Right | Wrong | No guess |
|---|---|---|---|
| 8.8 rules | 61 (81.3%) | 6 | 8 |
| **rules + e5-small fallback (threshold 0.88)** | **63 (84.0%)** | 6 | 6 |
| rules + fallback, threshold 0.86 (info) | 64 (85.3%) | 8 | 3 |
| rules + fallback, threshold 0.90 (info) | 61 (81.3%) | 6 | 8 |
| e5-small alone, threshold 0.88 (info) | 20 (26.7%) | 3 | 52 |

What this says, honestly:

- The model adds 2 right lines of 75 for a ~130 MB download. Lowering the threshold adds wrong guesses as fast as right ones.
- The small model matches word shapes more than meaning in Indonesian ("Pijat refleksi" is nearest to "resepsi").
- Speed was fine on the server (3–4 ms per line, native ONNX Runtime); not measured on a phone.
- The set also shows wrong rule guesses (becak, bajaj ke pasar, tukang sayur, mainan anak, uang saku dinas). Fixing them
  after this run would be post-hoc for this set.

Decision: not shipped.

## Round 2: a better model, a vocabulary cut to Indonesian + English, and the model next to the rules

heldout3 (above) was used from here on **to choose** (models, thresholds, how to combine); it is no longer a measurement.
`import-cat-heldout4.json` (83 lines, a mix of lines the rules may not know and ordinary ones) was written and committed
(e0064cc) before any second-round model was run, and run once at the end with the frozen setup.
Tools: `tools/export.mjs` (rule words + bench lines with the rules' guesses), `tools/pyeval.py` (scoring),
`tools/trim_gemma.py`, `tools/degbq.py`, `tools/verify_trim.py`, `tools/distill.py`, `tools/webbench.mjs` + `web-bench.html`.
Models are not in the repository.

How the model sits next to the rules: nearest labeled examples (the words the rules know + the made-up lines of
dev/dev2/heldout/heldout2), confidence = how far the winning main category's best example is ahead of any other main
category's best example. **Fill** a line the rules leave empty when confidence ≥ the fill threshold; **override** a rule
guess when confidence ≥ the override threshold and the model names another main category.

Choosing (heldout3, 75 lines; not a measurement):

| Model | Download | Best result on heldout3 (right / wrong / no guess) |
|---|---|---|
| 8.8 rules | — | 61 / 6 / 8 |
| multilingual-e5-small, fill 0.88 | ≈129 MB | 63 / 6 / 6 |
| LazarusNLP all-indo-e5-small-v4 (Indonesian), fill + override, margin 0.10 | ≈129 MB (no licence stated) | 64 / 5 / 6 |
| potion-multilingual-128M (static), fill 0.08 | ≈506 MB (could be cut) | 64 / 6 / 5 |
| static vectors distilled from EmbeddingGemma, fill 0.02 | ≈13 MB est. | 66 / 6 / 3 (alone only ~65–70% right: confidence unreliable) |
| **EmbeddingGemma-300M q4, fill ≥ 0.02 + override ≥ 0.08** | 207 MB → **117 MB trimmed** | **69 / 4 / 2**, and no change on dev, dev2, heldout, heldout2 |

Vocabulary cut (EmbeddingGemma): 96,360 of 262,144 tokens kept (Indonesian/English word lists used only to choose, plus
Title/UPPER case and every merge path of a kept token). The same tokens for 1,429 of 1,432 test texts; embeddings
identical (cos 1.000000) on a sample; benchmark results identical to the full model. The q4 embedding lookup
(GatherBlockQuantized) is not in onnxruntime-web's WASM build; `degbq.py` rewrites it with standard operators (output
identical, max difference 0.0).

Speed in Chromium (Transformers.js 4.3.2, WASM, the trimmed model served locally, cross-origin isolated):

| Machine | Load | One line | 50 lines in one batch |
|---|---|---|---|
| this server, 4 threads | 2.6 s | 240 ms | 2.8 s |
| this server, 1 thread | 2.1 s | 391 ms | 8.4 s |
| CPU slowed ×4 (rough mid-range phone), 4 threads | 8.5 s | 606 ms | 10.3 s |

**Measurement (heldout4, 83 lines, run once with the frozen setup):**

| Run | Right | Wrong | No guess |
|---|---|---|---|
| 8.8 rules | 69 (83.1%) | 3 | 11 |
| **rules + EmbeddingGemma (fill ≥ 0.02, override ≥ 0.08)** | **72 (86.7%)** | **7** | 4 |
| rules + fill only, 0.02 (info) | 73 | 6 | 4 |
| rules + fill only, 0.08 (info) | 71 | 4 | 8 |

What this says, honestly:

- On fresh lines the model fills 7 of the 11 lines the rules leave empty, but only about half of them right, so wrong
  answers go from 3 to 7. heldout3 (69 / 4 / 2) was optimistic because the setup was chosen on it.
- Its mistakes follow surface words: "Kartu nama" and "Password manager yearly plan" → Biaya Kartu (near "biaya kartu",
  "annual fee"), "Biaya materai elektronik" → Biaya Kartu.
- Not good enough to set categories on its own. At most it could **suggest** a category for empty rows that the person
  still confirms, for a ~120 MB download.

Decision: not shipped.

## Round 3: 8.9 rule fixes, a large held-out set and a large format test

Written and committed before the 8.9 fixes (99d37dc): `import-cat-heldout5.json` (157 everyday lines across every
category) and `import-format.mjs`, which wraps every labeled line the way banks and e-wallets print it (QRIS,
`TRSF E-BANKING DB/CR …`, `BI-FAST CR …`, debit card, reference numbers, upper and lower case, …): 4,248 lines from the
older sets ("pool", all already seen) and 1,518 from heldout5. A shop line must keep its category, and must not turn
into a transfer to a person.

Fixes: (1) a line the reader knows as a place or a kind of spending is a payment even when the bank calls it a transfer;
a note written like a note ("Celana jeans", "Bayar kos Bu Siti", "Tiket Ancol") is not a person's name; names written
like names, and lines in capitals, still count as a person. (2) Places/words that a broader word took the wrong way
(becak, bajaj, tukang sayur, gula darah, sprei/sarung bantal, mainan, masker wajah, materai, kartu nama, …), from the
misses of heldout3/heldout4 (post-hoc for them).

**Measurement (heldout5 and its format test, each run once after the fixes):**

| Run | Right | Wrong | No guess | Read as a transfer |
|---|---|---|---|---|
| heldout5, 8.8 | 144 (91.7%) | 5 | 8 | — |
| **heldout5, 8.9** | **146 (93.0%)** | 4 | 7 | — |
| heldout5 × formats (1,518), 8.8 | 1,262 (83.1%) | 45 | 73 | 138 (9.1%) |
| **heldout5 × formats, 8.9** | **1,408 (92.8%)** | 40 | 67 | **3 (0.2%)** |

After that run, the 11 heldout5 misses were fixed too (pempek, pasta gigi, tiket konser, ongkir, spion, golf, kostum,
PCR, termometer, bantu biaya berobat, coworking): heldout5 157/157 and its format test 1,518/1,518 — **post-hoc, not a
measurement**.

Everything else after the fixes: dev 99/99, dev2 55/55, heldout 80/80, heldout2 51/52 (lipstick: right main category,
another sub), heldout3 75/75 and heldout4 83/83 (post-hoc), pool format test 99.8% right, 0 read as a transfer, 100% the
same as the plain line. The owner's real files (counts only, starter categories, no history): rows with a category GoPay
32/57 and Krom 33/38 (unchanged: the rest are local places named only by their name); transfers with a person unchanged
(5 and 1 with the test owner name).

What this says, honestly: on new everyday lines the rules gained a little (91.7% → 93.0%); the big gain is on real bank
formats, where shop lines written as a transfer were asked "untuk apa" as if paid to a person (9.1% of wrapped lines →
0.2%). Lines named only by a local name stay without a guess until the person picks one once.
