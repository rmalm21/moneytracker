/**
 * 8.5 Bank and e-wallet statements (mutasi) read on the device, for Perlu dikonfirmasi.
 *
 * A CSV or Excel export from internet/mobile banking or an e-wallet is read here, in the browser: nothing is uploaded.
 * The header row is found by its words (Tanggal, Keterangan, Debet, Kredit, Jumlah, Saldo…, in Indonesian or English),
 * dates and amounts are read in the ways banks write them ("01/10", "2026-10-01 14:22", "1 Okt 2026", "50,000.00 DB",
 * "1.250.000,00", "-25.000", "(10.000)"), and each row becomes a suggestion: a short name, the guessed category, and
 * whether it may already be recorded. Rows go to Perlu dikonfirmasi; nothing changes a balance until the person
 * confirms it.
 */
import { effects } from '../accounting.ts';
import { suggestCategory } from '../categorize.ts';
import { walletsIn } from '../quick-entry.ts';
import type { Category, Draft, LedgerTx, Recurring, TxType, Wallet } from '../types';
import { isOldExcel, isZip, readXlsx } from './xlsx.ts';

export type StatementRow = { line: number; date: string; description: string; amount: number; type: 'expense' | 'income'; unsure?: boolean; /** 8.6 The balance after this row, when the file shows it. */ balance?: number };
export type StatementRead = {
  rows: StatementRow[];
  /** The columns read, by their header text (for "Kolom yang dibaca: …"). */
  columns: { date: string; description: string[]; amount?: string; debit?: string; credit?: string; kind?: string };
  /** Rows left out and why (a total, an opening balance, no date). */
  skipped: number;
  /** Amounts with no sign or debit/credit column: read as spending, to check. */
  unsure: number;
  from?: string; to?: string;
  /** 8.6 The bank's own balances: at the start and end of the file, and whether the rows read add up from one to the
   * other (opening + money in − money out = closing), which tells that no row was missed. */
  balance?: { opening?: number; closing?: number; closingDate?: string; complete?: boolean };
};

/* ------------------------------------------------------------------ Reading the file */

/** Text from a file's bytes: UTF-8 (with or without BOM), UTF-16 with a BOM, else Windows-1252. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''); } catch { return new TextDecoder('windows-1252').decode(bytes); }
}

/** CSV, semicolon or tab separated text as rows (quotes kept around commas and line breaks). */
export function parseDelimited(text: string): string[][] {
  const sample = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 40);
  const score = (sep: string) => {
    const counts = sample.map(l => splitLine(l, sep).length).filter(n => n > 1);
    if (!counts.length) return 0;
    const common = counts.sort((a, b) => counts.filter(x => x === b).length - counts.filter(x => x === a).length)[0];
    return counts.filter(n => n === common).length * Math.min(common, 8);
  };
  const sep = [',', ';', '\t', '|'].map(s => [s, score(s)] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell.trim() === '') { quoted = true; cell = ''; } else if (ch === sep) { row.push(cell.trim()); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell.trim() || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows;
}
function splitLine(line: string, sep: string) {
  const out: string[] = []; let cell = '', quoted = false;
  for (let i = 0; i < line.length; i++) { const ch = line[i]; if (ch === '"') quoted = !quoted; else if (ch === sep && !quoted) { out.push(cell); cell = ''; } else cell += ch; }
  out.push(cell); return out;
}

/** The table in a statement file: .xlsx by its zip signature, else text. An old .xls is refused with what to do. */
export async function readStatementFile(bytes: Uint8Array): Promise<string[][]> {
  if (isOldExcel(bytes)) throw Error('File .xls lama belum bisa dibaca. Buka di Excel/Google Sheets lalu simpan sebagai .xlsx atau .csv.');
  if (isZip(bytes)) return readXlsx(bytes);
  if (bytes.subarray(0, 5).every((b, i) => b === [0x25, 0x50, 0x44, 0x46, 0x2d][i])) throw Error('File PDF belum bisa dibaca. Unduh mutasi dalam format CSV atau Excel dari internet/mobile banking.');
  return parseDelimited(decodeText(bytes));
}

/* ------------------------------------------------------------------ Amounts and dates */

/** An amount as banks write it, with its sign when the cell says (-, DB/CR, parentheses). Cents are dropped. */
export function parseAmount(raw: string): { value: number; sign: -1 | 0 | 1 } | null {
  let s = String(raw ?? '').replace(/[ \s]+/g, ' ').trim();
  if (!s) return null;
  let sign: -1 | 0 | 1 = 0;
  const mark = s.match(/\s*\b(db|dr|d|debit|debet|cr|k|kr|kredit|credit)\.?$/i);
  if (mark) { sign = /^(?:cr|k|kr|kredit|credit)$/i.test(mark[1]) ? 1 : -1; s = s.slice(0, mark.index).trim(); }
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1).trim(); }
  s = s.replace(/^(?:rp\.?|idr)\s*/i, '').replace(/\s*(?:rp|idr)$/i, '').trim();
  if (/^[-−–]|[-−–]$/.test(s)) { sign = -1; s = s.replace(/^[-−–]\s*|\s*[-−–]$/g, ''); } else if (/^\+/.test(s)) { sign = 1; s = s.slice(1).trim(); }
  s = s.replace(/^(?:rp\.?|idr)\s*/i, '').replace(/\s/g, '');
  if (!/^\d[\d.,]*$/.test(s)) return null;
  const dot = s.lastIndexOf('.'), comma = s.lastIndexOf(',');
  let int: string;
  if (dot >= 0 && comma >= 0) int = (dot > comma ? s.slice(0, dot).replace(/,/g, '') : s.slice(0, comma).replace(/\./g, ''));
  else if (comma >= 0) int = /,\d{1,2}$/.test(s) && !/,\d{3}(?:,|$)/.test(s.slice(0, comma + 4)) ? s.slice(0, comma).replace(/,/g, '') : s.replace(/,/g, '');
  else if (dot >= 0) int = /\.\d{1,2}$/.test(s) && (s.match(/\./g) || []).length === 1 ? s.slice(0, dot) : s.replace(/\./g, '');
  else int = s;
  const value = Number(int);
  return Number.isFinite(value) ? { value, sign } : null;
}

const MONTHS: Record<string, number> = { jan: 1, januari: 1, january: 1, feb: 2, peb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4, mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, ags: 8, agus: 8, agustus: 8, aug: 8, august: 8, sep: 9, sept: 9, september: 9, okt: 10, oct: 10, oktober: 10, october: 10, nov: 11, nop: 11, november: 11, des: 12, dec: 12, desember: 12, december: 12 };
const pad = (n: number) => String(n).padStart(2, '0');
const validDate = (y: number, m: number, d: number) => m >= 1 && m <= 12 && d >= 1 && d <= 31 && new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d;
const fullYear = (y: number) => y < 100 ? 2000 + y : y;

/** The parts of a date cell, before the day/month order is known. */
function dateParts(raw: string): { a: number; b: number; y?: number; iso?: string } | null {
  const s = String(raw ?? '').trim().replace(/^'+/, '').toLowerCase();
  if (!s || /^pend/.test(s)) return null;
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ t].*)?$/);
  if (m) return validDate(+m[1], +m[2], +m[3]) ? { a: +m[3], b: +m[2], y: +m[1], iso: `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` } : null;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?(?:[ ,t].*)?$/);
  if (m) return { a: +m[1], b: +m[2], y: m[3] ? fullYear(+m[3]) : undefined };
  m = s.match(/^(\d{1,2})[\s-]+([a-z]{3,9})\.?[\s-]*(\d{2}|\d{4})?(?:[ ,].*)?$/);
  if (m && MONTHS[m[2]]) { const y = m[3] ? fullYear(+m[3]) : undefined; return { a: +m[1], b: MONTHS[m[2]], y, ...(y && validDate(y, MONTHS[m[2]], +m[1]) ? { iso: `${y}-${pad(MONTHS[m[2]])}-${pad(+m[1])}` } : {}) }; }
  m = s.match(/^([a-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1]]) { const y = +m[3]; return validDate(y, MONTHS[m[1]], +m[2]) ? { a: +m[2], b: MONTHS[m[1]], y, iso: `${y}-${pad(MONTHS[m[1]])}-${pad(+m[2])}` } : null; }
  // An Excel day number in a text export.
  if (/^\d{5}(?:\.\d+)?$/.test(s)) { const n = Number(s); if (n > 30000 && n < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5); return { a: d.getUTCDate(), b: d.getUTCMonth() + 1, y: d.getUTCFullYear(), iso: d.toISOString().slice(0, 10) }; } }
  return null;
}

/** A date as yyyy-mm-dd: day first unless the file shows month first; a missing year from the period, else the latest year not after today. */
export function parseDate(raw: string, opts: { order?: 'dmy' | 'mdy'; year?: number; today: string }): string | null {
  const p = dateParts(raw);
  if (!p) return null;
  if (p.iso) return p.iso;
  const [d, m] = opts.order === 'mdy' ? [p.b, p.a] : [p.a, p.b];
  const now = Number(opts.today.slice(0, 4)), month = Number(opts.today.slice(5, 7));
  const y = p.y ?? opts.year ?? (m > month ? now - 1 : now);
  return validDate(y, m, d) ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/* ------------------------------------------------------------------ The header and the rows */

const norm = (s: string) => String(s ?? '').toLowerCase().replace(/\((?:rp|idr)\)|\b(?:rp|idr)\b/g, ' ').replace(/[^a-z0-9/&]+/g, ' ').trim();
const ROLE: Record<'date' | 'desc' | 'debit' | 'credit' | 'amount' | 'kind' | 'balance' | 'other', RegExp> = {
  date: /^(?:tanggal|tgl|date|waktu|tanggal transaksi|tgl transaksi|transaction date|trx date|tanggal waktu|tanggal & waktu|date & time|date and time|date time|datetime|posting date|post date|tanggal posting|tgl posting|tanggal mutasi|tgl mutasi|value date|tanggal efektif|time)$/,
  desc: /^(?:keterangan|ket|deskripsi|description|desc|uraian|uraian transaksi|detail|details|detail transaksi|transaction details|transaction detail|remark|remarks|berita|berita transaksi|catatan|notes|note|keterangan transaksi|merchant|nama merchant|source\/destination|sumber\/tujuan|lawan transaksi|counterparty|nama|transaksi|informasi transaksi|transaction|transaction description|narrative|judul|title|tujuan|penerima)$/,
  debit: /^(?:debit|debet|db|dr|keluar|uang keluar|dana keluar|pengeluaran|withdrawal|withdrawals|penarikan|mutasi debet|mutasi debit|outgoing|money out|out|amount out|nominal keluar|jumlah keluar)$/,
  credit: /^(?:kredit|credit|cr|kr|masuk|uang masuk|dana masuk|pemasukan|deposit|deposits|setoran|mutasi kredit|incoming|money in|in|amount in|nominal masuk|jumlah masuk)$/,
  amount: /^(?:jumlah|amount|nominal|mutasi|nilai|jumlah transaksi|amount idr|total|total amount|transaction amount|jumlah mutasi|nominal transaksi)$/,
  kind: /^(?:tipe|type|jenis|d\/k|db\/cr|cr\/db|dk|d k|db cr|debit\/kredit|debit\/credit|jenis transaksi|tipe transaksi|transaction type|arah|status mutasi|flag)$/,
  balance: /^(?:saldo|balance|saldo akhir|running balance|ending balance|sisa saldo|saldo berjalan)$/,
  other: /^(?:no|no\.|nomor|cabang|branch|teller|journal|journal no|no referensi|referensi|reference|ref|ref no|no ref|currency|mata uang|kategori|category|status|id|transaction id|id transaksi)$/,
};
type Role = keyof typeof ROLE;
const roleOf = (cell: string): Role | null => { const n = norm(cell); if (!n) return null; for (const r of Object.keys(ROLE) as Role[]) if (ROLE[r].test(n)) return r; return null; };

const NOT_A_ROW = /^(?:saldo awal|saldo akhir|opening balance|closing balance|beginning balance|ending balance|saldo sebelumnya|previous balance|total|sub ?total|mutasi debet|mutasi kredit|mutasi debit|jumlah|grand total|total debet|total kredit|total debit|total credit)\b/i;
const OUT_WORD = /^(?:db|d|dr|debit|debet|keluar|uang keluar|out|outgoing|withdrawal|pembayaran|payment|pengeluaran|transfer keluar|purchase|pembelian)$/i;
const IN_WORD = /^(?:cr|k|kr|kredit|credit|masuk|uang masuk|in|incoming|deposit|top ?up|pemasukan|transfer masuk|refund|cashback|setoran)$/i;

/** The table read: header found by its words, rows read into date, description, amount and direction. */
export function readStatement(table: string[][], today: string, knownYear?: number): StatementRead {
  const rows = table.map(r => r.map(c => String(c ?? '').trim()));
  // The header: the first of the first 40 rows naming a date column and a money column.
  let header = -1, roles: (Role | null)[] = [];
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const rs = rows[i].map(roleOf);
    if (rs.includes('date') && (rs.includes('amount') || rs.includes('debit') || rs.includes('credit'))) { header = i; roles = rs; break; }
  }
  // The year of the period above the table ("Periode : 01/10/2026 - 31/10/2026"), for dates without one.
  const above = rows.slice(0, header < 0 ? 15 : header).map(r => r.join(' ')).join(' ');
  const periodYear = knownYear ?? (Number(above.match(/(?:periode|period|tanggal|statement)[^\d]{0,20}\d{1,2}[/.-]\d{1,2}[/.-](\d{4})/i)?.[1] || above.match(/\b(20\d{2})\b/)?.[1] || 0) || undefined);
  if (header < 0) return inferWithoutHeader(rows, today, periodYear);
  const pick = (role: Role) => roles.indexOf(role);
  const dateCol = pick('date'), debit = pick('debit'), credit = pick('credit'), amountCol = pick('amount'), balanceCol = pick('balance');
  let kindCol = pick('kind');
  const descCols = roles.map((r, i) => r === 'desc' ? i : -1).filter(i => i >= 0);
  const body = rows.slice(header + 1);
  // BCA puts DB/CR in the column after Jumlah, with no header.
  if (kindCol < 0 && amountCol >= 0 && !rows[header][amountCol + 1] && body.some(r => /^(?:db|cr)$/i.test(r[amountCol + 1] || ''))) kindCol = amountCol + 1;
  // A description column without a known header: the widest text column that is not a role already.
  if (!descCols.length) {
    const taken = new Set([dateCol, debit, credit, amountCol, kindCol, ...roles.map((r, i) => r ? i : -1)]);
    const widths = (rows[header] || []).map((_, i) => taken.has(i) ? -1 : body.slice(0, 30).reduce((n, r) => n + (/\p{L}{3,}/u.test(r[i] || '') ? (r[i] || '').length : 0), 0));
    const best = widths.indexOf(Math.max(...widths));
    if (best >= 0 && widths[best] > 0) descCols.push(best);
  }
  // Day or month first: a first part above 12 means day first; a second part above 12 means month first.
  let order: 'dmy' | 'mdy' = 'dmy';
  const parts = body.map(r => dateParts(r[dateCol] || '')).filter((p): p is NonNullable<typeof p> => Boolean(p && !p.iso));
  if (!parts.some(p => p.a > 12) && parts.some(p => p.b > 12)) order = 'mdy';
  const out: StatementRow[] = [];
  let skipped = 0, unsure = 0, opening: number | undefined, closing: number | undefined;
  const signed = (a: { value: number; sign: -1 | 0 | 1 } | null) => a ? (a.sign < 0 ? -a.value : a.value) : undefined;
  // "Saldo Awal" / "Saldo Akhir" lines (above or below the table): the first amount on the line.
  const lineAmount = (r: string[]) => { for (const c of r) { if (/\p{L}{3,}/u.test(c.replace(/\b(?:rp|idr|db|cr)\b/gi, ''))) continue; const a = parseAmount(c); if (a && (a.value > 0 || /\d/.test(c))) return signed(a); } return undefined; };
  for (const r of rows) {
    const text = r.join(' ').toLowerCase();
    if (/\b(?:saldo awal|opening balance|beginning balance|saldo sebelumnya|previous balance)\b/.test(text) && opening === undefined) opening = lineAmount(r);
    else if (/\b(?:saldo akhir|closing balance|ending balance)\b/.test(text) && !/\b(?:tanggal|periode)\b/.test(text)) closing = lineAmount(r) ?? closing;
  }
  body.forEach((r, k) => {
    if (!r.some(Boolean)) return;
    const description = descCols.map(i => r[i]).filter(Boolean).join(' · ').replace(/\s+/g, ' ').trim();
    const date = parseDate(r[dateCol] || '', { order, year: periodYear, today });
    if (!date || NOT_A_ROW.test(description) || NOT_A_ROW.test(r[dateCol] || '')) { skipped++; return; }
    const rowBalance = balanceCol >= 0 ? signed(parseAmount(r[balanceCol] || '')) : undefined;
    let amount = 0, type: 'expense' | 'income' | null = null, unsureRow = false;
    const out1 = debit >= 0 ? parseAmount(r[debit] || '') : null, in1 = credit >= 0 ? parseAmount(r[credit] || '') : null;
    if (out1 && out1.value > 0) { amount = out1.value; type = 'expense'; } else if (in1 && in1.value > 0) { amount = in1.value; type = 'income'; }
    else if (amountCol >= 0) {
      const a = parseAmount(r[amountCol] || '');
      if (a && a.value > 0) {
        amount = a.value;
        const kind = kindCol >= 0 ? norm(r[kindCol] || '') : '';
        type = kind && OUT_WORD.test(kind) ? 'expense' : kind && IN_WORD.test(kind) ? 'income' : a.sign < 0 ? 'expense' : a.sign > 0 ? 'income' : /\b(?:db|debit|debet)\b/i.test(description) ? 'expense' : /\b(?:cr|kredit|credit)\b/i.test(description) ? 'income' : null;
        if (!type) { type = 'expense'; unsureRow = true; }
      }
    }
    if (!type || amount <= 0) { skipped++; return; }
    if (unsureRow) unsure++;
    out.push({ line: header + 2 + k, date, description, amount: Math.round(amount), type, ...(unsureRow ? { unsure: true } : {}), ...(rowBalance !== undefined ? { balance: rowBalance } : {}) });
  });
  // Oldest first or newest first: the closing balance is the one after the latest row; the opening one is before the earliest.
  const withBalance = out.filter(r => r.balance !== undefined);
  if (withBalance.length) {
    const newestFirst = out.length > 1 && out[0].date > out[out.length - 1].date;
    const latest = newestFirst ? withBalance[0] : withBalance[withBalance.length - 1], earliest = newestFirst ? withBalance[withBalance.length - 1] : withBalance[0];
    closing ??= latest.balance;
    opening ??= earliest.balance! - (earliest.type === 'income' ? earliest.amount : -earliest.amount);
  }
  const net = out.reduce((n, r) => n + (r.type === 'income' ? r.amount : -r.amount), 0);
  const balance = opening !== undefined || closing !== undefined ? {
    ...(opening !== undefined ? { opening: Math.round(opening) } : {}), ...(closing !== undefined ? { closing: Math.round(closing), ...(out.length ? { closingDate: out.map(r => r.date).sort().pop()! } : {}) } : {}),
    ...(opening !== undefined && closing !== undefined ? { complete: Math.abs(opening + net - closing) <= Math.max(1, out.length) } : {}),
  } : undefined;
  // With no sign anywhere, every amount was read as spending: said, so the person checks.
  const dates = out.map(r => r.date).sort();
  return {
    rows: out, skipped, unsure, ...(balance ? { balance } : {}),
    columns: { date: rows[header][dateCol], description: descCols.map(i => rows[header][i] || `Kolom ${i + 1}`), ...(amountCol >= 0 ? { amount: rows[header][amountCol] } : {}), ...(debit >= 0 ? { debit: rows[header][debit] } : {}), ...(credit >= 0 ? { credit: rows[header][credit] } : {}), ...(kindCol >= 0 ? { kind: rows[header][kindCol] || 'DB/CR' } : {}) },
    ...(dates.length ? { from: dates[0], to: dates[dates.length - 1] } : {}),
  };
}

/** No header row: the date column is the one that reads as dates most, the amount the one that reads as signed amounts. */
function inferWithoutHeader(rows: string[][], today: string, year?: number): StatementRead {
  const width = Math.max(0, ...rows.map(r => r.length)), sample = rows.filter(r => r.filter(Boolean).length >= 3).slice(0, 60);
  const share = (f: (c: string) => boolean, i: number) => sample.filter(r => f(r[i] || '')).length / Math.max(1, sample.length);
  const cols = Array.from({ length: width }, (_, i) => i);
  const dateCol = cols.sort((a, b) => share(c => Boolean(dateParts(c)), b) - share(c => Boolean(dateParts(c)), a))[0];
  if (dateCol === undefined || share(c => Boolean(dateParts(c)), dateCol) < 0.5) throw Error('Kolom tanggal dan nominal tidak ditemukan. Pastikan file berisi mutasi dengan judul kolom seperti Tanggal, Keterangan, dan Jumlah/Debet/Kredit.');
  const moneyCols = Array.from({ length: width }, (_, i) => i).filter(i => i !== dateCol && share(c => Boolean(parseAmount(c)?.value) && !dateParts(c), i) >= 0.6);
  const descCol = Array.from({ length: width }, (_, i) => i).filter(i => i !== dateCol && !moneyCols.includes(i)).sort((a, b) => sample.reduce((n, r) => n + (r[b] || '').length, 0) - sample.reduce((n, r) => n + (r[a] || '').length, 0))[0];
  if (!moneyCols.length) throw Error('Kolom nominal tidak ditemukan di file ini.');
  // A balance column is the last of several money columns; the amount is the one before it.
  const amountCol = moneyCols.length > 1 ? moneyCols[moneyCols.length - 2] : moneyCols[0];
  const balanceCol = moneyCols.length > 1 ? moneyCols[moneyCols.length - 1] : -1;
  const table = [Array.from({ length: width }, (_, i) => i === dateCol ? 'Tanggal' : i === amountCol ? 'Jumlah' : i === descCol ? 'Keterangan' : i === balanceCol ? 'Saldo' : ''), ...rows];
  const read = readStatement(table, today, year);
  return { ...read, columns: { date: `Kolom ${dateCol + 1}`, description: descCol !== undefined ? [`Kolom ${descCol + 1}`] : [], amount: `Kolom ${amountCol + 1}` } };
}

/* ------------------------------------------------------------------ A name for each row */

/** A reference code (letters with digits, a number, one or two letters): not part of a name. "Bu" and "Om" stay. */
const CODE = /^(?:[\p{L}]*\d[\w/.:-]*|\d+[\w/.:-]*|(?!(?:bu|om|pa|ko|ci|ka)$)\p{L}{1,2})$/iu;
/** Short names written in capitals that stay so ("PLN", "BPJS", "KFC"). */
const ACRONYM = new Set('pln bpjs kai krl mrt lrt pdam atm kfc mcd ovo bca bri bni bsi btn xl im3 ptpn jne jnt sicepat ikea ace spbu'.split(' '));
const BANK_WORDS = new Set('trsf trf transfer e-banking ebanking mbanking m-banking ib db cr kr debit debet kredit credit switching bi-fast bifast bif biz fast ftscy ftfva sknbi rtgs prmt online otomatis auto via ke dari to from ref no rek rekening norek trx tx transaksi pembayaran payment byr bayar idr rp kartu card pos edc qr qris mcm va virtual account berita pt cv tbk persero esb intrabank interbank antarbank overbooking ob incoming outgoing purchase'.split(' '));
const KNOWN: [RegExp, string][] = [
  [/\b(?:tarik(?:an)?\s*(?:tunai\s*)?atm|tarik\s*tunai|penarikan\s*tunai|atm\s*withdrawal|cash\s*withdrawal|tarikan)\b/i, 'Tarik tunai'],
  [/\b(?:biaya\s*adm(?:in(?:istrasi)?)?|adm(?:in)?\s*fee|monthly\s*fee|biaya\s*bulanan|biaya\s*kartu|card\s*fee)\b/i, 'Biaya admin bank'],
  [/\b(?:pajak\s*bunga|tax\s*on\s*interest|pph\s*bunga)\b/i, 'Pajak bunga'],
  [/\b(?:bunga|interest|jasa\s*giro)\b/i, 'Bunga tabungan'],
  [/\b(?:biaya\s*transfer|transfer\s*fee|biaya\s*trf)\b/i, 'Biaya transfer'],
];
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/&-])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase()).replace(/\p{L}[\p{L}\d]*/gu, w => ACRONYM.has(w.toLowerCase()) ? w.toUpperCase() : w);

/** A short name for a statement line: known kinds by name ("Tarik tunai"), else the words left after codes and bank words. */
export function nameFor(description: string): string {
  const d = description.replace(/[*#_]+/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [re, name] of KNOWN) if (re.test(d)) return name;
  const topUp = d.match(/\b(?:top\s*-?up|topup|isi\s*saldo)\s+([a-z]+(?:\s*pay)?)/i);
  if (topUp) return `Top up ${titleCase(topUp[1].replace(/\s+/g, ''))}`.replace(/Gopay/, 'GoPay').replace(/Shopeepay/, 'ShopeePay').replace(/Ovo/, 'OVO');
  const qris = d.match(/\bqris\b\s*(?:payment|pembayaran)?\s*(?:[\d/.:-]+\s+)*([\p{L}][\p{L}\s.&'-]{2,40})/iu);
  const wordsOf = (text: string) => text.split(/[\s·|,;:]+/).filter(w => w && !CODE.test(w) && !BANK_WORDS.has(w.toLowerCase()) && /\p{L}{2,}/u.test(w));
  // After "QRIS" comes the merchant; when nothing is left there, the whole line ("Warung Padang · QRIS Payment").
  const words = qris && wordsOf(qris[1]).length ? wordsOf(qris[1]) : wordsOf(d);
  const name = titleCase(words.slice(0, 6).join(' ')).replace(/\s+/g, ' ').trim();
  return (name || 'Transaksi dari mutasi').slice(0, 60);
}

/* ------------------------------------------------------------------ The plan: what goes to Perlu dikonfirmasi */

export type ImportItem = StatementRow & {
  id: string; name: string; walletId: string; destinationWalletId: string | null; flow: TxType;
  categoryId: string | null; subcategoryId: string | null;
  /** Already recorded (a transaction of the same amount in this wallet, that day or the day next to it), already imported,
   * skipped before, or (8.6) already waiting in Perlu dikonfirmasi from a schedule. */
  already?: 'recorded' | 'imported' | 'skipped' | 'scheduled';
  /** 8.6 How the category was chosen: from your own records of this place, or from what kind of place it is. */
  from?: 'history' | 'place';
};
export type ImportCtx = {
  walletId: string;
  wallets: Pick<Wallet, 'id' | 'name' | 'isArchived' | 'type'>[];
  categories: Category[];
  transactions: Pick<LedgerTx, 'type' | 'amount' | 'date' | 'walletId' | 'destinationWalletId' | 'description' | 'merchant' | 'categoryId' | 'subcategoryId'>[];
  drafts: (Pick<Draft, 'id'> & Partial<Pick<Draft, 'status' | 'source' | 'amount' | 'walletId' | 'plannedDate'>>)[];
  /** Import rows the person skipped before (kept on this device). */
  skipped?: Set<string>;
};

/** FNV-1a: a short stable code for a description, so importing the same file twice finds the same rows. */
function code(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }
const dayAfter = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** 8.6 The first word of a place's name, its "brand" ("indomaret" for "Indomaret Ciputat"), to learn from other branches. */
const brandOf = (name: string) => { const w = name.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/)[0] || ''; return w.length >= 4 && !BANK_WORDS.has(w) ? w : ''; };
/** Categories the person gave to places of the same brand: used when they all agree (the person's own choice wins). */
function brandCategories(history: ImportCtx['transactions']) {
  const seen = new Map<string, Map<string, { categoryId: string; subcategoryId: string | null; n: number }>>();
  for (const t of history) {
    if ((t.type !== 'expense' && t.type !== 'income') || !t.categoryId) continue;
    for (const b of new Set([brandOf(t.description || ''), brandOf(t.merchant || '')].filter(Boolean))) {
      const key = `${t.type}:${b}`, cats = seen.get(key) || new Map(), cat = `${t.categoryId}/${t.subcategoryId || ''}`;
      const c = cats.get(cat) || { categoryId: t.categoryId, subcategoryId: t.subcategoryId || null, n: 0 }; c.n++; cats.set(cat, c); seen.set(key, cats);
    }
  }
  const out = new Map<string, { categoryId: string; subcategoryId: string | null }>();
  for (const [key, cats] of seen) if (cats.size === 1) { const c = [...cats.values()][0]; out.set(key, { categoryId: c.categoryId, subcategoryId: c.subcategoryId }); }
  return out;
}
/** What kind of place a name is, said in words the category reader knows (a minimarket's purchase is daily needs, a fuel station's is fuel). */
const PLACE_KIND: [RegExp, string][] = [
  [/\b(?:indomaret|alfamart|alfamidi|alfa ?express|lawson|family ?mart|circle ?k|superindo|super indo|hypermart|transmart|giant|lotte ?mart|carrefour|hero supermarket|ranch market|yogya|griya|tip ?top)\b/i, 'belanja kebutuhan harian di minimarket'],
  [/\b(?:pertamina|spbu|shell|bp akr|vivo energy|mypertamina)\b/i, 'isi bensin'],
  [/\b(?:pln|token listrik)\b/i, 'token listrik pln'],
  [/\b(?:pdam)\b/i, 'tagihan air pdam'],
  [/\b(?:bpjs)\b/i, 'iuran bpjs kesehatan'],
];

export function planImport(read: StatementRead, ctx: ImportCtx): ImportItem[] {
  const seen = new Map<string, number>(), ids = new Set(ctx.drafts.map(d => d.id));
  const used = new Set<number>();
  const live = ctx.wallets.filter(w => !w.isArchived && w.id !== ctx.walletId);
  const cash = live.find(w => w.type === 'cash') || live.find(w => /\b(?:tunai|cash|dompet\s*fisik)\b/i.test(w.name));
  const brands = brandCategories(ctx.transactions);
  // Waiting schedule drafts (Netflix next month…): a bank row for the same amount close to its date is that one.
  const waiting = ctx.drafts.filter(d => d.status === 'pending' && d.source !== 'import' && d.amount && d.walletId === ctx.walletId && d.plannedDate);
  const usedDrafts = new Set<string>();
  return read.rows.map(row => {
    const key = `${ctx.walletId}_${row.date}_${row.amount}_${row.type[0]}_${code(row.description.toLowerCase())}`;
    const n = (seen.get(key) || 0) + 1; seen.set(key, n);
    const id = `imp_${key}_${n}`.replace(/[^\w-]/g, '').slice(0, 140);
    const name = nameFor(row.description), low = row.description.toLowerCase();
    // Money moved to another of the person's own wallets: a transfer, not spending ("Top up GoPay", "Tarik tunai").
    let flow: TxType = row.type, destinationWalletId: string | null = null;
    if (row.type === 'expense') {
      const other = /\b(?:top\s*-?up|topup|isi\s*saldo|transfer\s*ke|trf\s*ke|pindah\s*dana)\b/.test(low) ? walletsIn(low, live).find(w => w.id !== ctx.walletId) : undefined;
      const toCash = name === 'Tarik tunai' && cash;
      if (other || toCash) { flow = 'transfer'; destinationWalletId = (other?.id || cash!.id); }
    }
    // The person's own choice for this brand first, then the reader (it also learns exact names), then the kind of place.
    const own = flow === 'transfer' ? undefined : brands.get(`${row.type}:${brandOf(name)}`);
    let guess = own || flow === 'transfer' ? null : suggestCategory({ text: `${name} ${low}`.toLowerCase(), item: name.toLowerCase(), amount: row.amount, type: row.type }, { categories: ctx.categories, history: ctx.transactions as LedgerTx[] });
    let from: ImportItem['from'] = own ? 'history' : undefined;
    const kind = !own && !guess && flow !== 'transfer' ? PLACE_KIND.find(([re]) => re.test(low)) : undefined;
    if (kind) { guess = suggestCategory({ text: kind[1], item: kind[1], amount: row.amount, type: row.type }, { categories: ctx.categories, history: [] }); if (guess) from = 'place'; }
    const pick = own || guess;
    // Already recorded: a transaction of this amount from or to this wallet, that day or a day next to it (each used once).
    const matchAt = ctx.transactions.findIndex((t, i) => !used.has(i) && t.amount === row.amount && (t.walletId === ctx.walletId || t.destinationWalletId === ctx.walletId) && (t.date === row.date || t.date === dayAfter(row.date, 1) || t.date === dayAfter(row.date, -1)) && (row.type === 'income' ? t.type === 'income' || t.destinationWalletId === ctx.walletId : t.type !== 'income'));
    if (matchAt >= 0) used.add(matchAt);
    const draft = matchAt < 0 && !ids.has(id) ? waiting.find(d => !usedDrafts.has(d.id) && d.amount === row.amount && Math.abs(Date.parse(`${d.plannedDate}T00:00:00Z`) - Date.parse(`${row.date}T00:00:00Z`)) <= 3 * 864e5) : undefined;
    if (draft) usedDrafts.add(draft.id);
    const already = ids.has(id) ? 'imported' as const : matchAt >= 0 ? 'recorded' as const : draft ? 'scheduled' as const : ctx.skipped?.has(id) ? 'skipped' as const : undefined;
    return { ...row, id, name, walletId: ctx.walletId, destinationWalletId, flow, categoryId: pick?.categoryId || null, subcategoryId: pick?.subcategoryId || null, ...(from && pick ? { from } : {}), ...(already ? { already } : {}) };
  });
}

/* ------------------------------------------------------------------ 8.6 Matching the bank's balance */

export type Reconcile = {
  /** The bank's balance at the end of the file, and that day. */
  bank: number; date: string;
  /** The wallet in the app on that day (everything recorded up to and including it). */
  app: number;
  /** What the new rows (not yet recorded) would add to or take from the wallet. */
  pending: number;
  /** Bank minus app-with-new-rows: 0 means it matches once the new rows are confirmed. */
  diff: number;
};
/** The wallet's change from one row (a transfer out of it takes money; one into it adds). */
const rowEffect = (x: ImportItem, walletId: string) => x.flow === 'income' ? x.amount : x.flow === 'transfer' ? (x.destinationWalletId === walletId ? x.amount : -x.amount) : -x.amount;
/** The app side starts from the balance the person sees now and takes back what was recorded after the file's last day. */
export function reconcile(read: StatementRead, chosen: ImportItem[], wallet: Pick<Wallet, 'id' | 'cachedBalance'>, history: LedgerTx[]): Reconcile | null {
  const bank = read.balance?.closing, date = read.balance?.closingDate;
  if (bank === undefined || !date) return null;
  const app = wallet.cachedBalance - history.filter(t => t.date > date).reduce((n, t) => n + (effects(t)[wallet.id] || 0), 0);
  const pending = chosen.filter(x => x.date <= date).reduce((n, x) => n + rowEffect(x, wallet.id), 0);
  return { bank, date, app, pending, diff: bank - (app + pending) };
}

/* ------------------------------------------------------------------ 8.6 Bills that come every month */

export type RecurringHint = { key: string; name: string; amount: number; day: number; months: number; categoryId: string | null; walletId: string; nextDate: string };
const billKey = (name: string) => name.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
/**
 * The same name and about the same amount (within 10%) on about the same day (within 6 days) in at least two different
 * months, in this file and the person's records: offered as "Jadikan transaksi rutin". Names already set up as a
 * schedule are not offered again.
 */
export function recurringHints(items: ImportItem[], history: ImportCtx['transactions'], recurring: Pick<Recurring, 'name' | 'amount' | 'active'>[], today: string): RecurringHint[] {
  type Seen = { name: string; amount: number; date: string; categoryId: string | null; walletId: string; inFile?: boolean };
  const groups = new Map<string, Seen[]>();
  const add = (key: string, s: Seen) => { if (key.length < 3) return; const g = groups.get(key) || []; g.push(s); groups.set(key, g); };
  for (const x of items) if (x.flow === 'expense' && x.amount >= 10_000 && x.already !== 'imported') add(billKey(x.name), { name: x.name, amount: x.amount, date: x.date, categoryId: x.subcategoryId || x.categoryId, walletId: x.walletId, inFile: true });
  for (const t of history) if (t.type === 'expense' && t.amount >= 10_000 && t.description) add(billKey(t.description), { name: t.description, amount: t.amount, date: t.date, categoryId: t.subcategoryId || t.categoryId, walletId: t.walletId });
  const known = recurring.filter(r => r.active !== false).map(r => r.name.toLowerCase());
  const out: RecurringHint[] = [];
  for (const [key, list] of groups) {
    // Only bills in this file (your records only confirm that they come every month).
    if (!list.some(s => s.inFile) || known.some(n => n.includes(key) || key.includes(n))) continue;
    const byMonth = new Map<string, Seen>();
    for (const s of list.sort((a, b) => a.date.localeCompare(b.date))) byMonth.set(s.date.slice(0, 7), s);
    const months = [...byMonth.values()];
    if (months.length < 2) continue;
    const amounts = months.map(m => m.amount).sort((a, b) => a - b), median = amounts[Math.floor(amounts.length / 2)];
    const days = months.map(m => Number(m.date.slice(8, 10)));
    if (amounts.some(a => Math.abs(a - median) > median * .1) || Math.max(...days) - Math.min(...days) > 6) continue;
    const last = months[months.length - 1], day = Number(last.date.slice(8, 10)), fromFile = list.find(s => s.inFile)!;
    let y = Number(last.date.slice(0, 4)), m = Number(last.date.slice(5, 7)), next = '';
    do { m++; if (m > 12) { m = 1; y++; } const dim = new Date(Date.UTC(y, m, 0)).getUTCDate(); next = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(day, dim)).padStart(2, '0')}`; } while (next < today);
    out.push({ key, name: last.name, amount: last.amount, day, months: months.length, categoryId: last.categoryId || fromFile.categoryId, walletId: fromFile.walletId, nextDate: next });
  }
  return out.sort((a, b) => b.months - a.months || b.amount - a.amount).slice(0, 4);
}
