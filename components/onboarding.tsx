'use client';
import { useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check, Sparkles } from 'lucide-react';
import { useApp } from './app-provider';
import { Button } from './ui/button';
import { Emoji } from './emoji';
import { Field, Input, Money } from './fields';
import { TemplateChecklist } from './category-template-picker';
import { salaryCycle, rupiah } from '@/lib/accounting';
import { saveProfile, saveWallet, seedCategoryTemplates } from '@/lib/firestore';
import { categoryTemplates, planTemplateSeed, presetHex } from '@/lib/category-templates';

/**
 * First run: a short guided setup (welcome → profile & payday → first wallets → categories).
 * Every answer can be changed later; "Lewati dulu" finishes with sensible defaults.
 */
type Choice = 'default' | 'pick' | 'empty';
const steps = ['Mulai', 'Profil', 'Dompet', 'Kategori'];
const dayText = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });

function Step({ emoji, title, lead, children }: { emoji: string; title: string; lead: string; children: ReactNode }) {
  return <section className="ob-step">
    <header className="ob-step-head"><span className="ob-step-emoji"><Emoji e={emoji}/></span><div><h2>{title}</h2><p>{lead}</p></div></header>
    {children}
  </section>;
}

export function Onboarding({ notify }: { notify: (s: string) => void }) {
  const { user, profile, data } = useApp();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.displayName || ''), [day, setDay] = useState(profile?.salaryCycleStartDay || 24), [salary, setSalary] = useState(profile?.monthlySalary || 0);
  const [wallets, setWallets] = useState(true), [cash, setCash] = useState(0), [bank, setBank] = useState(0);
  const [choice, setChoice] = useState<Choice>('default'), [picked, setPicked] = useState<string[]>(() => categoryTemplates.map(t => t.key));
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const hasCash = data.wallets.some(w => w.type === 'cash'), hasBank = data.wallets.some(w => w.type === 'bank');
  const cycle = salaryCycle(new Date(), Math.min(31, Math.max(1, Math.round(day) || 24)));
  const mains = choice === 'empty' ? 0 : choice === 'default' ? categoryTemplates.length : picked.length;

  async function finish(skip = false) {
    if (!user) return; const salaryDay = Math.min(31, Math.max(1, Math.round(day) || 24)); setBusy(true); setError('');
    try {
      if (!skip && wallets) {
        if (!hasCash) await saveWallet(user.uid, { name: 'Tunai', type: 'cash', openingBalance: cash, icon: '💵', color: presetHex('green'), displayOrder: 0 });
        if (!hasBank) await saveWallet(user.uid, { name: 'Bank', type: 'bank', openingBalance: bank, icon: '🏦', color: presetHex('blue'), displayOrder: 1 });
      }
      const keys = skip || choice === 'empty' ? [] : choice === 'default' ? categoryTemplates.map(t => t.key) : picked;
      const records = planTemplateSeed(data.categories, keys);
      if (records.length) await seedCategoryTemplates(user.uid, records);
      const gaji = records.find(r => r.data.templateKey === 'income.gaji');
      await saveProfile(user.uid, { displayName: name.trim() || profile?.username || '', salaryCycleStartDay: salaryDay, monthlySalary: salary, onboardingDone: true, ...(gaji ? { salaryIncomeCategoryId: gaji.id } : {}) });
      notify('Akun siap dipakai. Selamat mencatat!');
    } catch (e) { setError((e as Error).message || 'Pengaturan awal gagal.'); } finally { setBusy(false); }
  }
  const last = step === steps.length - 1, canNext = !(step === 3 && choice === 'pick' && !picked.length);

  return <main className="onboarding ob">
    <div className="ob-glow" aria-hidden="true"/>
    <div className="ob-card">
      <div className="ob-top">
        <div className="brand ob-brand"><span className="brand-mark"><Sparkles size={18}/></span><strong>dompet ajaib<span className="brand-dot">.</span></strong></div>
        <button type="button" className="link-button ob-skip" disabled={busy} onClick={() => void finish(true)}>Lewati dulu</button>
      </div>
      <ol className="ob-progress" aria-label={`Langkah ${step + 1} dari ${steps.length}`}>{steps.map((label, i) => <li key={label} className={i < step ? 'is-done' : i === step ? 'is-now' : ''} aria-current={i === step ? 'step' : undefined}><i>{i < step ? <Check size={12}/> : i + 1}</i><span>{label}</span></li>)}</ol>

      <div className="ob-body" key={step}>
        {step === 0 && <section className="ob-step ob-welcome">
          <div className="ob-art" aria-hidden="true"><span className="ob-art-main"><Emoji e="👛"/></span><span className="ob-art-a"><Emoji e="💸"/></span><span className="ob-art-b"><Emoji e="📊"/></span><span className="ob-art-c"><Emoji e="🎯"/></span></div>
          <h1>Halo{name.trim() ? `, ${name.trim().split(' ')[0]}` : ''}! Selamat datang di Dompet Ajaib</h1>
          <p>Tiga langkah singkat supaya semua angka langsung benar. Semuanya bisa diubah kapan saja.</p>
          <ul className="ob-features">
            <li><span><Emoji e="⚡"/></span><div><strong>Catat dalam hitungan detik</strong><small>Pengeluaran, pemasukan, dan transfer dari satu tombol.</small></div></li>
            <li><span><Emoji e="💡"/></span><div><strong>Anggaran & Insight</strong><small>Pantau batas belanja dan dapat saran dari kebiasaanmu sendiri.</small></div></li>
            <li><span><Emoji e="🔒"/></span><div><strong>Data milikmu</strong><small>Tersimpan di akunmu dan bisa dikunci PIN atau sidik jari.</small></div></li>
          </ul>
        </section>}

        {step === 1 && <Step emoji="👋" title="Kenalan dulu" lead="Tanggal gajian menentukan siklus anggaran, laporan, dan Insight.">
          <Field label="Nama panggilan"><Input value={name} onChange={e => setName(e.target.value)} placeholder="Nama yang ingin ditampilkan" autoFocus/></Field>
          <div className="ob-field"><span className="ob-label">Tanggal gajian</span>
            <div className="ob-days" role="radiogroup" aria-label="Tanggal gajian">{Array.from({ length: 31 }, (_, i) => i + 1).map(d => <button type="button" role="radio" key={d} aria-checked={day === d} className={day === d ? 'active' : ''} onClick={() => setDay(d)}>{d}</button>)}</div>
            <small className="ob-hint">Siklus pertamamu: <b>{dayText(cycle.start)} – {dayText(new Date(new Date(`${cycle.end}T12:00:00`).getTime() - 86400000).toLocaleDateString('en-CA'))}</b>. Kalau gajian jatuh di akhir bulan yang lebih pendek, siklus menyesuaikan.</small>
          </div>
          <Field label="Perkiraan gaji bulanan (opsional)"><Money value={salary} onChange={setSalary}/></Field>
        </Step>}

        {step === 2 && <Step emoji="💰" title="Dompet pertamamu" lead="Isi saldo sekarang supaya uang bebas dan laporan langsung akurat.">
          <label className="ob-switch"><input type="checkbox" checked={wallets} onChange={e => setWallets(e.target.checked)}/><span><strong>Buat dompet Tunai dan Bank</strong><small>Bisa diganti nama, warna, atau logo banknya nanti.</small></span></label>
          {wallets && <div className="ob-wallets">
            <div className="ob-wallet is-cash"><span className="ob-wallet-icon"><Emoji e="💵"/></span><strong>Tunai</strong>{hasCash ? <small>Sudah ada di akunmu</small> : <Money value={cash} onChange={setCash}/>}</div>
            <div className="ob-wallet is-bank"><span className="ob-wallet-icon"><Emoji e="🏦"/></span><strong>Bank</strong>{hasBank ? <small>Sudah ada di akunmu</small> : <Money value={bank} onChange={setBank}/>}</div>
          </div>}
          <small className="ob-hint">E-wallet, tabungan, investasi, dan kantong (mis. dana darurat) bisa ditambah nanti di menu <b>Dompet</b>.</small>
        </Step>}

        {step === 3 && <Step emoji="🗂️" title="Kategori belanja" lead="Kategori membuat laporan dan anggaran rapi. Pilih cara memulai:">
          <div className="ob-choices" role="radiogroup" aria-label="Pilihan kategori">{([['default', 'Pakai kategori bawaan', 'Kategori umum sudah disiapkan lengkap dengan subkategori.', '✅'], ['pick', 'Pilih sendiri', 'Centang kategori yang ingin dipakai.', '👆'], ['empty', 'Mulai dari kosong', 'Buat kategori sendiri nanti.', '🌱']] as [Choice, string, string, string][]).map(([value, title, text, emoji]) => <label key={value} className={`ob-choice ${choice === value ? 'is-selected' : ''}`}><input type="radio" name="category-choice" checked={choice === value} onChange={() => setChoice(value)}/><span className="ob-choice-emoji"><Emoji e={emoji}/></span><span><strong>{title}{value === 'default' && <em>Disarankan</em>}</strong><small>{text}</small></span></label>)}</div>
          {choice === 'pick' && <TemplateChecklist selected={picked} onChange={setPicked}/>}
          <div className="ob-summary"><span><Emoji e="🎉"/></span><div><strong>Siap dipakai!</strong><small>Gajian tiap tanggal {Math.round(day) || 24}{salary ? ` · gaji ${rupiah(salary)}` : ''} · {wallets ? `${(hasCash ? 0 : 1) + (hasBank ? 0 : 1)} dompet baru` : 'tanpa dompet baru'} · {mains ? `${mains} kategori` : 'tanpa kategori bawaan'}</small></div></div>
        </Step>}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="ob-nav">
        {step > 0 ? <Button type="button" variant="secondary" disabled={busy} onClick={() => setStep(step - 1)}><ArrowLeft size={16}/> Kembali</Button> : <span/>}
        {last ? <Button type="button" disabled={busy || !canNext} onClick={() => void finish()}>{busy ? 'Menyiapkan…' : <><Check size={16}/> Simpan & mulai</>}</Button>
          : <Button type="button" disabled={!canNext} onClick={() => setStep(step + 1)}>{step === 0 ? 'Mulai' : 'Lanjut'} <ArrowRight size={16}/></Button>}
      </div>
    </div>
  </main>;
}
