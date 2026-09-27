import test from 'node:test';
import assert from 'node:assert/strict';
import { assessQuality, boxBlur, cropRegion, findPaper, findSkew, homography, mapPoint, paperCorners, quadSize, sharpness, toBmp, variants, warp } from '../lib/receipt-image.ts';

/** A synthetic photo: a dark table with a white receipt (any four corners) carrying dark "text" rows. */
function photo(width, height, quad, { shadow = 0, blur = 0 } = {}) {
  const data = new Float32Array(width * height).fill(70);
  const toPaper = homography([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }].map(p => p), quad) ;
  const toUnit = homography(quad, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = mapPoint(toUnit, x, y);
    if (u.x < 0 || u.x > 1 || u.y < 0 || u.y > 1) continue;
    const row = u.y * 40, inRow = row - Math.floor(row);
    const text = u.x > .1 && u.x < .9 && inRow > .35 && inRow < .7 && Math.floor(u.x * 60) % 3 !== 0;
    let v = text ? 40 : 240;
    if (shadow && u.x < .4) v *= 1 - shadow;
    data[y * width + x] = v;
  }
  void toPaper;
  return { data: blur ? boxBlur({ data, width, height }, blur) : data, width, height };
}
const near = (a, b, tol) => Math.hypot(a.x - b.x, a.y - b.y) <= tol;

test('the four corners of a receipt shot at an angle are found', () => {
  const quad = [{ x: 90, y: 60 }, { x: 300, y: 80 }, { x: 330, y: 520 }, { x: 60, y: 500 }];
  const img = photo(400, 600, quad);
  const paper = findPaper(img);
  assert.ok(paper);
  const corners = paperCorners(paper, img.width, img.height);
  corners.quad.forEach((p, i) => assert.ok(near(p, quad[i], 5), `corner ${i}: ${JSON.stringify(p)} vs ${JSON.stringify(quad[i])}`));
  assert.equal(corners.confidence, 'high');
});

test('the perspective warp straightens the receipt: text rows become horizontal', () => {
  const quad = [{ x: 110, y: 60 }, { x: 290, y: 60 }, { x: 350, y: 540 }, { x: 50, y: 540 }];
  const img = photo(400, 600, quad);
  const { width, height } = quadSize(quad), w = Math.round(width), h = Math.round(height);
  const toSource = homography([{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }], quad);
  const out = warp(img, toSource, w, h);
  // Every output row is either mostly paper or crosses text: no slanted rows remain, so the skew is ~0.
  const skew = findSkew({ data: Float32Array.from(out), width: w, height: h }, null, 10);
  assert.ok(Math.abs(skew) <= .5, `skew ${skew}`);
  // Corners map exactly.
  assert.ok(near(mapPoint(toSource, 0, 0), quad[0], .01) && near(mapPoint(toSource, w, h), quad[2], .01));
});

test('a shadow over part of the receipt does not cut it off', () => {
  const quad = [{ x: 80, y: 60 }, { x: 320, y: 60 }, { x: 320, y: 540 }, { x: 80, y: 540 }];
  const img = photo(400, 600, quad, { shadow: .45 });
  const paper = findPaper(img);
  assert.ok(paper && paper.x0 <= 84 && paper.x1 >= 316, `paper ${paper?.x0}..${paper?.x1}`);
});

test('light is evened out: shadowed paper becomes as white as lit paper', () => {
  const quad = [{ x: 0, y: 0 }, { x: 399, y: 0 }, { x: 399, y: 599 }, { x: 0, y: 599 }];
  const img = photo(400, 600, quad, { shadow: .5 });
  const grey = Uint8ClampedArray.from(img.data);
  const { even } = variants(grey, 400, 600);
  // Paper pixels between rows, in the shadow (x≈60) and in the light (x≈300).
  const at = (x, y) => even[y * 400 + x];
  const paperRow = 7; // y where inRow < .35
  assert.ok(Math.abs(at(60, paperRow) - at(300, paperRow)) < 30, `${at(60, paperRow)} vs ${at(300, paperRow)}`);
});

test('a sharp photo scores higher than a blurred one', () => {
  const quad = [{ x: 0, y: 0 }, { x: 399, y: 0 }, { x: 399, y: 599 }, { x: 0, y: 599 }];
  const sharp = sharpness(photo(400, 600, quad)), soft = sharpness(photo(400, 600, quad, { blur: 3 }));
  assert.ok(sharp > soft * 1.5, `${sharp} vs ${soft}`);
});

test('quality: a small, dark receipt gets friendly warnings', () => {
  const quad = [{ x: 170, y: 240 }, { x: 245, y: 240 }, { x: 245, y: 355 }, { x: 170, y: 355 }];
  const img = photo(400, 600, quad);
  for (let i = 0; i < img.data.length; i++) img.data[i] *= .4;
  const paper = findPaper(img);
  const q = assessQuality({ preview: img, paper, corners: paper ? paperCorners(paper, 400, 600) : null, skew: 0, photoWidth: 400, photoHeight: 600, receiptWidthInPhoto: 50, working: null });
  assert.ok(q.warnings.includes('Foto terlalu gelap.'), q.warnings.join(' | '));
  assert.ok(q.warnings.some(w => /terlalu kecil/.test(w)));
  assert.equal(q.retake, true);
  assert.ok(!q.warnings.some(w => /\d/.test(w)), 'no technical numbers for the user');
});

test('an 8-bit BMP for the reader, and enlarged regions for re-reading', () => {
  const bmp = toBmp(new Uint8ClampedArray([0, 255, 128, 64, 10, 20]), 3, 2);
  assert.equal(String.fromCharCode(bmp[0], bmp[1]), 'BM');
  assert.equal(bmp.length, 54 + 1024 + 4 * 2);
  const region = cropRegion(new Uint8ClampedArray(100 * 50).fill(200), 100, 50, { x: 10, y: 10, width: 20, height: 10 }, 3, 12);
  assert.equal(region.width, 20 * 3 + 24); assert.equal(region.height, 10 * 3 + 24);
});

test('text running into the edge means the receipt was cut; a proper margin does not', async () => {
  const { inkAtEdges } = await import('../lib/receipt-image.ts');
  const make = cutLeft => { const w = 300, h = 400, data = new Uint8ClampedArray(w * h).fill(240); for (let y = 0; y < h; y++) { if ((y % 20) < 8 && y > 20 && y < h - 20) for (let x = cutLeft ? 0 : 30; x < 270; x++) if (x % 7 < 4) data[y * w + x] = 30; } return inkAtEdges(data, w, h); };
  assert.deepEqual(make(false).cut, []);
  assert.ok(make(true).cut.includes('left'));
});
