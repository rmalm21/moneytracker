import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canTapFocus, chooseCamera, focusConstraints, rankCameras } from '../lib/camera-select.ts';

const cam = (deviceId, label) => ({ deviceId, label });

test('Android: the main rear sensor, not the ultra-wide or the front camera', () => {
  const list = [cam('f', 'camera2 1, facing front'), cam('uw', 'camera2 2, facing back'), cam('main', 'camera2 0, facing back')];
  assert.equal(chooseCamera(list), 'main');
  assert.ok(!rankCameras(list).some(c => c.deviceId === 'f'));
});

test('iPhone: "Back Camera" (1×) over ultra wide, dual wide, triple and telephoto', () => {
  const list = [cam('tri', 'Back Triple Camera'), cam('dw', 'Back Dual Wide Camera'), cam('uw', 'Back Ultra Wide Camera'), cam('tele', 'Back Telephoto Camera'), cam('main', 'Back Camera'), cam('front', 'Front Camera')];
  assert.equal(chooseCamera(list), 'main');
  assert.deepEqual(rankCameras(list).slice(-2).map(c => c.deviceId).sort(), ['tele', 'uw']);
});

test('labels naming the lens are avoided whatever the brand writes', () => {
  assert.equal(chooseCamera([cam('a', 'Rear ultra wide camera'), cam('b', 'Rear camera')]), 'b');
  assert.equal(chooseCamera([cam('a', 'Kamera belakang 0.5x'), cam('b', 'Kamera belakang')]), 'b');
  assert.equal(chooseCamera([cam('a', 'Back macro'), cam('b', 'Back camera main')]), 'b');
});

test('without labels, or with nothing to tell apart, the browser keeps its environment choice', () => {
  assert.equal(chooseCamera([cam('a', ''), cam('b', '')]), undefined);
  assert.equal(chooseCamera([]), undefined);
  assert.equal(chooseCamera([cam('f', 'Front Camera')]), undefined);
  assert.equal(chooseCamera([cam('a', 'Integrated Webcam')]), 'a');
});

test('a remembered camera is tried first, but only if it is still there and still a rear camera', () => {
  const list = [cam('main', 'camera2 0, facing back'), cam('uw', 'camera2 2, facing back')];
  assert.equal(chooseCamera(list, 'uw'), 'uw', 'the one that worked last time');
  assert.equal(chooseCamera(list, 'gone'), 'main', 'a changed device id falls back to the automatic choice');
  assert.equal(chooseCamera([...list, cam('f', 'camera2 1, facing front')], 'f'), 'main');
});

test('focus and zoom: continuous autofocus and 1× only when supported; nothing for an unsupported camera', () => {
  assert.deepEqual(focusConstraints({ focusMode: ['continuous', 'single-shot'] }, {}), [{ focusMode: 'continuous' }]);
  assert.deepEqual(focusConstraints({ focusMode: ['manual'] }, {}), []);
  assert.deepEqual(focusConstraints(undefined, undefined), []);
  assert.deepEqual(focusConstraints({ zoom: { min: .5, max: 10 } }, { zoom: .5 }), [{ zoom: 1 }], 'a zoomed-out start goes back to 1×');
  assert.deepEqual(focusConstraints({ zoom: { min: 1, max: 10 } }, { zoom: 1 }), [], 'no digital zoom added');
  assert.equal(canTapFocus({ focusMode: ['continuous', 'single-shot'] }), true);
  assert.equal(canTapFocus({ focusMode: ['continuous'] }), false);
  assert.equal(canTapFocus(undefined), false);
});

test('Scan struk and Split Bill share one camera, and the phone camera stays available', () => {
  const camera = readFileSync(new URL('../components/receipt-camera.tsx', import.meta.url), 'utf8');
  assert.match(camera, /chooseCamera/); assert.match(camera, /focusConstraints/); assert.match(camera, /Kamera bawaan/);
  assert.match(camera, /catch/, 'unsupported constraints never stop the camera');
  const scan = readFileSync(new URL('../components/receipt-scan.tsx', import.meta.url), 'utf8');
  assert.match(scan, /<ReceiptCamera /);
  const flow = readFileSync(new URL('../components/split-bill-flow.tsx', import.meta.url), 'utf8');
  assert.ok(!/getUserMedia|capture="environment"/.test(flow), 'Split Bill has no camera of its own');
});
