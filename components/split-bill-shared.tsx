'use client';
import type { CSSProperties } from 'react';
import { Emoji } from './emoji';
import type { BillStatus, PersonStatus } from '@/lib/split-bill';
import type { SplitParticipant } from '@/lib/types';
import { rupiah } from '@/lib/accounting';

/** Pieces shared by the Split Bill page and its creation flow. */

const tints = ['#267e73', '#d27a1f', '#587eab', '#a26790', '#2f9e6e', '#c2456b', '#7a5bc9', '#3a78d6'];
/** The same person always gets the same colour. */
export function personTint(name: string) { let hash = 0; for (const char of name.trim().toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return tints[hash % tints.length]; }
export const personName = (person: Pick<SplitParticipant, 'name' | 'isMe'> | undefined) => person?.isMe ? 'Kamu' : person?.name.trim() || 'Tanpa nama';

export function PersonAvatar({ person, size = 'md' }: { person: Pick<SplitParticipant, 'name' | 'isMe' | 'emoji'>; size?: 'sm' | 'md' | 'lg' }) {
  const label = personName(person);
  return <span className={`sb-avatar is-${size} ${person.isMe ? 'is-me' : ''}`} style={{ '--tint': personTint(person.isMe ? 'kamu' : person.name) } as CSSProperties} aria-hidden="true">{person.emoji ? <Emoji e={person.emoji}/> : label.charAt(0).toUpperCase()}</span>;
}

export const statusTone: Record<BillStatus, string> = { draft: 'is-muted', active: '', partial: 'is-warn', settled: 'is-done', cancelled: 'is-muted' };
export const personTone: Record<PersonStatus, string> = { payer: 'is-done', paid: 'is-done', partial: 'is-warn', unpaid: 'is-open' };

/* ------------------------------------------------------------------ Sharing (always started by the user) */

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const area = document.createElement('textarea'); area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select();
    const done = document.execCommand('copy'); area.remove(); return done;
  }
}
/** The phone's share sheet when there is one; otherwise the text is copied. Returns what happened. */
export async function shareText(text: string, title = 'Split Bill'): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share) {
    try { await navigator.share({ title, text }); return 'shared'; }
    catch (error) { if ((error as Error).name === 'AbortError') return 'cancelled'; }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}
/** Opens WhatsApp with the text ready; the user picks the chat and sends it. */
export function openWhatsApp(text: string) { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer'); }

function fit(ctx: CanvasRenderingContext2D, text: string, max: number) { if (ctx.measureText(text).width <= max) return text; let cut = text; while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1); return `${cut}…`; }
/**
 * The nota as a receipt picture: white paper with torn (zigzag) edges, a monospace print, dashed rules, per person
 * what they had and their total, then the bill total and whom to pay.
 */
export async function renderNota(nota: import('@/lib/split-bill').Nota): Promise<Blob> {
  const scale = 2, width = 440, pad = 30, inner = width - pad * 2;
  const mono = (weight: number, size: number) => `${weight} ${size}px ui-monospace, "SFMono-Regular", "Roboto Mono", Menlo, Consolas, monospace`;
  const sans = (weight: number, size: number) => `${weight} ${size}px "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const ink = '#1d2a31', soft = '#5f6d75', paper = '#fffdf8';
  const money = (value: number) => `${value < 0 ? '-' : ''}${Math.abs(value).toLocaleString('id-ID')}`;
  // First the rows (to know the height), then the drawing.
  type Row = { kind: 'center' | 'title' | 'rule' | 'double' | 'name' | 'line' | 'sum' | 'total' | 'note' | 'gap'; text?: string; amount?: string; h: number };
  const rows: Row[] = [];
  const probe = document.createElement('canvas').getContext('2d');
  const wrapTo = (text: string, font: string, max: number) => { if (!probe) return [text]; probe.font = font; const out: string[] = []; let line = ''; for (const word of text.split(/\s+/)) { const next = line ? `${line} ${word}` : word; if (probe.measureText(next).width <= max || !line) line = next; else { out.push(line); line = word; } } if (line) out.push(line); return out; };
  rows.push({ kind: 'center', text: nota.single ? 'TAGIHAN SPLIT BILL' : 'NOTA SPLIT BILL', h: 22 });
  for (const line of wrapTo(nota.title, sans(800, 21), inner)) rows.push({ kind: 'title', text: line, h: 28 });
  if (nota.place) rows.push({ kind: 'center', text: nota.place, h: 20 });
  rows.push({ kind: 'center', text: nota.when, h: 20 }, { kind: 'double', h: 22 });
  nota.people.forEach((person, index) => {
    if (index) rows.push({ kind: 'rule', h: 20 });
    rows.push({ kind: 'name', text: person.name.toUpperCase(), amount: person.note, h: 24 });
    for (const [label, amount] of person.lines) {
      const parts = wrapTo(label, mono(500, 13.5), inner - 110);
      parts.forEach((part, i) => rows.push({ kind: 'line', text: part, amount: i === parts.length - 1 ? money(amount) : '', h: 20 }));
    }
    if (!nota.single) rows.push({ kind: 'sum', text: 'Total', amount: rupiah(person.total), h: 26 });
  });
  rows.push({ kind: 'double', h: 24 }, { kind: 'total', text: nota.single ? 'TOTAL KAMU' : 'TOTAL TAGIHAN', amount: rupiah(nota.total), h: 34 });
  if (nota.payTo) rows.push({ kind: 'note', text: `Bayar ke: ${nota.payTo}`, h: 24 });
  rows.push({ kind: 'rule', h: 22 }, { kind: 'center', text: 'Terima kasih!', h: 22 });
  const tooth = 9, height = Math.ceil(tooth * 2 + 28 + rows.reduce((sum, row) => sum + row.h, 0) + 26 + 30);
  const canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Gambar belum bisa dibuat di perangkat ini.');
  ctx.scale(scale, scale);
  try { await document.fonts?.ready; } catch { /* system font is fine */ }
  ctx.fillStyle = '#e9eef0'; ctx.fillRect(0, 0, width, height);
  // Paper with zigzag top and bottom edges and a soft shadow.
  const left = 14, right = width - 14, top = 14, bottom = height - 14 - 26;
  ctx.save(); ctx.shadowColor = 'rgba(20, 40, 50, .18)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4; ctx.fillStyle = paper; ctx.beginPath();
  ctx.moveTo(left, top + tooth);
  for (let x = left, up = true; x < right; x += tooth, up = !up) ctx.lineTo(Math.min(right, x + tooth), up ? top : top + tooth);
  ctx.lineTo(right, bottom - tooth);
  for (let x = right, down = true; x > left; x -= tooth, down = !down) ctx.lineTo(Math.max(left, x - tooth), down ? bottom : bottom - tooth);
  ctx.closePath(); ctx.fill(); ctx.restore();
  const dashed = (y: number, pattern: number[], color = '#9aa7ad') => { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.setLineDash(pattern); ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke(); ctx.restore(); };
  const fitText = (text: string, max: number) => fit(ctx, text, max);
  let y = top + tooth + 22;
  for (const row of rows) {
    const mid = y + row.h / 2 + 4;
    ctx.textAlign = 'left'; ctx.fillStyle = ink;
    if (row.kind === 'center') { ctx.font = mono(600, 12.5); ctx.fillStyle = soft; ctx.textAlign = 'center'; ctx.fillText(fitText(row.text!, inner), width / 2, mid); }
    else if (row.kind === 'title') { ctx.font = sans(800, 21); ctx.textAlign = 'center'; ctx.fillText(row.text!, width / 2, mid + 2); }
    else if (row.kind === 'rule') dashed(y + row.h / 2, [4, 4]);
    else if (row.kind === 'double') { dashed(y + row.h / 2 - 2, [], '#c3ccd0'); dashed(y + row.h / 2 + 2, [], '#c3ccd0'); }
    else if (row.kind === 'name') { ctx.font = mono(800, 14.5); ctx.fillText(fitText(row.text!, inner - 120), pad, mid); if (row.amount) { ctx.font = mono(600, 11.5); ctx.fillStyle = row.amount === 'lunas' ? '#15803d' : soft; ctx.textAlign = 'right'; ctx.fillText(row.amount === 'lunas' ? '✓ LUNAS' : row.amount.toUpperCase(), width - pad, mid); } }
    else if (row.kind === 'line') { ctx.font = mono(500, 13.5); ctx.fillStyle = soft; ctx.fillText(row.text!, pad + 10, mid); if (row.amount) { ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.fillText(row.amount, width - pad, mid); } }
    else if (row.kind === 'sum') { dashed(y + 3, [2, 3], '#b5c0c4'); ctx.font = mono(800, 14); ctx.fillText('Total', pad + 10, mid + 2); ctx.textAlign = 'right'; ctx.fillText(row.amount!, width - pad, mid + 2); }
    else if (row.kind === 'total') { ctx.font = mono(800, 15); ctx.fillText(row.text!, pad, mid + 2); ctx.font = mono(800, 19); ctx.textAlign = 'right'; ctx.fillText(row.amount!, width - pad, mid + 3); }
    else if (row.kind === 'note') { ctx.font = mono(600, 13); ctx.fillStyle = soft; ctx.fillText(fitText(row.text!, inner), pad, mid); }
    y += row.h;
  }
  ctx.font = sans(600, 11); ctx.fillStyle = '#8795a0'; ctx.textAlign = 'center'; ctx.fillText('Dibuat dengan Dompet Ajaib', width / 2, height - 18);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Gambar belum bisa dibuat.')), 'image/png'));
}
/** Shares the image with the phone's share sheet, or saves it as a file. */
export async function shareImage(blob: Blob, name: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const file = new File([blob], `${name.replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'split-bill'}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Split Bill' }); return 'shared'; }
    catch (error) { if ((error as Error).name === 'AbortError') return 'cancelled'; }
  }
  const link = document.createElement('a'); link.href = URL.createObjectURL(file); link.download = file.name; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  return 'saved';
}

/* ------------------------------------------------------------------ Receipt photo */

/** A smaller JPEG of the photo (long side 1600 px), so it uploads fast and stays well under the size limit. */
export async function shrinkPhoto(file: Blob): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw Error('Pilih file gambar.');
  const source = await loadImage(file);
  const scale = Math.min(1, 1600 / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
  const ctx = canvas.getContext('2d'); if (!ctx) return file;
  ctx.drawImage(source.image, 0, 0, canvas.width, canvas.height);
  source.done();
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob || file), 'image/jpeg', .82));
}
async function loadImage(file: Blob): Promise<{ image: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === 'function') { const bitmap = await createImageBitmap(file); return { image: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() }; }
  const url = URL.createObjectURL(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(Error('Foto tidak bisa dibuka.')); img.src = url; });
  return { image, width: image.naturalWidth, height: image.naturalHeight, done: () => URL.revokeObjectURL(url) };
}
