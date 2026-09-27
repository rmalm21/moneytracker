'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { findPaper, greyFromRgba, paperCorners, sharpness, type Quad } from '@/lib/receipt-image';
import { canTapFocus, chooseCamera, focusConstraints } from '@/lib/camera-select';

/** The camera that worked last time (this device only). */
const CAMERA_KEY = 'dompet-ajaib:receipt-camera';

/** Whether this browser can show a live camera. */
export const liveCameraAvailable = () => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

type Hint = { text: string; ok: boolean };
/**
 * A receipt scanner: the live camera with the receipt's outline drawn over it and short guidance ("Dekatkan kamera",
 * "Foto terlalu gelap"…). The shutter always works; auto-capture (optional, off by default) takes the photo when the
 * receipt is fully in view, steady, sharp and bright enough. "Kamera bawaan" opens the phone's own camera instead.
 * It opens the phone's normal 1× rear camera where the browser lets us tell the lenses apart (lib/camera-select.ts),
 * with continuous autofocus when supported, and a tap-to-focus only on cameras that really support it.
 */
export function ReceiptCamera({ onCapture, onFallback, onClose }: { onCapture: (photo: Blob) => void; onFallback: () => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null), [quad, setQuad] = useState<Quad | null>(null), [hint, setHint] = useState<Hint>({ text: 'Arahkan kamera ke struk', ok: false });
  const [error, setError] = useState(''), [auto, setAuto] = useState(false), [busy, setBusy] = useState(false);
  const steady = useRef(0), last = useRef<Quad | null>(null), autoRef = useRef(auto);
  autoRef.current = auto;
  const track = useRef<MediaStreamTrack | null>(null), [tapFocus, setTapFocus] = useState(false), [focusing, setFocusing] = useState<{ x: number; y: number } | null>(null), blurry = useRef(0);
  useEffect(() => {
    let stream: MediaStream | null = null, timer: ReturnType<typeof setInterval> | undefined, alive = true, starting = false;
    const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
    const stop = () => { stream?.getTracks().forEach(t => t.stop()); stream = null; track.current = null; };
    const remembered = () => { try { return localStorage.getItem(CAMERA_KEY); } catch { return null; } };
    const remember = (id: string | undefined) => { try { if (id) localStorage.setItem(CAMERA_KEY, id); else localStorage.removeItem(CAMERA_KEY); } catch { /* optional */ } };
    /** Open the camera once: the remembered or best-ranked main rear camera, else the browser's environment camera. */
    async function open() {
      if (starting) return; starting = true;
      try {
        const saved = remembered();
        try { stream = saved ? await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: saved }, ...size }, audio: false }) : null; }
        catch { remember(undefined); stream = null; }
        if (!stream) stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, ...size }, audio: false });
        if (!alive) { stop(); return; }
        // With permission given, the cameras have labels: switch once if the main rear camera is a different one.
        if (!saved) {
          try {
            const cameras = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').map(d => ({ deviceId: d.deviceId, label: d.label }));
            const best = chooseCamera(cameras), current = stream.getVideoTracks()[0]?.getSettings().deviceId;
            if (best && best !== current) {
              const next = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: best }, ...size }, audio: false }).catch(() => null);
              if (next && alive) { stop(); stream = next; } else next?.getTracks().forEach(t => t.stop());
            }
          } catch { /* the first camera stays */ }
        }
        if (!alive || !stream) { stop(); return; }
        const t = stream.getVideoTracks()[0]; track.current = t || null;
        remember(t?.getSettings().deviceId);
        // Continuous autofocus and a 1× view, only where the camera says it supports them; never fatal.
        try {
          const caps = (t?.getCapabilities?.() || {}) as MediaTrackCapabilities & { focusMode?: string[]; zoom?: { min: number; max: number }; pointsOfInterest?: unknown };
          const advanced = focusConstraints(caps, t?.getSettings() as { zoom?: number });
          if (advanced.length) await t.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => undefined);
          setTapFocus(canTapFocus(caps));
        } catch { setTapFocus(false); }
        const el = video.current; if (!el) return;
        el.srcObject = stream; await el.play().catch(() => undefined);
      } finally { starting = false; }
    }
    // Back in the app after switching away: the camera may have been released; open it again (only then).
    const onVisible = () => { if (document.visibilityState === 'visible' && alive && (!track.current || track.current.readyState === 'ended')) { stop(); void open().catch(() => undefined); } };
    (async () => {
      try {
        await open();
        const el = video.current; if (!el) return;
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
          // Still blurry while held steady for a while: the lens is still focusing.
          blurry.current = paper && moved <= .03 && sharp < .2 ? blurry.current + 1 : 0;
          const h: Hint = mean < 60 ? { text: 'Foto terlalu gelap, tambah cahaya', ok: false }
            : !paper ? { text: 'Struk belum ditemukan', ok: false }
            : cut ? { text: `Bagian ${paper.edges.bottom ? 'bawah' : paper.edges.top ? 'atas' : 'samping'} terpotong`, ok: false }
            : coverage < .15 ? { text: 'Dekatkan kamera', ok: false }
            : corners?.confidence === 'low' ? { text: 'Luruskan sedikit', ok: false }
            : moved > .03 ? { text: 'Jaga kamera tetap stabil', ok: false }
            : blurry.current >= 3 ? { text: tapFocusRef.current ? 'Belum fokus. Ketuk struk untuk fokus' : 'Sedang mencari fokus…', ok: false }
            : { text: 'Struk ditemukan', ok: true };
          setHint(h);
          steady.current = h.ok && sharp > .3 ? steady.current + 1 : 0;
          if (autoRef.current && steady.current >= 4) { steady.current = -100; void shoot(); }
        }, 300);
      } catch (e) { setError((e as Error).name === 'NotAllowedError' ? 'Izin kamera ditolak. Pakai kamera bawaan atau pilih dari galeri.' : 'Kamera belum bisa dibuka di perangkat ini.'); }
    })();
    document.addEventListener('visibilitychange', onVisible);
    return () => { alive = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tapFocusRef = useRef(false); tapFocusRef.current = tapFocus;
  /** A tap asks the camera to focus there (single-shot), then goes back to continuous focus. Only offered when supported. */
  async function focusAt(event: React.PointerEvent<HTMLDivElement>) {
    const t = track.current; if (!t || !tapFocus || focusing) return;
    const rect = event.currentTarget.getBoundingClientRect(), x = (event.clientX - rect.left) / rect.width, y = (event.clientY - rect.top) / rect.height;
    setFocusing({ x, y });
    try {
      await t.applyConstraints({ advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }] } as unknown as MediaTrackConstraints).catch(() => t.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] } as unknown as MediaTrackConstraints));
      setTimeout(() => { void t.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints).catch(() => undefined); setFocusing(null); }, 1500);
    } catch { setFocusing(null); }
  }
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
        <video ref={video} playsInline muted onPointerUp={event => void focusAt(event as unknown as React.PointerEvent<HTMLDivElement>)}/>
        {focusing && <span className="rs-camera-focus" style={{ left: `${focusing.x * 100}%`, top: `${focusing.y * 100}%` }} aria-hidden="true"/>}
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
