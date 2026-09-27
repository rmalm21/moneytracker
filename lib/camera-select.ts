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
 * When nothing can be told apart (no labels, one camera) the choice is left to the browser (environment).
 */
export type CameraInfo = { deviceId: string; label: string };

const FRONT = /\b(front|user|selfie|depan|facing front)\b/i;
const REAR = /\b(back|rear|belakang|environment|facing back|world)\b/i;
const OTHER_LENS = /(ultra[\s-]?wide|ultrawide|wide[\s-]?angle|\b0[.,]5\s*x?\b|\bmacro\b|\btele(photo)?\b|\bdepth\b|\binfra ?red\b|\bir\b)/i;
const VIRTUAL = /\b(dual|triple)\b/i;

/** Higher is more likely the normal rear camera; below zero means "not this one". */
export function cameraScore(camera: CameraInfo, index = 0) {
  const label = camera.label || '';
  if (!label) return 0;
  if (FRONT.test(label) && !REAR.test(label)) return -100;
  let score = REAR.test(label) ? 20 : 5;
  if (OTHER_LENS.test(label)) score -= 30;
  if (VIRTUAL.test(label)) score -= 6;
  if (/^back camera$/i.test(label.trim())) score += 6;
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
