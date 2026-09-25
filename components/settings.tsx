'use client';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useBackHandler } from './back-guard';
import { BellRing, Check, ChevronLeft, ChevronRight, DatabaseBackup, Download, FileJson, History, KeyRound, LayoutDashboard, LockKeyhole, LogOut, Palette, ShieldCheck, SlidersHorizontal, Smartphone, Upload, UserRound, Wallet, type LucideIcon } from 'lucide-react';
import { useApp } from './app-provider';
import { AppearanceSettings } from './appearance-settings';
import { Field, FormActions, Input, Money, Select } from './fields';
import { Button } from './ui/button';
import { Confirm } from './ui/alert-dialog';
import { PinSettings } from './pin-lock';
import { ReminderSettings, reminderConfig } from './reminders';
import { applyUpdate, promptInstall, usePwa } from '@/lib/pwa';
import { changePassword, friendlyError, logout } from '@/lib/auth';
import { exportData, importData, saveProfile, validateBackup } from '@/lib/firestore';
import type { TimeZone } from '@/lib/types';
import { APP_VERSION } from '@/lib/version';
import { metrics, rupiah } from '@/lib/accounting';
import { commitments } from '@/lib/finance-control';
import { dateInTimeZone, todayInTimeZone } from '@/lib/period';
import { themes } from '@/lib/appearance';
/** A tappable row that jumps to another page. */
function SettingsLink({ icon: Icon, title, detail, onClick }: { icon: LucideIcon; title: string; detail: string; onClick?: () => void }) {
  return <button type="button" className="settings-link" onClick={onClick}><span className="settings-link-icon" aria-hidden="true"><Icon size={18}/></span><span className="settings-link-text"><strong>{title}</strong><small>{detail}</small></span><ChevronRight size={18} className="settings-link-arrow" aria-hidden="true"/></button>;
}
const backupNames: Record<string, string> = { wallets: 'dompet', categories: 'kategori', budgets: 'anggaran', transactions: 'transaksi', claims: 'klaim', receivables: 'piutang', debts: 'utang', funds: 'tujuan dana', recurring: 'jadwal rutin', drafts: 'draf', plannedTransactions: 'rencana', categorizationRules: 'aturan kategori', financialNotes: 'catatan', cycleSnapshots: 'siklus' };

type Section = 'profile' | 'security' | 'reminders' | 'appearance' | 'app' | 'control' | 'data';
const groups = ['Akun', 'Aplikasi', 'Keuangan & data'] as const;
const sections: { key: Section; title: string; detail: string; icon: LucideIcon; group: typeof groups[number]; tone: string }[] = [
  { key: 'profile', title: 'Profil & gaji', detail: 'Nama, siklus gaji, dan isian otomatis saat mencatat.', icon: UserRound, group: 'Akun', tone: 'teal' },
  { key: 'security', title: 'Keamanan', detail: 'PIN aplikasi dan password akun.', icon: KeyRound, group: 'Akun', tone: 'blue' },
  { key: 'reminders', title: 'Pengingat', detail: 'Jam pengingat perbarui saldo dan tagihan.', icon: BellRing, group: 'Aplikasi', tone: 'amber' },
  { key: 'appearance', title: 'Tampilan', detail: 'Tema warna, mode layar, dan ukuran teks.', icon: Palette, group: 'Aplikasi', tone: 'pink' },
  { key: 'app', title: 'Aplikasi di perangkat', detail: 'Pasang ke layar utama agar bisa dibuka offline.', icon: Smartphone, group: 'Aplikasi', tone: 'violet' },
  { key: 'control', title: 'Kontrol keuangan', detail: 'Cara menghitung uang bebas dan aset bersih.', icon: SlidersHorizontal, group: 'Keuangan & data', tone: 'green' },
  { key: 'data', title: 'Data & cadangan', detail: 'Unduh cadangan atau pulihkan data dari file.', icon: DatabaseBackup, group: 'Keuangan & data', tone: 'slate' },
];

/** Uang bebas explained with the user's own numbers, plus the two switches that change it. */
function FreeMoneyCard({ perform, navigate }: { perform: (fn: () => Promise<unknown>, message: string) => Promise<void>; navigate?: (key: string) => void }) {
  const { data, profile, user, cycle } = useApp();
  const today = todayInTimeZone(profile?.timeZone), day = dateInTimeZone(new Date(), profile?.timeZone);
  const stat = metrics(data, cycle.start, cycle.end, profile?.salaryCycleStartDay, day, Boolean(profile?.netWorthIncludesReceivables));
  const usableWallets = data.wallets.filter(w => !w.isArchived && w.isSpendable !== false && !w.isReserved);
  const usable = usableWallets.reduce((n, w) => n + Math.max(0, w.cachedBalance), 0);
  const funds = Math.max(0, usable - stat.free), keptWallets = Math.max(0, stat.reserved - funds);
  const committed = commitments(data, { start: today, end: cycle.end }).reduce((n, x) => n + x.amount, 0) + commitments(data).filter(x => x.date < today).reduce((n, x) => n + x.amount, 0);
  const subtract = profile?.excludeCommittedFromAvailable !== false;
  const rows: [string, number, string][] = [
    [`Saldo dompet yang bisa dipakai (${usableWallets.length} dompet)`, usable, 'base'],
    ...(funds > 0 ? [['Tujuan dana yang belum punya dompet sendiri', -funds, 'minus'] as [string, number, string]] : []),
    ['Uang bebas', stat.free, 'total'],
    [`Tagihan & rencana belum dibayar sampai gajian${subtract ? '' : ' (tidak dikurangi)'}`, subtract ? -committed : 0, subtract ? 'minus' : 'off'],
    ['Uang tersedia', stat.free - (subtract ? committed : 0), 'total'],
  ];
  return <div className="set-card"><h3>Uang bebas</h3>
    <p>Uang bebas adalah uang yang aman dipakai sekarang. Dompet yang ditandai <b>Disimpan</b> (tabungan, investasi) tidak ikut dihitung.</p>
    <div className="free-breakdown">{rows.map(([label, value, kind]) => <div key={label} className={`free-row is-${kind}`}><span>{label}</span><strong>{kind === 'minus' ? `− ${rupiah(-value)}` : kind === 'off' ? rupiah(committed) : rupiah(value)}</strong></div>)}
      <div className="free-row is-note"><span>Tidak dihitung: dompet Disimpan</span><strong>{rupiah(keptWallets)}</strong></div></div>
    <div className="set-switches">
      <label className="switch-row"><input type="checkbox" checked={subtract} onChange={e => { if (user) void perform(() => saveProfile(user.uid, { excludeCommittedFromAvailable: e.target.checked }), ''); }}/><span><strong>Kurangi dengan tagihan & rencana</strong><small>Tagihan rutin dan rencana pengeluaran sampai gajian dianggap sudah terpakai, walau belum dibayar. Hasilnya tampil sebagai <b>Uang tersedia</b> di Beranda.</small></span></label>
      <label className="switch-row"><input type="checkbox" checked={Boolean(profile?.realisticMode)} onChange={e => { if (user) void perform(() => saveProfile(user.uid, { realisticMode: e.target.checked }), ''); }}/><span><strong>Redupkan kartu Total Aset di Beranda</strong><small>Supaya perhatian tertuju ke uang bebas, bukan total saldo yang sebagian sudah disimpan.</small></span></label>
    </div>
    <div className="settings-links"><SettingsLink icon={Wallet} title="Atur dompet yang Disimpan" detail="Ubah dompet, lalu centang “Disimpan” atau pilih kelompok Tabungan/Investasi" onClick={() => navigate?.('wallets')}/></div>
  </div>;
}

export function SettingsView({notify,navigate,onLockNow}:{notify:(msg:string)=>void;navigate?:(key:string)=>void;onLockNow?:()=>void}){const {user,profile,data}=useApp(),pwa=usePwa(),[name,setName]=useState(profile?.displayName||''),[day,setDay]=useState(profile?.salaryCycleStartDay||24),[salary,setSalary]=useState(profile?.monthlySalary||0),[timeZone,setTimeZone]=useState<TimeZone>(profile?.timeZone||'Asia/Jakarta'),[defaultExpenseWallet,setDefaultExpenseWallet]=useState(profile?.defaultExpenseWalletId||''),[defaultIncomeWallet,setDefaultIncomeWallet]=useState(profile?.defaultIncomeWalletId||''),[salaryCategory,setSalaryCategory]=useState(profile?.salaryIncomeCategoryId||''),[budgetWarning,setBudgetWarning]=useState(profile?.budgetWarningPercent||80),[current,setCurrent]=useState(''),[newPass,setNewPass]=useState(''),[repeat,setRepeat]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[importFile,setImportFile]=useState<unknown>(null),[fileName,setFileName]=useState(''),[counts,setCounts]=useState<Record<string,number>>({}),[mode,setMode]=useState<'merge'|'replace'>('merge'),[crossAccount,setCrossAccount]=useState(false);
 async function perform(fn:()=>Promise<unknown>,message:string){setError('');setBusy(true);try{await fn();notify(message);}catch(e){setError((e as Error).message||'Pengaturan belum tersimpan.');}finally{setBusy(false);}}
 async function handleFile(e:ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;setError('');setFileName(file.name);try{if(file.size>25_000_000)throw Error('File cadangan terlalu besar (maksimal 25 MB).');const parsed=JSON.parse(await file.text()) as unknown;const result=validateBackup(parsed);setImportFile(parsed);setCounts(result.counts);}catch(e){setError((e as Error).message);setImportFile(null);}}
 async function exportJson(){if(!user)return;await perform(async()=>{const backup=await exportData(user.uid);const blob=new Blob([JSON.stringify(backup,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`dompet-ajaib-backup-${new Date().toLocaleDateString('en-CA')}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);},'File cadangan diunduh.');}
 const [section,setSection]=useState<Section|null>(null),[wide,setWide]=useState(false);
 useEffect(()=>{const media=window.matchMedia('(min-width: 900px)');const update=()=>setWide(media.matches);update();media.addEventListener('change',update);return ()=>media.removeEventListener('change',update)},[]);
 const active=section??(wide?'profile':null);
 useBackHandler(Boolean(section)&&!wide,()=>setSection(null));
 function open(key:Section){setSection(key);setError('');if(!wide)window.scrollTo({top:0})}
 const r=reminderConfig(profile);
 const summaries:Record<Section,string>={
  profile:`Gajian tanggal ${profile?.salaryCycleStartDay||24} · ${rupiah(profile?.monthlySalary||0)}`,
  security:`${profile?.pinHash?'PIN aktif':'PIN belum aktif'} · password`,
  reminders:[r.balanceEnabled?`Perbarui saldo ${r.times.length}× sehari`:'Perbarui saldo mati',r.billsEnabled?'tagihan aktif':'tagihan mati'].join(' · '),
  appearance:`${themes.find(t=>t.value===(profile?.themePreset||'default'))?.label||'Dompet Ajaib'} · ${({system:'Ikuti sistem',light:'Terang',dark:'Gelap'} as Record<string,string>)[profile?.colorMode||profile?.theme||'light']} · teks ${(profile?.fontSize||'m').toUpperCase()}`,
  app:pwa.installed?'Terpasang di perangkat ini':'Pasang ke layar utama',
  control:`Uang bebas${profile?.excludeCommittedFromAvailable===false?'':' · dikurangi tagihan'} · aset bersih ${profile?.netWorthIncludesReceivables?'+ piutang':'tanpa piutang'}`,
  data:'Unduh dan pulihkan cadangan',
 };
 const page=active&&sections.find(item=>item.key===active)!;
 const errorText=error&&<p className="form-error" role="alert">{friendlyError({code:error})=== 'Proses belum berhasil. Coba lagi.'?error:friendlyError({code:error})}</p>;
 const walletOptions=data.wallets.filter(w=>!w.isArchived).map(w=><option key={w.id} value={w.id}>{w.name}</option>);
 return <>{!(page&&!wide)&&<div className="page-heading"><div><h1>Pengaturan</h1><p>Atur akun, tampilan, dan data aplikasimu.</p></div></div>}
 <div className={`set-layout ${active?'has-page':''}`}>
  <aside className="set-menu" aria-label="Menu pengaturan">
   <div className="set-hero"><span className="avatar settings-avatar">{(profile?.displayName||profile?.username||'A')[0]}</span><div><strong>{profile?.displayName||profile?.username}</strong><small>{user?.email}</small></div></div>
   {groups.map(group=><section key={group} className="set-group"><h2>{group}</h2><div className="set-list">{sections.filter(item=>item.group===group).map(({key,title,icon:Icon,tone})=><button type="button" key={key} className={`set-row ${active===key?'is-active':''}`} aria-current={active===key?'page':undefined} onClick={()=>open(key)}><span className={`set-row-icon tone-${tone}`} aria-hidden="true"><Icon size={18}/></span><span className="set-row-text"><strong>{title}</strong><small>{summaries[key]}</small></span><ChevronRight size={18} className="set-row-arrow" aria-hidden="true"/></button>)}</div></section>)}
   <div className="set-group"><Confirm title="Keluar dari akun?" description="Kamu perlu masuk lagi dengan username dan password untuk membuka catatan keuangan ini." confirmLabel="Ya, keluar" onConfirm={()=>logout()}><button type="button" className="settings-logout"><LogOut size={18}/> Keluar dari akun</button></Confirm><small className="set-version">Dompet Ajaib · Versi {APP_VERSION}</small></div>
  </aside>
  {page&&<section className="set-page" key={page.key} aria-labelledby="set-page-title">
   <header className="set-page-head">{!wide&&<button type="button" className="set-back" onClick={()=>setSection(null)} aria-label="Kembali ke menu pengaturan"><ChevronLeft size={20}/></button>}<span className={`set-row-icon tone-${page.tone}`} aria-hidden="true"><page.icon size={20}/></span><div><h2 id="set-page-title">{page.title}</h2><p>{page.detail}</p></div></header>

   {page.key==='profile'&&<form className="set-form" onSubmit={e=>{e.preventDefault();if(user)void perform(()=>saveProfile(user.uid,{displayName:name.trim(),salaryCycleStartDay:Math.min(31,Math.max(1,Math.round(day)||24)),monthlySalary:salary,timeZone,defaultExpenseWalletId:defaultExpenseWallet,defaultIncomeWalletId:defaultIncomeWallet,salaryIncomeCategoryId:salaryCategory,budgetWarningPercent:Math.min(100,Math.max(1,Math.round(budgetWarning)||80))}),'Profil diperbarui.')}}>
    <div className="set-card"><h3>Profil</h3><div className="form-grid"><Field label="Nama tampilan"><Input value={name} onChange={e=>setName(e.target.value)}/></Field><Field label="Email akun"><Input readOnly value={user?.email||''}/></Field></div></div>
    <div className="set-card"><h3>Gaji & siklus</h3><p>Siklus gaji dipakai untuk anggaran, laporan, dan hitungan hari menuju gajian.</p><div className="form-grid"><Field label="Tanggal gajian"><Input type="number" inputMode="numeric" min="1" max="31" required value={day} onChange={e=>setDay(Number(e.target.value))}/></Field><Field label="Perkiraan gaji"><Money value={salary} onChange={setSalary}/></Field><Field label="Zona waktu"><Select value={timeZone} onChange={e=>setTimeZone(e.target.value as TimeZone)}><option value="Asia/Jakarta">WIB · Jakarta</option><option value="Asia/Makassar">WITA · Makassar</option><option value="Asia/Jayapura">WIT · Jayapura</option><option value="UTC">UTC</option></Select></Field><Field label="Peringatan anggaran mulai (%)"><Input type="number" min="1" max="100" required value={budgetWarning} onChange={e=>setBudgetWarning(Number(e.target.value))}/></Field></div></div>
    <div className="set-card"><h3>Isian otomatis</h3><p>Dipilih lebih dulu saat mencatat transaksi baru.</p><div className="form-grid"><Field label="Dompet pengeluaran"><Select value={defaultExpenseWallet} onChange={e=>setDefaultExpenseWallet(e.target.value)}><option value="">Dompet pertama yang aktif</option>{walletOptions}</Select></Field><Field label="Dompet pemasukan"><Select value={defaultIncomeWallet} onChange={e=>setDefaultIncomeWallet(e.target.value)}><option value="">Dompet pertama yang aktif</option>{walletOptions}</Select></Field><Field label="Kategori gaji"><Select value={salaryCategory} onChange={e=>setSalaryCategory(e.target.value)}><option value="">Pilih saat mencatat</option>{data.categories.filter(c=>c.type==='income'&&!c.isArchived&&!c.parentId).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field></div></div>
    {errorText}<div className="set-save"><Button disabled={busy} type="submit"><Check size={16}/> Simpan profil</Button></div>
   </form>}

   {page.key==='security'&&<div className="set-form">
    <PinSettings notify={notify} onLockNow={onLockNow}/>
    <form className="set-card" onSubmit={e=>{e.preventDefault();if(!user)return;if(newPass!==repeat){setError('Konfirmasi password tidak cocok.');return;}void perform(async()=>{await changePassword(user,current,newPass);setCurrent('');setNewPass('');setRepeat('');},'Password berhasil diubah.')}}><h3>Password</h3><p>Masukkan password saat ini untuk menggantinya.</p><div className="form-grid"><Field label="Password saat ini"><Input type="password" autoComplete="current-password" required value={current} onChange={e=>setCurrent(e.target.value)}/></Field><Field label="Password baru"><Input type="password" autoComplete="new-password" required minLength={8} value={newPass} onChange={e=>setNewPass(e.target.value)}/></Field><Field label="Ulangi password baru"><Input type="password" autoComplete="new-password" required value={repeat} onChange={e=>setRepeat(e.target.value)}/></Field></div>{errorText}<div className="settings-actions"><Button disabled={busy} type="submit"><LockKeyhole size={16}/> Ganti password</Button></div></form>
   </div>}

   {page.key==='reminders'&&<div className="set-form"><ReminderSettings/></div>}

   {page.key==='appearance'&&<div className="set-form"><AppearanceSettings notify={notify}/><div className="set-card"><h3>Beranda</h3><p>Pilih dan urutkan kartu langsung dari halaman Beranda.</p><div className="settings-links"><SettingsLink icon={LayoutDashboard} title="Atur Beranda" detail="Buka Beranda, lalu ketuk “Atur Beranda”" onClick={()=>navigate?.('dashboard')}/></div></div></div>}

   {page.key==='app'&&<div className="set-form"><InstallPanel/></div>}

   {page.key==='control'&&<div className="set-form">
    <FreeMoneyCard perform={perform} navigate={navigate}/>
    <div className="set-card"><h3>Aset bersih</h3><div className="set-switches"><label className="switch-row"><input type="checkbox" checked={Boolean(profile?.netWorthIncludesReceivables)} onChange={e=>{if(user)void perform(()=>saveProfile(user.uid,{netWorthIncludesReceivables:e.target.checked}),"")}}/><span><strong>Hitung piutang & klaim kantor</strong><small>{profile?.netWorthIncludesReceivables?'Piutang dan klaim yang belum lunas ikut menambah aset bersih.':'Mati: aset bersih = saldo dompet − utang. Piutang baru dihitung setelah benar-benar dibayar.'}</small></span></label></div></div>
    
    <div className="set-card"><h3>Alat</h3><div className="settings-links"><SettingsLink icon={ShieldCheck} title="Periksa Data" detail="Cari saldo yang tidak cocok dan catatan yang janggal" onClick={()=>navigate?.('health')}/><SettingsLink icon={History} title="Riwayat Siklus" detail="Ringkasan setiap siklus gaji yang sudah ditutup" onClick={()=>navigate?.('cycles')}/></div></div>
    {errorText}
   </div>}

   {page.key==='data'&&<div className="set-form">
    <div className="set-card"><h3>Unduh cadangan</h3><p>Simpan dompet, kategori, transaksi, anggaran, dan catatan lainnya dalam satu file JSON.</p><div className="settings-actions start"><Button variant="secondary" onClick={()=>void exportJson()} disabled={busy}><Download size={16}/> Unduh cadangan</Button></div></div>
    <div className="set-card form-stack"><h3>Pulihkan dari cadangan</h3><p>Isi file ditampilkan dulu sebelum data ditambahkan atau diganti.</p><label className={`file-pick ${fileName?'has-file':''}`}><input type="file" accept=".json,application/json" onChange={e=>void handleFile(e)}/><span className="file-pick-icon" aria-hidden="true"><FileJson size={20}/></span><span className="file-pick-text"><strong>{fileName||'Pilih file cadangan'}</strong><small>{fileName?'Ketuk untuk memilih file lain':'File .json dari tombol Unduh cadangan'}</small></span></label>{Boolean(importFile)&&<><p style={{marginTop:12}}>Isi file: {Object.entries(counts).filter(([,n])=>n>0).map(([k,n])=>`${n} ${backupNames[k]||k}`).join(' · ')||'Kosong'}</p>{(importFile as {ownerUid?:string})?.ownerUid&&(importFile as {ownerUid?:string}).ownerUid!==user?.uid&&<label className="check-row" style={{marginTop:12}}><input type="checkbox" checked={crossAccount} onChange={e=>setCrossAccount(e.target.checked)}/> Saya paham file cadangan ini berasal dari akun lain dan menyetujui impor ke akun ini.</label>}<Field label="Metode impor"><Select value={mode} onChange={e=>setMode(e.target.value as 'merge'|'replace')}><option value="merge">Gabungkan dengan data yang ada</option><option value="replace">Ganti seluruh data keuangan</option></Select></Field><div className="settings-actions start"><Confirm title={mode==='replace'?'Ganti seluruh data akun ini?':'Impor data ke akun ini?'} description={mode==='replace'?'Semua catatan keuangan lama dihapus. Unduh cadangan terlebih dahulu. Proses besar dapat memerlukan beberapa tahap.':'Data dari file akan digabungkan ke akun yang sedang aktif. Pastikan file ini memang milikmu.'} onConfirm={()=>{if(user)void perform(async()=>{await importData(user.uid,importFile,mode,crossAccount);setImportFile(null);},'Impor data selesai.')}}><Button variant={mode==='replace'?'danger':'primary'} disabled={busy}><Upload size={16}/> {mode==='replace'?'Ganti data':'Impor data'}</Button></Confirm></div></>}</div>
    {errorText}
   </div>}
  </section>}
 </div></>;
}

/** Install the app to the home screen and pick up new versions. */
function InstallPanel(){const pwa=usePwa();return <div className="panel install-panel"><h3>Aplikasi di perangkat</h3>{pwa.installed?<p className="muted">Dompet Ajaib sudah terpasang di perangkat ini. Buka dari layar utama agar tampil penuh tanpa bilah browser.</p>:pwa.canInstall?<><p className="muted">Pasang di layar utama: terbuka lebih cepat, tampil penuh, dan tetap bisa dibuka saat offline.</p><div className="settings-actions start"><Button onClick={()=>void promptInstall()}><Download size={16}/> Pasang aplikasi</Button></div></>:pwa.ios?<p className="muted">Di iPhone/iPad: ketuk tombol <strong>Bagikan</strong> di Safari, lalu pilih <strong>Tambah ke Layar Utama</strong>.</p>:<p className="muted">Buka menu browser (⋮) lalu pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.</p>}{pwa.updateReady&&<div className="notice notice-action"><span>Versi baru sudah siap.</span><Button className="small" onClick={applyUpdate}>Muat ulang</Button></div>}<small className="muted">Tekan lama ikon aplikasi untuk pintasan: Catat pengeluaran, Catat pemasukan, Transaksi, dan Dompet.</small></div>}
