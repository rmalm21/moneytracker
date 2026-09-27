/**
 * Choosing the receipt camera: the phone's normal 1× rear camera, not its ultra-wide, macro, telephoto or front one.
 *
 * `facingMode: environment` alone lets some phones open the 0.5× ultra-wide lens. Once camera permission is given the
 * browser lists the cameras with labels; those labels differ per phone and browser, so they are scored, never
 * matched exactly:
 *   - rear words ("back", "rear", "belakang", "environment", "facing back") count for it; front words exclude it;
 *   - lens words for other lenses ("ultra", "wide angle", "0.5", "macro", "tele", "depth", "infrared") count against;
 *   - iOS "Back Camera" is the 1× lens; its "Dual Wide" / "Triple" virtual cameras may start wide, so they rank below it;
 *   - Android "camera2 0, facing back" is usually the main sensor; higher numbers are usually the extra lenses.
 * Phones name their cameras in the phone's language (an iPhone set to Indonesian says "Kamera Belakang",
 * "Kamera Ultra Lebar Belakang", "Kamera Tiga Belakang"), so the lens words are matched in Indonesian too.
 * When labels cannot tell the rear cameras apart, the camera itself is asked (continuous autofocus, sensor size:
 * `chooseByCapabilities`); when that cannot either, nothing is remembered and the person can switch lenses.
 */
export type CameraInfo = { deviceId: string; label: string };

const FRONT = /\b(front|user|selfie|depan|facing front)\b/i;
const REAR = /\b(back|rear|belakang|environment|facing back|world)\b/i;
const OTHER_LENS = /(ultra[\s-]?wide|ultrawide|wide[\s-]?angle|ultra[\s-]?lebar|sudut[\s-]?lebar|\b0[.,]5\s*x?\b|\bmacro\b|\bmakro\b|\btele(photo|foto)?\b|\bdepth\b|\bkedalaman\b|\binfra ?(red|merah)\b|\bir\b)/i;
const VIRTUAL = /\b(dual|triple|ganda|tiga)\b/i;

/** Higher is more likely the normal rear camera; below zero means "not this one". */
export function cameraScore(camera: CameraInfo, index = 0) {
  const label = camera.label || '';
  if (!label) return 0;
  if (FRONT.test(label) && !REAR.test(label)) return -100;
  let score = REAR.test(label) ? 20 : 5;
  if (OTHER_LENS.test(label)) score -= 30;
  if (VIRTUAL.test(label)) score -= 6;
  if (/^(back camera|kamera belakang)$/i.test(label.trim())) score += 6;
  const number = label.match(/camera\s*2?\s*(\d+)/i)?.[1] ?? label.match(/\b(\d+)\b/)?.[1];
  if (number !== undefined) score -= Math.min(5, Number(number)) * .5;
  return score - index * .01;
}

/** Rear cameras from the most to the least likely main 1× camera (front cameras left out). */
export function rankCameras(cameras: CameraInfo[]) {
  return cameras.map((camera, index) => ({ camera, score: cameraScore(camera, index) })).filter(entry => entry.score > -50).sort((a, b) => b.score - a.score).map(entry => entry.camera);
}

/**
 * The camera to open: the one remembered from a scan that worked (if it is still there and still looks like a rear
 * camera), otherwise the best ranked one. `undefined` = let the browser pick with facingMode (no labels, no choice).
 */
export function chooseCamera(cameras: CameraInfo[], remembered?: string | null): string | undefined {
  const labelled = cameras.filter(camera => camera.label);
  if (!labelled.length) return undefined;
  const ranked = rankCameras(labelled);
  if (remembered) { const again = ranked.find(camera => camera.deviceId === remembered); if (again && cameraScore(again) > 0) return again.deviceId; }
  const best = ranked[0];
  if (!best || cameraScore(best) <= 0) return undefined;
  // Nothing tells the rear cameras apart: the browser's own environment choice is as good as ours.
  if (ranked.length > 1 && cameraScore(ranked[0]) === cameraScore(ranked[1])) return undefined;
  return best.deviceId;
}

/** Continuous autofocus and a normal (not zoomed-out) view, only with what the camera says it supports. */
export function focusConstraints(capabilities: { focusMode?: string[]; zoom?: { min: number; max: number } } | undefined, settings: { zoom?: number } | undefined) {
  const advanced: Record<string, unknown>[] = [];
  if (capabilities?.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  const zoom = capabilities?.zoom;
  if (zoom && typeof settings?.zoom === 'number' && settings.zoom < 1 && zoom.min <= 1 && zoom.max >= 1) advanced.push({ zoom: 1 });
  return advanced;
}
/** Whether a tap can ask the camera to focus on a point (real support only; nothing is faked). */
export const canTapFocus = (capabilities: { focusMode?: string[]; pointsOfInterest?: unknown } | undefined) => Boolean(capabilities?.focusMode?.includes('single-shot') || capabilities?.focusMode?.includes('manual') && capabilities?.pointsOfInterest);

/** Rear cameras the labels rank equally at the top: the ones worth asking for their capabilities. */
export function tiedRearCameras(cameras: CameraInfo[]) {
  const ranked = rankCameras(cameras.filter(camera => camera.label)).filter(camera => cameraScore(camera) > 0);
  if (ranked.length < 2) return [];
  const top = cameraScore(ranked[0]);
  const tied = ranked.filter(camera => cameraScore(camera) === top);
  return tied.length > 1 ? tied.map(camera => camera.deviceId) : [];
}

export type LensCapabilities = { focusMode?: string[]; width?: { max?: number }; height?: { max?: number } };
/** The main camera focuses by itself and has the biggest sensor; ultra-wides are often fixed-focus and smaller. */
export function lensScore(caps: LensCapabilities | undefined) {
  const focus = caps?.focusMode?.includes('continuous') ? 100 : 0;
  const megapixels = (caps?.width?.max || 0) * (caps?.height?.max || 0) / 1e6;
  return focus + Math.min(50, megapixels);
}
/** The clearly best lens by its capabilities, or `undefined` when they look alike (then nothing is guessed). */
export function chooseByCapabilities(list: { deviceId: string; caps: LensCapabilities | undefined }[]) {
  const scored = list.map(entry => ({ id: entry.deviceId, score: lensScore(entry.caps) })).sort((a, b) => b.score - a.score);
  if (!scored.length) return undefined;
  if (scored.length > 1 && scored[0].score - scored[1].score < .5) return undefined;
  return scored[0].id;
}
/** "Ganti lensa": the next rear camera in ranked order, wrapping around. */
export function nextRearCamera(cameras: CameraInfo[], current: string | undefined) {
  const rear = rankCameras(cameras.filter(camera => camera.label)).filter(camera => cameraScore(camera) > 0).map(camera => camera.deviceId);
  if (rear.length < 2) return undefined;
  const at = current ? rear.indexOf(current) : -1;
  return rear[(at + 1) % rear.length];
}
