import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canTapFocus, coverPoint, tapFocusPlan, chooseCamera, focusConstraints, rankCameras } from '../lib/camera-select.ts';

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

test('an iPhone set to Indonesian: "Kamera Belakang", not the ultra-wide or the triple camera', async () => {
  const { chooseCamera: choose } = await import('../lib/camera-select.ts');
  const list = [cam('tri', 'Kamera Tiga Belakang'), cam('dw', 'Kamera Ganda Lebar Belakang'), cam('uw', 'Kamera Ultra Lebar Belakang'), cam('tele', 'Kamera Telefoto Belakang'), cam('main', 'Kamera Belakang'), cam('f', 'Kamera Depan')];
  assert.equal(choose(list), 'main');
});

test('rear cameras the labels cannot tell apart are asked; the one with autofocus and the bigger sensor wins', async () => {
  const { tiedRearCameras, chooseByCapabilities, nextRearCamera } = await import('../lib/camera-select.ts');
  const list = [cam('a', 'Rear camera'), cam('b', 'Rear camera'), cam('f', 'Front camera')];
  assert.deepEqual(tiedRearCameras(list).sort(), ['a', 'b']);
  assert.deepEqual(tiedRearCameras([cam('main', 'Back Camera'), cam('uw', 'Back Ultra Wide Camera')]), []);
  assert.equal(chooseByCapabilities([{ deviceId: 'uw', caps: { focusMode: ['manual'], width: { max: 2560 }, height: { max: 1920 } } }, { deviceId: 'main', caps: { focusMode: ['continuous', 'manual'], width: { max: 4000 }, height: { max: 3000 } } }]), 'main');
  assert.equal(chooseByCapabilities([{ deviceId: 'a', caps: { focusMode: ['continuous'] } }, { deviceId: 'b', caps: { focusMode: ['continuous'] } }]), undefined, 'alike: nothing is guessed');
  assert.equal(nextRearCamera(list, 'a'), 'b'); assert.equal(nextRearCamera(list, 'b'), 'a');
  assert.equal(nextRearCamera([cam('m', 'Back Camera'), cam('f', 'Front Camera')], 'm'), undefined, 'one rear camera: no switch');
});

test('tap focus plan: point, refocus or none', () => {
  assert.equal(tapFocusPlan({ focusMode: ['manual', 'single-shot', 'continuous'] }), 'point');
  assert.equal(tapFocusPlan({ focusMode: ['continuous'] }), 'refocus');
  assert.equal(tapFocusPlan({}), 'none');
  assert.equal(tapFocusPlan(undefined), 'none');
});

test('cover point maps a tap to the cropped camera frame', () => {
  // 1920x1080 landscape frame in a 390x700 portrait box: sides are cropped, the center stays the center.
  const c = coverPoint(195, 350, 390, 700, 1920, 1080);
  assert.ok(Math.abs(c.x - .5) < 1e-9 && Math.abs(c.y - .5) < 1e-9);
  const left = coverPoint(0, 350, 390, 700, 1920, 1080);
  assert.ok(left.x > .3 && left.x < .4, String(left.x));
  assert.deepEqual(coverPoint(-10, 800, 390, 700, 0, 0), { x: 0, y: 1 });
});
