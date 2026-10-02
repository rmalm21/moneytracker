/**
 * Insight V3 — Ask Insight: read-only questions about the user's own finances.
 *
 * Deterministic intent routing over the Insight report (no AI, no network). It only reads: it imports no save,
 * update, delete or batch function and receives no way to write (a test checks the source). Every answer lists the
 * signals or calculations it came from. A question it does not understand gets suggestions, never a made-up answer.
 * Catat otomatis writes records; Ask Insight never does.
 */
import { sum } from '../insight-v25/baseline.ts';
import { rp } from '../insight-v25/signals/common.ts';
import type { InsightSignal } from '../insight-v25/types.ts';
import { mainDriver } from '../insight-v25/signals/spending.ts';
import type { InsightV3Report } from './index.ts';

export type Intent = 'WHY_HEALTH_CHANGED' | 'WHAT_CHANGED' | 'SPENDING_DRIVER' | 'CATEGORY_DRIVER' | 'MERCHANT_DRIVER' | 'LIQUIDITY_EXPLAIN' | 'CLAIM_STATUS' | 'DEBT_STATUS' | 'RECEIVABLE_STATUS' | 'GOAL_PRESSURE' | 'INCOME_STABILITY' | 'PRICE_CHANGE' | 'CURRENT_PRIORITIES' | 'PRESSURE' | 'SCENARIO' | 'UNKNOWN';
export type Answer = { intent: Intent; title: string; lines: string[]; evidence: string[]; simulation?: boolean };
export const suggestedQuestions = ['Kenapa skor turun?', 'Apa yang paling berubah?', 'Kenapa uang tersedia turun?', 'Makan naik karena apa?', 'Klaim gue gimana?', 'Piutang gue berapa?', 'Apa yang paling menekan cashflow?', 'Kalau makan balik normal gimana?'];

const norm = (q: string) => q.toLocaleLowerCase('id-ID').replace(/[?!.,]/g, ' ').replace(/\s+/g, ' ').trim();
const lead = (s: InsightSignal) => s.headline || s.title;

export function classify(question: string, report: InsightV3Report): { intent: Intent; target?: string } {
  const q = norm(question), v25 = report.v25;
  if (/\b(kalau|kalo|jika|seandainya|gimana kalau|bagaimana jika|what if)\b/.test(q)) return { intent: 'SCENARIO' };
  if (/\b(skor|score|nilai kesehatan)\b/.test(q)) return { intent: 'WHY_HEALTH_CHANGED' };
  if (/\bpiutang\b|ngutang ke (gue|aku|saya)|berutang padaku|minjem ke (gue|aku)/.test(q)) return { intent: 'RECEIVABLE_STATUS' };
  if (/\b(klaim|claim|reimburse|reimbursement)\b/.test(q)) return { intent: 'CLAIM_STATUS' };
  if (/\b(utang|hutang|cicilan|pinjaman)\b/.test(q)) return { intent: 'DEBT_STATUS' };
  if (/\b(uang tersedia|uang bebas|saldo)\b/.test(q)) return { intent: 'LIQUIDITY_EXPLAIN' };
  if (/\b(menekan|tekanan|beban|terberat)\b/.test(q)) return { intent: 'PRESSURE' };
  if (/\b(prioritas|fokus|harus apa|penting)\b/.test(q)) return { intent: 'CURRENT_PRIORITIES' };
  if (/\b(target|tujuan dana|goal)\b/.test(q)) return { intent: 'GOAL_PRESSURE' };
  if (/\b(pemasukan|gaji|penghasilan|income)\b/.test(q)) return { intent: 'INCOME_STABILITY' };
  if (/\b(harga|mahal|inflasi)\b/.test(q)) return { intent: 'PRICE_CHANGE' };
  // A category or merchant named in the question.
  for (const c of v25.context.input.data.categories) { const name = c.name.toLocaleLowerCase('id-ID'); const word = name.split(/[\s&]+/)[0]; if (word.length >= 3 && new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(q)) return { intent: 'CATEGORY_DRIVER', target: c.parentId || c.id }; }
  const merchant = v25.signals.find(s => s.domain === 'merchant' && q.includes(s.title.split(' ')[0].toLocaleLowerCase('id-ID')));
  if (merchant) return { intent: 'MERCHANT_DRIVER', target: merchant.signature };
  if (/\b(berubah|beda|perubahan)\b/.test(q)) return { intent: 'WHAT_CHANGED' };
  if (/\b(pengeluaran|belanja|boros|keluar)\b/.test(q)) return { intent: 'SPENDING_DRIVER' };
  return { intent: 'UNKNOWN' };
}

export function ask(question: string, report: InsightV3Report): Answer {
  const { intent, target } = classify(question, report);
  const v25 = report.v25, w = report.world, sig = (s: string) => v25.signals.find(x => x.signature === s);
  const visible = v25.signals.filter(s => s.lifecycleState !== 'DISMISSED' && s.lifecycleState !== 'SNOOZED');
  switch (intent) {
    case 'WHY_HEALTH_CHANGED': {
      const d = v25.hero.delta;
      if (!d) return { intent, title: `Skor ${v25.hero.score}`, lines: ['Belum ada skor sebelumnya untuk dibandingkan. Perubahan muncul setelah Insight menyimpan skor di kunjungan berikutnya.', ...v25.advice.parts.slice().sort((a, b) => a.score - b.score).slice(0, 2).map(p => `Indikator terendah: ${p.label} (${p.value})`)], evidence: ['health:score'] };
      return { intent, title: `Skor ${d.delta >= 0 ? 'naik' : 'turun'} ${Math.abs(d.delta)} sejak ${d.previous.d.slice(8)}/${d.previous.d.slice(5, 7)}`, lines: d.rows.map(r => `${r.label}: ${r.change > 0 ? '+' : '−'}${Math.abs(r.change)} (${r.from} → ${r.to})`), evidence: ['health:score'] };
    }
    case 'WHAT_CHANGED': return v25.changed.length ? { intent, title: 'Yang paling berubah', lines: v25.changed.map(s => s.root.headline || s.title), evidence: v25.changed.map(s => s.signature) } : { intent, title: 'Tidak ada perubahan berarti', lines: ['Keuangan relatif stabil dibanding pola biasamu di titik siklus yang sama.'], evidence: [] };
    case 'CATEGORY_DRIVER': case 'SPENDING_DRIVER': case 'MERCHANT_DRIVER': {
      const s = intent === 'CATEGORY_DRIVER' ? sig(`spending:category:${target}`) : intent === 'MERCHANT_DRIVER' ? sig(target!) : visible.find(x => x.signature === 'cashflow:spending-pace') || v25.changed.find(st => st.root.domain === 'spending')?.root;
      if (!s) return { intent, title: 'Tidak ada perubahan berarti', lines: [intent === 'CATEGORY_DRIVER' ? `${v25.context.nameOf(target!)} masih dalam pola biasanya di titik siklus yang sama.` : 'Pengeluaran masih dalam pola biasanya.'], evidence: [] };
      const path = s.drivers[0] ? mainDriver(s.drivers[0]) : [];
      return { intent, title: s.title, lines: [s.summary, ...path.map(d => `${d.label}: ${d.delta >= 0 ? '+' : '−'}${rp(Math.abs(d.delta))}${d.count?.baseline ? ` · frekuensi ${d.frequencyEffect! >= 0 ? '+' : '−'}${rp(Math.abs(d.frequencyEffect!))}, nominal ${d.ticketEffect! >= 0 ? '+' : '−'}${rp(Math.abs(d.ticketEffect!))}` : ''}`), ...report.chain(s.signature).slice(0, 3).map(e => `→ ${e.note}`)], evidence: [s.signature] };
    }
    case 'LIQUIDITY_EXPLAIN': {
      const ctx = v25.context, cur = ctx.current;
      const byCat = new Map<string, number>(); for (const l of cur.lines.filter(l => l.tx.type === 'expense')) byCat.set(l.categoryId, (byCat.get(l.categoryId) || 0) + l.amount);
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1]), spent = sum(top.map(([, v]) => v));
      const saved = sum(cur.items.filter(t => t.type === 'fund_contribution').map(t => t.amount));
      return { intent, title: `Uang tersedia ${rp(w.liquidity.available)}`, lines: [
        `Sejak awal siklus: pemasukan +${rp(cur.income)}, pengeluaran −${rp(spent)}${saved ? `, disisihkan ke tujuan dana −${rp(saved)}` : ''}.`,
        ...top.slice(0, 3).map(([id, v]) => `${ctx.nameOf(id)} −${rp(v)}`), ...(top.length > 3 ? [`Lainnya −${rp(sum(top.slice(3).map(([, v]) => v)))}`] : []),
        `Uang bebas ${rp(w.liquidity.free)} − tagihan & rencana ${rp(w.liquidity.committed)}${w.liquidity.buffer ? ` − cadangan aman ${rp(w.liquidity.buffer)}` : ''} = uang tersedia ${rp(w.liquidity.available)}.`,
      ], evidence: ['world:liquidity', ...(visible.some(s => s.signature === 'liquidity:lowest') ? ['liquidity:lowest'] : [])] };
    }
    case 'CLAIM_STATUS': { const s = sig('claims:outstanding'); return s ? { intent, title: s.title, lines: [s.summary, ...s.evidence.map(e => `${e.label}: ${e.value}${e.note ? ` (${e.note})` : ''}`)], evidence: [s.signature, ...visible.filter(x => x.signature.startsWith('claims:aging:')).map(x => x.signature)] } : { intent, title: 'Tidak ada klaim yang belum cair', lines: ['Semua klaim kantor sudah cair atau belum ada yang dicatat.'], evidence: [] }; }
    case 'RECEIVABLE_STATUS': { const s = sig('receivable:outstanding'); return s ? { intent, title: s.title, lines: [s.summary, ...s.evidence.map(e => `${e.label}: ${e.value}${e.note ? ` (${e.note})` : ''}`)], evidence: [s.signature] } : { intent, title: 'Tidak ada piutang terbuka', lines: ['Tidak ada yang sedang berutang padamu.'], evidence: [] }; }
    case 'DEBT_STATUS': { const s = sig('debt:trajectory'); return { intent, title: `Sisa utang ${rp(w.obligations.debtOutstanding)}`, lines: [...(s ? [s.summary] : []), `Cicilan ${Math.round(v25.advice.summary.dsr * 100)}% dari pemasukan (ideal di bawah 30%).`], evidence: s ? [s.signature] : ['world:debt'] }; }
    case 'GOAL_PRESSURE': { const s = sig('goals:pressure'); return s ? { intent, title: s.title, lines: [s.summary, ...report.goalOptions.map(o => `${o.label}: ${o.detail}`)], evidence: [s.signature] } : { intent, title: 'Target dana masih tertampung', lines: [`${w.targets.length} target; kebutuhannya masih di bawah sisa uang biasanya atau belum bertenggat.`], evidence: [] }; }
    case 'INCOME_STABILITY': { const dep = sig('income:dependency') || report.extra.find(x => x.signature === 'income:dependency'); return { intent, title: `Pemasukan biasa ${rp(w.income.typical)}`, lines: [`Gaji tetap biasanya ${rp(w.income.regularTypical)}; batas aman ${rp(w.income.floor)}.`, `${Math.round(w.income.irregularShare * 100)}% pemasukan ${w.historicalCycles.length} siklus terakhir dari sumber tidak tetap.`, ...(dep ? [dep.summary] : [])], evidence: dep ? [dep.signature] : ['world:income'] }; }
    case 'PRICE_CHANGE': { const drift = visible.filter(s => s.domain === 'recurring' || s.domain === 'prices'); return { intent, title: drift.length ? 'Perubahan harga yang tercatat' : 'Belum ada perubahan harga yang cukup datanya', lines: drift.length ? drift.slice(0, 4).map(lead) : ['Harga langganan dan barang dari struk dibandingkan setelah minimal 3 pembelian di toko dan ukuran yang sama.'], evidence: drift.map(s => s.signature) }; }
    case 'CURRENT_PRIORITIES': return report.priority.length ? { intent, title: 'Prioritas sekarang', lines: report.priority.slice(0, 3).map((s, i) => `${i + 1}. ${s.root.headline || s.title}`), evidence: report.priority.slice(0, 3).map(s => s.signature) } : { intent, title: 'Tidak ada yang mendesak', lines: ['Keuangan relatif stabil.'], evidence: [] };
    case 'PRESSURE': { const main = report.mainPressure; return main.length ? { intent, title: `Tekanan utama: ${main.map(p => p.label).join(' & ')}`, lines: main.flatMap(p => p.reasons), evidence: main.map(p => p.signature || `pressure:${p.domain}`) } : { intent, title: 'Tidak ada tekanan berarti', lines: ['Likuiditas, anggaran, utang, dan kewajiban dalam batas aman.'], evidence: [] }; }
    case 'SCENARIO': {
      const q = norm(question);
      const cat = v25.context.input.data.categories.find(c => !c.parentId && q.includes(c.name.toLocaleLowerCase('id-ID').split(/[\s&]+/)[0]));
      const s = cat && sig(`spending:category:${cat.id}`);
      if (/klaim/.test(q)) { const a = report.scenarios.claimArrives, d = report.scenarios.claimDelayed; return { intent, simulation: true, title: 'Klaim cair vs tertunda', lines: [`Klaim cair sesuai riwayat: titik terendah ±${rp(a.lowest.balance)}, sebelum gajian ${rp(a.beforePayday)}.`, `Klaim tertunda: titik terendah ±${rp(d.lowest.balance)}, sebelum gajian ${rp(d.beforePayday)}.`], evidence: ['scenario:claims'] }; }
      if (s && (s.delta || 0) > 0) { const r = report.whatIf({ spendingReturnedToBaseline: { label: cat!.name, extraPerDay: (s.delta || 0) / Math.max(1, w.currentCycle.elapsed) } }); const b = report.scenarios.base; return { intent, simulation: true, title: `${cat!.name} kembali normal`, lines: [`Sekarang: sebelum gajian ${rp(b.beforePayday)}.`, `Bila ${cat!.name} kembali ke pola biasa: ${rp(r.beforePayday)}.`, `Selisih: +${rp(r.beforePayday - b.beforePayday)}. Ini simulasi, bukan kepastian.`], evidence: [s.signature, 'scenario:baseline'] }; }
      return { intent: 'UNKNOWN', title: 'Belum bisa dijawab', lines: ['Simulasi yang didukung: “kalau <kategori> balik normal”, “kalau klaim telat”. Skenario lain ada di Lab Skenario.'], evidence: [] };
    }
    default: return { intent: 'UNKNOWN', title: 'Pertanyaan ini belum bisa dijawab', lines: ['Insight hanya menjawab dari catatanmu sendiri dan tidak menebak. Coba salah satu pertanyaan ini:', ...suggestedQuestions.slice(0, 5)], evidence: [] };
  }
}
