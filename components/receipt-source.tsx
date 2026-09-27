'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, Maximize2, Minimize2, RotateCcw, RotateCw, ScanText } from 'lucide-react';
import { Button } from './ui/button';
import { homography, mapPoint, quadSize, type Matrix, type Point, type Quad } from '@/lib/receipt-image';
import type { Box } from '@/lib/receipt-rows';

/** A small upright copy of the original photo (the photo itself is never changed). */
export type Upright = { url: string; width: number; height: number };
type Mapping = { toPhoto: Matrix; photoWidth: number; photoHeight: number };

/** A box in the straightened working image → its four corners, 0..1 of the original photo. */
export function boxOnPhoto(box: Box, mapping: Mapping): Point[] {
  return [[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]].map(([x, y]) => { const p = mapPoint(mapping.toPhoto, x, y); return { x: p.x / mapping.photoWidth, y: p.y / mapping.photoHeight }; });
}

/**
 * Where a value was read: the original photo, zoomed on that part, with the words outlined. "Seluruh struk" shows the
 * whole photo with the outline.
 */
export function ReceiptSource({ upright, mapping, box, label }: { upright: Upright; mapping: Mapping; box: Box | null; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null), [whole, setWhole] = useState(!box), [failed, setFailed] = useState(false);
  useEffect(() => {
    const image = new Image(); let alive = true;
    image.onload = () => {
      const el = canvas.current; if (!alive || !el) return;
      const W = image.naturalWidth, H = image.naturalHeight;
      // A margin around the words, so the outline does not cover them.
      const padded = box && { x: box.x - box.height * .45, y: box.y - box.height * .4, width: box.width + box.height * .9, height: box.height * 1.8 };
      const poly = padded ? boxOnPhoto(padded, mapping).map(p => ({ x: p.x * W, y: p.y * H })) : [];
      let sx = 0, sy = 0, sw = W, sh = H;
      if (!whole && poly.length) {
        const xs = poly.map(p => p.x), ys = poly.map(p => p.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const lineH = Math.max(8, y1 - y0), padX = Math.max((x1 - x0) * .35, lineH * 4), padY = lineH * 3;
        sx = Math.max(0, x0 - padX); sy = Math.max(0, y0 - padY); sw = Math.min(W - sx, x1 - x0 + padX * 2); sh = Math.min(H - sy, y1 - y0 + padY * 2);
      }
      const cssWidth = el.parentElement?.clientWidth || 320, ratio = window.devicePixelRatio || 1, cssHeight = Math.min(whole ? 520 : 260, cssWidth * sh / sw);
      const scale = Math.min(cssWidth / sw, cssHeight / sh);
      el.width = Math.round(sw * scale * ratio); el.height = Math.round(sh * scale * ratio); el.style.width = `${Math.round(sw * scale)}px`; el.style.height = `${Math.round(sh * scale)}px`;
      const ctx = el.getContext('2d'); if (!ctx) return;
      ctx.setTransform(scale * ratio, 0, 0, scale * ratio, -sx * scale * ratio, -sy * scale * ratio);
      ctx.drawImage(image, 0, 0);
      if (poly.length) {
        ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.rect(sx, sy, sw, sh); poly.slice().reverse().forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.fill('evenodd');
        ctx.strokeStyle = '#f5a524'; ctx.lineWidth = Math.max(2, 3 / scale); ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); ctx.stroke();
      }
    };
    image.onerror = () => setFailed(true);
    image.src = upright.url;
    return () => { alive = false; };
  }, [upright.url, box, mapping, whole]);
  if (failed) return <p className="muted">Foto belum bisa ditampilkan.</p>;
  return <div className="rs-source">
    <div className="rs-source-canvas"><canvas ref={canvas} role="img" aria-label={`Bagian struk: ${label}`}/></div>
    {!box && <small className="muted">Letak bagian ini di foto belum diketahui.</small>}
    {box && <button type="button" className="link-button" onClick={() => setWhole(v => !v)}>{whole ? <><Minimize2 size={15}/> Perbesar bagian ini</> : <><Maximize2 size={15}/> Seluruh struk</>}</button>}
  </div>;
}

/**
 * Setting the receipt's four corners by hand, like a document scanner: a clean outline over the photo with the
 * outside dimmed, four large corner handles and four edge handles (an edge moves both its corners), a loupe while
 * dragging, snapping back to the detected corner when close, and a straightened preview of the result.
 * "Ulangi" returns to the detected outline; "Gunakan" reads the receipt again with these corners.
 */
const SNAP = .025;
/**
 * Marking the receipt on the photo. In the dialog (after a read) it only straightens; as the first step after a photo
 * (`onRetake`) it decides what is read at all, with a turn and a retake beside it.
 */
export function ReceiptCorners({ upright, corners, onApply, onCancel: _onCancel, applyLabel = 'Gunakan', onRetake, onRotate, fitVh = 58 }: { upright: Upright; corners: Quad; onApply: (corners: Quad, changed: boolean) => void; onCancel: () => void; applyLabel?: string; onRetake?: () => void; onRotate?: () => void; /** Tallest the photo may be, in % of the screen height. */ fitVh?: number }) {
  const [points, setPoints] = useState<Quad>(corners), frame = useRef<HTMLDivElement>(null), drag = useRef<{ kind: 'corner' | 'edge'; index: number; from: Point; start: Quad } | null>(null);
  const [active, setActive] = useState<{ x: number; y: number } | null>(null), preview = useRef<HTMLCanvasElement>(null), source = useRef<ImageData | null>(null);
  const initial = useRef(corners);
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  const at = (event: React.PointerEvent) => { const rect = frame.current!.getBoundingClientRect(); return { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) }; };
  function move(event: React.PointerEvent) {
    const d = drag.current; if (!d || !frame.current) return;
    const p = at(event);
    if (d.kind === 'corner') {
      // Close to where the outline was found: snap back onto it.
      const found = initial.current[d.index], snapped = Math.hypot(p.x - found.x, p.y - found.y) < SNAP ? found : p;
      setPoints(current => current.map((q, i) => i === d.index ? snapped : q) as Quad); setActive(snapped);
    } else {
      const dx = p.x - d.from.x, dy = p.y - d.from.y, a = d.index, b = (d.index + 1) % 4;
      setPoints(d.start.map((q, i) => i === a || i === b ? { x: clamp(q.x + dx), y: clamp(q.y + dy) } : q) as Quad);
      setActive(p);
    }
  }
  function end() { drag.current = null; setActive(null); }
  const names = ['kiri atas', 'kanan atas', 'kanan bawah', 'kiri bawah'], edges = ['atas', 'kanan', 'bawah', 'kiri'];
  function nudge(index: number, dx: number, dy: number) { setPoints(current => current.map((p, i) => i === index ? { x: clamp(p.x + dx), y: clamp(p.y + dy) } : p) as Quad); }
  const mid = (i: number) => ({ x: (points[i].x + points[(i + 1) % 4].x) / 2, y: (points[i].y + points[(i + 1) % 4].y) / 2 });

  // The photo's pixels once, for the loupe and the straightened preview.
  useEffect(() => {
    const image = new Image(); let alive = true;
    image.onload = () => { if (!alive) return; const scale = Math.min(1, 900 / Math.max(image.naturalWidth, image.naturalHeight)); const c = document.createElement('canvas'); c.width = Math.round(image.naturalWidth * scale); c.height = Math.round(image.naturalHeight * scale); const ctx = c.getContext('2d'); if (!ctx) return; ctx.drawImage(image, 0, 0, c.width, c.height); source.current = ctx.getImageData(0, 0, c.width, c.height); drawPreview(); };
    image.src = upright.url; return () => { alive = false; };
  }, [upright.url]); // eslint-disable-line react-hooks/exhaustive-deps
  // The straightened result, redrawn when a drag ends (cheap: a small image).
  function drawPreview() {
    const el = preview.current, img = source.current; if (!el || !img) return;
    const W = img.width, H = img.height, q = points.map(p => ({ x: p.x * W, y: p.y * H })) as Quad;
    const size = quadSize(q), outH = 150, outW = Math.max(40, Math.min(150, Math.round(outH * size.width / Math.max(1, size.height))));
    const m = homography([{ x: 0, y: 0 }, { x: outW, y: 0 }, { x: outW, y: outH }, { x: 0, y: outH }], q); if (!m) return;
    el.width = outW; el.height = outH; const ctx = el.getContext('2d'); if (!ctx) return;
    const out = ctx.createImageData(outW, outH);
    for (let y = 0; y < outH; y++) for (let x = 0; x < outW; x++) {
      const s = mapPoint(m, x + .5, y + .5), sx = Math.min(W - 1, Math.max(0, Math.round(s.x))), sy = Math.min(H - 1, Math.max(0, Math.round(s.y))), from = (sy * W + sx) * 4, to = (y * outW + x) * 4;
      out.data[to] = img.data[from]; out.data[to + 1] = img.data[from + 1]; out.data[to + 2] = img.data[from + 2]; out.data[to + 3] = 255;
    }
    ctx.putImageData(out, 0, 0);
  }
  useEffect(() => { if (!drag.current) drawPreview(); }, [points]); // eslint-disable-line react-hooks/exhaustive-deps

  const ratio = upright.width / upright.height;
  const path = `M0 0H100V100H0Z M${points.map(p => `${p.x * 100} ${p.y * 100}`).join(' L')}Z`;
  const changed = points.some((p, i) => Math.abs(p.x - initial.current[i].x) > .001 || Math.abs(p.y - initial.current[i].y) > .001);
  return <div className="rs-corners">
    <div className="rs-corners-stage">
      <div className="rs-corners-frame" ref={frame} style={{ aspectRatio: `${upright.width} / ${upright.height}`, width: `min(100%, calc(${fitVh}vh * ${ratio.toFixed(4)}))` }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <img src={upright.url} alt="Foto struk asli" draggable={false}/>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={path} fillRule="evenodd" className="rs-corners-dim"/><polygon points={points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}/></svg>
        {[0, 1, 2, 3].map(i => { const p = mid(i); return <button type="button" key={`e${i}`} className="rs-edge" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-label={`Geser sisi ${edges[i]}`}
          onPointerDown={event => { drag.current = { kind: 'edge', index: i, from: at(event), start: points }; (event.target as HTMLElement).setPointerCapture?.(event.pointerId); event.preventDefault(); }}/>; })}
        {points.map((p, i) => <button type="button" key={i} className="rs-corner" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-label={`Sudut ${names[i]}`}
          onPointerDown={event => { drag.current = { kind: 'corner', index: i, from: p, start: points }; setActive(p); (event.target as HTMLElement).setPointerCapture?.(event.pointerId); event.preventDefault(); }}
          onKeyDown={event => { const step = event.shiftKey ? .02 : .005; if (event.key === 'ArrowLeft') nudge(i, -step, 0); else if (event.key === 'ArrowRight') nudge(i, step, 0); else if (event.key === 'ArrowUp') nudge(i, 0, -step); else if (event.key === 'ArrowDown') nudge(i, 0, step); else return; event.preventDefault(); }}/>)}
        {active && <span className={`rs-loupe ${active.x < .5 ? 'is-right' : 'is-left'}`} aria-hidden="true" style={(() => { const r = frame.current?.getBoundingClientRect(), w = (r?.width || 300) * 2.5, h = (r?.height || 400) * 2.5; return { backgroundImage: `url(${upright.url})`, backgroundSize: `${w}px ${h}px`, backgroundPosition: `${48 - active.x * w}px ${48 - active.y * h}px` }; })()}><i/></span>}
      </div>
      <canvas ref={preview} className="rs-corners-preview" aria-label="Pratinjau struk yang diluruskan" role="img"/>
    </div>
    {onRetake ? <>
      <div className="rs-area-tools">
        <small className="muted">Geser titik atau sisi ke tepi struk.</small>
        {onRotate && <button type="button" className="rs-area-tool" onClick={onRotate}><RotateCw size={15}/> Putar</button>}
        <button type="button" className="rs-area-tool" disabled={!changed} onClick={() => setPoints(initial.current)}><RotateCcw size={15}/> Ulangi</button>
      </div>
      <div className="rs-corners-actions">
        <Button type="button" variant="secondary" onClick={onRetake}><Camera size={16}/> Ambil ulang</Button>
        <Button type="button" onClick={() => onApply(points, changed)}><ScanText size={16}/> {applyLabel}</Button>
      </div>
    </> : <>
      <small className="muted rs-corners-hint">Geser titik atau sisi ke tepi struk.</small>
      <div className="rs-corners-actions">
        <Button type="button" variant="secondary" disabled={!changed} onClick={() => setPoints(initial.current)}><RotateCcw size={15}/> Ulangi</Button>
        <Button type="button" onClick={() => onApply(points, changed)}><ScanText size={16}/> {applyLabel}</Button>
      </div>
    </>}
  </div>;
}
