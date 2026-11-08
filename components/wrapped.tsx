'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff, Palette, Share2, X } from 'lucide-react';
import { useApp } from './app-provider';
import { usePeriodTransactions } from './period-selector';
import { Select } from './fields';
import { buildWrapped, defaultPeriod, periodChoices, periodOf, previousOf, type Wrapped } from '@/lib/wrapped';
import { formatDate } from '@/lib/period';
import { featureUsed } from './feature-tips-events';
import { Emoji } from './emoji';
import { play, playRekap } from '@/lib/game-sound';
import { confetti } from './game/confetti';
import { lookOf, REKAP_THEMES, rekapTheme, setRekapTheme, type RekapThemeId } from './rekap-themes';

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
 * 9.6 The picture of the recap: story size (1080×1920), drawn on this device in the chosen look and the app's fonts.
 * Only the "Dompet Ajaib" mark at the bottom; amounts follow "Sembunyikan nominal".
 */
async function drawPicture(w: Wrapped, hide: boolean, themeId: RekapThemeId): Promise<Blob> {
  const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, money = (n: number) => hide ? HIDDEN : rp(n), month = w.period.kind === 'month';
  const t = lookOf(themeId), appAccent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1f7a6d';
  const accent = t.accent || (t.id === 'gelap' ? lighten(appAccent) : appAccent);
  const fonts = appFonts(); await fonts.ready;
  const serif = "Georgia, 'Noto Serif', 'Times New Roman', serif";
  const type = (size: number, weight = 700, spacing = 0, display = false) => {
    const head = weight >= 700;
    g.font = `${weight} ${size}px ${display && t.serif ? serif : head ? fonts.head : fonts.body}`;
    if ('letterSpacing' in g) (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing || (head && size >= 60 && !t.serif ? -0.025 * size : 0)}px`;
  };
  const fit = (text: string, max: number, size: number, weight = 800, display = true) => { let s = size; type(s, weight, 0, display); while (g.measureText(text).width > max && s > 24) { s -= 2; type(s, weight, 0, display); } return s; };
  const clip = (text: string, max: number) => { if (g.measureText(text).width <= max) return text; let x = text; while (x.length > 1 && g.measureText(`${x}…`).width > max) x = x.slice(0, -1); return `${x}…`; };
  const round = (x: number, y: number, ww: number, hh: number, r: number) => { g.beginPath(); g.roundRect(x, y, ww, hh, r); };
  const left = 96, right = W - 96, inner = right - left;
  // Background, by look.
  if (t.id === 'bersih') {
    g.fillStyle = '#f6f7f9'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(17,20,24,.07)'; for (let x = 620; x < W; x += 36) for (let y = 40; y < 520; y += 36) { g.globalAlpha = Math.max(0, 1 - (y / 520) - (W - x) / 900); g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1; g.fillStyle = accent; round(left, 120, 64, 10, 5); g.fill();
  } else if (t.id === 'editorial') {
    g.fillStyle = '#f3ede2'; g.fillRect(0, 0, W, H);
    g.strokeStyle = t.ink; g.lineWidth = 3; g.beginPath(); g.moveTo(left, 104); g.lineTo(right, 104); g.stroke(); g.lineWidth = 1; g.beginPath(); g.moveTo(left, 114); g.lineTo(right, 114); g.stroke();
  } else if (t.id === 'pastel') {
    g.fillStyle = '#fbf9ff'; g.fillRect(0, 0, W, H);
    for (const [x, y, r, col] of [[180, 260, 620, '255,196,178'], [900, 420, 640, '214,196,255'], [260, 1500, 700, '186,236,214'], [920, 1680, 560, '255,236,170']] as [number, number, number, string][]) {
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${col},.95)`); gr.addColorStop(1, `rgba(${col},0)`); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    }
  } else if (t.id === 'gelap') {
    g.fillStyle = '#0f1115'; g.fillRect(0, 0, W, H);
    const gr = g.createRadialGradient(160, 120, 0, 160, 120, 900); gr.addColorStop(0, hexA(accent, .22)); gr.addColorStop(1, hexA(accent, 0)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = accent; round(left, 120, 64, 8, 4); g.fill();
  } else {
    g.fillStyle = '#2f5bff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ff6b4a'; g.beginPath(); g.arc(W + 40, 140, 300, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(-60, H - 220, 260, 0, Math.PI * 2); g.fill();
  }
  // Title.
  type(32, 700, 6); g.fillStyle = t.id === 'pop' ? '#ffcc33' : t.id === 'editorial' ? t.accent : t.sub;
  g.fillText(month ? 'REKAP BULANAN' : 'REKAP TAHUNAN', left, t.id === 'editorial' ? 180 : 200);
  fit(w.period.label, inner, t.serif ? 132 : 124, t.serif ? 700 : 800, true); g.fillStyle = t.ink;
  if (t.id === 'pastel') { const gr = g.createLinearGradient(left, 0, right, 0); gr.addColorStop(0, '#5b3bdb'); gr.addColorStop(1, '#d9485f'); g.fillStyle = gr; }
  g.fillText(w.period.label, left, t.id === 'editorial' ? 320 : 330);
  // Cards, by look.
  const cardInk = (i: number) => t.id === 'pop' ? (i === 0 ? '#1a1a1a' : '#ffffff') : t.ink;
  const cardSub = (i: number) => t.id === 'pop' ? (i === 0 ? 'rgba(26,26,26,.7)' : 'rgba(255,255,255,.85)') : t.sub;
  const card = (y: number, h: number, i: number) => {
    if (t.id === 'editorial') { g.strokeStyle = t.line; g.lineWidth = 2; g.beginPath(); g.moveTo(left, y); g.lineTo(right, y); g.stroke(); return; }
    const fill = t.id === 'pop' ? ['#ffcc33', '#ff6b4a', '#18b07a', '#8b5cf6', '#ffffff'][i] || '#ff6b4a' : t.card;
    if (t.id === 'bersih') { g.save(); g.shadowColor = 'rgba(17,20,24,.08)'; g.shadowBlur = 30; g.shadowOffsetY = 10; g.fillStyle = fill; round(left, y, inner, h, 36); g.fill(); g.restore(); }
    g.fillStyle = fill; round(left, y, inner, h, t.id === 'pop' ? 44 : 36); g.fill();
    if (t.line !== 'transparent') { g.strokeStyle = t.line; g.lineWidth = 2; g.stroke(); }
  };
  const P = 54; // inside padding
  // What went out.
  card(400, 430, 0);
  type(30, 600, 2); g.fillStyle = cardSub(0); g.fillText('Total keluar', left + P, 480);
  fit(money(w.expense), inner - P * 2, 132, 800, true); g.fillStyle = t.id === 'gelap' ? accent : cardInk(0); g.fillText(money(w.expense), left + P, 630);
  g.strokeStyle = t.id === 'pop' ? 'rgba(26,26,26,.15)' : t.line; g.lineWidth = 2; g.beginPath(); g.moveTo(left + P, 690); g.lineTo(right - P, 690); g.stroke();
  if (!w.income) { type(32, 600); g.fillStyle = cardSub(0); g.fillText(`Belum ada pemasukan tercatat ${month ? 'bulan' : 'tahun'} ini`, left + P, 775); }
  else {
    const bal = balanceRow(w, hide), mid = left + inner / 2;
    type(26, 600, 1); g.fillStyle = cardSub(0); g.fillText('Masuk', left + P, 750); g.fillText(bal.label, mid + 20, 750);
    type(46, 800); g.fillStyle = cardInk(0); g.fillText(clip(money(w.income), inner / 2 - P - 20), left + P, 808);
    g.fillStyle = t.id === 'pop' ? (w.saved >= 0 ? '#0b6b45' : '#b42318') : w.saved >= 0 ? t.good : t.warn; g.fillText(clip(bal.value, inner / 2 - P - 20), mid + 20, 808);
  }
  // Where it went.
  const rows = Math.max(1, Math.min(3, w.top.length)), topH = 125 + rows * 105;
  card(870, topH, 1);
  type(34, 800, 0, true); g.fillStyle = t.id === 'pop' ? '#ffffff' : t.id === 'editorial' ? t.accent : t.ink; g.fillText('Paling banyak ke', left + P, 945);
  if (!w.top.length) { type(30, 600); g.fillStyle = cardSub(1); g.fillText('Belum ada pengeluaran', left + P, 1020); }
  w.top.slice(0, 3).forEach((x, i) => {
    const y = 1025 + i * 105;
    type(34, 700); g.fillStyle = cardInk(1); g.fillText(clip(`${i + 1}. ${x.name}`, inner - 2 * P - 230), left + P, y);
    type(30, 600); const v = hide ? pct(x.share) : rp(x.amount), tw = g.measureText(v).width; g.fillStyle = cardSub(1); g.fillText(v, right - P - tw, y);
    g.fillStyle = t.id === 'pop' ? 'rgba(255,255,255,.3)' : t.id === 'gelap' ? '#262a33' : 'rgba(17,20,24,.08)'; round(left + P, y + 22, inner - 2 * P, 12, 6); g.fill();
    g.fillStyle = t.id === 'pop' ? '#ffffff' : accent; round(left + P, y + 22, Math.max(12, (inner - 2 * P) * x.share), 12, 6); g.fill();
  });
  // Four small figures.
  const tilesY = 870 + topH + 40, tw = (inner - 24) / 2;
  const tiles: [string, string][] = [
    ['Rajin mencatat', `${w.longestStreak} hari`], ['Total catatan', `${w.count}`],
    [w.place ? 'Tempat favorit' : 'Rata-rata/hari', w.place ? w.place.name : money(w.perDay)],
    [w.biggestDay ? 'Hari paling boros' : 'Hari tercatat', w.biggestDay ? new Date(`${w.biggestDay.date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : `${w.recordedDays} hari`],
  ];
  tiles.forEach(([label, value], i) => {
    const x = left + (i % 2) * (tw + 24), y = tilesY + Math.floor(i / 2) * 170, popFill = ['#ffffff', '#18b07a', '#8b5cf6', '#ffcc33'][i];
    if (t.id === 'editorial') { g.strokeStyle = t.line; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + tw, y); g.stroke(); }
    else { g.fillStyle = t.id === 'pop' ? popFill : t.card; round(x, y, tw, 150, 32); g.fill(); if (t.line !== 'transparent') { g.strokeStyle = t.line; g.lineWidth = 2; g.stroke(); } }
    const dark = t.id === 'pop' ? (i === 0 || i === 3) : false;
    type(26, 600, 1); g.fillStyle = t.id === 'pop' ? (dark ? 'rgba(26,26,26,.65)' : 'rgba(255,255,255,.85)') : t.sub; g.fillText(label, x + (t.id === 'editorial' ? 0 : 34), y + 54);
    type(44, 800, 0, true); g.fillStyle = t.id === 'pop' ? (dark ? '#1a1a1a' : '#ffffff') : t.ink; g.fillText(clip(value, tw - 68), x + (t.id === 'editorial' ? 0 : 34), y + 114);
  });
  // Against the period before.
  if (w.change !== null) {
    const up = w.change > .05, down = w.change < -.05, text = `${up ? '▲' : down ? '▼' : '='} ${pct(Math.abs(w.change))} dibanding ${previousOf(w.period).label}`;
    type(30, 700); const pw = g.measureText(text).width + 64, py = tilesY + 345;
    g.fillStyle = t.id === 'pop' ? '#ffffff' : t.id === 'gelap' ? '#171a21' : up ? hexA(t.warn, .12) : hexA(t.good, .12); round(left, py, pw, 64, 32); g.fill();
    g.fillStyle = t.id === 'pop' ? (up ? '#b42318' : '#0b6b45') : up ? t.warn : t.good; g.fillText(text, left + 32, py + 43);
  }
  // The mark, and nothing else.
  type(32, 800, 1); g.fillStyle = t.id === 'pop' ? '#ffffff' : t.id === 'editorial' ? t.ink : t.sub;
  const mark = '✦ Dompet Ajaib', mw = g.measureText(mark).width; g.fillText(mark, (W - mw) / 2, H - 84);
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(Error('Gambar belum bisa dibuat.')), 'image/png'));
}
/** A colour's red, green and blue (#rgb, #rrggbb or rgb()/rgba()); null when it cannot be read. */
function rgbOf(color: string): [number, number, number] | null {
  const c = color.trim(), hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
  if (hex) { const h = hex[1].length === 3 ? hex[1].split('').map(x => x + x).join('') : hex[1], n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const fn = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec(c); return fn ? [Number(fn[1]), Number(fn[2]), Number(fn[3])] : null;
}
/** A colour with some transparency (a colour that cannot be read becomes a soft grey, never a solid fill). */
function hexA(color: string, a: number) { const v = rgbOf(color) || [128, 128, 128]; return `rgba(${v[0]},${v[1]},${v[2]},${a})`; }
/** The app accent, lighter, for the dark look. */
function lighten(color: string) { const v = rgbOf(color); if (!v) return '#5eead4'; const mix = (x: number) => Math.round(x + (255 - x) * .35); return `rgb(${mix(v[0])},${mix(v[1])},${mix(v[2])})`; }

export function WrappedView({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const { data, profile } = useApp();
  const today = new Date().toLocaleDateString('en-CA');
  const choices = useMemo(() => periodChoices(today), [today]);
  // The fonts start loading when the recap opens, so "Bagikan" does not have to wait for them.
  // 9.5 A sound as it opens (Drumroll, Kilau ajaib or Whoosh boom: Pengaturan → Tampilan).
  useEffect(() => {
    featureUsed('home_rekap'); void appFonts().ready; playRekap();
  }, []);
  const [key, setKey] = useState(() => initial || (() => { const p = defaultPeriod(today); return p.kind === 'year' ? p.start.slice(0, 4) : p.start.slice(0, 7); })());
  const period = periodOf(key), prev = previousOf(period);
  const now = usePeriodTransactions({ start: period.start, end: period.end }), before = usePeriodTransactions({ start: prev.start, end: prev.end });
  const [hide, setHide] = useState(false), [index, setIndex] = useState(0), [status, setStatus] = useState('');
  // 9.6 Five looks (kept on this device).
  const [theme, setTheme] = useState<RekapThemeId>(() => rekapTheme()), [picking, setPicking] = useState(false);
  const pickTheme = (id: RekapThemeId) => { setTheme(id); setRekapTheme(id); play('step'); };
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
    if (index === slides.length - 1 && slides.length > 2) { play('note'); confetti({ count: 70, spread: .7, origin: { x: .5, y: .4 } }); } else play('step');
  }, [index, slides.length]);
  async function share() {
    setStatus('');
    try {
      const blob = await drawPicture(wrapped, hide, theme);
      const file = new File([blob], `rekap-${key}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: `Rekap ${period.label}` }); return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatus('Gambar rekap disimpan ke perangkat.');
    } catch (e) { if ((e as Error).name !== 'AbortError') setStatus((e as Error).message || 'Belum bisa dibagikan.'); }
  }
  const loading = now.loading || before.loading;
  return <div className="wr-overlay" role="dialog" aria-modal="true" aria-label={`Rekap ${period.label}`}>
    <div className="wr-shell" data-wr-theme={theme} data-n={index % 5}>
      <div className="wr-intro" aria-hidden="true"><span className="wr-intro-burst"/><span className="wr-intro-word">Rekap</span></div>
      <span className="wr-deco" aria-hidden="true"/><span className="wr-deco2" aria-hidden="true"/>
      <div className="wr-top">
        <div className="wr-dots" aria-hidden="true">{slides.map((s, i) => <i key={s.key} className={i <= index ? 'on' : ''}/>)}</div>
        <div className="wr-bar">
          <Select value={key} onChange={e => setKey(e.target.value)} aria-label="Pilih periode rekap" className="wr-period">{choices.map(c => { const k = c.kind === 'year' ? c.start.slice(0, 4) : c.start.slice(0, 7); return <option key={k} value={k}>{c.kind === 'year' ? `Tahun ${c.label}` : c.label}</option>; })}</Select>
          <button type="button" className="wr-icon" onClick={() => setHide(h => !h)} aria-pressed={hide} aria-label={hide ? 'Tampilkan nominal' : 'Sembunyikan nominal'} title={hide ? 'Tampilkan nominal' : 'Sembunyikan nominal'}>{hide ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          <button type="button" className={`wr-icon ${picking ? 'is-on' : ''}`} onClick={() => setPicking(p => !p)} aria-pressed={picking} aria-label="Pilih desain rekap" title="Desain"><Palette size={18}/></button>
          <button type="button" className="wr-icon" onClick={onClose} aria-label="Tutup rekap"><X size={19}/></button>
        </div>
      </div>
      <div className="wr-track" ref={track} onScroll={e => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (i !== index) setIndex(i); }} aria-busy={loading}>
        {slides.map((s, i) => <section key={s.key} className={`wr-slide is-${s.key} ${s.tone ? `tone-${s.tone}` : ''} ${i === index ? 'is-on' : ''}`} data-n={i % 5} aria-hidden={i !== index}>
          <span className="wr-head-row" aria-hidden="true"><span className="wr-emblem"><Emoji e={s.key === 'change' ? ((wrapped.change || 0) > 0 ? '📈' : '📉') : EMBLEM[s.key] || '✨'}/></span><span className="wr-num">{String(i + 1).padStart(2, '0')}<small>/{String(slides.length).padStart(2, '0')}</small></span></span>
          <small className="wr-kicker">{s.kicker}</small>
          <strong className="wr-big">{loading && i > 0 ? '…' : s.big}</strong>
          {s.line && <p className="wr-line">{s.line}</p>}
          {s.rows && <ul className="wr-rows">{s.rows.map(r => <li key={r.label}><span>{r.label}</span><b>{r.value}</b>{r.share !== undefined && <i className="wr-bar-fill" style={{ '--w': `${Math.max(4, r.share * 100)}%` } as React.CSSProperties}/>}</li>)}</ul>}
          {s.key === 'end' && <button type="button" className="btn wr-share" onClick={() => void share()}><Share2 size={17}/> Bagikan gambar</button>}
          {s.key === 'end' && status && <p className="wr-status" role="status">{status}</p>}
        </section>)}
      </div>
      {picking && <div className="wr-themes" role="dialog" aria-label="Pilih desain rekap">
        <strong>Pilih desain</strong>
        <div className="wr-theme-list">{REKAP_THEMES.map(t => <button type="button" key={t.id} className={`wr-theme ${theme === t.id ? 'is-on' : ''}`} data-wr-theme={t.id} onClick={() => pickTheme(t.id)} aria-pressed={theme === t.id}>
          <span className="wr-theme-prev" aria-hidden="true"><i/><b/><em/></span>
          <span className="wr-theme-text"><b>{t.name}</b><small>{t.hint}</small></span>
          {theme === t.id && <Check size={16}/>}
        </button>)}</div>
        <button type="button" className="wr-theme-done" onClick={() => setPicking(false)}>Selesai</button>
      </div>}
      <div className="wr-nav">
        <button type="button" className="wr-icon" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Sebelumnya"><ChevronLeft size={20}/></button>
        <button type="button" className="wr-share-mini" onClick={() => void share()}><Share2 size={15}/> Bagikan</button>
        <button type="button" className="wr-icon" onClick={() => go(index + 1)} disabled={index === slides.length - 1} aria-label="Berikutnya"><ChevronRight size={20}/></button>
      </div>
    </div>
  </div>;
}
