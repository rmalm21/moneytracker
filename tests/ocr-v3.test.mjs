// V3 OCR plumbing: PaddleOCR segments → the shared line shape (with the tilt taken from the polygons), and the
// screenshot detector. Pure functions; the engines themselves are measured by the benchmark in a browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { paddleToRecognized, segmentWords, paddleTierFor } from '../lib/ocr-paddle.ts';
import { flatShare, looksLikeScreenshot } from '../lib/receipt-digital.ts';

const seg = (text, x0, y0, x1, y1, tilt = 0) => ({ text, score: .95, poly: [[x0, y0], [x1, y0 + tilt * (x1 - x0)], [x1, y1 + tilt * (x1 - x0)], [x0, y1]] });

test('a segment is split into words across its width', () => {
  const words = segmentWords('Total Incl. PPN', [[0, 0], [150, 0], [150, 20], [0, 20]], .9);
  assert.deepEqual(words.map(w => w.text), ['Total', 'Incl.', 'PPN']);
  assert.ok(words[0].x1 <= words[1].x0 && words[1].x1 <= words[2].x0);
  assert.equal(words[0].confidence, 90);
});

test('rows of a tilted receipt are not merged: the slope comes from the segments themselves', () => {
  // Two rows 30 px apart, the whole receipt tilted 8 % (a hand-held photo); names left, prices far right.
  const t = .08, items = [seg('GREEN LEAF MIRROR', 0, 100, 300, 120, t), seg('20,000', 700, 100 + t * 700, 780, 120 + t * 700, t), seg('3109482 1 X 20,000', 0, 130, 300, 150, t), seg('20,000', 700, 130 + t * 700, 780, 150 + t * 700, t)];
  const rows = paddleToRecognized(items).rows.map(r => r.text);
  assert.equal(rows.length, 2, JSON.stringify(rows));
  assert.ok(/^GREEN LEAF MIRROR\s+20,000$/.test(rows[0]), rows[0]);
});

test('the small model only where the device has the memory for it', () => {
  assert.equal(paddleTierFor(4), 'tiny'); assert.equal(paddleTierFor(8), 'small'); assert.equal(paddleTierFor(undefined), 'tiny');
});

test('screenshot vs photo: flat blocks and a phone-screen shape', () => {
  const W = 108, H = 234, flat = new Uint8Array(W * H).fill(255);
  for (let i = 0; i < 300; i++) flat[(i * 97) % flat.length] = 0;
  const noisy = Uint8Array.from({ length: W * H }, (_, i) => 120 + ((i * 7919) % 13));
  assert.ok(flatShare(flat, W, H) > .2); assert.equal(looksLikeScreenshot(flat, W, H), true);
  assert.equal(looksLikeScreenshot(noisy, W, H), false);
  // Flat but 4:3 (a rendered test receipt, a scanned page): not taken for a phone screenshot.
  assert.equal(looksLikeScreenshot(new Uint8Array(160 * 120).fill(250), 160, 120), false);
});
