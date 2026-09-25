'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { APP_VERSION } from '@/lib/version';

/** Stage-aware status lines; each stage moves the bar further. */
const steps: { target: number; lines: string[] }[] = [
  { target: 42, lines: ['Menghubungkan akunmu…', 'Memeriksa sesi login…'] },
  { target: 78, lines: ['Memuat profil & pengaturan…', 'Menyiapkan dompet…'] },
  { target: 96, lines: ['Menghitung saldo…', 'Merapikan catatan keuangan…', 'Menyiapkan insight…'] },
];

/** Minimal full-screen splash in the chosen theme colours while the account, profile and data load. `stage` 0 = sign-in, 1 = profile, 2 = data. */
export function LoadingScreen({ stage = 0, error = '' }: { stage?: number; error?: string }) {
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

  return <div className="splash" role="status" aria-live="polite" aria-label={`Menyiapkan catatan keuangan, ${shown}%`}>
    <div className="splash-center">
      <div className="splash-logo" aria-hidden="true"><span className="splash-ring"/><span className="splash-mark"><Sparkles size={30} strokeWidth={1.8}/></span></div>
      <h1 className="splash-title">dompet ajaib<span>.</span></h1>
      <p className="splash-text" key={`${stage}-${line}`}>{text}</p>
      <div className="splash-progress"><div className="splash-track"><div className="splash-fill" style={{ width: `${shown}%` }}/></div><span>{shown}%</span></div>
      {error && <p className="splash-error" role="alert">{error}</p>}
    </div>
    <small className="splash-foot">Tersinkron aman dengan akunmu · versi {APP_VERSION}</small>
  </div>;
}
