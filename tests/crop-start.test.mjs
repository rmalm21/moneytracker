import test from 'node:test';
import assert from 'node:assert/strict';
import { editorStart } from '../lib/receipt-prep.ts';

// 7.4: the corner editor starts on the paper's own outline when it is a plausible receipt, else on the reading's crop.
const crop = [{ x: -.05, y: -.05 }, { x: 1.05, y: -.05 }, { x: 1.05, y: 1.05 }, { x: -.05, y: 1.05 }];
const at = outline => editorStart({ corners: crop, outline, photoWidth: 1200, photoHeight: 1600 });

test('a tilted receipt on a table: its outline', () => {
  const paper = [{ x: .2, y: .1 }, { x: .75, y: .12 }, { x: .73, y: .9 }, { x: .18, y: .88 }];
  assert.deepEqual(at(paper), paper);
});

test('a receipt photographed from below (sides meet a little): its outline', () => {
  const paper = [{ x: .32, y: .1 }, { x: .68, y: .1 }, { x: .72, y: .92 }, { x: .28, y: .92 }];
  assert.deepEqual(at(paper), paper);
});

test('no paper, a shadow cutting the top at a slant, a tiny piece, or a side on the photo\'s edge: the crop', () => {
  assert.deepEqual(editorStart({ corners: crop, photoWidth: 1200, photoHeight: 1600 }), crop);
  assert.deepEqual(at([{ x: .2, y: .2 }, { x: .8, y: .1 }, { x: .8, y: .9 }, { x: .2, y: .9 }]), crop);
  assert.deepEqual(at([{ x: .4, y: .4 }, { x: .55, y: .4 }, { x: .55, y: .6 }, { x: .4, y: .6 }]), crop);
  assert.deepEqual(at([{ x: .42, y: .15 }, { x: .998, y: .15 }, { x: .998, y: .75 }, { x: .45, y: .77 }]), crop);
});
