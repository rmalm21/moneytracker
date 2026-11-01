'use client';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useEffect, useState, type CSSProperties } from 'react';
import { ChevronDown, Sparkles, X } from 'lucide-react';
import { Emoji } from './emoji';
import { releases, type Release } from '@/lib/changelog';
import { APP_VERSION } from '@/lib/version';
import { unseenReleases } from '@/lib/whats-new';

const SEEN = 'dompet-ajaib:whats-new-seen', ABOUT_SEEN = 'dompet-ajaib:about-seen';
/** Older releases listed at first; the rest open with one tap. */
const FIRST_OLDER = 6;

/** Shown once after the app updates: what is new since this device last saw the changes (lib/changelog.ts). The newest
 * release in full, every release missed before it as one short line (its title) that opens to its points. */
export function WhatsNew({ ready, navigate }: { ready: boolean; navigate?: (key: string, target?: string) => void }) {
  const [list, setList] = useState<Release[]>([]), [open, setOpen] = useState(false), [more, setMore] = useState(false);
  useEffect(() => {
    if (!ready) return;
    let news: Release[] = [];
    try {
      const keys = Object.keys(localStorage), usedBefore = keys.some(key => key.startsWith('dompet-ajaib:') && key !== SEEN);
      news = unseenReleases(releases, APP_VERSION, localStorage.getItem(SEEN) || localStorage.getItem(ABOUT_SEEN), usedBefore);
      if (!news.length) localStorage.setItem(SEEN, APP_VERSION);
    } catch { return; }
    if (!news.length) return;
    setList(news);
    // After the opening screen has gone, so it is not missed.
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [ready]);
  function close() {
    setOpen(false);
    // Seen here: the dot on Pengaturan → Info aplikasi goes too.
    try { localStorage.setItem(SEEN, APP_VERSION); localStorage.setItem(ABOUT_SEEN, APP_VERSION); } catch { /* shown again next time */ }
  }
  const [latest, ...older] = list;
  if (!latest) return null;
  return <DialogPrimitive.Root open={open} onOpenChange={value => { if (!value) close(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="wn-overlay"/>
      <DialogPrimitive.Content className="wn-card" aria-describedby="wn-lead">
        <header className="wn-hero">
          <span className="wn-spark is-a" aria-hidden="true">✦</span><span className="wn-spark is-b" aria-hidden="true">✦</span><span className="wn-spark is-c" aria-hidden="true">✦</span>
          <span className="wn-badge"><Sparkles size={14} aria-hidden="true"/> Baru diperbarui</span>
          <DialogPrimitive.Title className="wn-title">{latest.title}</DialogPrimitive.Title>
          <p className="wn-version" id="wn-lead">Versi {latest.version} · {latest.date}</p>
          <DialogPrimitive.Close className="wn-x" aria-label="Tutup"><X size={18}/></DialogPrimitive.Close>
        </header>
        <div className="wn-body">
          <ol className="wn-items">{latest.items.map(([emoji, text], index) => <li key={text} style={{ '--i': index } as CSSProperties}><span className="wn-emoji" aria-hidden="true"><Emoji e={emoji}/></span><p>{text}</p></li>)}</ol>
          {older.length > 0 && <section className="wn-older" aria-label="Pembaruan yang terlewat">
            <h3>Juga baru sejak terakhir kamu lihat <b>{older.length} versi</b></h3>
            <ul>{(more ? older : older.slice(0, FIRST_OLDER)).map(release => <li key={release.version}><details>
              <summary><span className="wn-chip">{release.version}</span><span className="wn-line"><strong>{release.title}</strong><small>{release.date} · {release.items.length} hal baru</small></span><ChevronDown size={16} aria-hidden="true"/></summary>
              <ul className="wn-points">{release.items.map(([emoji, text]) => <li key={text}><Emoji e={emoji}/><span>{text}</span></li>)}</ul>
            </details></li>)}</ul>
            {older.length > FIRST_OLDER && !more && <button type="button" className="link-button wn-more" onClick={() => setMore(true)}>Tampilkan {older.length - FIRST_OLDER} versi lainnya</button>}
          </section>}
        </div>
        <footer className="wn-actions">
          <button type="button" className="btn btn-primary wn-go" onClick={close}>Mantap, lanjut</button>
          {navigate && <button type="button" className="link-button wn-all" onClick={() => { close(); navigate('settings', 'about'); }}>Lihat semua pembaruan</button>}
        </footer>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
