import test from 'node:test';
import assert from 'node:assert/strict';
import { cornerCandidates, edgeField, snapCorner, snapEdge, snapQuad } from '../lib/crop-magnet.ts';

// A 300x400 dark photo with white paper from (60,50) to (240,350), plus a little print inside.
function photo() {
  const w = 300, h = 400, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const paper = x >= 60 && x < 240 && y >= 50 && y < 350, ink = paper && y % 24 < 3 && x > 80 && x < 200;
    const v = ink ? 70 : paper ? 235 : 45, i = (y * w + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
  }
  return { data, w, h };
}
const near = (p, x, y, tol = .025) => Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tol;

test('corner candidates include the paper corners', () => {
  const { data, w, h } = photo(), field = edgeField(data, w, h);
  const c = cornerCandidates(field);
  for (const [x, y] of [[.2, .125], [.8, .125], [.8, .875], [.2, .875]]) assert.ok(c.some(p => near(p, x, y)), `corner ${x},${y}`);
});

test('a dragged corner snaps to a nearby corner, not to a far one', () => {
  const { data, w, h } = photo(), field = edgeField(data, w, h), targets = cornerCandidates(field);
  const snapped = snapCorner({ x: .23, y: .15 }, w / h, targets);
  assert.ok(snapped && near(snapped, .2, .125), JSON.stringify(snapped));
  assert.equal(snapCorner({ x: .5, y: .5 }, w / h, [{ x: .2, y: .125 }]), null);
});

test('a side is pulled onto the paper border', () => {
  const { data, w, h } = photo(), field = edgeField(data, w, h);
  // Left side drawn 12px inside the paper.
  const moved = snapEdge({ x: 72 / w, y: 350 / h }, { x: 72 / w, y: 50 / h }, field);
  assert.ok(moved && Math.abs(moved[0].x - .2) < .015 && Math.abs(moved[1].x - .2) < .015, JSON.stringify(moved));
  // Far from any border (middle of plain background): stays.
  assert.equal(snapEdge({ x: .05, y: .95 }, { x: .05, y: .9 }, field, .01), null);
});

test('a rough outline tidies onto the paper', () => {
  const { data, w, h } = photo(), field = edgeField(data, w, h);
  const q = snapQuad([{ x: .23, y: .15 }, { x: .77, y: .11 }, { x: .82, y: .85 }, { x: .18, y: .9 }], field);
  for (const [p, [x, y]] of q.map((p, i) => [p, [[.2, .125], [.8, .125], [.8, .875], [.2, .875]][i]])) assert.ok(near(p, x, y, .02), JSON.stringify(q));
});
