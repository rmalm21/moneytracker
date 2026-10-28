/**
 * 6.6: the browser's own form warnings ("Please fill out this field", "Value must be less than or equal to 31") in
 * plain Indonesian, for every form in the app. Returns '' when the field is fine.
 */
export function validityMessage(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const v = el.validity, input = el instanceof HTMLInputElement ? el : null;
  if (v.valid || v.customError) return '';
  if (v.valueMissing) return el instanceof HTMLSelectElement ? 'Pilih salah satu dulu.' : 'Bagian ini wajib diisi.';
  if (v.rangeUnderflow) return `Paling kecil ${input?.min}.`;
  if (v.rangeOverflow) return `Paling besar ${input?.max}.`;
  if (v.typeMismatch) return input?.type === 'email' ? 'Tulis email yang benar, misalnya nama@gmail.com.' : input?.type === 'url' ? 'Tulis alamat yang benar, diawali https://.' : 'Isiannya belum sesuai.';
  if (v.tooShort) return `Minimal ${input?.minLength ?? (el as HTMLTextAreaElement).minLength} karakter.`;
  if (v.tooLong) return `Maksimal ${input?.maxLength ?? (el as HTMLTextAreaElement).maxLength} karakter.`;
  if (v.stepMismatch) return 'Pakai angka bulat.';
  if (v.badInput) return 'Tulis angka saja.';
  if (v.patternMismatch) return el.title || 'Formatnya belum sesuai.';
  return 'Isiannya belum sesuai.';
}

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isField = (el: EventTarget | null): el is Field => el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

/**
 * Puts the Indonesian warnings in place for the whole document. Only warnings set here are touched (an app's own
 * setCustomValidity stays), and they are cleared on every edit and right before a form is sent again, so a field
 * filled by a chip or a picker is never left stuck as invalid. Returns the cleanup.
 */
export function installFormMessages() {
  const ours = new Set<Field>();
  const clear = (el: Field) => { if (ours.delete(el)) el.setCustomValidity(''); };
  const invalid = (e: Event) => {
    const el = e.target; if (!isField(el)) return;
    if (el.validity.customError && !ours.has(el)) return;
    clear(el);
    const message = validityMessage(el); if (message) { el.setCustomValidity(message); ours.add(el); }
  };
  const edit = (e: Event) => { if (isField(e.target)) clear(e.target); };
  const beforeSend = (form: HTMLFormElement | null | undefined) => { if (form) for (const el of [...ours]) if (el.form === form || !el.isConnected) clear(el); };
  const click = (e: Event) => { const b = (e.target as Element | null)?.closest?.('button, input[type=submit]') as HTMLButtonElement | HTMLInputElement | null; if (b?.type === 'submit') beforeSend(b.form); };
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' && isField(e.target)) beforeSend(e.target.form); };
  document.addEventListener('invalid', invalid, true); document.addEventListener('input', edit, true); document.addEventListener('change', edit, true);
  document.addEventListener('click', click, true); document.addEventListener('keydown', key, true);
  return () => {
    document.removeEventListener('invalid', invalid, true); document.removeEventListener('input', edit, true); document.removeEventListener('change', edit, true);
    document.removeEventListener('click', click, true); document.removeEventListener('keydown', key, true);
  };
}
