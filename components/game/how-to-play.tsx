'use client';
/**
 * 9.5 "Cara main" as steps you swipe through: each with a little moving picture, a sound per step, and a send-off at
 * the end. Shown in the Arena (and from the welcome card).
 */
import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Emoji } from '../emoji';
import { Flame } from './flame';
import { confetti } from './confetti';
import { BADGE_TOTAL, FLAMES, MAX_SHIELDS, MISSION_BONUS } from '@/lib/game';
import { play } from '@/lib/game-sound';

type Step = { key: string; title: string; text: React.ReactNode; visual: React.ReactNode };

const steps: Step[] = [
  { key: 'nyala', title: 'Nyalakan apimu', text: <>Catat <b>1 transaksi</b> hari ini, atau ketuk <b>Hari ini aman</b> kalau memang nggak ada transaksi. Wuss, api nyala!</>,
    visual: <div className="htp-v htp-nyala"><span className="htp-receipt"><Emoji e="🧾"/><b>+1</b></span><span className="htp-flame-grow"><Flame tier={2} size={92}/></span></div> },
  { key: 'tumbuh', title: 'Makin rajin, makin besar', text: <>Tiap hari berturut-turut apimu tumbuh dan ganti warna, dari Percikan sampai <b>Api Legenda</b> di hari ke-100.</>,
    visual: <div className="htp-v htp-tumbuh">{FLAMES.slice(1).map((f, i) => <span key={f.tier} style={{ '--i': i } as React.CSSProperties}><Flame tier={f.tier} size={34 + i * 6}/><small>{f.from}</small></span>)}</div> },
  { key: 'perisai', title: 'Perisai Api', text: <>Tiap 7 hari berturut-turut dapat <b>1 perisai</b> (maksimal {MAX_SHIELDS}). Lupa sehari? Perisai maju duluan dan apimu selamat.</>,
    visual: <div className="htp-v htp-perisai"><span className="htp-wind" aria-hidden="true"><i/><i/><i/></span><span className="htp-shield"><Emoji e="🛡️"/></span><Flame tier={3} size={74}/></div> },
  { key: 'xp', title: 'Kumpulin XP, naik level', text: <><b>+10 XP</b> tiap transaksi (maksimal 5 sehari), <b>+20</b> saat api nyala plus bonus streak. Ada 10 gelar, dari Pencatat Pemula sampai Legenda Keuangan.</>,
    visual: <div className="htp-v htp-xp"><span className="htp-coins">{['+10', '+10', '+20', '+30'].map((c, i) => <i key={i} style={{ '--i': i } as React.CSSProperties}>{c}</i>)}</span><span className="htp-xp-row"><span className="htp-bar"><i/></span><span className="htp-lv"><b>Lv</b><span>5</span></span></span></div> },
  { key: 'misi', title: 'Misi & tantangan', text: <><b>3 misi baru</b> tiap hari. Beresin semuanya buat bonus +{MISSION_BONUS} XP. Tiap Senin ada <b>1 tantangan mingguan</b> yang dipilih dari kebiasaanmu.</>,
    visual: <div className="htp-v htp-misi"><ul>{['Catat 2 transaksi', 'Isi kategori', 'Buka Laporan'].map((m, i) => <li key={m} style={{ '--i': i } as React.CSSProperties}><span className="htp-check">✓</span>{m}</li>)}</ul><span className="htp-trophy"><Emoji e="🏆"/></span></div> },
  { key: 'lencana', title: 'Koleksi lencana', text: <>Ada <b>{BADGE_TOTAL} lencana</b> dalam 4 tingkat: Perunggu, Perak, Emas, dan Legenda. Ketuk lencana di Arena buat lihat syaratnya.</>,
    visual: <div className="htp-v htp-lencana">{(['perunggu', 'perak', 'emas', 'legenda'] as const).map((t, i) => <span key={t} className={`htp-medal tier-${t}`} style={{ '--i': i } as React.CSSProperties}><Emoji e={['🎯', '📸', '🏆', '🚀'][i]}/></span>)}</div> },
  { key: 'game', title: 'Main mini game', text: <>Sekali sehari setelah api nyala, <b>Putar Roda</b> buat XP atau Perisai. Atau main <b>Tangkap Koin</b> 40 detik dari gajian sampai tanggal tua, lengkap dengan power-up, Fever, dan misi harian. XP maksimal 30 sehari.</>,
    visual: <div className="htp-v htp-game"><span className="htp-wheel"><Emoji e="🎡"/></span><span className="htp-coin-rain">{[0, 1, 2, 3].map(i => <i key={i} style={{ '--i': i } as React.CSSProperties}><Emoji e="🪙"/></i>)}</span></div> },
  { key: 'bareng', title: 'Api bareng', text: <>Di Ruang Bersama, api bareng nyala kalau <b>semua anggota</b> mencatat atau cek-in di ruang itu hari itu. Telat? <b>Colek</b> temanmu lewat grup!</>,
    visual: <div className="htp-v htp-bareng"><span className="htp-l"><Flame tier={2} size={54}/></span><span className="htp-big"><Flame tier={4} size={96}/></span><span className="htp-r"><Flame tier={2} size={54}/></span></div> },
];

export function HowToPlay() {
  const [i, setI] = useState(0), start = useRef<number | null>(null), box = useRef<HTMLDivElement>(null);
  const last = i === steps.length - 1;
  const go = (n: number) => { const next = Math.max(0, Math.min(steps.length - 1, n)); if (next !== i) { setI(next); play('step'); } };
  const finish = () => {
    play('lit');
    const r = box.current?.getBoundingClientRect();
    confetti({ count: 90, colors: ['#ff7a1a', '#ffc24b', '#ff4d1a', '#fff2b3', '#ff4d6d'], origin: r ? { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 3) / window.innerHeight } : undefined });
    setI(0);
  };
  const s = steps[i];
  return <div className="htp" ref={box}
    onPointerDown={e => { start.current = e.clientX; }}
    onPointerUp={e => { if (start.current === null) return; const dx = e.clientX - start.current; start.current = null; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); }}
    onPointerCancel={() => { start.current = null; }}>
    <div className="htp-stage" key={s.key}>{s.visual}</div>
    <div className="htp-copy" key={`${s.key}-t`} aria-live="polite">
      <small>Langkah {i + 1} dari {steps.length}</small>
      <strong>{s.title}</strong>
      <p>{s.text}</p>
    </div>
    <div className="htp-nav">
      <button type="button" className="htp-arrow" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Langkah sebelumnya"><ChevronLeft size={18}/></button>
      <span className="htp-dots">{steps.map((x, n) => <button type="button" key={x.key} className={n === i ? 'on' : n < i ? 'past' : ''} onClick={() => go(n)} aria-label={`Langkah ${n + 1}: ${x.title}`}/>)}</span>
      {last ? <button type="button" className="htp-go" onClick={finish}>Siap main! <Emoji e="🔥"/></button>
        : <button type="button" className="htp-arrow is-next" onClick={() => go(i + 1)} aria-label="Langkah berikutnya"><ChevronRight size={18}/></button>}
    </div>
  </div>;
}
