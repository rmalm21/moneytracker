/** 9.4 A burst of confetti over the whole screen (canvas, removed when done). Nothing when motion is reduced. */
export function confetti({ count = 140, colors = ['#ff7a1a', '#ffc24b', '#ff4d6d', '#5fb2ff', '#7c4dff', '#2bd38a', '#ffffff'], spread = 1, origin = { x: 0.5, y: 0.45 } } = {}) {
  if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1);
  c.className = 'arena-confetti'; c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const g = c.getContext('2d'); if (!g) { c.remove(); return; }
  g.scale(dpr, dpr);
  const W = innerWidth, H = innerHeight, ox = origin.x * W, oy = origin.y * H;
  const parts = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1 * spread, v = 7 + Math.random() * 9;
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 4 + Math.random() * 5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, color: colors[Math.floor(Math.random() * colors.length)], shape: Math.random() < 0.35 ? 1 : 0, life: 0 };
  });
  const start = performance.now();
  const frame = (t: number) => {
    const age = t - start; g.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.28; p.vx *= 0.985; p.vy *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save(); g.globalAlpha = Math.max(0, 1 - age / 2600); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.color;
      if (p.shape) { g.beginPath(); g.arc(0, 0, p.r * 0.55, 0, Math.PI * 2); g.fill(); } else g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      g.restore();
    }
    if (age < 2700) requestAnimationFrame(frame); else c.remove();
  };
  requestAnimationFrame(frame);
}
