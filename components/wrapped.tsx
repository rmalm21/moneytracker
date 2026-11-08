'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, EyeOff, Share2, X } from 'lucide-react';
import { useApp } from './app-provider';
import { usePeriodTransactions } from './period-selector';
import { Select } from './fields';
import { buildWrapped, defaultPeriod, periodChoices, periodOf, previousOf, type Wrapped } from '@/lib/wrapped';
import { formatDate } from '@/lib/period';
import { featureUsed } from './feature-tips-events';

/**
 * 8.5 Rekap: a month or a year told in a few slides (swipe or tap the sides), with "Sembunyikan nominal" (shares and
 * counts stay, amounts become Rp•••) and "Bagikan", which draws one picture on this device and hands it to the phone's
 * share sheet (or saves it). Nothing is uploaded.
 */
const rp = (n: number) => `Rp${Math.round(Math.abs(n)).toLocaleString('id-ID')}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const HIDDEN = 'Rp•••';

type Slide = { key: string; kicker: string; big: string; line?: string; rows?: { label: string; value: string; share?: number }[]; tone?: 'good' | 'warn' };

function slidesOf(w: Wrapped, hide: boolean, name: string): Slide[] {
  const money = (n: number) => hide ? HIDDEN : rp(n), p = w.period, month = p.kind === 'month';
  const out: Slide[] = [{ key: 'cover', kicker: month ? 'Rekap bulanan' : 'Rekap tahunan', big: p.label, line: `${name ? `${name}, ` : ''}ini cerita uangmu ${month ? 'bulan ini' : 'setahun ini'}. Geser untuk mulai →` }];
  if (!w.count) return [...out, { key: 'empty', kicker: 'Belum ada catatan', big: 'Masih kosong', line: `Belum ada transaksi di ${p.label}. Catat dulu, nanti rekapnya muncul di sini.` }];
  out.push({ key: 'flow', kicker: 'Masuk dan keluar', big: money(w.expense), line: `keluar ${month ? 'bulan ini' : 'tahun ini'}${w.income ? `, dari ${money(w.income)} yang masuk` : ''}.`,
    rows: [{ label: 'Masuk', value: money(w.income) }, { label: 'Keluar', value: money(w.expense) }, { label: w.saved >= 0 ? 'Sisa' : 'Lebih besar pasak', value: hide ? (w.income ? pct(Math.abs(w.savedRate)) : HIDDEN) : rp(w.saved) }], tone: w.saved >= 0 ? 'good' : 'warn' });
  if (w.top.length) out.push({ key: 'top', kicker: 'Paling banyak ke', big: w.top[0].name, line: `${pct(w.top[0].share)} dari semua pengeluaranmu.`, rows: w.top.map(t => ({ label: t.name, value: hide ? pct(t.share) : rp(t.amount), share: t.share })) });
  if (w.place) out.push({ key: 'place', kicker: 'Tempat favoritmu', big: w.place.name, line: `${w.place.count} kali ke sini, total ${money(w.place.amount)}.` });
  if (w.biggestDay) out.push({ key: 'day', kicker: 'Hari paling boros', big: formatDate(w.biggestDay.date), line: `${money(w.biggestDay.amount)} dalam ${w.biggestDay.count} transaksi.${w.biggest ? ` Yang terbesar: ${w.biggest.name} (${money(w.biggest.amount)}).` : ''}`,
    ...(w.weekday ? { rows: [{ label: 'Hari paling banyak keluar', value: w.weekday.name }] } : {}) });
  out.push({ key: 'habit', kicker: 'Rajin mencatat', big: `${w.longestStreak} hari`, line: `berturut-turut paling lama. Total ${w.count} catatan di ${w.recordedDays} dari ${w.days} hari.`,
    rows: [{ label: 'Rata-rata keluar per hari', value: money(w.perDay) }] });
  if (w.change !== null) out.push({ key: 'change', kicker: `Dibanding ${previousOf(p).label}`, big: `${w.change > 0 ? '+' : '−'}${pct(Math.abs(w.change))}`, line: w.change > .05 ? 'pengeluaranmu naik. Cek lagi bagian yang paling besar, ya.' : w.change < -.05 ? 'pengeluaranmu turun. Mantap, pertahankan!' : 'pengeluaranmu hampir sama. Stabil!', tone: w.change > .05 ? 'warn' : 'good' });
  out.push({ key: 'end', kicker: 'Sampai jumpa', big: month ? 'Bulan depan lagi!' : 'Tahun depan lagi!', line: 'Bagikan rekap ini kalau mau. Gambarnya dibuat di HP-mu, tidak ada yang diunggah.' });
  return out;
}

/** One picture of the recap (1080×1350), drawn on a canvas in the page's colours. */
async function drawPicture(w: Wrapped, hide: boolean, colors: { accent: string; ink: string; muted: string; paper: string }): Promise<Blob> {
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, money = (n: number) => hide ? HIDDEN : rp(n);
  const font = (size: number, weight = 700) => `${weight} ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, colors.accent); bg.addColorStop(1, '#0f2a2a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.beginPath(); g.arc(W - 120, 140, 260, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = font(40, 600); g.fillText(w.period.kind === 'month' ? 'Rekap bulanan' : 'Rekap tahunan', 80, 140);
  g.font = font(92, 800); g.fillText(w.period.label, 80, 250);
  const card = (y: number, h: number) => { g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.roundRect(60, y, W - 120, h, 36); g.fill(); g.fillStyle = '#fff'; };
  card(310, 230);
  g.font = font(34, 600); g.globalAlpha = .8; g.fillText('Keluar', 110, 375); g.fillText('Masuk', 580, 375); g.globalAlpha = 1;
  g.font = font(64, 800); g.fillText(money(w.expense), 110, 455); g.fillText(money(w.income), 580, 455);
  g.font = font(32, 600); g.globalAlpha = .85; g.fillText(w.saved >= 0 ? `Sisa ${hide ? (w.income ? pct(w.savedRate) : HIDDEN) : rp(w.saved)}` : 'Pengeluaran lebih besar dari pemasukan', 110, 510); g.globalAlpha = 1;
  card(570, 420);
  g.font = font(36, 700); g.fillText('Paling banyak ke', 110, 640);
  w.top.slice(0, 3).forEach((t, i) => {
    const y = 720 + i * 95;
    g.font = font(38, 700); g.fillText(t.name.length > 22 ? `${t.name.slice(0, 21)}…` : t.name, 110, y);
    g.font = font(34, 600); const v = hide ? pct(t.share) : rp(t.amount), tw = g.measureText(v).width; g.fillText(v, W - 110 - tw, y);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.roundRect(110, y + 18, W - 220, 14, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.roundRect(110, y + 18, Math.max(14, (W - 220) * t.share), 14, 7); g.fill();
  });
  card(1020, 200);
  g.font = font(34, 600); g.globalAlpha = .8; g.fillText('Rajin mencatat', 110, 1085); g.fillText(w.place ? 'Tempat favorit' : 'Catatan', 580, 1085); g.globalAlpha = 1;
  g.font = font(50, 800); g.fillText(`${w.longestStreak} hari`, 110, 1160);
  const fav = w.place ? w.place.name : `${w.count} transaksi`; g.fillText(fav.length > 14 ? `${fav.slice(0, 13)}…` : fav, 580, 1160);
  g.font = font(30, 600); g.globalAlpha = .75; g.fillText('Dompet Ajaib · dihitung di HP sendiri', 80, H - 60); g.globalAlpha = 1;
  void colors;
  return new Promise((resolve, reject) => c.toBlob(b => b ? resolve(b) : reject(Error('Gambar belum bisa dibuat.')), 'image/png'));
}

export function WrappedView({ onClose, initial }: { onClose: () => void; initial?: string }) {
  const { data, profile } = useApp();
  const today = new Date().toLocaleDateString('en-CA');
  const choices = useMemo(() => periodChoices(today), [today]);
  useEffect(() => { featureUsed('home_rekap'); }, []);
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
  async function share() {
    setStatus('');
    try {
      const css = getComputedStyle(document.documentElement), color = (v: string, f: string) => css.getPropertyValue(v).trim() || f;
      const blob = await drawPicture(wrapped, hide, { accent: color('--accent', '#1f7a6d'), ink: color('--ink', '#14232b'), muted: color('--muted', '#62737e'), paper: color('--paper', '#fff') });
      const file = new File([blob], `rekap-${key}.png`, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
      if (nav.canShare?.({ files: [file] })) { await nav.share({ files: [file], title: `Rekap ${period.label}` }); return; }
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = file.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
      setStatus('Gambar rekap disimpan ke perangkat.');
    } catch (e) { if ((e as Error).name !== 'AbortError') setStatus((e as Error).message || 'Belum bisa dibagikan.'); }
  }
  const loading = now.loading || before.loading;
  return <div className="wr-overlay" role="dialog" aria-modal="true" aria-label={`Rekap ${period.label}`}>
    <div className="wr-shell">
      <div className="wr-top">
        <div className="wr-dots" aria-hidden="true">{slides.map((s, i) => <i key={s.key} className={i <= index ? 'on' : ''}/>)}</div>
        <div className="wr-bar">
          <Select value={key} onChange={e => setKey(e.target.value)} aria-label="Pilih periode rekap" className="wr-period">{choices.map(c => { const k = c.kind === 'year' ? c.start.slice(0, 4) : c.start.slice(0, 7); return <option key={k} value={k}>{c.kind === 'year' ? `Tahun ${c.label}` : c.label}</option>; })}</Select>
          <button type="button" className="wr-icon" onClick={() => setHide(h => !h)} aria-pressed={hide} aria-label={hide ? 'Tampilkan nominal' : 'Sembunyikan nominal'} title={hide ? 'Tampilkan nominal' : 'Sembunyikan nominal'}>{hide ? <EyeOff size={18}/> : <Eye size={18}/>}</button>
          <button type="button" className="wr-icon" onClick={onClose} aria-label="Tutup rekap"><X size={19}/></button>
        </div>
      </div>
      <div className="wr-track" ref={track} onScroll={e => { const el = e.currentTarget; const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth)); if (i !== index) setIndex(i); }} aria-busy={loading}>
        {slides.map((s, i) => <section key={s.key} className={`wr-slide is-${s.key} ${s.tone ? `tone-${s.tone}` : ''}`} aria-hidden={i !== index}>
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
