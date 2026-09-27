// Copies the on-device receipt reader (Tesseract, Apache-2.0) into public/ocr so the app serves it itself:
// no outside CDN is contacted when a receipt is read. Runs before `next dev` and `next build`.
import fs from 'node:fs';
import path from 'node:path';
const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const out = path.join(root, 'public', 'ocr');
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'].map(name => [`node_modules/tesseract.js-core/${name}`, `core/${name}`]),
  ['node_modules/@tesseract.js-data/ind/4.0.0_best_int/ind.traineddata.gz', 'lang/ind.traineddata.gz'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'lang/eng.traineddata.gz'],
];
for (const [from, to] of files) {
  const source = path.join(root, from), target = path.join(out, to);
  if (!fs.existsSync(source)) { console.warn(`OCR: ${from} tidak ditemukan, baca struk dari foto tidak tersedia.`); continue; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const a = fs.statSync(source);
  if (fs.existsSync(target) && fs.statSync(target).size === a.size) continue;
  fs.copyFileSync(source, target);
}
