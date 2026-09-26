'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, Eye, EyeOff, LockKeyhole, Sparkles, TriangleAlert, WalletCards } from 'lucide-react';
import { useApp } from '@/components/app-provider';
import { Field, Input } from '@/components/fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ForgotPassword, ResetPasswordPanel } from '@/components/password-ui';
import { friendlyError, login } from '@/lib/auth';

/** After "Hapus akun" the app lands here with a short goodbye (or a note that the login itself still exists). */
const goodbye: Record<string, [boolean, string]> = {
  done: [true, 'Akunmu sudah dihapus beserta semua datanya. Terima kasih sudah memakai Dompet Ajaib.'],
  partial: [false, 'Semua data sudah dihapus, tetapi akunnya belum. Masuk lagi, lalu buka Pengaturan → Hapus akun sekali lagi.'],
};

export default function LoginPage(){
 const {user,loading,ready}=useApp();const router=useRouter();
 const [identifier,setIdentifier]=useState(''),[password,setPassword]=useState(''),[show,setShow]=useState(false),[remember,setRemember]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [forgotOpen,setForgotOpen]=useState(false),[resetCode,setResetCode]=useState(''),[notice,setNotice]=useState<[boolean,string]|null>(null),[checked,setChecked]=useState(false);
 // A reset link opens this page with ?mode=resetPassword&oobCode=…; it is handled here even when someone is signed in.
 useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get('mode')==='resetPassword'&&params.get('oobCode'))setResetCode(params.get('oobCode')||'');try{const left=sessionStorage.getItem('dompet-ajaib:account-deleted');if(left){sessionStorage.removeItem('dompet-ajaib:account-deleted');setNotice(goodbye[left]||null);}}catch{/* No message then. */}setChecked(true);},[]);
 useEffect(()=>{if(checked&&user&&!resetCode)router.replace('/');},[checked,user,resetCode,router]);
 function leaveReset(email:string){window.history.replaceState(null,'','/login/');setResetCode('');if(email){setIdentifier(email);setPassword('');}}
 async function submit(e:FormEvent){e.preventDefault();if(!identifier.trim()){setError('Masukkan username.');return;}if(!password){setError('Masukkan password.');return;}setBusy(true);setError('');try{await login(identifier,password,remember);router.replace('/');}catch(e){setError(friendlyError(e));}finally{setBusy(false);}}
 return <main className="login-shell"><div className="login-art"><div className="brand"><span className="brand-mark"><Sparkles size={21}/></span><strong>dompet ajaib<span className="brand-dot">.</span></strong></div><div className="login-copy"><span className="eyebrow">KEUANGAN PRIBADI, JADI JELAS</span><h1>Uangmu,<br/><em>lebih jelas.</em></h1><p>Lihat mana yang sudah punya tujuan, mana yang bebas dipakai, dan ke mana setiap rupiah pergi.</p></div><div className="login-statement"><WalletCards size={23}/><span>Saldo besar belum tentu uang bebas.</span></div></div>
  <div className="login-panel"><div className="login-card"><div className="mobile-brand brand"><span className="brand-mark"><Sparkles size={20}/></span><strong>dompet ajaib<span className="brand-dot">.</span></strong></div>
   {resetCode?<ResetPasswordPanel code={resetCode} onDone={leaveReset} onRequestNew={()=>{leaveReset('');setForgotOpen(true);}}/>:<>
    {notice&&<div className={`login-notice ${notice[0]?'is-done':'is-warn'}`} role="status">{notice[0]?<CircleCheck size={18}/>:<TriangleAlert size={18}/>}<span>{notice[1]}</span></div>}
    <div className="login-icon"><LockKeyhole size={23}/></div><p className="eyebrow ink">SELAMAT DATANG</p><h2>Masuk ke akunmu</h2><p className="muted">Catatan keuanganmu tersedia setelah masuk.</p>{!ready&&<p className="form-error">Konfigurasi Firebase belum diisi. Lihat README untuk menghubungkan proyek.</p>}
    <form onSubmit={submit}><Field label="Username atau email"><Input autoComplete="username" value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="contoh: rama"/></Field><Field label="Password"><div className="password-wrap"><Input autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} type={show?'text':'password'} placeholder="Masukkan password"/><button type="button" className="password-toggle" aria-label={show?'Sembunyikan password':'Tampilkan password'} onClick={()=>setShow(!show)}>{show?<EyeOff size={19}/>:<Eye size={19}/>}</button></div></Field><div className="form-meta"><label className="check-row"><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/> Ingat saya</label><button type="button" className="link-button" onClick={()=>setForgotOpen(true)}>Lupa password?</button></div>{error&&<p role="alert" className="form-error">{error}</p>}<Button className="full" disabled={busy||loading||!ready}>{busy?'Memeriksa akun…':'Masuk'}</Button></form><p className="login-foot">Data setiap akun tersimpan terpisah dan dilindungi oleh aturan akses Firebase.</p>
   </>}
  </div></div>
  <Dialog open={forgotOpen} onOpenChange={setForgotOpen}><DialogContent title="Atur ulang password" className="auth-dialog">{forgotOpen&&<ForgotPassword initial={identifier} onClose={()=>setForgotOpen(false)}/>}</DialogContent></Dialog></main>;
}
