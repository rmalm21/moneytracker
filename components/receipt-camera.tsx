'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { findPaper, greyFromRgba, paperCorners, sharpness, type Quad } from '@/lib/receipt-image';

/** Whether this browser can show a live camera. */
export const liveCameraAvailable = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

type Hint = { text: string; ok: boolean };
/**
 * A receipt scanner: the live camera with the receipt's outline drawn over it and short guidance ("Dekatkan kamera",
 * "Foto terlalu gelap"…). The shutter always works; auto-capture (optional, off by default) takes the photo when the
 * receipt is fully in view, steady, sharp and bright enough. "Kamera bawaan" opens the phone's own camera instead.
 */
export function ReceiptCamera({ onCapture, onFallback, onClose }: { onCapture: (photo: Blob) => void; onFallback: () => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null), [quad, setQuad] = useState<Quad | null>(null), [hint, setHint] = useState<Hint>({ text: 'Arahkan kamera ke struk', ok: false });
  const [error, setError] = useState(''), [auto, setAuto] = useState(false), [busy, setBusy] = useState(false);
  const steady = useRef(0), last = useRef<Quad | null>(null), autoRef = useRef(auto);
  autoRef.current = auto;
  useEffect(() => {
    let stream: MediaStream | null = null, timer: ReturnType<typeof setInterval> | undefined, alive = true;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (!alive) { stream.getTracks().forEach(t => t.stop()); return; }
        const el = video.current; if (!el) return;
        el.srcObject = stream; await el.play().catch(() => undefined);
        const small = document.createElement('canvas'), ctx = small.getContext('2d', { willReadFrequently: true });
        timer = setInterval(() => {
          if (!el.videoWidth || !ctx) return;
          const scale = 240 / Math.max(el.videoWidth, el.videoHeight); small.width = Math.round(el.videoWidth * scale); small.height = Math.round(el.videoHeight * scale);
          ctx.drawImage(el, 0, 0, small.width, small.height);
          const grey = greyFromRgba(ctx.getImageData(0, 0, small.width, small.height).data, small.width, small.height);
          const paper = findPaper(grey), corners = paper ? paperCorners(paper, small.width, small.height) : null;
          let mean = 0; for (const v of grey.data) mean += v; mean /= grey.data.length;
          const next: Quad | null = corners ? corners.quad.map(p => ({ x: p.x / small.width, y: p.y / small.height })) as Quad : null;
          setQuad(next);
          const coverage = paper ? paper.area / (small.width * small.height) : 0, cut = paper && (paper.edges.top || paper.edges.bottom || paper.edges.left || paper.edges.right);
          const moved = next && last.current ? Math.max(...next.map((p, i) => Math.hypot(p.x - last.current![i].x, p.y - last.current![i].y))) : 1;
          last.current = next;
          const sharp = paper ? sharpness(grey) : 0;
          const h: Hint = mean < 60 ? { text: 'Foto terlalu gelap, tambah cahaya', ok: false }
            : !paper ? { text: 'Struk belum ditemukan', ok: false }
            : cut ? { text: `Bagian ${paper.edges.bottom ? 'bawah' : paper.edges.top ? 'atas' : 'samping'} terpotong`, ok: false }
            : coverage < .15 ? { text: 'Dekatkan kamera', ok: false }
            : corners?.confidence === 'low' ? { text: 'Luruskan sedikit', ok: false }
            : moved > .03 ? { text: 'Tahan sebentar…', ok: false }
            : { text: 'Struk ditemukan', ok: true };
          setHint(h);
          steady.current = h.ok && sharp > .3 ? steady.current + 1 : 0;
          if (autoRef.current && steady.current >= 4) { steady.current = -100; void shoot(); }
        }, 300);
      } catch (e) { setError((e as Error).name === 'NotAllowedError' ? 'Izin kamera ditolak. Pakai kamera bawaan atau pilih dari galeri.' : 'Kamera belum bisa dibuka di perangkat ini.'); }
    })();
    return () => { alive = false; clearInterval(timer); stream?.getTracks().forEach(t => t.stop()); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function shoot() {
    const el = video.current; if (!el?.videoWidth || busy) return;
    setBusy(true);
    const canvas = document.createElement('canvas'); canvas.width = el.videoWidth; canvas.height = el.videoHeight;
    canvas.getContext('2d')?.drawImage(el, 0, 0);
    canvas.toBlob(blob => { canvas.width = 1; canvas.height = 1; setBusy(false); if (blob) onCapture(blob); }, 'image/jpeg', .92);
  }
  return <div className="rs-camera">
    {error ? <div className="rs-camera-error"><p>{error}</p><button type="button" className="rs-pick-button is-main" onClick={onFallback}><Camera size={20}/> Kamera bawaan</button></div> : <>
      <div className="rs-camera-view">
        <video ref={video} playsInline muted/>
        {quad && <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon className={hint.ok ? 'is-ok' : ''} points={quad.map(p => `${p.x * 100},${p.y * 100}`).join(' ')}/></svg>}
        <span className={`rs-camera-hint ${hint.ok ? 'is-ok' : ''}`} role="status" aria-live="polite">{hint.text}</span>
      </div>
      <div className="rs-camera-bar">
        <label className="rs-camera-auto"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)}/> Foto otomatis</label>
        <button type="button" className="rs-shutter" aria-label="Ambil foto" disabled={busy} onClick={() => void shoot()}><span/></button>
        <button type="button" className="link-button" onClick={onFallback}>Kamera bawaan</button>
      </div>
    </>}
    <button type="button" className="rs-camera-close" aria-label="Tutup kamera" onClick={onClose}><X size={20}/></button>
  </div>;
}
