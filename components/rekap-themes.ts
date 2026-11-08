/**
 * 9.6 Rekap in five looks, picked in Rekap (kept on this device): the slides use the look's colours (CSS, by
 * data-wr-theme) and the shared picture is drawn in the same look.
 */
export type RekapThemeId = 'bersih' | 'editorial' | 'pastel' | 'gelap' | 'pop';
export type RekapLook = {
  id: RekapThemeId; name: string; hint: string; swatch: [string, string, string];
  /** Picture colours. `accent: ''` takes the app's own accent colour. */
  ink: string; sub: string; accent: string; card: string; line: string; good: string; warn: string; serif?: boolean;
};
export const REKAP_THEMES: RekapLook[] = [
  { id: 'bersih', name: 'Bersih', hint: 'Putih lega, rapi, warna aksen aplikasimu', swatch: ['#f6f7f9', '#111418', ''], ink: '#111418', sub: '#6b7280', accent: '', card: '#ffffff', line: '#e5e7eb', good: '#15803d', warn: '#c2410c' },
  { id: 'editorial', name: 'Editorial', hint: 'Krem ala majalah, huruf serif, garis tipis', swatch: ['#f3ede2', '#1d1a16', '#c2410c'], ink: '#1d1a16', sub: '#7a6f60', accent: '#c2410c', card: 'transparent', line: '#d6cbb8', good: '#3f6212', warn: '#b91c1c', serif: true },
  { id: 'pastel', name: 'Pastel', hint: 'Gradasi lembut peach, lilac, dan mint', swatch: ['#ffd6c9', '#e3d4ff', '#c9f0e1'], ink: '#1f1b2e', sub: '#6b6680', accent: '#7c5cff', card: 'rgba(255,255,255,.62)', line: 'rgba(255,255,255,.95)', good: '#0f8a5f', warn: '#d9485f' },
  { id: 'gelap', name: 'Gelap', hint: 'Hitam kalem, satu warna aksen, minimalis', swatch: ['#0f1115', '#f5f7fa', ''], ink: '#f5f7fa', sub: '#9aa3b2', accent: '', card: '#171a21', line: '#262a33', good: '#4ade80', warn: '#fb7185' },
  { id: 'pop', name: 'Pop', hint: 'Blok warna berani, ceria, tiap slide beda', swatch: ['#2f5bff', '#ff6b4a', '#ffcc33'], ink: '#ffffff', sub: 'rgba(255,255,255,.82)', accent: '#ffcc33', card: '#ff6b4a', line: 'transparent', good: '#b7ffd8', warn: '#ffe1d6' },
];
const KEY = 'dompet-ajaib:rekap-theme';
export function rekapTheme(): RekapThemeId { try { const v = localStorage.getItem(KEY) as RekapThemeId | null; return v && REKAP_THEMES.some(t => t.id === v) ? v : 'bersih'; } catch { return 'bersih'; } }
export function setRekapTheme(id: RekapThemeId) { try { localStorage.setItem(KEY, id); } catch { /* preference */ } }
export const lookOf = (id: RekapThemeId) => REKAP_THEMES.find(t => t.id === id) || REKAP_THEMES[0];
