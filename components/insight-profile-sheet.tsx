'use client';
import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { Button } from './ui/button';
import { budgetStyleLabels, experienceLabels, horizonLabels, householdLabels, incomeLabels, priorityLabels, resolveInsightProfile, riskLabels, riskQuestions, scoreRiskQuiz, suggestedEmergencyMonths, type InsightProfile } from '@/lib/insight-profile';

/** One-tap choices shown as capsules (a radio group). */
function Choices<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (value: T) => void; label: string }) {
  return <div className="ip-choices" role="radiogroup" aria-label={label}>{options.map(([key, text]) => <button type="button" role="radio" aria-checked={value === key} key={String(key)} className={value === key ? 'active' : ''} onClick={() => onChange(key)}>{value === key && <Check size={14} aria-hidden="true"/>}{text}</button>)}</div>;
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return <section className="ip-block"><header><h3>{title}</h3>{hint && <small>{hint}</small>}</header>{children}</section>;
}

/** Sheet that personalises Insight: a short risk quiz plus the targets and situation that tune the advice. */
export function InsightProfileSheet({ open, onOpenChange, saved, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; saved?: Partial<InsightProfile> | null; onSave: (profile: InsightProfile) => void }) {
  const [draft, setDraft] = useState<InsightProfile>(() => resolveInsightProfile(saved));
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [autoEmergency, setAutoEmergency] = useState(() => !saved?.emergencyMonths);
  const quizDone = riskQuestions.every(q => answers[q.id]);
  const quiz = quizDone ? scoreRiskQuiz(answers) : null;
  const set = <K extends keyof InsightProfile>(key: K, value: InsightProfile[K]) => setDraft(current => {
    const next = { ...current, [key]: value };
    if (key === 'household' && value === 'family' && !next.dependants) next.dependants = 1;
    if (autoEmergency && (key === 'household' || key === 'dependants' || key === 'income')) next.emergencyMonths = suggestedEmergencyMonths(next);
    return next;
  });
  function answer(id: string, score: number) {
    const next = { ...answers, [id]: score };
    setAnswers(next);
    if (riskQuestions.every(q => next[q.id])) { const result = scoreRiskQuiz(next); setDraft(current => ({ ...current, risk: result.risk, riskScore: result.score, horizon: result.horizon, experience: result.experience })); }
  }
  const suggested = suggestedEmergencyMonths(draft);

  return <Dialog open={open} onOpenChange={value => { if (value) { setDraft(resolveInsightProfile(saved)); setAnswers({}); setAutoEmergency(!saved?.emergencyMonths); } onOpenChange(value); }}>
    <DialogContent title="Personalisasi Insight" className="insight-profile-dialog">
      <p className="ip-intro">Jawab singkat supaya saran menyesuaikan kondisimu. Semua tersimpan di akunmu dan bisa diubah kapan saja.</p>

      <Block title="1 · Kuis profil risiko" hint="5 pertanyaan untuk menentukan jenis investasi yang cocok.">
        <ol className="ip-quiz">{riskQuestions.map((q, i) => <li key={q.id}><strong>{i + 1}. {q.question}</strong><Choices label={q.question} value={answers[q.id] || 0} options={q.options.map(([text, score]) => [score, text] as [number, string])} onChange={score => answer(q.id, score)}/></li>)}</ol>
        <div className={`ip-result risk-${draft.risk}`}>
          <span>{quiz ? `Skor ${quiz.score}/15 · hasil kuis` : 'Profil risiko saat ini'}</span>
          <strong>{riskLabels[draft.risk].label}</strong>
          <small>{riskLabels[draft.risk].hint}</small>
        </div>
        <small className="ip-or">Atau pilih langsung:</small>
        <Choices label="Profil risiko" value={draft.risk} options={(Object.keys(riskLabels) as InsightProfile['risk'][]).map(key => [key, riskLabels[key].label])} onChange={value => set('risk', value)}/>
      </Block>

      <Block title="2 · Target tabungan" hint="Porsi pemasukan yang ingin kamu sisihkan tiap gajian.">
        <Choices label="Target tabungan" value={Math.round(draft.savingsTarget * 100)} options={[10, 15, 20, 25, 30, 40, 50].map(v => [v, `${v}%`])} onChange={value => set('savingsTarget', value / 100)}/>
      </Block>

      <Block title="3 · Kondisimu" hint="Menentukan besar dana darurat dan batas kebutuhan.">
        <Choices label="Status" value={draft.household} options={(Object.keys(householdLabels) as InsightProfile['household'][]).map(key => [key, householdLabels[key]])} onChange={value => set('household', value)}/>
        {draft.household === 'family' && <div className="ip-row"><span>Jumlah tanggungan</span><Choices label="Jumlah tanggungan" value={draft.dependants} options={[1, 2, 3, 4].map(v => [v, v === 4 ? '4+' : String(v)])} onChange={value => set('dependants', value)}/></div>}
        <Choices label="Penghasilan" value={draft.income} options={(Object.keys(incomeLabels) as InsightProfile['income'][]).map(key => [key, incomeLabels[key]])} onChange={value => set('income', value)}/>
        <div className="ip-row"><span>Dana darurat</span><Choices label="Dana darurat" value={draft.emergencyMonths} options={[3, 6, 9, 12].map(v => [v, `${v} bulan`])} onChange={value => { setAutoEmergency(false); set('emergencyMonths', value); }}/></div>
        <small className="ip-note">Saran untuk kondisimu: <b>{suggested} bulan</b> pengeluaran.{draft.emergencyMonths !== suggested && <button type="button" className="ip-reset" onClick={() => { setAutoEmergency(true); set('emergencyMonths', suggested); }}><RotateCcw size={13}/> Pakai saran</button>}</small>
      </Block>

      <Block title="4 · Prioritas & gaya" hint="Langkah yang sesuai prioritasmu akan dinaikkan di Rencana aksi.">
        <Choices label="Prioritas utama" value={draft.priority} options={(Object.keys(priorityLabels) as InsightProfile['priority'][]).map(key => [key, priorityLabels[key]])} onChange={value => set('priority', value)}/>
        <div className="ip-row"><span>Gaya anggaran</span><Choices label="Gaya anggaran" value={draft.budgetStyle} options={(Object.keys(budgetStyleLabels) as InsightProfile['budgetStyle'][]).map(key => [key, budgetStyleLabels[key].label])} onChange={value => set('budgetStyle', value)}/></div>
        <small className="ip-note">{budgetStyleLabels[draft.budgetStyle].hint}</small>
        <div className="ip-row"><span>Jangka waktu investasi</span><Choices label="Jangka waktu investasi" value={draft.horizon} options={(Object.keys(horizonLabels) as InsightProfile['horizon'][]).map(key => [key, horizonLabels[key]])} onChange={value => set('horizon', value)}/></div>
        <div className="ip-row"><span>Pengalaman investasi</span><Choices label="Pengalaman investasi" value={draft.experience} options={(Object.keys(experienceLabels) as InsightProfile['experience'][]).map(key => [key, experienceLabels[key]])} onChange={value => set('experience', value)}/></div>
      </Block>

      <div className="modal-actions ip-actions"><Button variant="secondary" type="button" onClick={() => onOpenChange(false)}>Batal</Button><Button type="button" onClick={() => onSave({ ...draft, personalized: true })}><Check size={16}/> Simpan profil</Button></div>
    </DialogContent>
  </Dialog>;
}
