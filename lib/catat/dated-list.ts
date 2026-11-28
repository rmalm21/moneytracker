/**
 * 10.7 Daftar bertanggal: several transactions typed or pasted one per line, grouped under date headers, often between
 * lines that only ask for something:
 *
 *   Tolong catat transaksi berikut:
 *   27 November 2026
 *   - Potong rambut … Rp60.000
 *   - Jajan … Rp7.000
 *   26 November 2026
 *   - Transfer ke rekening Mandiri sendiri Rp50.000 (mutasi antar dompet, bukan pengeluaran)
 *   Sesuaikan kategori masing-masing transaksi …
 *
 * Read as one sentence this went wrong: a date was taken as said once for everything (or stuck to the next item),
 * "26/11/2026" became an amount, a header ran into an item, and "Sesuaikan kategori …" made a new category. Here the
 * lines are sorted first: a header sets the date of the items under it, a line with an amount is one item (its bullet
 * taken off), a line without one only asks (or names the wallet for all: "Semua pakai GoPay"). Each item is then read
 * on its own by the usual reader with its group's date (lib/quick-plan.ts parseQuickPlan).
 */
import { amountWords, findAmounts, readDate, walletsIn } from '../quick-entry.ts';
import type { QuickContext } from '../quick-entry.ts';

export type ListItem = { text: string; line: number; date?: string; dateLabel?: string; wallet?: string };
export type DatedList = { items: ListItem[]; headers: { line: number; date: string; label: string }[]; asked: string[]; trace: string[] };

const BULLET = /^\s*(?:[-–—•·*▪◦●○►▸✓✔☐☑]\s*|\d{1,3}[.)]\s+|[a-z][.)]\s+)/iu;
const MONTHS = 'januari|februari|maret|april|mei|juni|juli|agustus|september|oktober|november|desember|jan|feb|mar|apr|jun|jul|agu|agt|aug|sep|sept|okt|oct|nov|des|dec|january|february|march|may|june|july|august|october|december';
const WEEKDAYS = 'senin|selasa|rabu|kamis|jumat|jum\'at|sabtu|minggu|ahad|sen|sel|rab|kam|jum|sab|min|monday|tuesday|wednesday|thursday|friday|saturday|sunday';
// What may stand around a date in a header line: day names, "tanggal", decorations.
const HEADER_REST = new RegExp(`\\b(?:${WEEKDAYS}|${MONTHS}|tanggal|tgl|tg|hari|ini|kemarin|kemaren|kmrn|kmarin|kemarinnya|lusa|besok|tadi|pada|transaksi|pengeluaran|catatan|date|day)\\b`, 'giu');
// A note in brackets that is meant for the reader, not for the record ("(mutasi antar dompet, bukan pengeluaran)").
const ASIDE = /\((?=[^)]*\b(?:bukan pengeluaran|bukan pemasukan|bukan belanja|mutasi|antar dompet|antar rekening|pindah dompet|pindah dana|pindah rekening|rekening sendiri|dompet sendiri|jangan dicatat|catatan untukmu)\b)[^)]*\)/giu;

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const MONTH_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };
/** Header spellings the usual date reader does not take: "22.11.2026", "Nov 21, 2026". */
function headerDate(line: string, today: string, salaryDay?: number): { date: string; label: string } | null {
  const dotted = line.match(/^\D*(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})\D*$/);
  if (dotted) { const y = dotted[3].length === 2 ? 2000 + Number(dotted[3]) : Number(dotted[3]), m = Number(dotted[2]), d = Number(dotted[1]); if (m >= 1 && m <= 12 && d >= 1 && d <= 31) { const date = iso(y, m, d); return { date, label: `${d} ${['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'][m - 1]} ${y}` }; } }
  const english = line.match(new RegExp(`\\b(${MONTHS})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'));
  if (english && !/^\d/.test(line.trim())) { const m = MONTH_NUM[english[1].toLowerCase().slice(0, 3)] || 0; if (m) { const y = english[3] ? Number(english[3]) : Number(today.slice(0, 4)); const label = `${Number(english[2])} ${['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'][m - 1]}${english[3] ? ` ${y}` : ''}`; const when = readDate(label, today, false, false, salaryDay); if (when) return { date: when.date, label }; } }
  const when = readDate(line, today, false, false, salaryDay);
  return when ? { date: when.date, label: when.label } : null;
}
/** A line that is only a date (and a day name, "tanggal", decorations): the header of the items under it. */
function asHeader(raw: string, today: string, salaryDay?: number) {
  const line = raw.toLocaleLowerCase('id-ID').replace(/[=#*_~|>`]+/g, ' ').replace(/\p{Extended_Pictographic}/gu, ' ').replace(/[:：]+\s*$/, '').trim();
  if (!line || line.length > 48) return null;
  const rest = line.replace(HEADER_REST, ' ').replace(/[\d/.\-,()[\]]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (rest) return null;
  return headerDate(line, today, salaryDay);
}

/**
 * The list, or null when the text is not one (a single sentence, or lines the usual reader already reads well). A list
 * needs at least two lines and either a date header, two bulleted items, or items under a line that only asks.
 */
export function readDatedList(input: string, ctx: Pick<QuickContext, 'today' | 'wallets' | 'salaryDay'>): DatedList | null {
  const lines = input.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const headers: DatedList['headers'] = [], asked: string[] = [], trace: string[] = [];
  const items: (ListItem & { group: number })[] = [], walletLines: { line: number; group: number; id: string }[] = [];
  const wallets = ctx.wallets.filter(w => !(w as { isArchived?: boolean }).isArchived);
  let bullets = 0, group = 0, current: { date: string; label: string } | null = null;
  lines.forEach((raw, index) => {
    const header = asHeader(raw.replace(BULLET, ''), ctx.today, ctx.salaryDay);
    if (header) { current = header; group++; headers.push({ line: index, ...header }); trace.push(`daftar: baris ${index + 1} judul tanggal ${header.date} (“${raw}”)`); return; }
    const bullet = BULLET.test(raw);
    const text = (bullet ? raw.replace(BULLET, '') : raw).replace(ASIDE, ' ').replace(/\s+/g, ' ').trim();
    const low = text.toLocaleLowerCase('id-ID');
    if (!findAmounts(amountWords(low)).some(a => a.value > 0)) {
      // "Semua pakai GoPay", "pakai mandiri ya": the wallet for the items that name none.
      const named = walletsIn(low, wallets);
      if (named.length === 1 && /\b(?:semua|semuanya|sisanya|pakai|pake|pkai|via|dari|bayar|dibayar|lewat)\b/i.test(low)) { walletLines.push({ line: index, group, id: named[0].id }); trace.push(`daftar: baris ${index + 1} dompet untuk semua (${named[0].name})`); }
      else { asked.push(raw); trace.push(`daftar: baris ${index + 1} hanya permintaan, tidak dicatat (“${raw}”)`); }
      return;
    }
    if (bullet) bullets++;
    const own = readDate(low, ctx.today, false, false, ctx.salaryDay);
    const at = current as { date: string; label: string } | null;
    items.push({ text, line: index, group, ...(own || !at ? {} : { date: at.date, dateLabel: at.label }) });
  });
  if (!items.length || !(headers.length || bullets >= 2 || asked.length && items.length >= 2)) return null;
  // A wallet named on its own line: for its group (before or after the items), or for all when it stands before the first
  // header or after the last item ("Semuanya pakai GoPay" at the end).
  const lastItem = items[items.length - 1].line;
  for (const item of items) {
    if (walletsIn(item.text.toLocaleLowerCase('id-ID'), wallets).length) continue;
    const own = walletLines.filter(w => w.group === item.group && w.group > 0);
    const shared = walletLines.filter(w => w.group === 0 || w.line > lastItem);
    const pick = own.filter(w => w.line < item.line).at(-1) || own.find(w => w.line > item.line) || shared.at(-1);
    if (pick) item.wallet = pick.id;
  }
  return { items: items.map(({ group: _group, ...item }) => item), headers, asked, trace };
}
