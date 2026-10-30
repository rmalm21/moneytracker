/**
 * 7.9 The suggestions above the message box: what fits this moment of the conversation, with a clear label.
 *
 * A suggestion either sends a message the assistant understands (`text`), or puts the start of one in the message box
 * for the person to finish (`fill`: "jadi " for another amount, "catatannya " for a note). What is suggested follows the
 * conversation (a card waiting to be saved, a question just answered, a calculation, a joke, venting) and, when nothing
 * is going on, the person's own data: the time of day, what they record most, a budget nearly used up, payday coming.
 */
import { budgetCurrent, countedBudgets } from '../accounting.ts';
import { readPeriod } from '../catat/ask.ts';
import { walletsIn } from '../quick-entry.ts';
import type { ChatContext, ChatMemory, ChatReply } from './engine.ts';

export type SuggestIcon = 'date' | 'wallet' | 'amount' | 'note' | 'category' | 'cancel' | 'undo' | 'record' | 'ask' | 'calc' | 'chart' | 'budget' | 'payday' | 'tips' | 'fun' | 'yes' | 'no' | 'help';
export type Suggestion = { label: string; text?: string; fill?: string; icon: SuggestIcon };

const lower = (s: string) => s.toLocaleLowerCase('id-ID');
const D = (iso: string) => new Date(`${iso}T00:00:00Z`);
const daysBetween = (a: string, b: string) => Math.round((D(b).getTime() - D(a).getTime()) / 86_400_000);
const shortRp = (n: number) => n >= 1e6 ? `${(Math.round(n / 1e5) / 10).toLocaleString('id-ID')}jt` : n >= 1e3 ? `${Math.round(n / 1e3)}rb` : String(Math.round(n));

/** Wallets the person pays with, most used first (only those that may pay: uang bebas). */
function payWallets(ctx: ChatContext, since: string) {
  const live = ctx.data.wallets.filter(w => !w.isArchived && !w.isDeleted && !w.isReserved && w.isSpendable !== false && w.canPay !== false);
  const used = new Map<string, number>();
  for (const t of ctx.data.transactions) if (t.date >= since && t.walletId) used.set(t.walletId, (used.get(t.walletId) || 0) + 1);
  return [...live].sort((a, b) => (used.get(b.id) || 0) - (used.get(a.id) || 0));
}
/** What this person records most lately ("kopi", "makan siang"), as they wrote it. */
function usualItem(ctx: ChatContext, since: string) {
  const count = new Map<string, number>();
  for (const t of ctx.data.transactions) {
    if (t.type !== 'expense' || t.date < since) continue;
    const d = lower((t.description || '').trim());
    if (d && d.length <= 18 && d.split(' ').length <= 2 && !/\d/.test(d)) count.set(d, (count.get(d) || 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= 2 ? top[0] : null;
}
const meal = (hour: number) => hour >= 5 && hour < 10 ? 'sarapan' : hour >= 11 && hour < 15 ? 'makan siang' : hour >= 18 && hour < 22 ? 'makan malam' : null;
const addDays = (iso: string, n: number) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** The card waiting to be saved: change its day, wallet, amount, note or category, or drop it. */
function forDraft(text: string, ctx: ChatContext): Suggestion[] {
  const t = lower(text), ins = ctx.inspect(text), kind = ins.kind || 'expense', out: Suggestion[] = [];
  const yesterday = /\b(?:kemarin|kemaren|kmrn|semalam|semalem)\b/.test(t);
  out.push(yesterday ? { label: 'Ganti ke hari ini', text: 'tanggalnya hari ini', icon: 'date' } : { label: 'Ganti ke kemarin', text: 'tanggalnya kemarin', icon: 'date' });
  if (kind === 'expense' || kind === 'income') {
    const named = new Set(walletsIn(t, ctx.quick.wallets).map(w => w.id));
    const wallets = kind === 'income' ? ctx.data.wallets.filter(w => !w.isArchived && !w.isDeleted && w.canReceive !== false) : payWallets(ctx, addDays(ctx.today, -60));
    for (const w of wallets.filter(w => !named.has(w.id)).slice(0, named.size ? 1 : 2)) out.push(kind === 'income' ? { label: `Masuk ke ${w.name}`, text: `masuk ${lower(w.name)}`, icon: 'wallet' } : { label: `Bayar pakai ${w.name}`, text: `pakai ${lower(w.name)}`, icon: 'wallet' });
  }
  out.push({ label: 'Ubah nominal…', fill: 'jadi ', icon: 'amount' });
  if (kind === 'expense' || kind === 'income') out.push({ label: 'Tambah catatan…', fill: 'catatannya ', icon: 'note' });
  if (kind === 'expense') out.push({ label: 'Ganti kategori…', fill: 'kategorinya ', icon: 'category' });
  out.push({ label: 'Nggak jadi', text: 'gak jadi', icon: 'cancel' });
  return out;
}

/** When nothing is going on: from the time of day and the person's own data. */
function idle(ctx: ChatContext): Suggestion[] {
  const out: Suggestion[] = [], hour = ctx.hour ?? 12, month = addDays(ctx.today, -30);
  const m = meal(hour), usual = usualItem(ctx, month);
  if (m) out.push({ label: `Catat ${m}…`, fill: `${m} `, icon: 'record' });
  if (usual && usual !== m) out.push({ label: `Catat ${usual} lagi…`, fill: `${usual} `, icon: 'record' });
  if (!m && !usual) out.push({ label: 'Catat pengeluaran…', fill: '', icon: 'record' });
  const asOf = new Date(`${ctx.today}T12:00:00`);
  const fullest = countedBudgets(ctx.data.budgets.filter(b => b.active)).map(b => { const c = budgetCurrent(b, ctx.data.transactions, ctx.data.categories, asOf, ctx.salaryDay); return { name: b.name, used: c.available > 0 ? c.spent / c.available : 0 }; }).sort((a, b) => b.used - a.used)[0];
  if (fullest && fullest.used >= 0.8) out.push({ label: `Anggaran ${fullest.name} ${Math.round(fullest.used * 100)}%`, text: 'cek semua anggaran', icon: 'budget' });
  const toPayday = daysBetween(ctx.today, ctx.cycle.end);
  if (toPayday >= 0 && toPayday <= 5) out.push({ label: toPayday ? `Gajian ${toPayday} hari lagi` : 'Gajian hari ini', text: 'kapan gajian?', icon: 'payday' });
  const spentToday = ctx.data.transactions.some(t => t.date === ctx.today && t.type === 'expense');
  out.push(spentToday && hour >= 15 ? { label: 'Pengeluaran hari ini', text: 'pengeluaran hari ini berapa', icon: 'chart' } : { label: 'Ringkasan bulan ini', text: 'ringkasan bulan ini', icon: 'chart' });
  if (ctx.data.receivables.some(r => (r.remainingAmount ?? 0) > 0)) out.push({ label: 'Siapa yang masih utang?', text: 'siapa yang masih utang ke aku?', icon: 'ask' });
  out.push({ label: 'Aman beli sesuatu?', fill: 'aman nggak beli ', icon: 'ask' });
  return out;
}

/**
 * The suggestions for now. `last` is the assistant's latest reply: what its own buttons already offer is not repeated.
 */
export function suggestFor(memory: ChatMemory, ctx: ChatContext, last?: ChatReply): Suggestion[] {
  let out: Suggestion[];
  if (memory.asking) out = [{ label: 'Nggak jadi', text: 'gak jadi', icon: 'cancel' }];
  else if (memory.offer) out = memory.offer === 'ajari aku'
    ? [{ label: 'Ajari kamu', text: 'ajari aku', icon: 'yes' }, { label: 'Kamu bisa apa aja?', text: 'bisa apa aja?', icon: 'help' }]
    : [{ label: 'Iya, boleh', text: 'boleh', icon: 'yes' }, { label: 'Nggak dulu', text: 'nggak dulu', icon: 'no' }];
  else if (memory.plan?.status === 'pending') out = forDraft(memory.plan.text, ctx);
  // 8.0 The assistant's riddle waits for a guess; the person's own riddle waits for them (nothing to suggest).
  else if (memory.riddle !== undefined) out = [{ label: 'Nyerah', text: 'nyerah', icon: 'no' }, { label: 'Kasih tau dong', text: 'kasih tau dong', icon: 'ask' }];
  else if (memory.userRiddle) out = [];
  // 8.1 A game waiting for a move; another quote, fact or challenge.
  else if (memory.game?.kind === 'suit') out = [{ label: '✊ Batu', text: 'batu', icon: 'fun' }, { label: '✌️ Gunting', text: 'gunting', icon: 'fun' }, { label: '✋ Kertas', text: 'kertas', icon: 'fun' }];
  else if (memory.game?.kind === 'angka') out = [3, 5, 7].map(n => ({ label: `Tebak ${n}`, text: String(n), icon: 'fun' as const }));
  else if (memory.topic === 'fun') out = [{ label: 'Lagi', text: 'lagi dong', icon: 'fun' }, { label: 'Tantangan hemat', text: 'kasih tantangan hemat', icon: 'tips' }, { label: 'Ramal keuanganku', text: 'ramal keuangan aku', icon: 'fun' }];
  else if (memory.topic === 'game') out = [{ label: 'Suit lagi', text: 'suit yuk', icon: 'fun' }, { label: 'Tebak angka', text: 'main tebak angka', icon: 'fun' }, { label: 'Lempar koin', text: 'lempar koin', icon: 'fun' }];
  else if (memory.topic === 'roast') out = [{ label: 'Kasih tips hemat', text: 'kasih tips hemat', icon: 'tips' }, { label: 'Pengeluaran terbesar', text: 'pengeluaran terbesar bulan ini', icon: 'chart' }, { label: 'Satu jokes buat hiburan', text: 'kasih jokes dong', icon: 'fun' }];
  else if (memory.topic === 'joke' || memory.topic === 'banter') out = [{ label: 'Satu lagi', text: 'lagi dong', icon: 'fun' }, { label: 'Jelasin lucunya', text: 'maksudnya?', icon: 'ask' }, { label: 'Udah, serius', text: 'udah ah serius', icon: 'no' }];
  else if (memory.topic === 'curhat') out = [{ label: 'Makasih udah dengerin', text: 'makasih udah dengerin', icon: 'yes' }, { label: 'Hibur aku', text: 'hibur aku', icon: 'fun' }, { label: 'Lihat kondisi uangku', text: 'ringkasan bulan ini', icon: 'chart' }];
  else if (memory.last === 'question' && memory.question) {
    const p = readPeriod(lower(memory.question), ctx.today, ctx.salaryDay)?.said.trim() || '';
    const other: [string, string][] = /bulan ini|siklus|periode/.test(p) || !p ? [['Bulan lalu berapa?', 'kalau bulan lalu?'], ['Minggu ini berapa?', 'kalau minggu ini?']]
      : /minggu ini/.test(p) ? [['Minggu lalu berapa?', 'kalau minggu lalu?'], ['Bulan ini berapa?', 'kalau bulan ini?']]
      : /hari ini/.test(p) ? [['Kemarin berapa?', 'kalau kemarin?'], ['Minggu ini berapa?', 'kalau minggu ini?']]
      : [['Bulan ini berapa?', 'kalau bulan ini?'], ['Bulan lalu berapa?', 'kalau bulan lalu?']];
    out = [...other.map(([label, text]) => ({ label, text, icon: 'date' as const })), { label: 'Ringkasan bulan ini', text: 'ringkasan bulan ini', icon: 'chart' }];
  } else if (memory.last === 'calc' && memory.number !== undefined) {
    const n = memory.number;
    out = [{ label: 'Bagi 2', text: 'kalau dibagi 2?', icon: 'calc' }, { label: 'Kali 12 (setahun)', text: 'kalau dikali 12?', icon: 'calc' }];
    if (n >= 500 && Number.isFinite(n)) out.push({ label: `Catat ${shortRp(n)}…`, fill: `${shortRp(n)} buat `, icon: 'record' });
  } else if (memory.topic === 'tips') out = [{ label: 'Tips lainnya', text: 'yang lain?', icon: 'tips' }, { label: 'Cek semua anggaran', text: 'cek semua anggaran', icon: 'budget' }, { label: 'Aman beli sesuatu?', fill: 'aman nggak beli ', icon: 'ask' }];
  else if (memory.plan?.status === 'saved' && memory.last === 'record') {
    const usual = usualItem(ctx, addDays(ctx.today, -30));
    out = [{ label: 'Batalkan yang tadi', text: 'batalin yang tadi', icon: 'undo' }, usual ? { label: `Catat ${usual} lagi…`, fill: `${usual} `, icon: 'record' } : { label: 'Catat lagi…', fill: '', icon: 'record' }, { label: 'Pengeluaran hari ini', text: 'pengeluaran hari ini berapa', icon: 'chart' }];
  } else out = idle(ctx);
  // Not twice what the latest reply already shows as its own buttons, and never the same suggestion twice.
  const shown = new Set((last?.chips || []).map(lower)), seen = new Set<string>();
  return out.filter(s => !(s.text && shown.has(lower(s.text))) && !seen.has(s.label) && seen.add(s.label)).slice(0, 6);
}
