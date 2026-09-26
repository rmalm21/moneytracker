'use client';
import { useState } from 'react';
import { ChevronDown, CircleHelp, Cloud, RefreshCw, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { Emoji } from './emoji';
import { Button } from './ui/button';
import { applyUpdate, usePwa } from '@/lib/pwa';
import { APP_VERSION } from '@/lib/version';
import { releases } from '@/lib/changelog';

/** Pengaturan → Info aplikasi: version, "Apa yang baru" as a timeline, and a few facts about the app. */
export function AboutApp({ navigate }: { navigate?: (key: string) => void }) {
  const pwa = usePwa();
  const [open, setOpen] = useState<string[]>([releases[0]?.version]), [all, setAll] = useState(false);
  const shown = all ? releases : releases.slice(0, 4);
  const toggle = (version: string) => setOpen(list => list.includes(version) ? list.filter(v => v !== version) : [...list, version]);
  return <div className="about">
    <section className="about-hero">
      <div className="about-hero-top">
        <span className="about-logo" aria-hidden="true"><Sparkles size={26}/></span>
        <div className="about-name"><strong>dompet ajaib<span className="brand-dot">.</span></strong><small>Uangmu, lebih jelas.</small></div>
      </div>
      <div className="about-facts">
        <div><span>Versi</span><b>{APP_VERSION}</b></div>
        <div><span>Pembaruan terakhir</span><b>{releases[0]?.date}</b></div>
        <div><span>Di perangkat ini</span><b>{pwa.installed ? 'Terpasang' : 'Dibuka di browser'}</b></div>
      </div>
      {pwa.updateReady ? <Button type="button" className="small about-update" onClick={applyUpdate}><RefreshCw size={15}/> Muat versi terbaru</Button>
        : <p className="about-fresh"><ShieldCheck size={15} aria-hidden="true"/> Ini versi terbaru yang ada di perangkatmu.</p>}
    </section>

    <section className="about-news" aria-labelledby="about-news-title">
      <header><h3 id="about-news-title">Apa yang baru</h3><small>{releases.length} pembaruan terakhir</small></header>
      <ol className="about-timeline">
        {shown.map((release, index) => { const isOpen = open.includes(release.version); return <li key={release.version} className={`about-release ${index === 0 ? 'is-latest' : ''} ${isOpen ? 'is-open' : ''}`}>
          <button type="button" className="about-release-head" aria-expanded={isOpen} onClick={() => toggle(release.version)}>
            <span className="about-dot" aria-hidden="true"/>
            <span className="about-release-text"><strong>{release.title}{index === 0 && <em>Baru</em>}</strong><small>Versi {release.version} · {release.date}</small></span>
            <ChevronDown size={18} className="about-chevron" aria-hidden="true"/>
          </button>
          {isOpen && <ul className="about-items">{release.items.map(([emoji, text]) => <li key={text}><span className="about-emoji" aria-hidden="true"><Emoji e={emoji}/></span><span>{text}</span></li>)}</ul>}
        </li>; })}
      </ol>
      {releases.length > 4 && <button type="button" className="link-button about-all" onClick={() => setAll(!all)}>{all ? 'Tampilkan lebih sedikit' : `Lihat ${releases.length - 4} pembaruan sebelumnya`}</button>}
    </section>

    <section className="about-cards">
      <div className="about-card"><span aria-hidden="true"><Cloud size={18}/></span><div><strong>Data milikmu</strong><small>Tersimpan di akunmu sendiri; akun lain tidak bisa membacanya.</small></div></div>
      <div className="about-card"><span aria-hidden="true"><Smartphone size={18}/></span><div><strong>Bisa offline</strong><small>Catatan tersimpan di perangkat dan dikirim saat internet kembali.</small></div></div>
      {navigate && <button type="button" className="about-card is-link" onClick={() => navigate('help')}><span aria-hidden="true"><CircleHelp size={18}/></span><div><strong>Tanya Jawab</strong><small>Istilah, fungsi menu, dan cara pakai.</small></div></button>}
    </section>
    <p className="about-credit">Emoji: Microsoft Fluent Emoji (MIT) · Ikon: Lucide (ISC)</p>
  </div>;
}
