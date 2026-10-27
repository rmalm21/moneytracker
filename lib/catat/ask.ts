/**
 * Catat otomatis 6.0 — Tanya: questions about one's own money, answered on the device from the person's own ledger.
 *
 *   "berapa pengeluaranku bulan ini"        → spend   · this calendar month
 *   "bensin bulan lalu habis berapa"        → spend   · Bensin (category) · last month
 *   "jajan minggu ini udah berapa"          → spend   · entries that say "jajan" · this week
 *   "saldo gopay berapa" / "total saldo"    → balance
 *   "sisa anggaran makan"                   → budget  · the budget's own period
 *   "kapan terakhir isi bensin"             → last
 *   "berapa kali ngopi bulan ini"           → count
 *   "pengeluaran terbesar bulan ini"        → top     (a transaction; "kategori apa" → a category)
 *   "rata-rata makan sehari"                → average (per day, or per entry: "sekali")
 *   "bulan ini lebih boros dari bulan lalu" → compare (the same number of days of the period before)
 *
 * A question is read in three parts: what is asked (the intent), the period, and what it is about (a category, a place,
 * a wallet or a word of the notes). Numbers come from the same formulas as Laporan and Anggaran (lib/accounting.ts).
 * Nothing is guessed: a word that is not clearly one of the person's categories is looked up in the notes, and when
 * nothing matches the answer says so instead of borrowing a wider category. Read only: nothing is written.
 * No period → this salary cycle, the period Beranda shows. Every answer names its dates and opens its transactions.
 */
import { budgetCurrent, budgetMatcher, countedBudgets, expenseAllocations, salaryCycle, transactionExpense, transactionIncome } from '../accounting.ts';
import { suggestCategory } from '../categorize.ts';
import { findAmounts, knownPlaces, walletsIn, type QuickContext } from '../quick-entry.ts';
import type { Budget, Category, LedgerTx } from '../types';

export type AskIntent = 'spend' | 'income' | 'balance' | 'budget' | 'last' | 'count' | 'top' | 'average' | 'compare' | 'owed' | 'unknown';
/** What an answer is built from, for the card and the benchmark. Dates are ISO, `end` exclusive. */
export type AskMeta = {
  intent: AskIntent; total?: number; count?: number; date?: string; start?: string; end?: string; compare?: number; label?: string;
  /** The period in words ("bulan ini · 1–31 Okt") and what was counted ("kategori Bensin", "catatan berisi “jajan”"). */
  period?: string; basis?: string;
  /** The same kind of period just before, for "Rp… minggu lalu". */
  before?: { label: string; total: number };
  /** Transaksi filter that shows exactly what was counted (kind:value@start..end). */
  focus?: string;
};
export type AskData = { transactions: LedgerTx[]; wallets: { id: string; name: string; isArchived?: boolean; cachedBalance: number }[]; budgets: Budget[] };
export type AskAnswer = { question: string; answer: string; lines: { label: string; amount: number }[]; total?: number; ask: AskMeta };

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const rp = (n: number) => `${n < 0 ? '-' : ''}Rp${Math.abs(Math.round(n)).toLocaleString('id-ID')}`;
const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, word: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc(word)}(?![\\p{L}\\p{N}])`, 'u').test(text);
const cut = (text: string, word: string) => text.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${esc(word)}(?![\\p{L}\\p{N}])`, 'u'), '$1 ');

// ——— Dates (ISO strings, UTC arithmetic) ———
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const days = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);
const monthOf = (y: number, m: number) => { const s = new Date(Date.UTC(y, m, 1)); return [isoOf(s), isoOf(new Date(Date.UTC(y, m + 1, 1)))]; };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTHS = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
const SHORT: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, agu: 7, agt: 7, ags: 7, sep: 8, sept: 8, okt: 9, nov: 10, des: 11 };
const dm = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]}`; };
/** "1–31 Okt", "25 Sep–24 Okt", "15 Okt" (end exclusive). */
const span = (start: string, end: string) => {
  const last = addDays(end, -1);
  if (last === start) return dm(start);
  return start.slice(0, 7) === last.slice(0, 7) ? `${Number(start.slice(8))}–${dm(last)}` : `${dm(start)}–${dm(last)}`;
};
const ago = (date: string, today: string) => { const n = days(date, today); return n <= 0 ? 'hari ini' : n === 1 ? 'kemarin' : `${n} hari lalu`; };

type Period = { start: string; end: string; label: string; prev?: { start: string; end: string; label: string }; said: string };

/** The period a question names, or null. `said` is the matched phrase (taken out before reading the subject). */
export function readPeriod(text: string, today: string, salaryDay = 24): Period | null {
  const t = ` ${text} `;
  const [y, m] = today.split('-').map(Number);
  const cycleAt = (iso: string) => { const [yy, mm, dd] = iso.split('-').map(Number); return salaryCycle(new Date(yy, mm - 1, dd, 12), salaryDay); };
  const month = (yy: number, mm: number, label: string, said: string): Period => {
    const [start, end] = monthOf(yy, mm), [ps, pe] = monthOf(yy, mm - 1);
    return { start, end, label, said, prev: { start: ps, end: pe, label: MONTHS[(mm + 11) % 12].replace(/^./, c => c.toUpperCase()) } };
  };
  let r: RegExpMatchArray | null;
  if ((r = t.match(/\b(\d{1,3})\s*hari\s*(?:terakhir|belakangan|ke ?belakang)\b/)) || (r = t.match(/\b(se(?:minggu|pekan|bulan))\s*(?:terakhir|belakangan|ke ?belakang)\b/))) {
    const n = /^\d/.test(r[1]) ? Number(r[1]) : /bulan/.test(r[1]) ? 30 : 7, start = addDays(today, 1 - n), end = addDays(today, 1);
    return { start, end, label: `${n} hari terakhir`, said: r[0], prev: { start: addDays(start, -n), end: start, label: `${n} hari sebelumnya` } };
  }
  if ((r = t.match(/\b(?:minggu|pekan)\s+(?:lalu|kemarin|kemaren|kmrn|kemarin)\b/))) {
    const start = addDays(today, -((D(today).getUTCDay() + 6) % 7) - 7);
    return { start, end: addDays(start, 7), label: 'minggu lalu', said: r[0], prev: { start: addDays(start, -7), end: start, label: '2 minggu lalu' } };
  }
  if ((r = t.match(/\b(?:minggu|pekan)\s+ini\b/))) {
    const start = addDays(today, -((D(today).getUTCDay() + 6) % 7));
    return { start, end: addDays(start, 7), label: 'minggu ini', said: r[0], prev: { start: addDays(start, -7), end: start, label: 'minggu lalu' } };
  }
  if ((r = t.match(/\b(?:siklus|periode)\s+(?:lalu|kemarin|sebelumnya)\b|\bgajian\s+lalu\b/))) {
    const cur = cycleAt(today), c = cycleAt(addDays(cur.start, -1)), p = cycleAt(addDays(c.start, -1));
    return { start: c.start, end: c.end, label: 'siklus lalu', said: r[0], prev: { start: p.start, end: p.end, label: 'siklus sebelumnya' } };
  }
  if ((r = t.match(/\b(?:siklus|periode)\s+ini\b|\bsejak\s+gajian\b|\bgajian\s+ini\b/))) {
    const c = cycleAt(today), p = cycleAt(addDays(c.start, -1));
    return { start: c.start, end: c.end, label: 'siklus ini', said: r[0], prev: { start: p.start, end: p.end, label: 'siklus lalu' } };
  }
  if ((r = t.match(/\bbulan\s+(?:lalu|kemarin|kemaren|kmrn|sebelumnya)\b/))) return month(m === 1 ? y - 1 : y, (m + 10) % 12, 'bulan lalu', r[0]);
  if ((r = t.match(/\bbulan\s+ini\b/))) return month(y, m - 1, 'bulan ini', r[0]);
  if ((r = t.match(/\btahun\s+(ini|lalu|kemarin)\b/))) {
    const yy = r[1] === 'ini' ? y : y - 1;
    return { start: `${yy}-01-01`, end: `${yy + 1}-01-01`, label: r[1] === 'ini' ? 'tahun ini' : 'tahun lalu', said: r[0], prev: { start: `${yy - 1}-01-01`, end: `${yy}-01-01`, label: `${yy - 1}` } };
  }
  if ((r = t.match(new RegExp(`\\b(?:bulan\\s+)?(${MONTHS.join('|')})(?:\\s+(\\d{4}))?\\b`))) || (r = t.match(new RegExp(`\\bbulan\\s+(${Object.keys(SHORT).join('|')})(?:\\s+(\\d{4}))?\\b`)))) {
    const mm = MONTHS.includes(r[1]) ? MONTHS.indexOf(r[1]) : SHORT[r[1]], yy = r[2] ? Number(r[2]) : mm > m - 1 ? y - 1 : y;
    const name = MONTHS[mm].replace(/^./, c => c.toUpperCase());
    return month(yy, mm, `${name}${yy !== y ? ` ${yy}` : ''}`, r[0]);
  }
  if ((r = t.match(/\b(?:kemarin\s+lusa|kemaren\s+lusa|kmrn\s+lusa)\b/))) { const d = addDays(today, -2); return { start: d, end: addDays(d, 1), label: 'kemarin lusa', said: r[0] }; }
  if ((r = t.match(/\b(?:kemarin|kemaren|kmrn|kmarin)\b/))) { const d = addDays(today, -1); return { start: d, end: today, label: 'kemarin', said: r[0], prev: { start: addDays(d, -1), end: d, label: 'kemarin lusa' } }; }
  if ((r = t.match(/\b(?:hari\s+ini|hr\s+ini|tadi|barusan|td)\b/))) return { start: today, end: addDays(today, 1), label: 'hari ini', said: r[0], prev: { start: addDays(today, -1), end: today, label: 'kemarin' } };
  return null;
}

// ——— What is asked ———
const QUESTION = /\b(?:berapa|brp|brapa|kapan|gimana|bagaimana|apakah|apa|mana)\b|\?\s*$/;
const LEAD = /^(?:sisa\s+(?:anggaran|budget|bujet|saldo)|saldo\b|total\s+(?:pengeluaran|pemasukan|saldo|uang|duit)|rata-?rata|rata2|rerata)|^(?:pengeluaran|pemasukan)\p{L}*\b.*\b(?:terbesar|tergede|termahal|paling)\b/u;
const SPEND_CUE = /\b(?:pengeluaran\p{L}*|keluar|keluarin|habis|abis|kepake|kepakai|terpakai|belanja|bayar|beli|jajan|boros|spend|spending|biaya|ongkos)\b/u;
function intentOf(t: string): Exclude<AskIntent, 'owed'> {
  if (/\b(?:dibanding(?:kan|in)?|banding(?:in)?|vs|versus|lebih\s+(?:boros|hemat|banyak|sedikit|gede|besar|kecil))\b/.test(t)) return 'compare';
  if (/\bkapan\b/.test(t)) return 'last';
  if (/\b(?:berapa|brp|brapa)\s*(?:kali|x)\b/.test(t)) return 'count';
  if (/\b(?:rata-?rata|rata2|rerata)\b/.test(t)) return 'average';
  if (/\b(?:anggaran|budget|bujet)\b/.test(t)) return 'budget';
  if (/\b(?:terbesar|tergede|termahal|paling\s+(?:gede|besar|boros|mahal|banyak))\b/.test(t)) return 'top';
  if (/\b(?:saldo|isi\s+dompet)\b|\b(?:uang|duit)(?:ku|\s+ku)?\s+(?:di|yang\s+ada)\b|\btotal\s+(?:uang|duit)\b/.test(t) && !SPEND_CUE.test(t)) return 'balance';
  if (/\b(?:pemasukan\p{L}*|pendapatan\p{L}*|penghasilan\p{L}*|gaji|gajian|income|dapat|dapet|diterima|masuk)\b/u.test(t) && !/\b(?:pengeluaran\p{L}*|keluar|habis|abis)\b/u.test(t)) return 'income';
  return 'spend';
}

// ——— What it is about ———
const STOP = new Set(`berapa brp brapa kali kapan terakhir terakhirnya pernah gimana bagaimana apakah apa mana sih ya yah dong deh aja saja kok nih
udah sudah total jumlah semua semuanya aku saya gue gw ku punya ini itu buat untuk utk di ke dari pakai pake via lewat yang yg sama dan dengan
habis abis keluar keluarin kepake kepakai terpakai pengeluaran spend spending duit uang biaya ongkos rp sekarang tadi bulan minggu pekan hari tahun
siklus periode lalu kemarin sebelumnya paling terbesar tergede termahal gede besar boros mahal banyak rata rata-rata rata2 rerata sehari per tiap
sekali harian kategori dibanding dibandingkan dibandingin banding vs versus lebih hemat sedikit kecil sisa anggaran budget bujet saldo dompet isi masih
tinggal pemasukan pendapatan penghasilan masuk dapat dapet diterima income bayar beli catat dicatat transaksi sih kah`.split(/\s+/));
type Subject = { walletId?: string; walletName?: string; merchant?: string; text?: string; category?: { id: string; name: string } };

function catalog(ctx: QuickContext, flow: 'expense' | 'income') { return ctx.categories.filter(c => c.type === flow && !c.isArchived); }
/** A category the person named: the whole name ("nongkrong" → Nongkrong), then a word of it ("hiburan" → Nongkrong & Hiburan). */
function namedCategory(word: string, ctx: QuickContext, flow: 'expense' | 'income') {
  const cats = catalog(ctx, flow), parts = (c: { name: string }) => lower(c.name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return cats.find(c => lower(c.name) === word) || cats.find(c => !c.parentId && parts(c).includes(word)) || cats.find(c => parts(c).includes(word))
    || (word.length >= 5 ? cats.find(c => parts(c).some(p => p.startsWith(word))) : undefined);
}
const noteOf = (t: LedgerTx) => lower(`${t.description || ''} ${t.merchant || ''}`);

function subjectOf(text: string, ctx: QuickContext, data: AskData, flow: 'expense' | 'income', intent: AskIntent): { subject: Subject; leftover: boolean } {
  let rest = ` ${text} `;
  const subject: Subject = {};
  const w = walletsIn(rest, ctx.wallets)[0];
  if (w) { subject.walletId = w.id; subject.walletName = w.name; rest = cut(rest, w.word); }
  const places = [...knownPlaces(ctx)].filter(([k]) => k.length >= 3).sort((a, b) => b[0].length - a[0].length);
  for (const [key, name] of places) if (has(rest, key)) { subject.merchant = name; rest = cut(rest, key); break; }
  if (intent === 'balance') return { subject, leftover: false };
  const words = rest.split(/[^\p{L}\p{N}-]+/u).map(x => x.replace(/(?:ku|nya)$/u, m => (STOP.has(x) ? m : ''))).filter(x => x.length >= 3 && !STOP.has(x) && !/^\d/.test(x));
  if (!words.length) return { subject, leftover: false };
  const pool = data.transactions.filter(t => (flow === 'expense' ? transactionExpense(t) > 0 : transactionIncome(t) > 0));
  const phrase = words.join(' ');
  if (words.length >= 2 && pool.some(t => has(noteOf(t), phrase))) { subject.text = phrase; return { subject, leftover: false }; }
  for (const word of words) {
    const named = namedCategory(word, ctx, flow);
    if (named) { subject.category = { id: named.id, name: named.name }; return { subject, leftover: false }; }
    if (pool.some(t => has(noteOf(t), word))) { subject.text = word; return { subject, leftover: false }; }
    // A concept word ("ngopi" → Minuman) only when it lands on a specific subcategory; a wider category would answer
    // a different question ("listrik" is not all of Tagihan).
    const guess = suggestCategory({ text: word, item: word, amount: 0, type: flow }, ctx);
    if (guess?.subcategoryId && guess.score >= 0.5) { const c = ctx.categories.find(x => x.id === guess.subcategoryId); if (c) { subject.category = { id: c.id, name: c.name }; return { subject, leftover: false }; } }
  }
  subject.text = words[0];
  return { subject, leftover: true };
}

/** The money of one transaction that the subject covers (category lines for spending), 0 when it does not match. */
function amountFor(t: LedgerTx, s: Subject, flow: 'expense' | 'income') {
  if (s.walletId && t.walletId !== s.walletId) return 0;
  if (s.merchant && !lower(t.merchant || '').includes(lower(s.merchant))) return 0;
  if (s.text && !has(noteOf(t), s.text)) return 0;
  if (flow === 'income') return s.category && t.categoryId !== s.category.id && t.subcategoryId !== s.category.id ? 0 : transactionIncome(t);
  if (!s.category) return transactionExpense(t);
  const id = s.category.id;
  return expenseAllocations(t).filter(l => l.categoryId === id || l.subcategoryId === id).reduce((n, l) => n + l.amount, 0);
}
const basisOf = (s: Subject) => [s.category ? `kategori ${s.category.name}` : '', s.text ? `catatan berisi “${s.text}”` : '', s.merchant ? `di ${s.merchant}` : '', s.walletName ? `pakai ${s.walletName}` : ''].filter(Boolean).join(' · ');
const nameOf = (s: Subject) => s.category?.name || (s.text ? `“${s.text}”` : '') || s.merchant || '';
/** The Transaksi filter that shows exactly the entries counted. */
function focusOf(s: Subject, ids: string[], flow: 'expense' | 'income', start?: string, end?: string) {
  const range = start && end ? `@${start}..${end}` : '';
  const parts = [s.category, s.text || s.merchant, s.walletId].filter(Boolean).length;
  if (parts > 1) return ids.length ? `tx:${ids.join(',')}${range}` : undefined;
  if (s.category) return `category:${s.category.id}${range}`;
  if (s.text || s.merchant) return `search:${s.text || lower(s.merchant!)}${range}`;
  if (s.walletId) return `wallet:${s.walletId}${range}`;
  return `type:${flow}${range}`;
}

/**
 * Answers a question about the person's own money from QuickContext.ask, or null when the sentence is not such a
 * question (or there is no ledger to answer from). `text` is the normalized message.
 */
export function askMoney(text: string, ctx: QuickContext): AskAnswer | null {
  const data = ctx.ask;
  const t = text.trim().replace(/[.!]+$/, '');
  if (!data || !(QUESTION.test(t) || LEAD.test(t))) return null;
  // An amount with a unit is an entry ("saldo jago 1jt", "makan 30rb?").
  if (findAmounts(t).some(a => a.marked)) return null;
  // Prices of things, the time, small talk: not the person's money.
  if (/\b(?:harga|kurs|cuaca|jam berapa|kabar)\b/.test(t)) return null;
  const today = ctx.today, intent = intentOf(t);
  const flow: 'expense' | 'income' = intent === 'income' ? 'income' : 'expense';
  const period = readPeriod(t, today, ctx.salaryDay);
  const { subject, leftover } = subjectOf(period ? t.replace(period.said.trim(), ' ') : t, ctx, data, flow, intent);
  const named = Boolean(subject.category || subject.merchant || subject.walletId || subject.text && !leftover);
  // A spending question needs a money word, a period or something it is about ("berapa umurmu" is none of these).
  if ((intent === 'spend' || intent === 'count') && !SPEND_CUE.test(t) && !named && !period) return null;
  if (intent === 'spend' && !SPEND_CUE.test(t) && !named && !/\b(?:berapa|brp|brapa)\b/.test(t)) return null;

  const cycle = (() => { const [yy, mm, dd] = today.split('-').map(Number); return salaryCycle(new Date(yy, mm - 1, dd, 12), ctx.salaryDay || 24); })();
  const P = period || { start: cycle.start, end: cycle.end, label: 'siklus ini', said: '', prev: undefined };
  const periodText = `${P.label} · ${span(P.start, P.end)}`;
  const within = (x: LedgerTx, s: string, e: string) => x.date >= s && x.date < e;
  const rows = (s: string, e: string) => data.transactions.filter(x => within(x, s, e)).map(x => ({ tx: x, amount: amountFor(x, subject, flow) })).filter(r => r.amount > 0);
  const sum = (list: { amount: number }[]) => list.reduce((n, r) => n + r.amount, 0);
  const what = nameOf(subject), basis = basisOf(subject) || undefined;
  const answer = (sentence: string, ask: AskMeta, lines: { label: string; amount: number }[] = []): AskAnswer => ({ question: text, answer: sentence, lines, total: ask.total, ask: { basis, ...ask } });

  if (intent === 'balance') {
    const live = data.wallets.filter(x => !x.isArchived);
    if (subject.walletId) { const w = live.find(x => x.id === subject.walletId) || data.wallets.find(x => x.id === subject.walletId); if (w) return answer(`Saldo ${w.name} ${rp(w.cachedBalance)}.`, { intent, total: w.cachedBalance, label: w.name, focus: `wallet:${w.id}` }); }
    const total = live.reduce((n, x) => n + x.cachedBalance, 0);
    return answer(`Total saldo ${live.length} dompet ${rp(total)}.`, { intent, total, label: 'Semua dompet' }, [...live].sort((a, b) => b.cachedBalance - a.cachedBalance).map(x => ({ label: x.name, amount: x.cachedBalance })));
  }

  if (intent === 'budget') {
    const live = data.budgets.filter(b => b.active);
    const cats = ctx.categories as Category[], asOf = new Date(...(today.split('-').map(Number).map((v, i) => i === 1 ? v - 1 : v) as [number, number, number]), 12);
    const current = (b: Budget) => budgetCurrent(b, data.transactions, cats, asOf, ctx.salaryDay || 24);
    let chosen = live;
    if (subject.category) {
      const c = ctx.categories.find(x => x.id === subject.category!.id)!;
      chosen = live.filter(b => budgetMatcher(b, cats)(c.parentId || c.id, c.parentId ? c.id : null));
    } else if (subject.text) chosen = live.filter(b => lower(b.name).includes(subject.text!));
    if ((subject.category || subject.text) && !chosen.length) return answer(`Belum ada anggaran untuk ${what}.`, { intent, label: what });
    if (chosen.length === 1) {
      const b = chosen[0], c = current(b);
      const sentence = c.remaining >= 0 ? `Sisa anggaran ${b.name} ${rp(c.remaining)} dari ${rp(c.available)} (terpakai ${rp(c.spent)}).` : `Anggaran ${b.name} lewat ${rp(-c.remaining)} (terpakai ${rp(c.spent)} dari ${rp(c.available)}).`;
      return answer(sentence, { intent, total: c.remaining, label: b.name, period: `periode anggaran · ${span(c.start, c.end)}`, start: c.start, end: c.end, focus: `category:${b.subcategoryIds?.length === 1 ? b.subcategoryIds[0] : b.subcategoryId || b.categoryId}@${c.start}..${c.end}` }, [{ label: 'Terpakai', amount: c.spent }, { label: 'Anggaran', amount: c.available }]);
    }
    const counted = countedBudgets(chosen), all = counted.map(b => ({ b, c: current(b) }));
    const remaining = all.reduce((n, x) => n + x.c.remaining, 0);
    return answer(all.length ? `Sisa semua anggaran ${rp(remaining)}.` : 'Belum ada anggaran yang aktif.', { intent, total: remaining, label: 'Semua anggaran' }, all.map(x => ({ label: x.b.name, amount: x.c.remaining })));
  }

  if (intent === 'last') {
    const list = (period ? rows(P.start, P.end) : rows('0000-01-01', '9999-12-31')).sort((a, b) => b.tx.date.localeCompare(a.tx.date) || (b.tx.time || '').localeCompare(a.tx.time || ''));
    const hit = list[0];
    if (!hit) return answer(`Belum ada catatan ${what || 'pengeluaran'}${period ? ` ${P.label}` : ''}.`, { intent, label: what });
    const x = hit.tx, label = [x.description, x.merchant].filter(Boolean).filter((v, i, a) => a.findIndex(y => lower(y) === lower(v)) === i).join(' · ') || what;
    return answer(`Terakhir ${dm(x.date)} (${ago(x.date, today)}): ${label} ${rp(hit.amount)}.`, { intent, date: x.date, total: hit.amount, label, focus: `tx:${x.id}` });
  }

  const now = rows(P.start, P.end);
  const total = sum(now), ids = now.map(r => r.tx.id), focus = focusOf(subject, ids, flow, P.start, P.end);
  const subjectWords = `${what ? ` ${what}` : ''}${subject.merchant && what !== subject.merchant ? ` di ${subject.merchant}` : ''}${subject.walletName ? ` pakai ${subject.walletName}` : ''}`;

  if (intent === 'count') {
    return answer(now.length ? `${now.length} kali${subjectWords} ${P.label}, total ${rp(total)}.` : `Belum ada${subjectWords || ' pengeluaran'} ${P.label}.`, { intent, count: now.length, total, start: P.start, end: P.end, period: periodText, focus, label: what });
  }

  if (intent === 'top') {
    if (/\bkategori\b/.test(t)) {
      const by = new Map<string, number>();
      for (const r of now) for (const l of expenseAllocations(r.tx)) if (l.categoryId) by.set(l.categoryId, (by.get(l.categoryId) || 0) + l.amount);
      const ranked = [...by].sort((a, b) => b[1] - a[1]).map(([id, amount]) => ({ label: ctx.categories.find(c => c.id === id)?.name || 'Lainnya', amount, id }));
      if (!ranked.length) return answer(`Belum ada pengeluaran ${P.label}.`, { intent, start: P.start, end: P.end, period: periodText });
      return answer(`Paling besar ${P.label}: ${ranked[0].label} ${rp(ranked[0].amount)}.`, { intent, total: ranked[0].amount, label: ranked[0].label, start: P.start, end: P.end, period: periodText, focus: `category:${ranked[0].id}@${P.start}..${P.end}` }, ranked.slice(0, 4).map(({ label, amount }) => ({ label, amount })));
    }
    const ranked = [...now].sort((a, b) => b.amount - a.amount);
    if (!ranked.length) return answer(`Belum ada pengeluaran${subjectWords} ${P.label}.`, { intent, start: P.start, end: P.end, period: periodText });
    const name = (x: LedgerTx) => [x.description, x.merchant].filter(Boolean).filter((v, i, a) => a.findIndex(y => lower(y) === lower(v)) === i).join(' · ') || 'Pengeluaran';
    const best = ranked[0];
    return answer(`Paling besar ${P.label}: ${name(best.tx)} ${rp(best.amount)} (${dm(best.tx.date)}).`, { intent, total: best.amount, label: name(best.tx), date: best.tx.date, start: P.start, end: P.end, period: periodText, focus: `tx:${best.tx.id}` }, ranked.slice(0, 4).map(r => ({ label: `${name(r.tx)} · ${dm(r.tx.date)}`, amount: r.amount })));
  }

  if (intent === 'average') {
    const daily = /\b(?:sehari|per\s*hari|tiap\s+hari|harian)\b/.test(t);
    const elapsed = Math.max(1, days(P.start, P.end < addDays(today, 1) ? P.end : addDays(today, 1)));
    const value = daily ? Math.round(total / elapsed) : now.length ? Math.round(total / now.length) : 0;
    const sentence = !now.length ? `Belum ada${subjectWords || ' pengeluaran'} ${P.label}.` : daily ? `Rata-rata${subjectWords} ${rp(value)} sehari (${rp(total)} dalam ${elapsed} hari, ${P.label}).` : `Rata-rata${subjectWords} ${rp(value)} sekali (${now.length} kali, ${P.label}).`;
    return answer(sentence, { intent, total: value, count: now.length, start: P.start, end: P.end, period: periodText, focus, label: what });
  }

  if (intent === 'compare') {
    // The period being judged is the current one; "… dari bulan lalu" only names what it is compared with.
    const base = readPeriod(t.replace(/\b(?:minggu|pekan|bulan|siklus|periode|tahun)\s+(?:lalu|kemarin|kemaren|kmrn|sebelumnya)\b/g, ' '), today, ctx.salaryDay) || readPeriod('bulan ini', today, ctx.salaryDay)!;
    const cur = rows(base.start, base.end), curTotal = sum(cur);
    const length = days(base.start, base.end < addDays(today, 1) ? base.end : addDays(today, 1));
    const prevStart = base.prev?.start || addDays(base.start, -length), prevEnd = addDays(prevStart, length);
    const before = sum(rows(prevStart, prevEnd)), diff = curTotal - before;
    const word = flow === 'income' ? (diff >= 0 ? 'lebih banyak' : 'lebih sedikit') : diff > 0 ? 'lebih boros' : diff < 0 ? 'lebih hemat' : 'sama';
    const pct = before ? Math.round(Math.abs(diff) / before * 100) : 0;
    const sentence = diff === 0 ? `${base.label.replace(/^./, c => c.toUpperCase())} sama dengan ${base.prev?.label || 'sebelumnya'}: ${rp(curTotal)}.` : `${base.label.replace(/^./, c => c.toUpperCase())} ${word} ${rp(Math.abs(diff))}${pct ? ` (${pct}%)` : ''}: ${rp(curTotal)} vs ${rp(before)} di ${span(prevStart, prevEnd)}.`;
    return answer(sentence, { intent, total: curTotal, compare: before, start: base.start, end: base.end, period: `${base.label} · ${span(base.start, base.end)}`, before: { label: `${base.prev?.label || 'sebelumnya'} (${span(prevStart, prevEnd)})`, total: before }, focus: focusOf(subject, cur.map(r => r.tx.id), flow, base.start, base.end), label: what }, [{ label: base.label, amount: curTotal }, { label: `${base.prev?.label || 'sebelumnya'}, hari yang sama`, amount: before }]);
  }

  // spend / income: the total, a breakdown and the same kind of period just before.
  const prev = P.prev || (!period ? (() => { const [yy, mm, dd] = addDays(cycle.start, -1).split('-').map(Number); const c = salaryCycle(new Date(yy, mm - 1, dd, 12), ctx.salaryDay || 24); return { start: c.start, end: c.end, label: 'siklus lalu' }; })() : undefined);
  const before = prev ? { label: prev.label, total: sum(rows(prev.start, prev.end)) } : undefined;
  const lines: { label: string; amount: number }[] = [];
  if (now.length) {
    const by = new Map<string, number>();
    for (const r of now) {
      const key = subject.category || subject.text || subject.merchant
        ? [r.tx.description, r.tx.merchant].filter(Boolean)[0] || 'Lainnya'
        : ctx.categories.find(c => c.id === r.tx.categoryId)?.name || (flow === 'income' ? 'Pemasukan' : 'Tanpa kategori');
      by.set(key, (by.get(key) || 0) + r.amount);
    }
    lines.push(...[...by].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([label, amount]) => ({ label, amount })));
  }
  const noun = flow === 'income' ? 'Pemasukan' : 'Pengeluaran';
  const sentence = now.length
    ? `${noun}${subjectWords} ${P.label} ${rp(total)} dari ${now.length} transaksi.`
    : `Belum ada ${lower(noun)}${subjectWords} ${P.label}.`;
  return answer(sentence, { intent, total, count: now.length, start: P.start, end: P.end, period: periodText, before, focus, label: what }, lines);
}
