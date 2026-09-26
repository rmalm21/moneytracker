import type { ColorMode, Profile, ThemePreset } from './types';

export const themes: { value: ThemePreset; label: string; color: string }[] = [
  { value: 'default', label: 'Dompet Ajaib', color: '#267e73' },
  { value: 'peach', label: 'Peach Lembut', color: '#ad594d' },
  { value: 'blush', label: 'Pink Pastel', color: '#e38aaa' },
  { value: 'lavender', label: 'Lavender', color: '#7762a6' },
  { value: 'sage', label: 'Sage', color: '#53795c' },
  { value: 'ocean', label: 'Samudra', color: '#386e9a' },
  { value: 'rose', label: 'Mawar', color: '#a35170' },
  { value: 'monochrome', label: 'Monokrom', color: '#3d5059' },
];
export type FontChoice = NonNullable<Profile['fontFamily']>;
/** Typefaces the user can pick. The default pair ships with the app; the others load only when chosen. */
export const fontChoices: { value: FontChoice; label: string; note: string; stack: string; query: string }[] = [
  { value: 'default', label: 'Bawaan', note: 'DM Sans & Manrope — seperti sekarang', stack: "'DM Sans', system-ui, sans-serif", query: '' },
  { value: 'inter', label: 'Inter', note: 'Rapi, netral, mudah dibaca', stack: "'Inter', system-ui, sans-serif", query: 'Inter:wght@400;500;600;700;800' },
  { value: 'google', label: 'Google Sans', note: 'Bulat dan ramah', stack: "'Google Sans', system-ui, sans-serif", query: 'Google+Sans:wght@400;500;600;700' },
  { value: 'jakarta', label: 'Plus Jakarta Sans', note: 'Modern, karya desainer Indonesia', stack: "'Plus Jakarta Sans', system-ui, sans-serif", query: 'Plus+Jakarta+Sans:wght@400;500;600;700;800' },
];
const fontsUrl = (query: string) => `https://fonts.googleapis.com/css2?${query}&display=swap`;
/** Adds (or swaps) the stylesheet of the chosen typeface; the default pair is already in the app's CSS. */
export function loadFont(choice?: string) {
  if (typeof document === 'undefined') return;
  const font = fontChoices.find(f => f.value === choice);
  if (!font?.query) return;
  const href = fontsUrl(`family=${font.query}`);
  let link = document.getElementById('font-choice') as HTMLLinkElement | null;
  if (!link) { link = document.createElement('link'); link.id = 'font-choice'; link.rel = 'stylesheet'; document.head.appendChild(link); }
  if (link.getAttribute('href') !== href) link.setAttribute('href', href);
}
/** Loads the other typefaces while the appearance settings are open, so each choice previews in its own font. */
export function loadFontPreviews() {
  if (typeof document === 'undefined' || document.getElementById('font-preview')) return;
  const link = document.createElement('link'); link.id = 'font-preview'; link.rel = 'stylesheet';
  link.href = fontsUrl(fontChoices.filter(f => f.query).map(f => `family=${f.query}`).join('&'));
  document.head.appendChild(link);
}
const channel = (value: number) => { const n = value / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; };
const light = (hex: string) => { const [r, g, b] = [1, 3, 5].map(index => channel(parseInt(hex.slice(index, index + 2), 16))); return .2126 * r + .7152 * g + .0722 * b; };
export const contrast = (a: string, b: string) => { const brighter = Math.max(light(a), light(b)), darker = Math.min(light(a), light(b)); return (brighter + .05) / (darker + .05); };
export const validAccent = (hex: string, mode: 'light' | 'dark') => /^#[0-9a-fA-F]{6}$/.test(hex) && contrast(hex, mode === 'dark' ? '#1b2c35' : '#ffffff') >= 4.5;
export function effectiveMode(mode: ColorMode | undefined, legacy: Profile['theme'] | undefined) {
  if (mode === 'system') return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return mode || legacy || 'light';
}
/** Default sizes when the account has not picked any: text S, display M (Normal). */
export const DEFAULT_FONT_SIZE: NonNullable<Profile['fontSize']> = 's';
export const DEFAULT_DENSITY: NonNullable<Profile['density']> = 'comfortable';
export function applyAppearance(profile: Profile | null) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const mode = effectiveMode(profile?.colorMode, profile?.theme);
  const accent = profile?.accentColor && validAccent(profile.accentColor, mode) ? profile.accentColor : '';
  const next: Record<string, string> = { theme: mode, preset: profile?.themePreset || 'default', density: profile?.density || DEFAULT_DENSITY, fontSize: profile?.fontSize || DEFAULT_FONT_SIZE, font: profile?.fontFamily || 'default' };
  // A new theme, palette or accent recolours everything in one step: transitions are paused for two frames,
  // otherwise buttons and cards fade from the old colours (a light flash when switching to dark).
  const recolor = root.dataset.theme !== next.theme || root.dataset.preset !== next.preset || root.style.getPropertyValue('--accent') !== accent;
  if (recolor) root.classList.add('theme-switching');
  for (const [key, value] of Object.entries(next)) if (root.dataset[key] !== value) root.dataset[key] = value;
  loadFont(profile?.fontFamily);
  if (accent) {
    root.style.setProperty('--accent', accent);
    // Opaque tint so the soft colour also reads well on the dark sidebar.
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${accent} 16%, var(--paper))`);
    root.style.setProperty('--accent-on', contrast(accent, '#ffffff') > contrast(accent, '#172f3c') ? '#ffffff' : '#172f3c');
  } else { root.style.removeProperty('--accent'); root.style.removeProperty('--accent-soft'); root.style.removeProperty('--accent-on'); }
  // The phone's browser bar follows the chosen palette (reading the style also applies the new colours now).
  const paper = getComputedStyle(root).getPropertyValue('--paper').trim();
  if (paper) document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach(meta => { meta.content = paper; });
  if (recolor) requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')));
}
const cacheKey=(uid:string)=>`dompet-ajaib:appearance:${uid}`;
export function readCachedAppearance(uid:string):Profile|null{if(typeof localStorage==='undefined')return null;try{const value=JSON.parse(localStorage.getItem(cacheKey(uid))||'null');return value&&value.uid===uid?value as Profile:null}catch{return null}}
export function cacheAppearance(profile:Profile){if(typeof localStorage==='undefined')return;try{localStorage.setItem(cacheKey(profile.uid),JSON.stringify({uid:profile.uid,theme:profile.theme,themePreset:profile.themePreset,colorMode:profile.colorMode,accentColor:profile.accentColor,density:profile.density,fontSize:profile.fontSize,fontFamily:profile.fontFamily}));localStorage.setItem('dompet-ajaib:appearance:last',profile.uid)}catch{/* Appearance cache is optional. */}}
