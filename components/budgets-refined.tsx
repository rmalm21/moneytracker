'use client';
import { useUndoDelete } from './undo-delete';
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { Check, ChevronDown, ChevronRight, GripVertical, Plus, Sparkles, Target } from 'lucide-react';
import { useApp } from './app-provider';
import { useNotify } from './notifications';
import { AppIcon, categoryColor, emojiOrFallback, identityStyle } from './visual-identity';
import { Button } from './ui/button';
import { Dialog, DialogContent } from './ui/dialog';
import { Field, FormActions, Input, Money, Select } from './fields';
import { archiveOrDelete, saveDisplayOrder, saveRecord } from '@/lib/firestore';
import { ReorderHandle, reorder } from './reorder-handle';
import { budgetCurrent, budgetIconCategoryId, budgetMatcher, budgetMonthly, budgetSubcategories, budgetWindow, countedBudgets, rupiah } from '@/lib/accounting';
import { budgetCommitted } from '@/lib/finance-control';
import { dateInTimeZone } from '@/lib/period';
import type { Budget, LedgerTx } from '@/lib/types';
import { BudgetDetail } from './budget-detail';

const weekdays = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
type SortMode = 'manual' | 'remaining' | 'used' | 'amount' | 'name';
type Tone = 'ok' | 'warn' | 'over' | 'saving' | 'paused';
const sortModes: [SortMode, string][] = [['manual', 'Urutan saya'], ['remaining', 'Sisa paling sedikit'], ['used', 'Paling banyak terpakai'], ['amount', 'Nominal terbesar'], ['name', 'Nama A–Z']];
const sortKey = 'dompet-ajaib:budget-sort';
const toneText: Record<Tone, string> = { ok: 'Aman', warn: 'Hampir habis', over: 'Terlampaui', saving: 'Berjalan', paused: 'Jeda' };
export function periodText(b: Pick<Budget, 'cycleType' | 'cycleStartDay'>, salaryDay: number) { return b.cycleType === 'weekly' ? `Mingguan · mulai ${weekdays[((b.cycleStartDay || 1) - 1) % 7]}` : b.cycleType === 'salary' ? 'Siklus gaji' : b.cycleType === 'calendar' ? 'Bulan ini' : `Mulai tanggal ${b.cycleStartDay || salaryDay}`; }
const short = (value: number) => { const n = Math.abs(value), sign = value < 0 ? '-' : ''; return n >= 1e6 ? `${sign}Rp${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} jt` : n >= 1e3 ? `${sign}Rp${Math.round(n / 1e3)} rb` : rupiah(value); };

/** A ring that fills with how much of the budget is used, around the category icon. */
function Ring({ used, committed, icon, color }: { used: number; committed: number; icon?: string; color?: string }) {
  const r = 22, c = 2 * Math.PI * r, a = Math.min(1, Math.max(0, used)), b = Math.min(1 - a, Math.max(0, committed));
  return <span className="bgt-ring" style={identityStyle(color)} aria-hidden="true">
    <svg viewBox="0 0 52 52"><circle className="bgt-ring-track" cx="26" cy="26" r={r}/>{a + b > 0 && <circle className="bgt-ring-plan" cx="26" cy="26" r={r} strokeDasharray={`${(a + b) * c} ${c}`}/>}{a > 0 && <circle className="bgt-ring-used" cx="26" cy="26" r={r} strokeDasharray={`${a * c} ${c}`}/>}</svg>
    <span className="bgt-ring-icon"><AppIcon icon={icon} fallback="🎯"/></span>
  </span>;
}

export function BudgetsView({ notify, navigate, openTx }: { notify: (message: string) => void; navigate?: (view: string, focus?: string) => void; openTx?: (preset?: Partial<LedgerTx>, editing?: LedgerTx) => void }) {
  const { data, user, profile, cycle } = useApp(); const { track } = useNotify(); const undo = useUndoDelete();
  const [open, setOpen] = useState(false), [editing, setEditing] = useState<Budget | null>(null), [name, setName] = useState(''), [nameTouched, setNameTouched] = useState(false), [category, setCategory] = useState(''), [subs, setSubs] = useState<string[]>([]), [amount, setAmount] = useState(0), [classification, setClassification] = useState<Budget['classification']>('living'), [period, setPeriod] = useState<Budget['cycleType']>('salary'), [day, setDay] = useState(24), [warning, setWarning] = useState(80), [notes, setNotes] = useState(''), [rollover, setRollover] = useState(false), [active, setActive] = useState(true), [error, setError] = useState(''), [busy, setBusy] = useState(false), [detail, setDetail] = useState<string | null>(null), [sortMode, setSortMode] = useState<SortMode>('manual'), [order, setOrder] = useState<string[]>([]);
  const today = dateInTimeZone(new Date(), profile?.timeZone), salaryDay = profile?.salaryCycleStartDay || 24;
  useEffect(() => { try { const saved = localStorage.getItem(sortKey) as SortMode | null; if (saved && sortModes.some(([k]) => k === saved)) setSortMode(saved); } catch { /* Sorting preference is optional. */ } }, []);
  useEffect(() => { setOrder([]); }, [data.budgets]);
  function chooseSort(mode: SortMode) { setSortMode(mode); try { localStorage.setItem(sortKey, mode); } catch { /* Sorting preference is optional. */ } }

  // Everything each card needs, worked out once.
  const stats = useMemo(() => new Map(data.budgets.map(b => {
    const status = budgetCurrent(b, data.transactions, data.categories, today, salaryDay), committed = budgetCommitted(b, data, today, salaryDay);
    const limit = Math.max(1, status.available), left = status.remaining - committed, saving = b.classification === 'savings' || b.classification === 'sinking';
    const used = status.spent / limit, planned = committed / limit, warnAt = (b.warningPercent || profile?.budgetWarningPercent || 80) / 100;
    const tone: Tone = !b.active ? 'paused' : saving ? 'saving' : status.spent > status.available || left < 0 ? 'over' : used + planned >= warnAt ? 'warn' : 'ok';
    return [b.id, { status, committed, left, used, planned, saving, tone, perDay: left > 0 && !saving ? left / Math.max(1, status.daysRemaining) : 0 }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [data.budgets, data.transactions, data.categories, data.plannedTransactions, data.recurring, data.drafts, today.toDateString(), salaryDay, profile?.budgetWarningPercent]);
  const sorted = useMemo(() => {
    const manual = [...data.budgets].map((b, i) => ({ b, i })).sort((x, y) => { const ax = order.indexOf(x.b.id), ay = order.indexOf(y.b.id); if (ax >= 0 && ay >= 0) return ax - ay; return (x.b.sortOrder ?? 1e6 + x.i) - (y.b.sortOrder ?? 1e6 + y.i) || x.b.name.localeCompare(y.b.name); }).map(x => x.b);
    if (sortMode === 'manual') return manual;
    const by: Record<Exclude<SortMode, 'manual'>, (a: Budget, b: Budget) => number> = { remaining: (a, b) => stats.get(a.id)!.left - stats.get(b.id)!.left, used: (a, b) => (stats.get(b.id)!.used + stats.get(b.id)!.planned) - (stats.get(a.id)!.used + stats.get(a.id)!.planned), amount: (a, b) => budgetMonthly(b) - budgetMonthly(a), name: (a, b) => a.name.localeCompare(b.name) };
    return [...manual].sort((a, b) => Number(b.active) - Number(a.active) || by[sortMode](a, b));
  }, [data.budgets, order, sortMode, stats]);
  function move(from: string, to: string) { if (!user) return; const ids = reorder(sorted, from, to).map(b => b.id); if (ids.join() === sorted.map(b => b.id).join()) return; setOrder(ids); track(saveDisplayOrder(user.uid, 'budgets', ids), { pending: 'Menyimpan urutan…', success: 'Urutan anggaran disimpan.', failure: 'Urutan belum tersimpan', quiet: true }); }

  // Overview: spending budgets that are counted once (a part-of-category budget is inside its category's budget).
  const spending = countedBudgets(data.budgets.filter(b => b.active)).filter(b => !stats.get(b.id)!.saving);
  const totals = spending.reduce((t, b) => { const s = stats.get(b.id)!; return { limit: t.limit + s.status.available, spent: t.spent + s.status.spent, planned: t.planned + s.committed }; }, { limit: 0, spent: 0, planned: 0 });
  const totalLeft = totals.limit - totals.spent - totals.planned, counts = { ok: 0, warn: 0, over: 0 };
  const savingLeft = countedBudgets(data.budgets.filter(b => b.active)).filter(b => stats.get(b.id)!.saving).reduce((n, b) => n + Math.max(0, stats.get(b.id)!.left), 0);
  for (const b of data.budgets) { const t = stats.get(b.id)?.tone; if (t === 'ok' || t === 'warn' || t === 'over') counts[t]++; }

  const parents = data.categories.filter(c => ['expense', 'savings'].includes(c.type) && !c.parentId && !c.isArchived);
  const children = data.categories.filter(c => c.parentId === category && !c.isArchived);
  const [subsOpen, setSubsOpen] = useState(false);
  const chosenNames = subs.map(id => children.find(c => c.id === id)?.name).filter(Boolean) as string[];
  const autoName = (cat: string, list: string[]) => { const parent = data.categories.find(c => c.id === cat)?.name || ''; const names = list.map(id => data.categories.find(c => c.id === id)?.name).filter(Boolean); return names.length === 1 ? names[0]! : names.length ? `${parent}: ${names.slice(0, 2).join(', ')}${names.length > 2 ? ` +${names.length - 2}` : ''}` : parent; };
  function pickCategory(id: string) { setCategory(id); setSubs([]); if (!nameTouched) setName(autoName(id, [])); }
  function toggleSub(id: string) { const next = subs.includes(id) ? subs.filter(x => x !== id) : [...subs, id]; setSubs(next); if (!nameTouched) setName(autoName(category, next)); }
  // Another active budget that already counts some of the same spending.
  const overlaps = useMemo(() => {
    if (!category) return [];
    const draft = budgetMatcher({ categoryId: category, subcategoryId: subs[0] || null, subcategoryIds: subs }, data.categories);
    const ids = subs.length ? subs : [category, ...children.map(c => c.id)];
    return data.budgets.filter(b => b.active && b.id !== editing?.id && b.categoryId === category).filter(b => { const m = budgetMatcher(b, data.categories); return ids.some(id => m(category, id) && draft(category, id)); }).map(b => b.name);
  }, [category, subs, data.budgets, data.categories, editing?.id, children]);

  function edit(b?: Budget) { setSubsOpen(false); setEditing(b || null); setName(b?.name || ''); setNameTouched(Boolean(b)); setCategory(b?.categoryId || ''); setSubs(b ? budgetSubcategories(b) : []); setAmount(b?.amount || 0); setClassification(b?.classification || 'living'); setPeriod(b?.cycleType || 'salary'); setDay(b?.cycleStartDay || salaryDay); setWarning(b?.warningPercent || profile?.budgetWarningPercent || 80); setNotes(b?.notes || ''); setRollover(b?.rolloverEnabled || false); setActive(b?.active ?? true); setError(''); setOpen(true); }
  async function act(fn: () => Promise<unknown>, message: string, close = false) { if (close) { setOpen(false); track(fn(), { pending: 'Menyimpan…', success: message, failure: 'Belum tersimpan', retry: { label: 'Buka lagi', run: () => setOpen(true) } }); return; } setError(''); setBusy(true); try { await fn(); notify(message); if (close) setOpen(false); } catch (e) { setError((e as Error).message || 'Belum berhasil. Coba lagi.'); } finally { setBusy(false); } }
  function submit(event: FormEvent) {
    event.preventDefault(); if (!user || !category) return;
    const startDay = period === 'weekly' ? Math.min(7, Math.max(1, Math.round(day) || 1)) : Math.min(31, Math.max(1, Math.round(day) || salaryDay)), warnAt = Math.min(100, Math.max(1, Math.round(warning) || 80));
    const reset = !editing || editing.cycleType !== period || period === 'custom' && editing.cycleStartDay !== startDay;
    const chosen = subs.filter(id => children.some(c => c.id === id));
    const base = { name: name.trim() || autoName(category, chosen), categoryId: category, subcategoryId: chosen[0] || null, subcategoryIds: chosen, amount, classification, cycleType: period, cycleStartDay: startDay, warningPercent: warnAt, notes: notes.trim(), rolloverEnabled: rollover, active, ...(editing ? {} : { sortOrder: data.budgets.reduce((n, x) => Math.max(n, (x.sortOrder ?? -1) + 1), data.budgets.length) }), ...(reset ? { createdDate: editing?.createdDate || today.toLocaleDateString('en-CA'), lastSettledStart: budgetWindow({ cycleType: period, cycleStartDay: startDay } as Budget, today, salaryDay).start, rolloverCarry: 0 } : {}) };
    void act(() => saveRecord(user.uid, 'budgets', base, editing?.id), editing ? 'Anggaran diperbarui.' : 'Anggaran dibuat.', true);
  }
  const scopeText = (b: Budget) => { const list = budgetSubcategories(b); if (!list.length) return ''; const names = list.map(id => data.categories.find(c => c.id === id)?.name).filter(Boolean) as string[]; return list.length === 1 ? names[0] || '' : `${list.length} subkategori`; };
  const visible = sorted.filter(b => !undo.hidden.has(b.id));
  const usedAll = totals.limit > 0 ? (totals.spent + totals.planned) / totals.limit : 0;

  return <div className="bgt-page">
    <div className="page-heading"><div><h1>Anggaran</h1><p>Batas belanja per kategori. Ketuk kartu untuk melihat rinciannya.</p></div><div className="heading-actions"><Button onClick={() => edit()}><Plus size={16}/> Buat anggaran</Button></div></div>

    {data.budgets.length > 0 && <section className={`bgt-hero ${totalLeft < 0 ? 'is-over' : ''}`}>
      <div className="bgt-hero-main">
        <small>Sisa anggaran periode ini</small>
        <strong>{rupiah(totalLeft)}</strong>
        <span>dari {rupiah(totals.limit)} · {cycle.daysRemaining} hari lagi sampai gajian{savingLeft > 0 ? ` · target tabungan tersisa ${short(savingLeft)} tidak dihitung` : ''}</span>
      </div>
      <div className="bgt-hero-ring" role="img" aria-label={`${Math.round(usedAll * 100)}% anggaran terpakai atau direncanakan`}>
        <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" className="track"/>{usedAll > 0 && <circle cx="60" cy="60" r="50" className="plan" strokeDasharray={`${Math.min(1, usedAll) * 314.16} 314.16`}/>}{totals.spent > 0 && <circle cx="60" cy="60" r="50" className="used" strokeDasharray={`${Math.min(1, totals.limit ? totals.spent / totals.limit : 0) * 314.16} 314.16`}/>}</svg>
        <span><b>{Math.round(usedAll * 100)}%</b><small>terpakai</small></span>
      </div>
      <div className="bgt-hero-chips">
        {totalLeft > 0 && <span className="is-daily"><Sparkles size={13}/>Aman ±{short(totalLeft / Math.max(1, cycle.daysRemaining))}/hari</span>}
        <span className="is-ok"><i/>{counts.ok} aman</span>
        <span className="is-warn"><i/>{counts.warn} hampir habis</span>
        <span className="is-over"><i/>{counts.over} terlampaui</span>
        {totals.planned > 0 && <span className="is-plan"><i/>{short(totals.planned)} direncanakan</span>}
      </div>
    </section>}

    {data.budgets.length > 1 && <div className="bgt-toolbar">
      <label className="bgt-sort"><span>Urutkan</span><Select value={sortMode} onChange={e => chooseSort(e.target.value as SortMode)} aria-label="Urutkan anggaran" menuWidth={220}>{sortModes.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select></label>
      {sortMode === 'manual' && <small className="bgt-drag-hint"><GripVertical size={14}/> Tahan pegangan untuk menggeser</small>}
    </div>}

    <div className="bgt-list budget-list">{visible.map((b, index) => {
      const s = stats.get(b.id)!, cat = data.categories.find(c => c.id === budgetIconCategoryId(b)), color = categoryColor(data.categories, cat), scope = scopeText(b);
      const usedPct = Math.min(100, s.used * 100), planPct = Math.min(Math.max(0, 100 - usedPct), s.planned * 100), warnPct = Math.min(100, (b.warningPercent || profile?.budgetWarningPercent || 80));
      return <div key={b.id} data-sort-id={b.id} className={`bgt-card is-${s.tone} is-clickable`} style={{ ...identityStyle(color), animationDelay: `${Math.min(index, 8) * 30}ms` } as CSSProperties} role="button" tabIndex={0} aria-label={`Buka rincian anggaran ${b.name}`} onClick={e => { if (!(e.target as Element).closest('button,a,details,summary,input')) setDetail(b.id); }} onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setDetail(b.id); } }}>
        <div className="bgt-card-top">
          {sortMode === 'manual' && data.budgets.length > 1 && <ReorderHandle id={b.id} onMove={move}/>}
          <Ring used={s.used} committed={s.planned} icon={cat?.icon} color={color}/>
          <div className="bgt-card-title"><strong>{b.name}</strong><small>{periodText(b, salaryDay)}{scope ? ` · ${scope}` : ''}</small></div>
          <span className={`bgt-status is-${s.tone}`}>{s.saving && s.used >= 1 ? 'Tercapai' : toneText[s.tone]}</span>
        </div>
        <div className="bgt-card-amount">
          <span><small>{s.saving ? 'Sisa target periode ini' : s.left < 0 ? 'Lewat dari batas' : 'Masih bisa dipakai'}</small><strong className={s.left < 0 && !s.saving ? 'amount-negative' : ''}>{rupiah(s.left)}</strong></span>
          <span className="bgt-card-limit"><small>Batas</small><b>{rupiah(s.status.available)}</b></span>
        </div>
        <div className="bgt-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(100, (s.used + s.planned) * 100))} aria-label={`${b.name} terpakai`}>
          <i className="used" style={{ width: `${usedPct}%` }}/><i className="plan" style={{ width: `${planPct}%` }}/>{!s.saving && warnPct < 100 && <b className="warn-mark" style={{ left: `${warnPct}%` }} title={`Tanda peringatan ${warnPct}%`}/>}
        </div>
        <div className="bgt-card-foot">
          <span>Terpakai <b>{short(s.status.spent)}</b></span>
          {s.committed > 0 && <span>Rencana <b>{short(s.committed)}</b></span>}
          {s.perDay > 0 ? <span className="bgt-per-day">±{short(s.perDay)}/hari</span> : <span className="bgt-per-day"/>}
          <ChevronRight size={16} className="bgt-chevron" aria-hidden="true"/>
        </div>
      </div>;
    })}</div>

    {!data.budgets.length && <section className="bgt-empty">
      <span className="bgt-empty-icon"><Target size={26}/></span>
      <strong>Belum ada anggaran</strong>
      <p>Buat batas belanja untuk kategori yang ingin dijaga, misalnya Makan & Minum atau Hiburan. Bisa untuk seluruh kategori atau beberapa subkategori saja.</p>
      <Button onClick={() => edit()}><Plus size={16}/> Buat anggaran pertama</Button>
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}

    <BudgetDetail budget={data.budgets.find(b => b.id === detail) || null} onClose={() => setDetail(null)} navigate={navigate} openTx={openTx} onEdit={b => { setDetail(null); edit(b); }} onToggle={b => { if (user) track(saveRecord(user.uid, 'budgets', { active: !b.active }, b.id), { pending: 'Menyimpan…', success: b.active ? 'Anggaran dijeda.' : 'Anggaran diaktifkan.', failure: 'Belum tersimpan', quiet: true }); }} onCopy={b => { setDetail(null); if (user) track(saveRecord(user.uid, 'budgets', { ...b, name: b.name + ' (salinan)', active: false, createdDate: today.toLocaleDateString('en-CA'), lastSettledStart: budgetWindow(b, today, salaryDay).start, rolloverCarry: 0 }), { pending: 'Menyalin…', success: 'Anggaran disalin dalam keadaan jeda.', failure: 'Belum tersalin' }); }} onDelete={b => { setDetail(null); if (user) { const uid = user.uid; undo.remove(b.id, 'Anggaran', () => archiveOrDelete(uid, 'budgets', b.id, data)); } }}/>

    <Dialog open={open} onOpenChange={setOpen}><DialogContent title={editing ? 'Ubah anggaran' : 'Anggaran baru'}><form className="form-stack bgt-form" onSubmit={submit}>
      <Field label="Kategori"><Select required value={category} onChange={e => pickCategory(e.target.value)}><option value="">Pilih kategori</option>{parents.map(c => <option value={c.id} key={c.id}>{emojiOrFallback(c.icon)} {c.name}</option>)}</Select></Field>
      {category && children.length > 0 && <div className="bgt-subs">
        <span className="bgt-subs-label" id="bgt-subs-label">Subkategori yang dihitung</span>
        <button type="button" className={`bgt-sub-select ${subsOpen ? 'is-open' : ''}`} aria-expanded={subsOpen} aria-controls="bgt-sub-list" aria-labelledby="bgt-subs-label bgt-sub-value" onClick={() => setSubsOpen(o => !o)}>
          <span className="bgt-sub-value" id="bgt-sub-value">{chosenNames.length ? chosenNames.length > 2 ? `${chosenNames.slice(0, 2).join(', ')} +${chosenNames.length - 2}` : chosenNames.join(', ') : 'Semua subkategori'}</span>
          {subs.length > 0 && <b className="bgt-sub-count" aria-hidden="true">{subs.length}</b>}
          <ChevronDown size={18} className="bgt-sub-chevron" aria-hidden="true"/>
        </button>
        {subsOpen && <div className="bgt-sub-list" id="bgt-sub-list" role="group" aria-label="Pilih subkategori">
          <label className={`bgt-sub-option is-all ${!subs.length ? 'is-on' : ''}`}><input type="checkbox" checked={!subs.length} onChange={() => { setSubs([]); if (!nameTouched) setName(autoName(category, [])); }}/><span>Semua subkategori</span></label>
          {children.map(c => { const on = subs.includes(c.id); return <label key={c.id} className={`bgt-sub-option ${on ? 'is-on' : ''}`}><input type="checkbox" checked={on} onChange={() => toggleSub(c.id)}/><span className="bgt-sub-emoji"><AppIcon icon={c.icon} fallback="•"/></span><span>{c.name}</span></label>; })}
          <button type="button" className="link-button bgt-sub-done" onClick={() => setSubsOpen(false)}><Check size={14}/> Selesai</button>
        </div>}
        <small className="muted">{subs.length ? `Hanya ${subs.length} subkategori terpilih yang dihitung.` : 'Seluruh pengeluaran kategori ini dihitung, termasuk semua subkategorinya.'} Pilih satu atau beberapa untuk membatasi.</small>
        {overlaps.length > 0 && <small className="bgt-overlap">Sebagian pengeluaran ini juga dihitung di anggaran {overlaps.map(n => `“${n}”`).join(', ')}.</small>}
      </div>}
      <div className="form-grid">
        <Field label="Nama"><Input required value={name} onChange={e => { setName(e.target.value); setNameTouched(true); }} placeholder="Contoh: Makan siang kantor"/></Field>
        <Field label="Batas per periode"><Money value={amount} onChange={setAmount} required/></Field>
        <Field label="Periode"><Select value={period} onChange={e => { const next = e.target.value as Budget['cycleType']; setPeriod(next); if (next === 'weekly' && (day < 1 || day > 7)) setDay(1); if (next === 'custom' && editing?.cycleType === 'weekly') setDay(salaryDay); }}><option value="salary">Siklus gaji</option><option value="calendar">Bulan ini</option><option value="custom">Mulai tanggal tertentu</option><option value="weekly">Mingguan</option></Select></Field>
        {period === 'custom' && <Field label="Tanggal mulai"><Input type="number" min={1} max={31} value={day} onChange={e => setDay(Number(e.target.value))}/></Field>}
        {period === 'weekly' && <Field label="Minggu dimulai hari"><Select value={String(Math.min(7, Math.max(1, day)))} onChange={e => setDay(Number(e.target.value))}>{weekdays.map((w, i) => <option key={w} value={i + 1}>{w}</option>)}</Select></Field>}
      </div>
      <details className="disclosure"><summary>Pengaturan tambahan</summary><div className="form-grid"><Field label="Jenis anggaran"><Select value={classification} onChange={e => setClassification(e.target.value as Budget['classification'])}><option value="living">Kebutuhan</option><option value="fixed">Tagihan tetap</option><option value="sinking">Tujuan dana</option><option value="savings">Tabungan</option></Select></Field><Field label="Ingatkan saat terpakai (%)"><Input type="number" min={1} max={100} value={warning} onChange={e => setWarning(Number(e.target.value))}/></Field><Field label="Catatan"><Input value={notes} onChange={e => setNotes(e.target.value)}/></Field><label className="check-row"><input type="checkbox" checked={rollover} onChange={e => setRollover(e.target.checked)}/> Sisa dibawa ke periode berikutnya</label><label className="check-row"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)}/> Aktif</label></div></details>
      {error && <p className="form-error" role="alert">{error}</p>}
      <FormActions saving={busy} onCancel={() => setOpen(false)}/>
    </form></DialogContent></Dialog>
  </div>;
}
