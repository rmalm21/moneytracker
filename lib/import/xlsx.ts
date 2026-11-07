/**
 * 8.5 A small Excel (.xlsx) reader for bank and e-wallet statements, read on the device: nothing is uploaded.
 *
 * An .xlsx file is a zip of XML files. Only what a statement needs is read: the first worksheet's cells, with shared
 * and inline strings, numbers as they are stored, and dates as Excel day numbers (read as dates by the statement reader
 * where a date is expected). Formulas give their last computed value. Zip entries are unpacked with the browser's own
 * DecompressionStream ('deflate-raw'), so no library is added.
 */

type Entry = { name: string; method: number; size: number; offset: number };

const u16 = (b: Uint8Array, i: number) => b[i] | b[i + 1] << 8;
const u32 = (b: Uint8Array, i: number) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0;

/** The files in a zip, from its central directory. */
function zipEntries(b: Uint8Array): Entry[] {
  let end = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (u32(b, i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw Error('File Excel tidak terbaca (bukan .xlsx yang utuh).');
  const count = u16(b, end + 10), entries: Entry[] = [];
  let at = u32(b, end + 16);
  for (let n = 0; n < count && u32(b, at) === 0x02014b50; n++) {
    const method = u16(b, at + 10), size = u32(b, at + 20), nameLen = u16(b, at + 28), extra = u16(b, at + 30), comment = u16(b, at + 32), offset = u32(b, at + 42);
    entries.push({ name: new TextDecoder().decode(b.subarray(at + 46, at + 46 + nameLen)), method, size, offset });
    at += 46 + nameLen + extra + comment;
  }
  return entries;
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function readEntry(b: Uint8Array, e: Entry): Promise<string> {
  const nameLen = u16(b, e.offset + 26), extra = u16(b, e.offset + 28), start = e.offset + 30 + nameLen + extra;
  const raw = b.subarray(start, start + e.size);
  const bytes = e.method === 0 ? raw : e.method === 8 ? await inflate(raw) : null;
  if (!bytes) throw Error('File Excel ini memakai kompresi yang belum didukung. Simpan ulang sebagai .xlsx atau .csv.');
  return new TextDecoder().decode(bytes);
}

const unescapeXml = (s: string) => s.replace(/&(lt|gt|amp|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_m, e: string) => {
  const k = e.toLowerCase();
  return k === 'lt' ? '<' : k === 'gt' ? '>' : k === 'amp' ? '&' : k === 'quot' ? '"' : k === 'apos' ? "'" : String.fromCodePoint(k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
});
/** The text of a string item: its runs (<t>) joined, without phonetic hints (<rPh>). */
const textOf = (xml: string) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(m => unescapeXml(m[1])).join('');

/** Column letters → index ("A" → 0, "AB" → 27). */
function columnIndex(ref: string) {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Number formats that show a date: built-in ids 14–22 and 45–47, or a custom format with day/month/year letters. */
function dateStyles(stylesXml: string): Set<number> {
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)) custom.set(Number(m[1]), unescapeXml(m[2]));
  const xfs = stylesXml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] || '';
  const out = new Set<number>();
  [...xfs.matchAll(/<xf\b([^>]*)\/?>/g)].forEach((m, i) => {
    const id = Number(m[1].match(/numFmtId="(\d+)"/)?.[1] ?? 0);
    const code = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]/g, '');
    if (id >= 14 && id <= 22 || id >= 45 && id <= 47 || /[dy]/i.test(code) || /m{3,}/i.test(code)) out.add(i);
  });
  return out;
}

/** An Excel day number as yyyy-mm-dd (1900 date system; day 60 is the leap-year bug Excel keeps). */
export function excelDate(serial: number): string {
  const days = Math.floor(serial), ms = Date.UTC(1899, 11, 30) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/** The first worksheet of an .xlsx file as rows of cell texts. Date cells come back as yyyy-mm-dd. */
export async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entries = zipEntries(bytes), find = (name: string) => entries.find(e => e.name.toLowerCase() === name.toLowerCase());
  const shared: string[] = [];
  const sst = find('xl/sharedStrings.xml');
  if (sst) for (const m of (await readEntry(bytes, sst)).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));
  const styles = find('xl/styles.xml'), dates = styles ? dateStyles(await readEntry(bytes, styles)) : new Set<number>();
  // The first sheet in the workbook's order (its relationship target), else the first worksheet file.
  let sheet: Entry | undefined;
  const book = find('xl/workbook.xml'), rels = find('xl/_rels/workbook.xml.rels');
  if (book && rels) {
    const rid = (await readEntry(bytes, book)).match(/<sheet\b[^>]*r:id="([^"]+)"/)?.[1];
    const target = rid ? (await readEntry(bytes, rels)).match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] || (await readEntry(bytes, rels)).match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1] : undefined;
    if (target) sheet = find(target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);
  }
  sheet ||= entries.filter(e => /^xl\/worksheets\/[^/]+\.xml$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))[0];
  if (!sheet) throw Error('Lembar kerja di file Excel ini tidak ditemukan.');
  const xml = await readEntry(bytes, sheet), rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>|<row\b([^>]*)\/>/g)) {
    const rowNo = Number((r[1] || r[3] || '').match(/\br="(\d+)"/)?.[1] || rows.length + 1);
    const cells: string[] = [];
    let next = 0;
    for (const c of (r[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], body = c[2] || '';
      const ref = attrs.match(/\br="([A-Z]+)\d*"/i)?.[1];
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = attrs.match(/\bt="([^"]+)"/)?.[1] || 'n', style = Number(attrs.match(/\bs="(\d+)"/)?.[1] ?? -1);
      const v = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let text = '';
      if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') text = textOf(body);
      else if (type === 'str' || type === 'e') text = unescapeXml(v ?? '');
      else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) { const n = Number(v); text = dates.has(style) && Number.isFinite(n) && n > 0 && n < 2958466 ? excelDate(n) : v; }
      cells[col] = text.trim();
    }
    while (rows.length < rowNo - 1) rows.push([]);
    rows.push(Array.from(cells, x => x ?? ''));
  }
  return rows;
}

/** Whether these bytes are a zip (an .xlsx), by its first bytes. */
export const isZip = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
/** An old binary Excel file (.xls), which this reader does not open. */
export const isOldExcel = (b: Uint8Array) => b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
