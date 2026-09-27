'use client';
import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, ScanText } from 'lucide-react';
import { Button } from './ui/button';
import { mapPoint, type Matrix, type Point, type Quad } from '@/lib/receipt-image';
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
 * Setting the receipt's four corners by hand, on the original photo: drag the dots to the paper's corners, then read
 * again. Enough when the outline was not found; no need to take the photo again.
 */
export function ReceiptCorners({ upright, corners, onApply, onCancel }: { upright: Upright; corners: Quad; onApply: (corners: Quad) => void; onCancel: () => void }) {
  const [points, setPoints] = useState<Quad>(corners), frame = useRef<HTMLDivElement>(null), drag = useRef<number | null>(null);
  const initial = useRef(corners);
  function move(event: React.PointerEvent) {
    const index = drag.current, rect = frame.current?.getBoundingClientRect(); if (index === null || !rect) return;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    setPoints(current => current.map((p, i) => i === index ? { x, y } : p) as Quad);
  }
  const names = ['kiri atas', 'kanan atas', 'kanan bawah', 'kiri bawah'];
  function nudge(index: number, dx: number, dy: number) { setPoints(current => current.map((p, i) => i === index ? { x: Math.max(0, Math.min(1, p.x + dx)), y: Math.max(0, Math.min(1, p.y + dy)) } : p) as Quad); }
  return <div className="rs-corners">
    <p className="muted">Geser keempat titik ke sudut struk, lalu baca ulang.</p>
    <div className="rs-corners-frame" ref={frame} style={{ aspectRatio: `${upright.width} / ${upright.height}` }} onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <img src={upright.url} alt="Foto struk asli" draggable={false}/>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={points.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}/></svg>
      {points.map((p, i) => <button type="button" key={i} className="rs-corner" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} aria-label={`Sudut ${names[i]}`}
        onPointerDown={event => { drag.current = i; (event.target as HTMLElement).setPointerCapture?.(event.pointerId); event.preventDefault(); }}
        onKeyDown={event => { const step = event.shiftKey ? .02 : .005; if (event.key === 'ArrowLeft') nudge(i, -step, 0); else if (event.key === 'ArrowRight') nudge(i, step, 0); else if (event.key === 'ArrowUp') nudge(i, 0, -step); else if (event.key === 'ArrowDown') nudge(i, 0, step); else return; event.preventDefault(); }}/>)}
    </div>
    <div className="rs-corners-actions">
      <button type="button" className="link-button" onClick={() => setPoints(initial.current)}><RotateCcw size={15}/> Kembalikan</button>
      <Button type="button" variant="secondary" onClick={onCancel}>Batal</Button>
      <Button type="button" onClick={() => onApply(points)}><ScanText size={16}/> Baca ulang</Button>
    </div>
  </div>;
}
