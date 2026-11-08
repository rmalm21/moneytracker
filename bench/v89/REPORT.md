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
