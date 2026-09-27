/**
 * Rebuilding receipt rows from OCR words and their positions. A phone photo is rarely straight and a receipt has a
 * price column far to the right, so the OCR's own lines often split a row in two (the name, then its price) or join
 * two rows. Words are grouped by height instead, with the tilt taken out, and read left to right. Pure, no browser.
 */
export type OcrWord = { text: string; x0: number; y0: number; x1: number; y1: number; confidence?: number };

const median = (values: number[]) => { if (!values.length) return 0; const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };

/** The tilt of the text (rise per pixel), from the OCR lines' baselines. */
export function slopeOf(baselines: { x0: number; y0: number; x1: number; y1: number }[]) {
  return median(baselines.filter(b => b.x1 - b.x0 > 80).map(b => (b.y1 - b.y0) / (b.x1 - b.x0)).filter(s => Math.abs(s) < .3));
}

/** Words → text lines, top to bottom; a wide gap between words becomes three spaces (a column break). */
export function rowsFromWords(words: OcrWord[], slope = 0) {
  const list = words.filter(w => w.text.trim() && w.x1 > w.x0 && w.y1 > w.y0 && !(w.confidence !== undefined && w.confidence < 25 && w.text.trim().length <= 2 && !/\d/.test(w.text)));
  if (!list.length) return '';
  const height = median(list.map(w => w.y1 - w.y0)) || 10;
  const charWidth = median(list.map(w => (w.x1 - w.x0) / Math.max(1, w.text.trim().length))) || height / 2;
  const placed = list.map(w => ({ w, y: (w.y0 + w.y1) / 2 - slope * (w.x0 + w.x1) / 2 })).sort((a, b) => a.y - b.y);
  const rows: { y: number; n: number; words: OcrWord[] }[] = [];
  for (const item of placed) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(item.y - row.y) < height * .55) { row.words.push(item.w); row.y = (row.y * row.n + item.y) / (row.n + 1); row.n++; }
    else rows.push({ y: item.y, n: 1, words: [item.w] });
  }
  return rows.map(row => {
    const sorted = row.words.sort((a, b) => a.x0 - b.x0);
    let text = '';
    sorted.forEach((w, i) => { if (i) text += w.x0 - sorted[i - 1].x1 > charWidth * 2.2 ? '   ' : ' '; text += w.text.trim(); });
    return text;
  }).join('\n');
}
