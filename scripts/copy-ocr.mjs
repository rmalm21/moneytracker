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

// The second reader: PaddleOCR.js (Apache-2.0) with PP-OCRv6 models (Apache-2.0, official PaddlePaddle exports, pinned
// via npm), and the ONNX Runtime Web files it runs on. Each model is packed as the plain .tar the SDK expects
// (inference.onnx + inference.yml), so nothing is fetched from an outside host when it reads.
const paddle = path.join(out, 'paddle');
function tarOf(entries) {
  const blocks = [];
  for (const [name, data] of entries) {
    const header = Buffer.alloc(512);
    const put = (text, at, len) => header.write(text, at, len, 'ascii');
    put(name, 0, 100); put('0000644\0', 100, 8); put('0000000\0', 108, 8); put('0000000\0', 116, 8);
    put(`${data.length.toString(8).padStart(11, '0')}\0`, 124, 12); put(`${Math.floor(Date.UTC(2026, 0, 1) / 1000).toString(8).padStart(11, '0')}\0`, 136, 12);
    put('        ', 148, 8); put('0', 156, 1); put('ustar\0', 257, 6); put('00', 263, 2);
    let sum = 0; for (const byte of header) sum += byte;
    put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
    blocks.push(header, data, Buffer.alloc((512 - (data.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return Buffer.concat(blocks);
}
for (const tier of ['tiny', 'small']) {
  const bundle = path.join(root, `node_modules/@arcships/light-ocr-model-ppocrv6-${tier}/bundle`);
  if (!fs.existsSync(bundle)) { console.warn(`OCR: model PP-OCRv6 ${tier} tidak ditemukan.`); continue; }
  for (const part of ['det', 'rec']) {
    const target = path.join(paddle, `v6-${tier}`, `${part}.tar`), onnx = path.join(bundle, part, 'inference.onnx'), yml = path.join(bundle, part, 'inference.yml');
    if (fs.existsSync(target) && fs.statSync(target).mtimeMs >= fs.statSync(onnx).mtimeMs) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, tarOf([['inference.yml', fs.readFileSync(yml)], ['inference.onnx', fs.readFileSync(onnx)]]));
  }
}
for (const name of ['ort-wasm-simd-threaded.mjs', 'ort-wasm-simd-threaded.wasm']) {
  const source = path.join(root, 'node_modules/onnxruntime-web/dist', name), target = path.join(out, 'ort', name);
  if (!fs.existsSync(source)) { console.warn(`OCR: ${name} tidak ditemukan.`); continue; }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target) || fs.statSync(target).size !== fs.statSync(source).size) fs.copyFileSync(source, target);
}
