'use client';
import { Fragment, type CSSProperties, type ReactNode } from 'react';
import { appleEmojiKeys } from '@/lib/apple-emoji';

const pictographic = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;
/** File name for an emoji: hex codepoints joined by "-", variation selectors dropped. */
export const emojiKey = (emoji: string) => [...emoji].map(c => c.codePointAt(0)!.toString(16).padStart(4, '0')).filter(c => c !== 'fe0f').join('-');
export const hasAppleEmoji = (emoji: string) => appleEmojiKeys.has(emojiKey(emoji));

/** One emoji drawn with the bundled iOS artwork, so it looks the same on Android, Windows and iPhone. */
export function Emoji({ e, className = '' }: { e: string; className?: string }) {
  const key = emojiKey(e);
  if (!appleEmojiKeys.has(key)) return <span className={className}>{e}</span>;
  return <img src={`/emoji/${key}.webp`} alt={e} className={`emoji ${className}`} draggable={false} decoding="async"/>;
}

function graphemes(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) return [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].map(s => s.segment);
  return text.match(/\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}️?)*|[\s\S]/gu) || [];
}
/** Text with any emoji inside swapped for the iOS artwork. */
export function EmojiText({ text }: { text?: string | null }): ReactNode {
  if (!text || !pictographic.test(text)) return text ?? null;
  const parts: ReactNode[] = []; let plain = '';
  graphemes(text).forEach((g, i) => { if (pictographic.test(g) && hasAppleEmoji(g)) { if (plain) parts.push(plain); plain = ''; parts.push(<Emoji key={i} e={g}/>); } else plain += g; });
  if (plain) parts.push(plain);
  return <Fragment>{parts}</Fragment>;
}

/** Props for a `data-avatar` row icon: the emoji as text, plus its iOS artwork when available. */
export function emojiAvatar(emoji: string): { 'data-avatar': string; style?: CSSProperties } {
  const key = emojiKey(emoji);
  return appleEmojiKeys.has(key) ? { 'data-avatar': emoji, style: { '--avatar-img': `url(/emoji/${key}.webp)` } as CSSProperties } : { 'data-avatar': emoji };
}
