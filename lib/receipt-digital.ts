/**
 * A screenshot (an order screen, an e-receipt) or a camera photo of paper? A screenshot is drawn by a phone, so large
 * parts of it are perfectly flat (the same pixel value over a whole block); a camera photo always has sensor noise.
 * A screenshot is read as it is: no paper search, no perspective, no evening-out of light.
 */
export function flatShare(grey: ArrayLike<number>, width: number, height: number, block = 8) {
  let flat = 0, total = 0;
  for (let y = 0; y + block <= height; y += block) for (let x = 0; x + block <= width; x += block) {
    let min = 255, max = 0;
    for (let dy = 0; dy < block; dy++) { const row = (y + dy) * width + x; for (let dx = 0; dx < block; dx++) { const v = grey[row + dx]; if (v < min) min = v; if (v > max) max = v; } }
    total++; if (max - min <= 1) flat++;
  }
  return total ? flat / total : 0;
}
/**
 * A phone screenshot: the tall shape of a phone screen (≥ 1.7 : 1) and a good part perfectly flat. Measured on the
 * screenshots received so far: 29–52 % flat blocks after JPEG; camera photos of paper have sensor noise (near 0 %).
 * Shape matters too: rendered test receipts (4:3) are flat but are not screenshots.
 */
export function looksLikeScreenshot(grey: ArrayLike<number>, width: number, height: number) {
  const tall = Math.max(width, height) / Math.max(1, Math.min(width, height));
  return tall >= 1.7 && flatShare(grey, width, height) >= .2;
}
