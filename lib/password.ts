/** Password helpers shared by "Lupa password", the new-password page, and Ganti password. */
export type PasswordCheck = { ok: boolean; label: string };

/** Passwords (or near copies) that are guessed first. */
const common = ['password', 'passw0rd', '12345678', '123456789', '1234567890', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'iloveyou', 'sayang', 'rahasia', 'dompet', 'bismillah', 'indonesia', 'abc12345'];

/** The checklist shown under a new password. Only length (and differing from the old one) is required to save. */
export function passwordChecks(value: string, previous?: string): PasswordCheck[] {
  const checks: PasswordCheck[] = [
    { ok: value.length >= 8, label: 'Minimal 8 karakter' },
    { ok: /[a-zA-Z]/.test(value) && /\d/.test(value), label: 'Ada huruf dan angka' },
    { ok: (/[a-z]/.test(value) && /[A-Z]/.test(value)) || /[^a-zA-Z0-9]/.test(value), label: 'Ada huruf besar atau simbol' },
  ];
  if (previous !== undefined) checks.push({ ok: Boolean(value) && value !== previous, label: 'Beda dari password lama' });
  return checks;
}

/** 0 (empty) to 4 (very strong), from length and variety; short, one-character or well-known passwords stay weak. */
export function passwordScore(value: string) {
  if (!value) return 0;
  const lower = value.toLowerCase();
  if (value.length < 8 || /^(.)\1+$/.test(value) || /^\d+$/.test(value) || common.some(word => lower.includes(word) && lower.length <= word.length + 2)) return 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(pattern => pattern.test(value)).length;
  return Math.min(4, 1 + (kinds >= 2 ? 1 : 0) + (kinds >= 3 ? 1 : 0) + (value.length >= 12 ? 1 : 0));
}
export const strengthLabels = ['', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'] as const;

/** Enough to be saved: 8 characters, typed the same twice, and not the old password. */
export function passwordReady(value: string, repeat: string, previous?: string) {
  return value.length >= 8 && value === repeat && (previous === undefined || value !== previous);
}

/** "rama@gmail.com" → "ra••@gmail.com": shows where a link went without spelling out the address. */
export function maskEmail(email: string) {
  const at = email.lastIndexOf('@');
  if (at < 1) return email;
  const name = email.slice(0, at), keep = name.length <= 2 ? 1 : 2;
  return `${name.slice(0, keep)}${'•'.repeat(Math.max(2, Math.min(6, name.length - keep)))}${email.slice(at)}`;
}
