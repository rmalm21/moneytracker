'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Emoji } from './emoji';
import { APP_VERSION } from '@/lib/version';

/** Stage-aware status lines; each stage moves the bar further. */
const steps: { target: number; lines: string[] }[] = [
  { target: 42, lines: ['Menghubungkan akunmu…', 'Memeriksa sesi login…'] },
  { target: 78, lines: ['Memuat profil & pengaturan…', 'Menyiapkan dompet…'] },
  { target: 96, lines: ['Menghitung saldo…', 'Merapikan catatan keuangan…', 'Menyiapkan insight…'] },
];

const NAME_KEY = 'dompet-ajaib:last-name', STYLE_KEY = 'dompet-ajaib:splash-style';
export type SplashStyle = 'standard' | 'greeting';
/** The opening screen chosen in Pengaturan → Tampilan, kept on the device so it shows before the profile loads. */
export function rememberSplashStyle(style: SplashStyle | undefined) { try { if (style) localStorage.setItem(STYLE_KEY, style); } catch { /* default */ } }
function savedSplashStyle(): SplashStyle { try { return localStorage.getItem(STYLE_KEY) === 'standard' ? 'standard' : 'greeting'; } catch { return 'greeting'; } }
/** Remembers who opened the app last, so the next opening can greet them before the profile has loaded. */
export function rememberGreetingName(name: string) { try { if (name.trim()) localStorage.setItem(NAME_KEY, name.trim()); else localStorage.removeItem(NAME_KEY); } catch { /* greeting only */ } }

/** Minimal full-screen splash in the chosen theme colours while the account, profile and data load. `stage` 0 = sign-in, 1 = profile, 2 = data. */
export function LoadingScreen({ stage = 0, error = '', name = '', style }: { stage?: number; error?: string; name?: string; style?: SplashStyle }) {
  // The name and the chosen look as soon as they are known; before that, what this device remembers.
  const [saved, setSaved] = useState(''), [savedStyle, setSavedStyle] = useState<SplashStyle | null>(null);
  useEffect(() => { try { setSaved(localStorage.getItem(NAME_KEY) || ''); } catch { /* no name */ } setSavedStyle(savedSplashStyle()); }, []);
  const look = style || savedStyle;
  const who = (name || saved).trim().split(/\s+/)[0] || '';
  const step = steps[Math.min(stage, steps.length - 1)];
  const [progress, setProgress] = useState(6);
  const [line, setLine] = useState(0);
  // Ease towards the stage target so the bar keeps moving but never claims to be done early.
  useEffect(() => {
    const id = window.setInterval(() => setProgress(p => Math.min(step.target - .5, p + Math.max(.15, (step.target - p) * .07))), 90);
    return () => window.clearInterval(id);
  }, [step.target]);
  useEffect(() => { setLine(0); const id = window.setInterval(() => setLine(i => i + 1), 1500); return () => window.clearInterval(id); }, [stage]);
  const shown = Math.min(step.target, Math.round(progress));
  const text = step.lines[line % step.lines.length];

  // Until this device's choice is read (one frame), only the background shows, so the look never flips.
  if (!look) return <div className="splash" aria-busy="true"/>;
  if (look === 'standard') return <div className="splash" role="status" aria-live="polite" aria-label={`Menyiapkan catatan keuangan, ${shown}%`}>
    <div className="splash-center">
      <div className="splash-logo" aria-hidden="true"><span className="splash-ring"/><span className="splash-mark"><Sparkles size={30} strokeWidth={1.8}/></span></div>
      <h1 className="splash-title">dompet ajaib<span>.</span></h1>
      <p className="splash-text" key={`${stage}-${line}`}>{text}</p>
      <div className="splash-progress"><div className="splash-track"><div className="splash-fill" style={{ width: `${shown}%` }}/></div><span>{shown}%</span></div>
      {error && <p className="splash-error" role="alert">{error}</p>}
    </div>
    <small className="splash-foot">Tersinkron aman dengan akunmu · versi {APP_VERSION}</small>
  </div>;
  return <div className="splash" role="status" aria-live="polite" aria-label={`${who ? `Halo, ${who}. ` : ''}Menyiapkan catatan keuangan, ${shown}%`}>
    <div className="splash-glow" aria-hidden="true"><i/><i/><i/></div>
    <div className="splash-card">
      <span className="splash-wave" aria-hidden="true"><Emoji e="👋"/></span>
      <h1 className="splash-hello">Halo{who ? <>, <b>{who}</b></> : ''}!</h1>
      <p className="splash-welcome">{who ? 'Selamat datang kembali' : 'Selamat datang'}</p>
      <p className="splash-text" key={`${stage}-${line}`}>{text}</p>
      <div className="splash-progress"><div className="splash-track"><div className="splash-fill" style={{ width: `${shown}%` }}/></div><span>{shown}%</span></div>
      {error && <p className="splash-error" role="alert">{error}</p>}
    </div>
    <small className="splash-foot"><b>dompet ajaib<span>.</span></b> · tersinkron aman · versi {APP_VERSION}</small>
  </div>;
}
