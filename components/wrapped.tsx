'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Share2, X } from 'lucide-react';
import { useApp } from './app-provider';
import { usePeriodTransactions } from './period-selector';
import { Select } from './fields';
import { buildWrapped, defaultPeriod, periodChoices, periodOf, previousOf, type Wrapped } from '@/lib/wrapped';
import { formatDate } from '@/lib/period';
import { featureUsed } from './feature-tips-events';
import { Emoji } from './emoji';
import { play, playRekap } from '@/lib/game-sound';
import { confetti } from './game/confetti';

/**
 * 8.5 Rekap: a month or a year told in a few slides (swipe or tap the sides), with "Sembunyikan nominal" (shares and
 * counts stay, amounts become Rp•••) and "Bagikan", which draws one picture on this device and hands it to the phone's
 * share sheet (or saves it). Nothing is uploaded.
 */
const rp = (n: number) => `Rp${Math.round(Math.abs(n)).toLocaleString('id-ID')}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const HIDDEN = 'Rp•••';
/** 9.6 A picture for each slide. */
const EMBLEM: Record<string, string> = { cover: '✨', empty: '📝', flow: '💰', top: '🏆', place: '🏪', day: '💸', habit: '📝', end: '🎉' };

/** 9.6 What is left, in plain words: "Sisa", or "Tekor" when more went out than came in (no idiom, no odd percent). */
function balanceRow(w: Wrapped, hide: boolean) {
  if (!w.income) return { label: 'Pemasukan', value: 'belum dicatat' };
  if (w.saved >= 0) return { label: 'Sisa', value: hide ? `${pct(w.savedRate)} dari masuk` : rp(w.saved) };
  return { label: 'Tekor', value: hide ? HIDDEN : `−${rp(w.saved)}` };
}

type Slide = { key: string; kicker: string; big: string; line?: string; rows?: { label: string; value: string; share?: number }[]; tone?: 'good' | 'warn' };

function slidesOf(w: Wrapped, hide: boolean, name: string): Slide[] {
  const money = (n: number) => hide ? HIDDEN : rp(n), p = w.period, month = p.kind === 'month';
  const out: Slide[] = [{ key: 'cover', kicker: month ? 'Rekap bulanan' : 'Rekap tahunan', big: p.label, line: `${name ? `${name}, ` : ''}ini cerita uangmu ${month ? 'bulan ini' : 'setahun ini'}. Geser untuk mulai →` }];
  if (!w.count) return [...out, { key: 'empty', kicker: 'Belum ada catatan', big: 'Masih kosong', line: `Belum ada transaksi di ${p.label}. Catat dulu, nanti rekapnya muncul di sini.` }];
  out.push({ key: 'flow', kicker: 'Masuk dan keluar', big: money(w.expense), line: `keluar ${month ? 'bulan ini' : 'tahun ini'}${w.income ? (w.saved < 0 ? `, lebih besar dari ${money(w.income)} yang masuk` : `, dari ${money(w.income)} yang masuk`) : ''}.`,
    rows: w.income ? [{ label: 'Masuk', value: money(w.income) }, { label: 'Keluar', value: money(w.expense) }, balanceRow(w, hide)] : [{ label: 'Keluar', value: money(w.expense) }, balanceRow(w, hide)], tone: !w.income ? undefined : w.saved >= 0 ? 'good' : 'warn' });
  if (w.top.length) out.push({ key: 'top', kicker: 'Paling banyak ke', big: w.top[0].name, line: `${pct(w.top[0].share)} dari semua pengeluaranmu.`, rows: w.top.map(t => ({ label: t.name, value: hide ? pct(t.share) : rp(t.amount), share: t.share })) });
  if (w.place) out.push({ key: 'place', kicker: 'Tempat favoritmu', big: w.place.name, line: `${w.place.count} kali ke sini, total ${money(w.place.amount)}.` });
  if (w.biggestDay) out.push({ key: 'day', kicker: 'Hari paling boros', big: formatDate(w.biggestDay.date), line: `${money(w.biggestDay.amount)} dalam ${w.biggestDay.count} transaksi.${w.biggest ? ` Yang terbesar: ${w.biggest.name} (${money(w.biggest.amount)}).` : ''}`,
    ...(w.weekday ? { rows: [{ label: 'Hari paling banyak keluar', value: w.weekday.name }] } : {}) });
  out.push({ key: 'habit', kicker: 'Rajin mencatat', big: `${w.longestStreak} hari`, line: `berturut-turut paling lama. Total ${w.count} catatan di ${w.recordedDays} dari ${w.days} hari.`,
    rows: [{ label: 'Rata-rata keluar per hari', value: money(w.perDay) }] });
  if (w.change !== null) out.push({ key: 'change', kicker: `Dibanding ${previousOf(p).label}`, big: `${w.change > 0 ? '+' : '−'}${pct(Math.abs(w.change))}`, line: w.change > .05 ? 'pengeluaranmu naik. Cek lagi bagian yang paling besar, ya.' : w.change < -.05 ? 'pengeluaranmu turun. Mantap, pertahankan!' : 'pengeluaranmu hampir sama. Stabil!', tone: w.change > .05 ? 'warn' : 'good' });
  out.push({ key: 'end', kicker: 'Sampai jumpa', big: month ? 'Bulan depan lagi!' : 'Tahun depan lagi!', line: 'Simpan atau bagikan rekapmu dalam satu gambar yang keren.' });
  return out;
}

/**
 * 9.3.1 The app's own fonts for the picture: the ones picked in Tampilan (DM Sans and Manrope unless changed), read from
 * the page and loaded first. A canvas does not wait for web fonts: drawing before they are in fell back to the phone's
 * plain font (Arial-like on many Androids). Offline or slow, it gives up after a moment and draws with what there is.
 */
function appFonts() {
  const css = getComputedStyle(document.documentElement);
  const body = css.getPropertyValue('--font-body').trim() || getComputedStyle(document.body).fontFamily || 'sans-serif';
  const head = css.getPropertyValue('--font-head').trim() || body;
  const first = (list: string) => list.split(',')[0].trim();
  const fonts = document.fonts as FontFaceSet | undefined;
  const loads = fonts ? [...[600, 700].map(w => `${w} 40px ${first(body)}`), ...[700, 800].map(w => `${w} 40px ${first(head)}`)].map(f => fonts.load(f, 'Rp1.234 Rekap•…').catch(() => [])) : [];
  const ready = Promise.race([Promise.all(loads), new Promise(done => window.setTimeout(done, 2500))]);
  return { body, head, ready };
}

/**
 * 9.6 The picture of the recap: a story-size card (1080×1920) in midnight and gold, drawn on this device in the app's
 * fonts. Only the "Dompet Ajaib" mark at the bottom; amounts follow "Sembunyikan nominal".
 */
async function drawPicture(w: Wrapped, hide: boolean): Promise<Blob> {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, money = (n: number) => hide ? HIDDEN : rp(n), month = w.period.kind === 'month';
  const fonts = appFonts(); await fonts.ready;
  const type = (size: number, weight = 700, spacing = 0) => {
    const head = weight >= 700;
    g.font = `${weight} ${size}px ${head ? fonts.head : fonts.body}`;
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing || (head && size >= 60 ? -0.02 * size : 0)}px`;
  };
  const fit = (text: string, max: number, size: number, weight = 800) => { let s = size; type(s, weight); while (g.measureText(text).width > max && s > 24) { s -= 2; type(s, weight); } return s; };
  const clip = (text: string, max: number) => { if (g.measureText(text).width <= max) return text; let t = text; while (t.length > 1 && g.measureText(`${t}…`).width > max) t = t.slice(0, -1); return `${t}…`; };
  const gold = (x0: number, y0: number, x1: number, y1: number) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, '#fff7d6'); gr.addColorStop(.35, '#f6d26b'); gr.addColorStop(.6, '#c9971f'); gr.addColorStop(1, '#ffe9a8'); return gr; };
  const round = (x: number, y: number, ww: number, hh: number, r: number) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); };
  const center = (text: string, y: number) => { const tw = g.measureText(text).width; g.fillText(text, (W - tw) / 2, y); };
  // Midnight with a gold glow, soft rays and gold dust.
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#0b0718'); bg.addColorStop(.45, '#1b1140'); bg.addColorStop(1, '#2b1650');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const glow = g.createRadialGradient(W / 2, 330, 20, W / 2, 330, 760); glow.addColorStop(0, 'rgba(255,200,90,.38)'); glow.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, 330); g.globalAlpha = .07; g.fillStyle = '#ffd56b';
  for (let i = 0; i < 18; i++) { g.rotate(Math.PI / 9); g.beginPath(); g.moveTo(0, 0); g.lineTo(-60, -1400); g.lineTo(60, -1400); g.closePath(); g.fill(); }
  g.restore();
  let seed = 7; const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 140; i++) { g.globalAlpha = .15 + rand() * .55; g.fillStyle = rand() > .3 ? '#ffe39a' : '#ffffff'; g.beginPath(); g.arc(rand() * W, rand() * H, .8 + rand() * 2.6, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  // A thin gold frame with corner ornaments.
  g.strokeStyle = gold(0, 0, W, H); g.lineWidth = 3; round(40, 40, W - 80, H - 80, 44); g.stroke();
  g.globalAlpha = .35; g.lineWidth = 1.5; round(58, 58, W - 116, H - 116, 34); g.stroke(); g.globalAlpha = 1;
  for (const [x, y] of [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]]) { g.fillStyle = gold(x - 14, y - 14, x + 14, y + 14); g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-11, -11, 22, 22); g.restore(); }
  // Title.
  type(34, 600, 10); g.fillStyle = '#f6d26b';
  const kicker = month ? 'REKAP BULANAN' : 'REKAP TAHUNAN', kw = g.measureText(kicker).width;
  center(kicker, 190);
  g.strokeStyle = 'rgba(246,210,107,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(W / 2 - kw / 2 - 110, 178); g.lineTo(W / 2 - kw / 2 - 30, 178); g.moveTo(W / 2 + kw / 2 + 30, 178); g.lineTo(W / 2 + kw / 2 + 110, 178); g.stroke();
  fit(w.period.label, W - 220, 128, 800); g.fillStyle = gold(0, 220, 0, 360); center(w.period.label, 340);
  // The big number: what went out.
  const card = (y: number, h: number) => { const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, 'rgba(255,255,255,.11)'); gr.addColorStop(1, 'rgba(255,255,255,.04)'); g.fillStyle = gr; round(96, y, W - 192, h, 40); g.fill(); g.strokeStyle = 'rgba(246,210,107,.35)'; g.lineWidth = 2; g.stroke(); };
  card(420, 430);
  type(32, 600, 4); g.fillStyle = 'rgba(255,255,255,.72)'; center('TOTAL KELUAR', 500);
  fit(money(w.expense), W - 300, 136, 800); g.fillStyle = gold(0, 520, 0, 660); center(money(w.expense), 650);
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; g.beginPath(); g.moveTo(150, 710); g.lineTo(W - 150, 710); g.stroke();
  if (!w.income) { type(34, 600); g.fillStyle = 'rgba(255,255,255,.72)'; center(`Belum ada pemasukan tercatat ${month ? 'bulan' : 'tahun'} ini`, 795); }
  else {
    const bal = balanceRow(w, hide);
    g.beginPath(); g.moveTo(W / 2, 735); g.lineTo(W / 2, 820); g.stroke();
    type(28, 600, 2); g.fillStyle = 'rgba(255,255,255,.65)'; g.fillText('Masuk', 170, 770); g.fillText(bal.label, W / 2 + 50, 770);
    type(46, 800); g.fillStyle = '#ffffff'; g.fillText(clip(money(w.income), W / 2 - 230), 170, 825);
    g.fillStyle = w.saved >= 0 ? '#7dffc0' : '#ffb3a8'; g.fillText(clip(bal.value, W / 2 - 200), W / 2 + 50, 825);
  }
  // Where it went (as tall as it needs).
  const rows = Math.max(1, Math.min(3, w.top.length)), topH = 125 + rows * 105;
  card(890, topH);
  type(36, 800); g.fillStyle = '#f6d26b'; g.fillText('Paling banyak ke', 150, 965);
  if (!w.top.length) { type(32, 600); g.fillStyle = 'rgba(255,255,255,.7)'; g.fillText('Belum ada pengeluaran', 150, 1040); }
  w.top.slice(0, 3).forEach((t, i) => {
    const y = 1045 + i * 105;
    type(36, 700); g.fillStyle = '#fff'; const label = clip(`${i + 1}. ${t.name}`, 560); g.fillText(label, 150, y);
    type(32, 600); const v = hide ? pct(t.share) : rp(t.amount), tw = g.measureText(v).width; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(v, W - 150 - tw, y);
    g.fillStyle = 'rgba(255,255,255,.12)'; round(150, y + 22, W - 300, 14, 7); g.fill();
    g.fillStyle = gold(150, 0, W - 150, 0); round(150, y + 22, Math.max(14, (W - 300) * t.share), 14, 7); g.fill();
  });
  // Four small figures.
  const tilesY = 890 + topH + 44;
  const tiles: [string, string][] = [
    ['Rajin mencatat', `${w.longestStreak} hari`],
    ['Total catatan', `${w.count}`],
    [w.place ? 'Tempat favorit' : 'Rata-rata/hari', w.place ? w.place.name : money(w.perDay)],
    [w.biggestDay ? 'Hari paling boros' : 'Hari tercatat', w.biggestDay ? new Date(`${w.biggestDay.date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : `${w.recordedDays} hari`],
  ];
  tiles.forEach(([label, value], i) => {
    const x = 96 + (i % 2) * ((W - 192) / 2 + 12), y = tilesY + Math.floor(i / 2) * 170, tw = (W - 192) / 2 - 12;
    g.fillStyle = 'rgba(255,255,255,.07)'; round(x, y, tw, 150, 32); g.fill(); g.strokeStyle = 'rgba(246,210,107,.22)'; g.lineWidth = 2; g.stroke();
    type(26, 600, 1); g.fillStyle = 'rgba(255,255,255,.62)'; g.fillText(label, x + 34, y + 54);
    type(44, 800); g.fillStyle = '#fff'; g.fillText(clip(value, tw - 68), x + 34, y + 112);
  });
  // Against the period before.
  if (w.change !== null) {
    const up = w.change > .05, down = w.change < -.05, text = `${up ? '▲' : down ? '▼' : '='} ${pct(Math.abs(w.change))} dibanding ${previousOf(w.period).label}`;
    type(30, 700); const tw = g.measureText(text).width + 64, py = tilesY + 345;
    g.fillStyle = up ? 'rgba(255,120,100,.18)' : 'rgba(80,230,160,.16)'; round((W - tw) / 2, py, tw, 64, 32); g.fill();
    g.fillStyle = up ? '#ffb3a8' : '#7dffc0'; center(text, py + 43);
  }
  // The mark, and nothing else.
  type(34, 800, 2); g.fillStyle = gold(0, H - 110, 0, H - 70); center('✦ Dompet Ajaib', H - 82);
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(Error('Gambar belum bisa dibuat.')), 'image/png'));
}

export function WrappedView({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const { data, profile } = useApp();
  const today = new Date().toLocaleDateString('en-CA');
  const choices = useMemo(() => periodChoices(today), [today]);
  // The fonts start loading when the recap opens, so "Bagikan" does not have to wait for them.
  // 9.5 A sound as it opens (Drumroll, Kilau ajaib or Whoosh boom: Pengaturan → Tampilan) and a burst of confetti.
  useEffect(() => {
    featureUsed('home_rekap'); void appFonts().ready; playRekap();
    const t = window.setTimeout(() => confetti({ count: 90, spread: .9, origin: { x: .5, y: .35 } }), 650);
    return () => window.clearTimeout(t);
  }, []);
  const [key, setKey] = useState(() => initial || (() => { const p = defaultPeriod(today); return p.kind === 'year' ? p.start.slice(0, 4) : p.start.slice(0, 7); })());
  const period = periodOf(key), prev = previousOf(period);
  const now = usePeriodTransactions({ start: period.start, end: period.end }), before = usePeriodTransactions({ start: prev.start, end: prev.end });
  const [hide, setHide] = useState(false), [index, setIndex] = useState(0), [status, setStatus] = useState('');
  const wrapped = useMemo(() => buildWrapped(now.items, before.items, data.categories, period, today), [now.items, before.items, data.categories, key, today]);
  const name = (profile?.displayName || profile?.username || '').trim().split(/\s+/)[0] || '';
  const slides = slidesOf(wrapped, hide, name);
  const track = useRef<HTMLDivElement>(null);
  useEffect(() => { setIndex(0); track.current?.scrollTo({ left: 0 }); }, [key]);
  const go = (i: number) => { const n = Math.max(0, Math.min(slides.length - 1, i)); setIndex(n); const el = track.current; if (el) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' }); };
  // Each slide arrives with a little sound; the last one with confetti.
  const shown = useRef(0);
  useEffect(() => {
    if (index === shown.current) return; shown.current = index;
    if (index === slides.length - 1 && slides.length > 2) { play('level'); confetti({ count: 140, origin: { x: .5, y: .4 } }); } else play('step');
  }, [index, slides.length]);
  async function share() {
    setStatus('');
    try {
      const blob = await drawPicture(wrapped, hide);
      const file = new File([blob], `rekap-${key}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: `Rekap ${period.label}` }); return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatus('Gambar rekap disimpan ke perangkat.');
    } catch (e) { if ((e as Error).name !== 'AbortError') setStatus((e as Error).message || 'Belum bisa dibagikan.'); }
  }
  const loading = now.loading || before.loading;
  return <div className="wr-overlay" role="dialog" aria-modal="true" aria-label={`Rekap ${period.label}`}>
    <div className="wr-intro" aria-hidden="true"><span className="wr-intro-burst"/><span className="wr-intro-ring"/><span className="wr-intro-word">Rekap</span></div>
    <div className="wr-shell">
      <span className="wr-aurora" aria-hidden="true"/><span className="wr-dust" aria-hidden="true"/><span className="wr-frame" aria-hidden="true"/>
      <div className="wr-top">
        <div className="wr-dots" aria-hidden="true">{slides.map((s, i) => <i key={s.key} className={i <= index ? 'on' : ''}/>)}</div>
        <div className="wr-bar">
          <Select value={key} onChange={e => setKey(e.target.value)} aria-label="Pilih periode rekap" className="wr-period">{choices.map(c => { const k = c.kind === 'year' ? c.start.slice(0, 4) : c.start.slice(0, 7); return <option key={k} value={k}>{c.kind === 'year' ? `Tahun ${c.label}` : c.label}</option>; })}</Select>
          <button type="button" className="wr-icon" onClick={() => setHide(h => !h)} aria-pressed={hide} aria-label={hide ? 'Tampilkan nominal' : 'Sembunyikan nominal'} title={hide ? 'Tampilkan nominal' : 'Sembunyikan nominal'}>{hide ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          <button type="button" className="wr-icon" onClick={onClose} aria-label="Tutup rekap"><X size={19}/></button>
        </div>
      </div>
      <div className="wr-track" ref={track} onScroll={e => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (i !== index) setIndex(i); }} aria-busy={loading}>
        {slides.map((s, i) => <section key={s.key} className={`wr-slide is-${s.key} ${s.tone ? `tone-${s.tone}` : ''} ${i === index ? 'is-on' : ''}`} aria-hidden={i !== index}>
          <span className="wr-emblem" aria-hidden="true"><span className="wr-emblem-ring"/><Emoji e={s.key === 'change' ? ((wrapped.change || 0) > 0 ? '📈' : '📉') : EMBLEM[s.key] || '✨'}/></span>
          <small className="wr-kicker">{s.kicker}</small>
          <strong className="wr-big">{loading && i > 0 ? '…' : s.big}</strong>
          {s.line && <p className="wr-line">{s.line}</p>}
          {s.rows && <ul className="wr-rows">{s.rows.map(r => <li key={r.label}><span>{r.label}</span><b>{r.value}</b>{r.share !== undefined && <i className="wr-bar-fill" style={{ '--w': `${Math.max(4, r.share * 100)}%` } as React.CSSProperties}/>}</li>)}</ul>}
          {s.key === 'end' && <button type="button" className="btn wr-share" onClick={() => void share()}><Share2 size={17}/> Bagikan gambar</button>}
          {s.key === 'end' && status && <p className="wr-status" role="status">{status}</p>}
        </section>)}
      </div>
      <div className="wr-nav">
        <button type="button" className="wr-icon" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Sebelumnya"><ChevronLeft size={20}/></button>
        <button type="button" className="wr-share-mini" onClick={() => void share()}><Share2 size={15}/> Bagikan</button>
        <button type="button" className="wr-icon" onClick={() => go(index + 1)} disabled={index === slides.length - 1} aria-label="Berikutnya"><ChevronRight size={20}/></button>
      </div>
    </div>
  </div>;
}
