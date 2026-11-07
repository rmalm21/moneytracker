// 8.7 A tiny PDF writer for tests: text at given positions in Helvetica (one of the fonts every PDF reader has), on one
// or more pages, and optionally locked with a password (standard security handler, RC4 128-bit, revision 3, the lock
// most bank e-statements use). Every statement made with it is made up: no real account data.
import { createHash } from 'node:crypto';

const PAD = Buffer.from('28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a', 'hex');
const md5 = (...parts) => createHash('md5').update(Buffer.concat(parts.map(p => Buffer.from(p)))).digest();
function rc4(key, data) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) { j = (j + s[i] + key[i % key.length]) & 255; [s[i], s[j]] = [s[j], s[i]]; }
  const out = Buffer.alloc(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) { i = (i + 1) & 255; j = (j + s[i]) & 255; [s[i], s[j]] = [s[j], s[i]]; out[n] = data[n] ^ s[(s[i] + s[j]) & 255]; }
  return out;
}
const padded = pw => Buffer.concat([Buffer.from(pw, 'latin1'), PAD]).subarray(0, 32);
/** O, U and the file key of the standard security handler, revision 3, 128-bit (PDF 1.7, algorithms 2, 3 and 5). */
function security(user, owner, id, p) {
  let h = md5(padded(owner)); for (let i = 0; i < 50; i++) h = md5(h);
  let o = rc4(h, padded(user)); for (let i = 1; i <= 19; i++) o = rc4(Buffer.from(h.map(b => b ^ i)), o);
  const pBytes = Buffer.alloc(4); pBytes.writeInt32LE(p);
  let key = md5(padded(user), o, pBytes, id); for (let i = 0; i < 50; i++) key = md5(key.subarray(0, 16));
  key = key.subarray(0, 16);
  let u = rc4(key, md5(PAD, id)); for (let i = 1; i <= 19; i++) u = rc4(Buffer.from(key.map(b => b ^ i)), u);
  return { o, u: Buffer.concat([u, Buffer.alloc(16)]), key };
}
const objectKey = (key, num) => md5(key, Buffer.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, 0, 0])).subarray(0, 16);
const esc = s => s.replace(/[\\()]/g, m => `\\${m}`);

/**
 * pages: [[{ x, y, s, size? }]] with y from the top of the page. Options: width/height (A4 by default), password.
 * Returns the file's bytes.
 */
export function makePdf(pages, { width = 595, height = 842, password } = {}) {
  const id = md5(JSON.stringify(pages), String(password || ''));
  const sec = password ? security(password, `${password}-owner`, id, -4) : null;
  const objects = [];
  const add = body => { objects.push(body); return objects.length; };
  const catalog = add(null), tree = add(null), font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const kids = [];
  for (const items of pages) {
    const text = items.map(it => `BT /F1 ${it.size || 8} Tf 1 0 0 1 ${it.x.toFixed(2)} ${(height - it.y).toFixed(2)} Tm (${esc(it.s)}) Tj ET`).join('\n');
    const num = objects.length + 1;
    let data = Buffer.from(text, 'latin1');
    if (sec) data = rc4(objectKey(sec.key, num), data);
    add({ stream: data });
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${num} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objects[tree - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  const encrypt = sec ? add(`<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4 /O <${sec.o.toString('hex')}> /U <${sec.u.toString('hex')}> >>`) : 0;
  const chunks = [Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\n', 'latin1')];
  let at = chunks[0].length;
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(at);
    const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
    const part = typeof body === 'string' ? Buffer.from(`${body}\nendobj\n`, 'latin1')
      : Buffer.concat([Buffer.from(`<< /Length ${body.stream.length} >>\nstream\n`, 'latin1'), body.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    chunks.push(head, part); at += head.length + part.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`, ...offsets.map(o => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R${encrypt ? ` /Encrypt ${encrypt} 0 R` : ''} /ID [<${id.toString('hex')}> <${id.toString('hex')}>] >>\nstartxref\n${at}\n%%EOF\n`;
  chunks.push(Buffer.from(xref + trailer, 'latin1'));
  return new Uint8Array(Buffer.concat(chunks));
}

/** Text placed right-aligned so it ends at x (amounts in a bank's table), for Helvetica at the given size. */
const WIDTHS = { ' ': 278, '+': 584, '-': 333, ',': 278, '.': 278, '/': 278, R: 722, p: 556, D: 722, B: 667, C: 722 };
export const textWidth = (s, size = 8) => [...s].reduce((n, ch) => n + (WIDTHS[ch] ?? (/\d/.test(ch) ? 556 : 556)), 0) * size / 1000;
export const right = (end, y, s, size = 8) => ({ x: end - textWidth(s, size), y, s, size });
