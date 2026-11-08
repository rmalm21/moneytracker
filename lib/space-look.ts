/** 9.0 How a Ruang Bersama looks: its emoji and colour (each colour readable on light and dark screens). */
export const SPACE_EMOJIS = ['🏠', '🏡', '❤️', '💍', '👶', '👨‍👩‍👧', '🐱', '🐶', '🛒', '🍳', '✈️', '🏖️', '🎓', '🚗', '🎉', '💼'];
export const SPACE_COLORS: { key: string; label: string; light: string; dark: string }[] = [
  { key: 'rose', label: 'Merah muda', light: '#b0386b', dark: '#f29bbf' },
  { key: 'violet', label: 'Ungu', light: '#6a4bc4', dark: '#b9a3f5' },
  { key: 'blue', label: 'Biru', light: '#2563c9', dark: '#8ab8f5' },
  { key: 'amber', label: 'Kuning tua', light: '#9a5a00', dark: '#f2b84b' },
  { key: 'teal', label: 'Hijau toska', light: '#0f7a69', dark: '#5fd3bf' },
  { key: 'orange', label: 'Oranye', light: '#b2461a', dark: '#f5a37a' },
];
export const spaceColor = (key: string | undefined, mode: 'light' | 'dark') => { const c = SPACE_COLORS.find(x => x.key === key) || SPACE_COLORS[0]; return mode === 'dark' ? c.dark : c.light; };
