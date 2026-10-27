'use client';
import { useEffect, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useApp } from './app-provider';
import { Dialog, DialogContent } from './ui/dialog';
import { CreatePasswordForm } from './password-ui';
import { GOOGLE_NO_PASSWORD, hasPassword } from '@/lib/auth';

/**
 * 6.1: right after signing in with Google, an account without a password is asked once to make one (the sign-in is
 * fresh, so Firebase allows it without asking again). "Nanti saja" closes it; Pengaturan › Keamanan keeps the form.
 */
export function GooglePasswordPrompt({ notify }: { notify: (message: string) => void }) {
  const { user } = useApp();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!user || hasPassword(user)) return; try { if (sessionStorage.getItem(GOOGLE_NO_PASSWORD) === '1') setOpen(true); } catch { /* no prompt */ } }, [user]);
  const close = () => { try { sessionStorage.removeItem(GOOGLE_NO_PASSWORD); } catch { /* ignore */ } setOpen(false); };
  if (!open || !user) return null;
  return <Dialog open onOpenChange={next => { if (!next) close(); }}><DialogContent title="Buat password dulu, yuk" className="pw-prompt">
    <div className="pw-prompt-head"><span className="auth-badge is-small" aria-hidden="true"><KeyRound size={20}/></span><p>Kamu masuk pakai Google, jadi akun ini belum punya password. Dengan password, akunmu tetap bisa dibuka pakai <b>{user.email}</b> kalau Google lagi bermasalah, dan bisa dipakai untuk konfirmasi hal penting seperti hapus akun.</p></div>
    <CreatePasswordForm user={user} compact onDone={() => { close(); notify('Password sudah dibuat. Sekarang bisa masuk pakai Google atau password.'); }}/>
    <button type="button" className="link-button pw-prompt-later" onClick={close}>Nanti saja</button>
  </DialogContent></Dialog>;
}
