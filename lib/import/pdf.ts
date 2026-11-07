/**
 * 8.7 Bank and e-wallet statements as PDF (e-statement, "mutasi"), read on the device.
 *
 * The PDF is opened with pdf.js (Apache-2.0), served by the app itself from /pdf and loaded only when a PDF is chosen:
 * nothing is uploaded. A password-protected statement is opened with the password the person types; it is used once
 * here and never kept. A scan (a picture of a statement) has no text and is refused with what to do.
 *
 * pdf.js gives each piece of text with its position. The table is rebuilt from those positions: the header line names
 * a date column and a money column (the same words as a CSV: Tanggal, Keterangan, Jumlah, Debet/Kredit, Saldo…), each
 * piece of text goes to the column under its header, a line whose date column reads as a date starts a row, and the
 * lines just under it (time, reference, a wrapped name) belong to that row. The figures around the table (saldo awal,
 * saldo akhir, total pemasukan/pengeluaran, the account holder) are read too, to check that no row was missed.
 */
import { headerRole, parseAmount, type StatementMeta } from './statement.ts';

type Piece = { s: string; x: number; y: number; w: number; h: number; page: number };
type Line = { page: number; y: number; h: number; pieces: Piece[] };
type Cell = { s: string; x: number; end: number };
type Col = { role: ColRole; x: number; end: number; name: string };
type ColRole = 'date' | 'desc' | 'debit' | 'credit' | 'amount' | 'kind' | 'balance' | 'other';

export type PdfStatement = { table: string[][]; meta: StatementMeta; pages: number };
export type { Piece as PdfPiece };

/** Thrown when the PDF needs its password (none given, or a wrong one): the screen then asks for it. */
export class PdfPasswordError extends Error {
  readonly wrong: boolean;
  constructor(wrong: boolean) { super(wrong ? 'Password PDF salah. Coba lagi.' : 'PDF ini dikunci password.'); this.name = 'PdfPasswordError'; this.wrong = wrong; }
}

/* ------------------------------------------------------------------ Opening the file */

type PdfJs = {
  getDocument(src: Record<string, unknown>): { promise: Promise<PdfDoc>; destroy(): Promise<void> };
  GlobalWorkerOptions: { workerSrc: string };
};
type PdfDoc = { numPages: number; getPage(n: number): Promise<PdfPage> };
type PdfPage = { getViewport(o: { scale: number }): { width: number; height: number }; getTextContent(): Promise<{ items: { str?: string; transform?: number[]; width?: number; height?: number }[] }> };

let loading: Promise<PdfJs> | null = null;
/** pdf.js from the app's own /pdf folder in the browser (copied there from node_modules), from node_modules elsewhere. */
function pdfjs(): Promise<PdfJs> {
  if (loading) return loading;
  const browser = typeof window !== 'undefined';
  const spec = browser ? '/pdf/pdf.min.mjs' : 'pdfjs-dist/legacy/build/pdf.mjs';
  loading = (import(/* webpackIgnore: true */ /* turbopackIgnore: true */ spec) as Promise<PdfJs>).then(lib => {
    if (browser) lib.GlobalWorkerOptions.workerSrc = '/pdf/pdf.worker.min.mjs';
    return lib;
  }).catch(e => { loading = null; throw e; });
  return loading;
}

/** Every piece of text on every page, with its position from the top-left of its page. */
export async function pdfPieces(bytes: Uint8Array, password?: string): Promise<{ pieces: Piece[][]; pages: number }> {
  const lib = await pdfjs();
  // A copy: pdf.js takes the buffer over, and the screen keeps the file to try again with a password.
  const task = lib.getDocument({ data: bytes.slice(), password: password || undefined, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0, stopAtErrors: false });
  let doc: PdfDoc;
  try {
    doc = await task.promise;
  } catch (e) {
    void task.destroy();
    const err = e as { name?: string; code?: number };
    if (err?.name === 'PasswordException') throw new PdfPasswordError(err.code === 2 || Boolean(password));
    throw Error('File PDF ini tidak bisa dibuka. Coba unduh ulang e-statement-nya.');
  }
  try {
    const pieces: Piece[][] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n), height = page.getViewport({ scale: 1 }).height, content = await page.getTextContent();
      const list: Piece[] = [];
      for (const item of content.items) {
        const s = (item.str || '').replace(/\s+$/, ''), t = item.transform;
        if (!s.trim() || !t) continue;
        const size = Math.hypot(t[2], t[3]) || item.height || 8, x = t[4], y = height - t[5], w = item.width || s.length * size * .5;
        // One piece holding a whole line ("01/10  TRSF E-BANKING DB  50,000.00"): split where wide gaps are.
        const parts = s.split(/(\s{2,})/);
        if (parts.length > 1) {
          let at = 0;
          for (const part of parts) { if (part.trim()) list.push({ s: part.trim(), x: x + w * at / s.length, y, w: w * part.length / s.length, h: size, page: n }); at += part.length; }
        } else list.push({ s: s.trim(), x, y, w, h: size, page: n });
      }
      pieces.push(list);
    }
    return { pieces, pages: doc.numPages };
  } finally { void task.destroy(); }
}

/* ------------------------------------------------------------------ Lines and cells */

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Pieces at the same height on a page make a line (tolerance: a third of the text size). */
function linesOf(pieces: Piece[]): Line[] {
  const lines: Line[] = [];
  for (const p of [...pieces].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(p.y - last.y) <= Math.max(2, Math.min(p.h, last.h) * .35)) last.pieces.push(p);
    else lines.push({ page: p.page, y: p.y, h: p.h, pieces: [p] });
  }
  for (const l of lines) l.pieces.sort((a, b) => a.x - b.x);
  return lines;
}
/** Pieces close together (a space apart) make one cell: "Saldo Sebelumnya /" + "Previous Balance". */
function cellsOf(line: Line): Cell[] {
  const cells: Cell[] = [];
  for (const p of line.pieces) {
    const last = cells[cells.length - 1];
    if (last && p.x - last.end <= Math.max(1.5, p.h * .45)) { last.s += (p.x - last.end > p.h * .1 ? ' ' : '') + p.s; last.end = Math.max(last.end, p.x + p.w); }
    else cells.push({ s: p.s, x: p.x, end: p.x + p.w });
  }
  return cells;
}

/* ------------------------------------------------------------------ The header */

const norm = (s: string) => s.toLowerCase().replace(/\((?:rp|idr)\)|\b(?:rp|idr)\b/g, ' ').replace(/[^a-z0-9/&]+/g, ' ').trim();
// The same header words the CSV reader knows (statement.ts), and the English line some banks print under each one.
const ROLES: [ColRole, RegExp][] = [
  ['date', /^(?:tanggal|tgl|date|tanggal transaksi|tgl transaksi|transaction date|trx date|tanggal waktu|tanggal & waktu|date & time|date and time|date time|posting date|post date|tanggal posting|tgl posting|tanggal mutasi|tgl mutasi|value date|tanggal efektif|tanggal & jam|tgl & jam)$/],
  ['desc', /^(?:keterangan|ket|deskripsi|description|uraian|uraian transaksi|detail|details|detail transaksi|transaction details|transaction detail|transactions detail|transactions details|remark|remarks|berita|berita transaksi|catatan|notes|keterangan transaksi|merchant|nama merchant|source\/destination|sumber\/tujuan|lawan transaksi|counterparty|transaksi|informasi transaksi|transaction|transaction description|narrative|rincian transaksi|aktivitas)$/],
  ['debit', /^(?:debit|debet|db|dr|keluar|uang keluar|dana keluar|pengeluaran|withdrawal|withdrawals|penarikan|mutasi debet|mutasi debit|outgoing|money out|nominal keluar|jumlah keluar)$/],
  ['credit', /^(?:kredit|credit|cr|kr|masuk|uang masuk|dana masuk|pemasukan|deposit|deposits|setoran|mutasi kredit|incoming|money in|nominal masuk|jumlah masuk)$/],
  ['amount', /^(?:jumlah|amount|nominal|mutasi|nilai|jumlah transaksi|amount idr|total|transaction amount|jumlah mutasi|nominal transaksi)$/],
  ['kind', /^(?:tipe|type|jenis|d\/k|db\/cr|cr\/db|dk|debit\/kredit|debit\/credit|jenis transaksi|tipe transaksi|transaction type|transactions type)$/],
  ['balance', /^(?:saldo|balance|running balance|sisa saldo|saldo berjalan)$/],
];
const roleOf = (s: string): ColRole | null => { const n = norm(s); if (!n) return null; for (const [r, re] of ROLES) if (re.test(n)) return r; return null; };
const MONEY: ColRole[] = ['debit', 'credit', 'amount', 'balance'];

/** The columns, when this line is a table header: it names a date column and a money column. */
function headerOf(line: Line): Col[] | null {
  const cells = cellsOf(line);
  // Cells merged by closeness are split back when each piece names a column and the whole does not ("Debet Kredit").
  const split: Cell[] = [];
  for (const c of cells) {
    if (roleOf(c.s)) { split.push(c); continue; }
    const inside = line.pieces.filter(p => p.x >= c.x - .5 && p.x + p.w <= c.end + .5);
    if (inside.length > 1 && inside.every(p => roleOf(p.s))) split.push(...inside.map(p => ({ s: p.s, x: p.x, end: p.x + p.w })));
    else split.push(c);
  }
  const cols = split.map(c => ({ role: roleOf(c.s) || 'other' as ColRole, x: c.x, end: c.end, name: c.s }));
  return cols.some(c => c.role === 'date') && cols.some(c => MONEY.includes(c.role) && c.role !== 'balance') ? cols : null;
}

/** The column a piece of text sits under: the header it overlaps most, else the nearest one. */
function columnOf(p: Piece, cols: Col[]): number {
  let best = -1, score = -Infinity;
  cols.forEach((c, i) => {
    const overlap = Math.min(p.x + p.w, c.end) - Math.max(p.x, c.x);
    const s = overlap > 0 ? overlap : -Math.min(Math.abs(p.x - c.end), Math.abs(c.x - (p.x + p.w)), Math.abs(p.x - c.x));
    if (s > score) { score = s; best = i; }
  });
  return best;
}

/* ------------------------------------------------------------------ Dates, amounts and the lines around the table */

const MONTH = /\b(?:jan|januari|january|feb|peb|februari|february|mar|maret|march|apr|april|mei|may|jun|juni|june|jul|juli|july|agu|agt|ags|agus|agustus|aug|august|sep|sept|september|okt|oct|oktober|october|nov|nop|november|des|dec|desember|december)\b/i;
const TIME = /^\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\s*(?:wib|wita|wit|am|pm))?$/i;
/** A date in a row's first line: day and month (and a year, or a month written as a word, unless an amount sits on the line). */
function rowDate(s: string, amountOnLine: boolean) {
  const t = s.trim();
  if (!t || TIME.test(t)) return false;
  const m = t.match(/^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?\b/) || t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) {
    const [a, b] = m[1].length === 4 ? [+m[3], +m[2]] : [+m[1], +m[2]];
    const ok = (a >= 1 && a <= 31 && b >= 1 && b <= 12) || (b >= 1 && b <= 31 && a >= 1 && a <= 12);
    return ok && (Boolean(m[3]) || amountOnLine);
  }
  return /^\d{1,2}[\s-]+\p{L}{3,9}\.?(?:[\s-]+\d{2,4})?\b/u.test(t) && MONTH.test(t) || /^\p{L}{3,9}\.?\s+\d{1,2},?\s+\d{4}/u.test(t) && MONTH.test(t);
}
const AMOUNT = /^[-+−(]?\s*(?:rp\.?|idr)?\s*[-+−]?\s*\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?\s*\)?\s*(?:db|cr|d|k|dr|kr)?$|^[-+−]?\s*(?:rp\.?|idr)?\s*\d+(?:[.,]\d{1,2})?$/i;
const isAmount = (s: string) => AMOUNT.test(s.trim()) && /\d/.test(s);
/** Page furniture that is not part of any row. */
const FOOTER = /\b(?:halaman|page)\s*\d+|\be-?statement\b|\bberizin\b|\blicensed\b|\bsupport@|\bwww\.|\.co\.id\b|\.id\b|\bojk\b|\blps\b|\bdicetak\b|\bprinted\b|\bcall center\b|^\d+\s*(?:dari|of)\s*\d+$/i;

/* ------------------------------------------------------------------ The figures around the table */

const META: [keyof StatementMeta, RegExp][] = [
  ['opening', /\b(?:saldo\s+(?:awal|sebelumnya)|opening balance|previous balance|beginning balance)\b/i],
  ['closing', /\b(?:saldo\s+akhir|ending balance|closing balance)\b/i],
  ['totalIn', /\b(?:total\s+(?:pemasukan|uang masuk|dana masuk|kredit|credit|incoming|mutasi kredit|mutasi credit)|mutasi\s+(?:cr|kredit|credit)|jumlah\s+kredit)\b/i],
  ['totalOut', /\b(?:total\s+(?:pengeluaran|uang keluar|dana keluar|debet|debit|outgoing|mutasi debet|mutasi debit)|mutasi\s+(?:db|debet|debit)|jumlah\s+debet)\b/i],
  ['pointsUsed', /\b(?:total\s+(?:gopay\s+)?(?:coins?|koin|poin|points?)\s+(?:dipakai|digunakan|terpakai|used))\b/i],
];
const OWNER = /\b(?:pemilik rekening|account owner|nama nasabah|nama pemilik|account name|nama rekening|customer name|nama pelanggan)\b/i;
const PHONE = /^(?:\+?62|0)8\d{7,12}$/;

/** An amount with its cents and sign ("-Rp0,26", "+Rp61.000,00", "1,234.00 DB"), or nothing when the text is not one. */
const money = (s: string) => {
  const t = s.replace(/^[:=\s]+/, '').trim();
  const a = isAmount(t) ? parseAmount(t) : null;
  return a ? (a.sign < 0 ? -a.exact : a.exact) : undefined;
};

/** The summary figures: each label's amount on the same line to its right, else just under it. The first one wins. */
function metaOf(lines: Line[], tableLines: Set<Line>): StatementMeta {
  const out: StatementMeta = {};
  const free = lines.filter(l => !tableLines.has(l));
  free.forEach((line, k) => {
    const cells = cellsOf(line);
    cells.forEach((cell, ci) => {
      for (const [key, re] of META) {
        if (out[key] !== undefined || !re.test(cell.s)) continue;
        // The amount after the label in the same cell ("SALDO AKHIR : 1,234.00"), or the next cells before another label.
        const rest = cell.s.slice((cell.s.match(re)!.index || 0) + cell.s.match(re)![0].length).replace(/^[\s/:=]+/, '').replace(/^\p{L}[\p{L}\s]*\/?\s*/u, '');
        let value = rest ? money(rest) : undefined;
        for (let j = ci + 1; value === undefined && j < cells.length; j++) { const v = money(cells[j].s); if (v !== undefined) { value = v; break; } if (/\p{L}{3,}/u.test(cells[j].s.replace(/\b(?:rp|idr)\b/gi, ''))) break; }
        // Under the label: the next one or two lines on the same page, the amount nearest its left edge.
        for (let d = 1; value === undefined && d <= 2; d++) {
          const below = free[k + d];
          if (!below || below.page !== line.page || below.y - line.y > line.h * 4.5) break;
          const near = cellsOf(below).map(c => ({ c, v: money(c.s) })).filter(o => o.v !== undefined && Math.abs(o.c.x - cell.x) < Math.max(60, cell.end - cell.x)).sort((a, b) => Math.abs(a.c.x - cell.x) - Math.abs(b.c.x - cell.x))[0];
          if (near) value = near.v;
        }
        if (value !== undefined) (out as Record<string, number>)[key] = key === 'opening' || key === 'closing' ? value : Math.abs(value);
      }
      if (!out.owner && OWNER.test(cell.s)) {
        // The English label printed next to it ("Pemilik Rekening /" "Account Owner") is not the name.
        const next = cells.slice(ci + 1).find(c => !OWNER.test(c.s)), below = free[k + 1];
        const name = next && next.x - cell.end < 60 && !/\d{3,}/.test(next.s) && /\p{L}{2,}/u.test(next.s) && !META.some(([, re]) => re.test(next.s)) ? next.s
          : below && below.page === line.page ? cellsOf(below).filter(c => Math.abs(c.x - cell.x) < 40 && /\p{L}{2,}/u.test(c.s) && !/\d{3,}/.test(c.s)).map(c => c.s)[0] : undefined;
        if (name) out.owner = name.replace(/^[:\s]+/, '').trim();
      }
    });
  });
  // No label (GoPay): the name printed just above the phone number at the top of the first page.
  if (!out.owner) {
    const first = free.filter(l => l.page === 1);
    for (let i = 1; i < first.length && !out.owner; i++) {
      const phone = cellsOf(first[i]).find(c => PHONE.test(c.s.replace(/[\s-]/g, '')));
      if (!phone) continue;
      // The nearest text above it that starts at the same place (other columns may sit between).
      for (let j = i - 1; j >= 0 && first[i].y - first[j].y < first[i].h * 3 && !out.owner; j--) {
        const name = cellsOf(first[j]).find(c => Math.abs(c.x - phone.x) < 12);
        if (name) { if (/^\p{L}[\p{L}\s.'-]{1,60}$/u.test(name.s)) out.owner = name.s.trim(); break; }
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------------ The table */

/** Pages of text as one table (a header row named by role, then one row per transaction) and the summary figures. */
export function tableFromPieces(pages: Piece[][]): PdfStatement {
  const lines = pages.flatMap(p => linesOf(p));
  const tableLines = new Set<Line>();
  type Row = { cells: Map<ColRole, string[]>; first: Map<ColRole, string>; last: Line };
  const rows: Row[] = [];
  const names = new Map<ColRole, string>();
  let cols: Col[] | null = null, row: Row | null = null;
  const pitch = median(lines.map(l => l.h)) || 8;
  for (const line of lines) {
    const header = headerOf(line);
    // A header under a header (the English line some banks print below): it keeps the roles read from the first.
    if (header && cols && !row) for (const c of header) if (c.role === 'other') c.role = cols.find(o => o.role !== 'other' && Math.min(o.end, c.end) - Math.max(o.x, c.x) > 0)?.role || 'other';
    if (header) { cols = header; row = null; tableLines.add(line); for (const c of header) if (c.role !== 'other' && !names.has(c.role)) names.set(c.role, c.name); continue; }
    if (!cols) continue;
    const text = line.pieces.map(p => p.s).join(' ');
    const placed = line.pieces.map(p => ({ p, col: cols![columnOf(p, cols!)] }));
    const dateText = placed.filter(o => o.col.role === 'date').map(o => o.p.s).join(' ');
    const amountOnLine = placed.some(o => MONEY.includes(o.col.role) && o.col.role !== 'balance' && isAmount(o.p.s));
    if (rowDate(dateText, amountOnLine)) {
      row = { cells: new Map(), first: new Map(), last: line };
      rows.push(row);
    } else {
      // A line under the row: close enough, on the same page, and not page furniture or a summary label.
      const close = row && row.last.page === line.page && line.y - row.last.y <= Math.max(pitch * 2.6, line.h * 2.6);
      if (!row || !close || FOOTER.test(text) || META.some(([, re]) => re.test(text)) || OWNER.test(text)) { row = null; continue; }
      row.last = line;
    }
    tableLines.add(line);
    // Each column's text: the description gathers every line (" · " between lines); the others keep their first value.
    const byCol = new Map<ColRole, string[]>();
    for (const { p, col } of placed) { if (col.role === 'other') continue; const list = byCol.get(col.role) || []; list.push(p.s); byCol.set(col.role, list); }
    for (const [role, parts] of byCol) {
      const joined = parts.join(' ').replace(/\s+/g, ' ').trim();
      if (!joined) continue;
      if (role === 'desc') { const list = row.cells.get('desc') || []; list.push(joined); row.cells.set('desc', list); }
      else if (row.first.has(role)) continue;
      else if (!MONEY.includes(role) || isAmount(joined)) row.first.set(role, joined);
    }
  }
  const order: ColRole[] = ['date', 'desc', 'kind', 'debit', 'credit', 'amount', 'balance'];
  const used = order.filter(r => r === 'desc' || rows.some(x => x.first.has(r)) || (r === 'date' && rows.length));
  const fallback: Record<ColRole, string> = { date: 'Tanggal', desc: 'Keterangan', kind: 'Tipe', debit: 'Debet', credit: 'Kredit', amount: 'Jumlah', balance: 'Saldo', other: '' };
  const table: string[][] = [];
  // The period above the table, for dates written without a year.
  const period = lines.find(l => l.page === 1 && !tableLines.has(l) && /\b(?:periode|period)\b/i.test(l.pieces.map(p => p.s).join(' ')));
  if (period) table.push([period.pieces.map(p => p.s).join(' ')]);
  // The bank's own header words when the statement reader knows them ("Tanggal & Waktu"), else plain ones.
  table.push(used.map(r => { const n = names.get(r); return n && headerRole(n) === r ? n : fallback[r]; }));
  for (const r of rows) table.push(used.map(role => role === 'desc' ? (r.cells.get('desc') || []).join(' · ') : r.first.get(role) || ''));
  const meta = metaOf(lines, tableLines);
  return { table, meta, pages: pages.length };
}

/** A PDF statement read into a table for readStatement, with its summary figures. */
export async function readPdfStatement(bytes: Uint8Array, opts: { password?: string } = {}): Promise<PdfStatement> {
  const { pieces, pages } = await pdfPieces(bytes, opts.password);
  if (!pieces.some(p => p.length)) throw Error('PDF ini berupa gambar (hasil scan), jadi tulisannya belum bisa dibaca. Unduh e-statement asli dari aplikasi bank/e-wallet, atau pakai file CSV/Excel.');
  const read = tableFromPieces(pieces);
  if (read.table.filter(r => r.length > 1).length < 2) throw Error('Tabel mutasi tidak ditemukan di PDF ini. Pastikan ini e-statement/mutasi rekening dengan kolom Tanggal dan Jumlah (atau Debet/Kredit).');
  return { ...read, pages };
}
