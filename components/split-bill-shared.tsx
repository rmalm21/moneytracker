'use client';
import type { CSSProperties } from 'react';
import { Emoji } from './emoji';
import type { BillStatus, PersonStatus } from '@/lib/split-bill';
import type { SplitParticipant } from '@/lib/types';

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

export type ShareImage = { title: string; subtitle: string; heading: string; lines: [string, string][]; total: [string, string]; footer: string[] };
/** A clean image of a share (bill name, the person, the breakdown, what to pay and to whom). Nothing else is drawn. */
export async function renderShareImage(card: ShareImage): Promise<Blob> {
  const scale = 2, width = 540, pad = 32, lineHeight = 30;
  const height = pad * 2 + 124 + card.lines.length * lineHeight + 84 + card.footer.length * 24;
  const canvas = document.createElement('canvas'); canvas.width = width * scale; canvas.height = height * scale;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Gambar belum bisa dibuat di perangkat ini.');
  ctx.scale(scale, scale);
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue('--accent').trim() || '#267e73';
  const font = (weight: number, size: number) => `${weight} ${size}px "DM Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  try { await document.fonts?.ready; } catch { /* system font is fine */ }
  ctx.fillStyle = '#f3f6f7'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff'; roundRect(ctx, 12, 12, width - 24, height - 24, 22); ctx.fill();
  ctx.fillStyle = accent; roundRect(ctx, 12, 12, width - 24, 96, 22); ctx.fill(); ctx.fillRect(12, 80, width - 24, 28);
  ctx.fillStyle = '#ffffff'; ctx.font = font(800, 22); ctx.fillText(fit(ctx, card.title, width - pad * 2), pad, 54);
  ctx.font = font(500, 14); ctx.globalAlpha = .9; ctx.fillText(fit(ctx, card.subtitle, width - pad * 2), pad, 80); ctx.globalAlpha = 1;
  let y = 108 + 38;
  ctx.fillStyle = '#172f3c'; ctx.font = font(800, 18); ctx.fillText(fit(ctx, card.heading, width - pad * 2), pad, y); y += 14;
  ctx.font = font(500, 15);
  for (const [label, amount] of card.lines) {
    y += lineHeight;
    ctx.fillStyle = '#62737e'; ctx.textAlign = 'left'; ctx.fillText(fit(ctx, label, width - pad * 2 - 140), pad, y);
    ctx.fillStyle = '#172f3c'; ctx.textAlign = 'right'; ctx.fillText(amount, width - pad, y); ctx.textAlign = 'left';
  }
  y += 22; ctx.strokeStyle = '#e2e9eb'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(width - pad, y); ctx.stroke();
  y += 36; ctx.fillStyle = '#172f3c'; ctx.font = font(800, 18); ctx.fillText(card.total[0], pad, y);
  ctx.fillStyle = accent; ctx.font = font(800, 24); ctx.textAlign = 'right'; ctx.fillText(card.total[1], width - pad, y); ctx.textAlign = 'left';
  ctx.fillStyle = '#62737e'; ctx.font = font(600, 14);
  for (const line of card.footer) { y += 24; ctx.fillText(fit(ctx, line, width - pad * 2), pad, y); }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('Gambar belum bisa dibuat.')), 'image/png'));
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) { if (ctx.measureText(text).width <= max) return text; let cut = text; while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1); return `${cut}…`; }
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
export async function shrinkPhoto(file: File): Promise<Blob> {
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
type DetectedText = { rawValue: string; boundingBox: DOMRectReadOnly };
type TextDetectorClass = new () => { detect: (image: ImageBitmapSource) => Promise<DetectedText[]> };
/** The browser's own text recognition (Shape Detection API), when the device has it. Nothing is sent anywhere. */
export const canReadPhoto = () => typeof window !== 'undefined' && typeof (window as unknown as { TextDetector?: TextDetectorClass }).TextDetector === 'function';
/** Text lines read from the photo, top to bottom; empty when nothing could be read. */
export async function readPhotoText(photo: Blob): Promise<string> {
  const Detector = (window as unknown as { TextDetector?: TextDetectorClass }).TextDetector;
  if (!Detector) return '';
  const bitmap = await createImageBitmap(photo);
  try {
    const blocks = (await new Detector().detect(bitmap)).filter(block => block.rawValue?.trim());
    const rows: { y: number; h: number; parts: DetectedText[] }[] = [];
    for (const block of [...blocks].sort((a, b) => a.boundingBox.top - b.boundingBox.top)) {
      const middle = block.boundingBox.top + block.boundingBox.height / 2;
      const row = rows.find(line => Math.abs(line.y - middle) < Math.max(line.h, block.boundingBox.height) * .55);
      if (row) row.parts.push(block); else rows.push({ y: middle, h: block.boundingBox.height, parts: [block] });
    }
    return rows.map(row => row.parts.sort((a, b) => a.boundingBox.left - b.boundingBox.left).map(part => part.rawValue.trim()).join('   ')).join('\n');
  } finally { bitmap.close(); }
}
