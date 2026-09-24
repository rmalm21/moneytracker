import type { ColorMode, Profile, ThemePreset } from './types';

export const themes: { value: ThemePreset; label: string; color: string }[] = [
  { value: 'default', label: 'Dompet Ajaib', color: '#267e73' },
  { value: 'peach', label: 'Soft Peach', color: '#ad594d' },
  { value: 'lavender', label: 'Lavender', color: '#7762a6' },
  { value: 'sage', label: 'Sage', color: '#53795c' },
  { value: 'ocean', label: 'Ocean', color: '#386e9a' },
  { value: 'rose', label: 'Rose', color: '#a35170' },
  { value: 'monochrome', label: 'Monochrome', color: '#3d5059' },
];
const channel = (value: number) => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; };
const light = (hex: string) => { const [r, g, b] = [1, 3, 5].map(index => channel(parseInt(hex.slice(index, index + 2), 16))); return .2126 * r + .7152 * g + .0722 * b; };
export const contrast = (a: string, b: string) => { const brighter = Math.max(light(a), light(b)), darker = Math.min(light(a), light(b)); return (brighter + .05) / (darker + .05); };
export const validAccent = (hex: string, mode: 'light' | 'dark') => /^#[0-9a-fA-F]{6}$/.test(hex) && contrast(hex, mode === 'dark' ? '#1b2c35' : '#ffffff') >= 4.5;
export function effectiveMode(mode: ColorMode | undefined, legacy: Profile['theme'] | undefined) {
  if (mode === 'system') return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return mode || legacy || 'light';
}
export function applyAppearance(profile: Profile | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const mode = effectiveMode(profile?.colorMode, profile?.theme);
  root.dataset.theme = mode;
  root.dataset.preset = profile?.themePreset || 'default';
  root.dataset.density = profile?.density || 'comfortable';
  root.dataset.fontSize = profile?.fontSize || 'm';
  const accent = profile?.accentColor;
  if (accent && validAccent(accent, mode)) {
    root.style.setProperty('--accent', accent);
    // Opaque tint so the soft colour also reads well on the dark sidebar.
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 16%, var(--paper))`);
    root.style.setProperty('--accent-on', contrast(accent, '#ffffff') > contrast(accent, '#172f3c') ? '#ffffff' : '#172f3c');
  } else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent-soft'); root.style.removeProperty('--accent-on'); }
  // The phone's browser bar follows the chosen palette.
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  if (paper) document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => { meta.content = paper; });
}
const cacheKey=(uid:string)=>`dompet-ajaib:appearance:${uid}`;
export function readCachedAppearance(uid:string):Profile|null{if(typeof localStorage==='undefined')return null;try{const value=JSON.parse(localStorage.getItem(cacheKey(uid))||'null');return value&&value.uid===uid?value as Profile:null}catch{return null}}
export function cacheAppearance(profile:Profile){if(typeof localStorage==='undefined')return;try{localStorage.setItem(cacheKey(profile.uid),JSON.stringify({uid:profile.uid,theme:profile.theme,themePreset:profile.themePreset,colorMode:profile.colorMode,accentColor:profile.accentColor,density:profile.density,fontSize:profile.fontSize}));localStorage.setItem('dompet-ajaib:appearance:last',profile.uid)}catch{/* Appearance cache is optional. */}}
