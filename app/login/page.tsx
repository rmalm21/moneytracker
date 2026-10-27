'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { CircleCheck, Eye, EyeOff, LockKeyhole, Sparkles, TriangleAlert, WalletCards } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Field, Input } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ForgotPassword, ResetPasswordPanel } from '@/components/password-ui';
import { finishGoogleRedirect, friendlyError, hasGoogle, linkGoogle, login, loginWithGoogle } from '@/lib/auth';
import { GoogleButton, GoogleMark } from '@/components/google-button';

/** After "Hapus akun" the app lands here with a short goodbye (or a note that the login itself still exists). */
const goodbye: Record<string, [boolean, string]> = {
  done: [true, 'Akunmu sudah dihapus beserta semua datanya. Terima kasih sudah memakai Dompet Ajaib.'],
  partial: [false, 'Semua data sudah dihapus, tetapi akunnya belum. Masuk lagi, lalu buka Pengaturan → Hapus akun sekali lagi.'],
};

export default function LoginPage(){
 const {user,loading,ready}=useApp();
 const [identifier,setIdentifier]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[remember,setRemember]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [forgotOpen,setForgotOpen]=useState(false),[googleBusy,setGoogleBusy]=useState(false),[linkMode,setLinkMode]=useState(false),[resetCode,setResetCode]=useState(''),[notice,setNotice]=useState<[boolean,string]|null>(null),[checked,setChecked]=useState(false);
 // A reset link opens this page with ?mode=resetPassword&oobCode=…; it is handled here even when someone is signed in.
 useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get('mode')==='resetPassword'&&params.get('oobCode'))setResetCode(params.get('oobCode')||'');if(params.get('mode')==='linkGoogle')setLinkMode(true);try{const left=sessionStorage.getItem('dompet-ajaib:account-deleted');if(left){sessionStorage.removeItem('dompet-ajaib:account-deleted');setNotice(goodbye[left]||null);}}catch{/* No message then. */}setChecked(true);void finishGoogleRedirect().then(({error,linked})=>{if(error)setError(error);else if(linked)enterApp('/?view=settings');});},[]);
 // The app is opened with a full load (not a client-side switch): only then is it cross-origin isolated again, which the
 // receipt reader's threads need; this page itself is not isolated, so Google's sign-in popup can answer it.
 const enterApp=(path='/')=>window.location.replace(path);
 useEffect(()=>{if(checked&&user&&!resetCode&&!linkMode)enterApp();},[checked,user,resetCode,linkMode]);
 function leaveReset(email:string){window.history.replaceState(null,'','/login/');setResetCode('');if(email){setIdentifier(email);setPassword('');}}
 async function google(){setGoogleBusy(true);setError('');try{if(await loginWithGoogle(remember)==='popup')enterApp();}catch(e){const message=friendlyError(e);if(message!=='Masuk dengan Google dibatalkan.')setError(message);}finally{setGoogleBusy(false);}}
 // Pengaturan → "Hubungkan akun Google" comes here (?mode=linkGoogle) because the popup needs this non-isolated page.
 async function link(){if(!user)return;setGoogleBusy(true);setError('');try{await linkGoogle(user);enterApp('/?view=settings');}catch(e){const message=friendlyError(e);if(message!=='Masuk dengan Google dibatalkan.')setError(message);setGoogleBusy(false);}}
 async function submit(e:FormEvent){e.preventDefault();if(!identifier.trim()){setError('Masukkan username.');return;}if(!password){setError('Masukkan password.');return;}setBusy(true);setError('');try{await login(identifier,password,remember);enterApp();}catch(e){setError(friendlyError(e));}finally{setBusy(false);}}
 return <main className="login-shell"><div className="login-art"><div className="brand"><span className="brand-mark"><Sparkles size={21}/></span><strong>dompet ajaib<span className="brand-dot">.</span></strong></div><div className="login-copy"><span className="eyebrow">KEUANGAN PRIBADI, JADI JELAS</span><h1>Uangmu,<br/><em>lebih jelas.</em></h1><p>Lihat mana yang sudah punya tujuan, mana yang bebas dipakai, dan ke mana setiap rupiah pergi.</p></div><div className="login-statement"><WalletCards size={23}/><span>Saldo besar belum tentu uang bebas.</span></div></div>
  <div className="login-panel"><div className="login-card"><div className="mobile-brand brand"><span className="brand-mark"><Sparkles size={20}/></span><strong>dompet ajaib<span className="brand-dot">.</span></strong></div>
   {linkMode&&user?<div className="login-link"><div className="login-icon google"><span className="google-glass-mark"><GoogleMark size={24}/></span></div><p className="eyebrow ink">PENGATURAN · KEAMANAN</p><h2>Hubungkan akun Google</h2><p className="muted">Kamu masuk sebagai <b>{user.email}</b>. Setelah terhubung, akun ini bisa dibuka dengan Google atau dengan password seperti biasa. Datanya tetap sama.</p>
    {hasGoogle(user)?<p className="login-notice is-done"><CircleCheck size={18}/><span>Akun Google sudah terhubung.</span></p>:<GoogleButton busy={googleBusy} onClick={()=>void link()} label="Hubungkan akun Google"/>}
    {error&&<p role="alert" className="form-error">{error}</p>}
    <button type="button" className="link-button login-back" onClick={()=>enterApp('/?view=settings')}>Kembali ke Pengaturan</button></div>
   :resetCode?<ResetPasswordPanel code={resetCode} onDone={leaveReset} onRequestNew={()=>{leaveReset('');setForgotOpen(true);}}/>:<>
    {notice&&<div className={`login-notice ${notice[0]?'is-done':'is-warn'}`} role="status">{notice[0]?<CircleCheck size={18}/>:<TriangleAlert size={18}/>}<span>{notice[1]}</span></div>}
    <div className="login-icon"><LockKeyhole size={23}/></div><p className="eyebrow ink">SELAMAT DATANG</p><h2>Masuk ke akunmu</h2><p className="muted">Catatan keuanganmu tersedia setelah masuk.</p>{!ready&&<p className="form-error">Konfigurasi cloud belum diisi. Lihat README untuk menghubungkan proyek.</p>}
    <form onSubmit={submit}><Field label="Username atau email"><Input autoComplete="username" value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="contoh: andi"/></Field><Field label="Password"><div className="password-wrap"><Input autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} type={show?'text':'password'} placeholder="Masukkan password"/><button type="button" className="password-toggle" aria-label={show?'Sembunyikan password':'Tampilkan password'} onClick={()=>setShow(!show)}>{show?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></Field><div className="form-meta"><label className="check-row"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Ingat saya</label><button type="button" className="link-button" onClick={()=>setForgotOpen(true)}>Lupa password?</button></div>{error&&<p role="alert" className="form-error">{error}</p>}<Button className="full" disabled={busy||loading||!ready}>{busy?'Memeriksa akun…':'Masuk'}</Button></form>
    <div className="login-or" role="separator"><span>atau</span></div>
    <GoogleButton busy={googleBusy} disabled={busy||!ready} onClick={()=>void google()}/><p className="login-foot">Data setiap akun tersimpan terpisah dan dilindungi oleh aturan akses cloud.</p>
   </>}
  <p className="login-credit">created by Rama <span className="login-credit-star" aria-hidden="true">✦</span></p>
  </div></div>
  <Dialog open={forgotOpen} onOpenChange={setForgotOpen}><DialogContent title="Atur ulang password" className="auth-dialog">{forgotOpen&&<ForgotPassword initial={identifier} onClose={()=>setForgotOpen(false)}/>}</DialogContent></Dialog></main>;
}
