'use client';
import { useState, type ReactNode } from 'react';
import { Check, ChevronDown, Gauge, HeartHandshake, Home, RotateCcw, ShieldCheck, Sparkles, Sprout, Wallet } from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { Money } from './fields';
import { rupiah } from '@/lib/accounting';
import { emergencyPockets } from '@/lib/pockets';
import { useApp } from './app-provider';
import { instrumentChoices } from '@/lib/invest-plan';
import { budgetStyleLabels, defaultInsightProfile, experienceLabels, horizonLabels, householdLabels, incomeLabels, priorityLabels, resolveInsightProfile, riskLabels, riskQuestions, scoreRiskQuiz, suggestedEmergencyMonths, type InsightProfile } from '@/lib/insight-profile';

/** One-tap choices shown as capsules (a radio group). */
function Choices<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return <div className="ip-choices" role="radiogroup" aria-label={label}>{options.map(([key, text]) => <button type="button" role="radio" aria-checked={value === key} key={String(key)} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{value === key && <Check size={14} aria-hidden="true"/>}{text}</button>)}</div>;
}
function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div className="ip-row"><div className="ip-row-head"><strong>{label}</strong>{hint && <small>{hint}</small>}</div>{children}</div>;
}
/** A slider with the value shown next to it. */
function Percent({ value, min, max, step = 1, onChange, label, suffix = '%' }: { value: number; min: number; max: number; step?: number; onChange: (value: number) => void; label: string; suffix?: string }) {
  return <div className="ip-slider"><input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={event => onChange(Number(event.target.value))} style={{ '--p': `${(value - min) / (max - min) * 100}%` } as React.CSSProperties}/><output>{value}{suffix}</output></div>;
}
function Switch({ on, onChange, label, hint }: { on: boolean; onChange: (on: boolean) => void; label: string; hint?: string }) {
  return <button type="button" role="switch" aria-checked={on} className={`ip-switch ${on ? 'on' : ''}`} onClick={() => onChange(!on)}><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><i aria-hidden="true"/></button>;
}

const shortRp = (n: number) => n >= 1e6 ? `Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `Rp${Math.round(n / 1e3)} rb` : rupiah(n);

const tabs = [
  { key: 'risk', label: 'Risiko', icon: Gauge },
  { key: 'target', label: 'Target', icon: ShieldCheck },
  { key: 'life', label: 'Kondisi', icon: Home },
  { key: 'budget', label: 'Anggaran', icon: Wallet },
  { key: 'invest', label: 'Investasi', icon: Sprout },
] as const;
type Tab = typeof tabs[number]['key'];

/** Sheet that personalises Insight. Everything has an automatic default; the user can override any of it. */
export function InsightProfileSheet({ open, onOpenChange, saved, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; saved?: Partial<InsightProfile> | null; onSave: (profile: InsightProfile) => void }) {
  const { data } = useApp();
  // A target on the emergency kantong wins over this setting (one source of truth).
  const kantongTarget = emergencyPockets(data.funds)?.target || 0;
  const [draft, setDraft] = useState<InsightProfile>(() => resolveInsightProfile(saved));
  const [tab, setTab] = useState<Tab>('risk');
  const [quizOpen, setQuizOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [autoEmergency, setAutoEmergency] = useState(() => !saved?.emergencyMonths);
  const quiz = riskQuestions.every(q => answers[q.id]) ? scoreRiskQuiz(answers) : null;
  const set = <K extends keyof InsightProfile>(key: K, value: InsightProfile[K]) => setDraft(current => {
    const next = { ...current, [key]: value };
    if (key === 'household' && value === 'family' && !next.dependants) next.dependants = 1;
    if (autoEmergency && (key === 'household' || key === 'dependants' || key === 'income')) next.emergencyMonths = suggestedEmergencyMonths(next);
    return next;
  });
  function answer(id: string, score: number) {
    const next = { ...answers, [id]: score };
    setAnswers(next);
    if (riskQuestions.every(q => next[q.id])) { const result = scoreRiskQuiz(next); setDraft(current => ({ ...current, risk: result.risk, riskScore: result.score, horizon: result.horizon })); }
  }
  const suggested = suggestedEmergencyMonths(draft);
  const pct = (v: number) => Math.round(v * 100);

  return <Dialog open={open} onOpenChange={value => { if (value) { setDraft(resolveInsightProfile(saved)); setAnswers({}); setQuizOpen(false); setTab('risk'); setAutoEmergency(!saved?.emergencyMonths); } onOpenChange(value); }}>
    <DialogContent title="Personalisasi Insight" className="insight-profile-dialog">
      <div className="ip-summary">
        <span><small>Risiko</small><strong>{riskLabels[draft.risk].label}</strong></span>
        <span><small>Menabung</small><strong>{pct(draft.savingsTarget)}%</strong></span>
        <span><small>Dana darurat</small><strong>{kantongTarget ? shortRp(kantongTarget) : draft.emergencyMode === 'amount' ? shortRp(draft.emergencyAmount) : `${draft.emergencyMonths} bln`}</strong></span>
      </div>
      <div className="ip-tabs" role="tablist">{tabs.map(t => <button type="button" role="tab" key={t.key} aria-selected={tab === t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}><t.icon size={15} aria-hidden="true"/>{t.label}</button>)}</div>

      <div className="ip-panel" role="tabpanel">
        {tab === 'risk' && <>
          <div className="ip-risk-cards" role="radiogroup" aria-label="Profil risiko">{(Object.keys(riskLabels) as InsightProfile['risk'][]).map(key => <button type="button" role="radio" aria-checked={draft.risk === key} key={key} className={`ip-risk risk-${key} ${draft.risk === key ? 'active' : ''}`} onClick={() => set('risk', key)}>
            <span className="ip-risk-bars" aria-hidden="true">{[1, 2, 3].map(i => <i key={i} className={i <= (key === 'konservatif' ? 1 : key === 'moderat' ? 2 : 3) ? 'on' : ''}/>)}</span>
            <strong>{riskLabels[key].label}</strong><small>{riskLabels[key].hint}</small>{draft.risk === key && <Check size={16} className="ip-risk-check"/>}
          </button>)}</div>
          <div className={`ip-quiz-box ${quizOpen ? 'open' : ''}`}>
            <button type="button" className="ip-quiz-toggle" onClick={() => setQuizOpen(v => !v)} aria-expanded={quizOpen}><Sparkles size={15}/> Belum yakin? Kuis 3 pertanyaan <ChevronDown size={16}/></button>
            {quizOpen && <ol className="ip-quiz">{riskQuestions.map(q => <li key={q.id}><strong>{q.question}</strong><Choices label={q.question} value={answers[q.id] || 0} options={q.options.map(([text, score]) => [score, text] as [number, string])} onChange={score => answer(q.id, score)}/></li>)}
              {quiz && <li className="ip-quiz-result">Hasil: <b>{riskLabels[quiz.risk].label}</b> (skor {quiz.score}/{quiz.max}) — sudah dipilih di atas.</li>}</ol>}
          </div>
          <Row label="Jangka waktu investasi"><Choices label="Jangka waktu investasi" value={draft.horizon} options={(Object.keys(horizonLabels) as InsightProfile['horizon'][]).map(key => [key, horizonLabels[key]])} onChange={value => set('horizon', value)}/></Row>
          <Row label="Pengalaman investasi" hint="Pemula mendapat porsi saham lebih kecil."><Choices label="Pengalaman investasi" value={draft.experience} options={(Object.keys(experienceLabels) as InsightProfile['experience'][]).map(key => [key, experienceLabels[key]])} onChange={value => set('experience', value)}/></Row>
        </>}

        {tab === 'target' && <>
          <Row label="Target menabung" hint="Porsi pemasukan yang disisihkan tiap gajian."><Percent label="Target menabung" value={pct(draft.savingsTarget)} min={1} max={80} onChange={v => set('savingsTarget', v / 100)}/><Choices label="Pilihan cepat" value={pct(draft.savingsTarget)} options={[10, 20, 30, 50].map(v => [v, `${v}%`])} onChange={v => set('savingsTarget', v / 100)}/></Row>
          <Row label="Dana darurat" hint="Tentukan dalam bulan pengeluaran, atau nominal pasti.">
            {kantongTarget > 0 && <p className="ip-note ip-override">Target dari kantong/tujuan dana darurat dipakai: <b>{rupiah(kantongTarget)}</b>. Pengaturan di bawah hanya dipakai kalau target di sana dikosongkan.</p>}
            <div className="ip-seg"><button type="button" className={draft.emergencyMode === 'months' ? 'active' : ''} onClick={() => set('emergencyMode', 'months')}>Dalam bulan</button><button type="button" className={draft.emergencyMode === 'amount' ? 'active' : ''} onClick={() => set('emergencyMode', 'amount')}>Nominal sendiri</button></div>
            {draft.emergencyMode === 'months' ? <>
              <Percent label="Bulan dana darurat" value={draft.emergencyMonths} min={1} max={24} suffix=" bln" onChange={v => { setAutoEmergency(false); set('emergencyMonths', v); }}/>
              <small className="ip-note">Saran untuk kondisimu: <b>{suggested} bulan</b>.{draft.emergencyMonths !== suggested && <button type="button" className="ip-reset" onClick={() => { setAutoEmergency(true); set('emergencyMonths', suggested); }}><RotateCcw size={13}/> Pakai saran</button>}</small>
            </> : <Money value={draft.emergencyAmount} onChange={v => set('emergencyAmount', v)} placeholder="contoh: Rp30.000.000"/>}
          </Row>
          <Row label="Cadangan tak terduga" hint="Disisakan di dompet harian sebelum uang dianggap menganggur (persen dari kebutuhan sebulan)."><Percent label="Cadangan tak terduga" value={pct(draft.buffer)} min={0} max={50} step={5} onChange={v => set('buffer', v / 100)}/></Row>
          <Row label="Abaikan uang menganggur di bawah" hint="Supaya saran investasi tidak muncul untuk nominal kecil."><Money value={draft.idleMinimum} onChange={v => set('idleMinimum', v)} placeholder="Rp500.000"/></Row>
        </>}

        {tab === 'life' && <>
          <Row label="Status"><Choices label="Status" value={draft.household} options={(Object.keys(householdLabels) as InsightProfile['household'][]).map(key => [key, householdLabels[key]])} onChange={value => set('household', value)}/></Row>
          {draft.household === 'family' && <Row label="Jumlah tanggungan"><Choices label="Jumlah tanggungan" value={draft.dependants} options={[1, 2, 3, 4, 5].map(v => [v, v === 5 ? '5+' : String(v)])} onChange={value => set('dependants', value)}/></Row>}
          <Row label="Penghasilan"><Choices label="Penghasilan" value={draft.income} options={(Object.keys(incomeLabels) as InsightProfile['income'][]).map(key => [key, incomeLabels[key]])} onChange={value => set('income', value)}/></Row>
          <Row label="Pemasukan per bulan" hint="Kosongkan agar dihitung otomatis dari transaksi/gaji di profil."><Money value={draft.monthlyIncome} onChange={v => set('monthlyIncome', v)} placeholder="Otomatis"/></Row>
          <Row label="Kebutuhan hidup per bulan" hint="Kosongkan agar dihitung dari riwayat pengeluaran. Isi kalau kamu tahu angkanya."><Money value={draft.monthlyNeed} onChange={v => set('monthlyNeed', v)} placeholder="Otomatis"/></Row>
          <Row label="Prioritas utama" hint="Langkah yang sesuai dinaikkan di Rencana aksi."><Choices label="Prioritas utama" value={draft.priority} options={(Object.keys(priorityLabels) as InsightProfile['priority'][]).map(key => [key, priorityLabels[key]])} onChange={value => set('priority', value)}/></Row>
        </>}

        {tab === 'budget' && <>
          <Row label="Gaya anggaran" hint={budgetStyleLabels[draft.budgetStyle].hint}><Choices label="Gaya anggaran" value={draft.budgetStyle} options={(Object.keys(budgetStyleLabels) as InsightProfile['budgetStyle'][]).map(key => [key, budgetStyleLabels[key].label])} onChange={value => set('budgetStyle', value)}/></Row>
          <Switch on={draft.needsLimit > 0} onChange={on => set('needsLimit', on ? .5 : 0)} label="Tentukan sendiri batas kebutuhan" hint={draft.needsLimit ? undefined : `Otomatis: ${draft.household === 'family' || draft.dependants > 0 ? 60 : 50}% dari pemasukan`}/>
          {draft.needsLimit > 0 && <Percent label="Batas kebutuhan" value={pct(draft.needsLimit)} min={20} max={90} step={5} onChange={v => set('needsLimit', v / 100)}/>}
          <Switch on={draft.wantsLimit > 0} onChange={on => set('wantsLimit', on ? .3 : 0)} label="Tentukan sendiri batas keinginan" hint={draft.wantsLimit ? undefined : `Otomatis: ${draft.budgetStyle === 'strict' ? 20 : draft.budgetStyle === 'relaxed' ? 35 : 30}% dari pemasukan`}/>
          {draft.wantsLimit > 0 && <Percent label="Batas keinginan" value={pct(draft.wantsLimit)} min={5} max={60} step={5} onChange={v => set('wantsLimit', v / 100)}/>}
        </>}

        {tab === 'invest' && <>
          <Switch on={draft.syariah} onChange={on => set('syariah', on)} label="Hanya instrumen syariah" hint="RDPU syariah, sukuk, saham syariah (ISSI/JII), emas."/>
          <Row label="Instrumen yang boleh disarankan" hint="Matikan yang tidak ingin kamu pakai; porsinya dibagi ke yang lain.">
            <div className="ip-instruments">{instrumentChoices.map(item => { const on = !draft.excluded.includes(item.key); return <button type="button" key={item.key} role="switch" aria-checked={on} className={on ? 'active' : ''} onClick={() => set('excluded', on ? [...draft.excluded, item.key] : draft.excluded.filter(k => k !== item.key))}>{on ? <Check size={14}/> : <span className="ip-off"/>}{item.name}</button>; })}</div>
          </Row>
          <p className="ip-note"><HeartHandshake size={14}/> Saran investasi adalah gambaran pembagian, bukan rekomendasi produk.</p>
        </>}
      </div>

      <div className="modal-actions ip-actions">
        <button type="button" className="link-button" onClick={() => { setDraft({ ...defaultInsightProfile, emergencyMonths: suggestedEmergencyMonths(defaultInsightProfile) }); setAutoEmergency(true); }}><RotateCcw size={14}/> Bawaan</button>
        <Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>Batal</Button>
        <Button type="button" onClick={() => onSave({ ...draft, personalized: true })}><Check size={16}/> Simpan</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
