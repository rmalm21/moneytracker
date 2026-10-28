# Third-party notices

## Fluent Emoji (public/emoji)

The emoji images in `public/emoji` are from Microsoft Fluent Emoji (3D style),
https://github.com/microsoft/fluentui-emoji, via the `@lobehub/fluent-emoji-3d` package.
They were resized to 72×72 and converted to WebP.

MIT License

Copyright (c) Microsoft Corporation.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Tesseract.js, tesseract.js-core and tessdata (public/ocr)

Scan struk reads receipt photos on the device with Tesseract.js (https://github.com/naptha/tesseract.js),
its WebAssembly core tesseract.js-core, and the Indonesian and English `4.0.0_best_int` trained data from
tessdata via the `@tesseract.js-data/ind` and `@tesseract.js-data/eng` packages. `scripts/copy-ocr.mjs` copies
them into `public/ocr` at build time.

Licensed under the Apache License, Version 2.0 (https://www.apache.org/licenses/LICENSE-2.0).
Copyright (c) Tesseract.js contributors; Tesseract OCR copyright (c) Google Inc. and the Tesseract contributors.

## CORD v2 receipt dataset (lib/receipt-rowlink-model.ts)

The row model of Scan struk (Receipt Intelligence V4) was trained on CORD v2, "CORD: A Consolidated Receipt Dataset
for Post-OCR Parsing" by Clova AI Research, NAVER Corp. (https://github.com/clovaai/cord). The dataset itself is not
included; only the trained weights are.

Licensed under the Creative Commons Attribution 4.0 International License (https://creativecommons.org/licenses/by/4.0/).
