'use client';
import { useMemo, useState, type CSSProperties } from 'react';
import { Emoji } from './emoji';
import { ChevronDown, Search } from 'lucide-react';
import { Dialog, DialogContent } from './ui/dialog';
import { colorPresets } from '@/lib/category-templates';
import type { Category } from '@/lib/types';

type EmojiGroup = { label: string; items: [string, string][] };
const g = (label: string, list: string): EmojiGroup => ({ label, items: list.trim().split('\n').map(line => { const [emoji, ...words] = line.trim().split(' '); return [emoji, words.join(' ')] as [string, string]; }) });
/** Built-in icon library, grouped and searchable by Indonesian keywords. */
export const emojiLibrary: EmojiGroup[] = [
  g('Makanan', `🍜 mie makan minum kuliner
    🍱 makan siang bekal nasi
    🥐 sarapan roti pagi
    🌙 makan malam
    🍿 jajan camilan snack
    ☕ kopi minuman ngopi
    🧋 boba teh minuman
    🍔 burger fast food
    🍕 pizza
    🍗 ayam
    🍽️ restoran makan
    🥡 delivery pesan antar
    🛒 bahan makanan belanja dapur
    🍰 kue dessert lainnya
    🍎 buah
    🥗 salad sehat
    🍳 masak dapur
    🍦 es krim`),
  g('Transportasi', `🚗 mobil kendaraan transportasi
    ⛽ bensin bbm
    🅿️ parkir
    🛣️ tol jalan
    🚌 bus transportasi umum
    🚕 taksi online
    🚆 kereta
    ✈️ pesawat terbang
    🚢 kapal
    🛵 ojek motor
    🏍️ motor
    🧭 perjalanan lainnya
    🛠️ service bengkel
    🛞 ban
    🔩 spare part
    🔧 perbaikan kendaraan
    🚿 cuci`),
  g('Rumah', `🏠 rumah sewa kost
    🧹 kebutuhan rumah bersih
    🧻 perlengkapan harian tisu
    🪑 furnitur mebel
    🔨 perbaikan renovasi
    🧺 laundry cuci baju
    🧼 kebersihan sabun
    🛏️ kamar tidur kasur
    🍳 dapur peralatan
    💡 listrik tagihan lampu
    ⚡ listrik token
    💧 air pdam
    🔥 gas
    🌐 internet wifi
    📶 paket data
    📱 pulsa hp aplikasi`),
  g('Belanja', `🛍️ belanja
    👕 pakaian baju fashion
    👟 sepatu
    ⌚ aksesori jam
    💻 laptop gadget elektronik
    🧴 personal care skincare
    🧸 hobi mainan
    🎁 hadiah kado
    📦 marketplace paket lainnya
    👜 tas
    💍 perhiasan cincin`),
  g('Hiburan', `🎵 musik langganan
    🎬 film bioskop streaming
    🎮 game gaming
    🎤 konser
    🎳 aktivitas bowling
    🎟️ tiket
    🏖️ rekreasi pantai
    🎉 acara pesta
    🍻 hangout nongkrong
    🎈 lainnya
    📺 tv
    ☁️ cloud storage
    🤖 ai software
    📰 berita konten`),
  g('Kesehatan', `❤️ kesehatan
    🏥 dokter rumah sakit
    💊 obat apotek
    🧪 laboratorium
    🦷 gigi
    👓 mata kacamata
    🏋️ gym fitness
    🧘 wellness yoga
    🩺 medical check up
    💈 potong rambut`),
  g('Pendidikan', `🎓 kuliah pendidikan
    📚 buku
    📝 kursus
    ✏️ alat tulis
    🖨️ print fotokopi
    📖 sertifikasi
    🎒 perlengkapan sekolah`),
  g('Keuangan', `💰 uang gaji tabungan celengan
    💵 tunai cash
    💳 kartu kredit
    🏦 bank admin
    🔄 transfer biaya
    📉 denda
    📈 investasi hasil
    🧾 pajak tagihan iuran
    🎯 bonus target
    🏆 reward insentif
    💸 biaya pengeluaran
    🪙 koin
    🛡️ asuransi`),
  g('Kerja', `💼 kerja kantor gaji
    🏨 hotel perjalanan dinas
    🤝 meeting teman
    📄 administrasi dokumen
    ⏱️ lembur
    🗂️ operasional arsip`),
  g('Travel', `🌴 liburan
    🧳 koper travel
    🏝️ pulau wisata
    ⛺ camping
    🗺️ peta
    🛂 paspor dokumen`),
  g('Sosial', `🤲 sedekah zakat
    👨‍👩‍👧 keluarga
    💝 donasi
    💐 bunga acara
    🕌 keagamaan masjid
    🎂 ulang tahun
    👥 patungan orang
    👶 anak bayi
    🐱 hewan peliharaan`),
  g('Lainnya', `📌 tak terduga
    ❓ belum dikategorikan
    ⭐ favorit
    🌿 tanaman
    📷 foto
    🎨 seni hobi
    📸 aktivitas pribadi
    👤 personal
    🔁 berulang`),
];
export const categoryEmojis = emojiLibrary.flatMap(group => group.items.map(([emoji]) => emoji));
/** Bank and e-wallet marks, drawn as brand-coloured name tiles (stored as `brand:<key>`). */
export type BrandIcon = { key: string; label: string; text: string; bg: string; fg: string; group: 'Bank' | 'Bank digital' | 'E-wallet' | 'Uang elektronik' | 'Investasi'; words: string };
export const brandIcons: BrandIcon[] = [
  // Prepaid cards first, so "e-money Mandiri" or "Brizzi BRI" suggest the card rather than the bank.
  { key: 'emoney', label: 'e-money Mandiri', text: 'e-money', bg: '#f5a800', fg: '#003d79', group: 'Uang elektronik', words: 'emoney money etoll' },
  { key: 'flazz', label: 'Flazz BCA', text: 'flazz', bg: '#005eb8', fg: '#ffffff', group: 'Uang elektronik', words: 'flazz' },
  { key: 'tapcash', label: 'TapCash BNI', text: 'TapCash', bg: '#005e6a', fg: '#f37021', group: 'Uang elektronik', words: 'tapcash tap' },
  { key: 'brizzi', label: 'Brizzi BRI', text: 'BRIZZI', bg: '#1b63c6', fg: '#ffffff', group: 'Uang elektronik', words: 'brizzi' },
  { key: 'bca', label: 'BCA', text: 'BCA', bg: '#0060af', fg: '#ffffff', group: 'Bank', words: 'bca bank central asia klikbca mybca' },
  { key: 'mandiri', label: 'Mandiri', text: 'mandiri', bg: '#003d79', fg: '#ffb700', group: 'Bank', words: 'mandiri livin' },
  { key: 'bri', label: 'BRI', text: 'BRI', bg: '#00529c', fg: '#ffffff', group: 'Bank', words: 'bri brimo rakyat' },
  { key: 'bni', label: 'BNI', text: 'BNI', bg: '#f15a23', fg: '#ffffff', group: 'Bank', words: 'bni wondr negara' },
  { key: 'bsi', label: 'BSI', text: 'BSI', bg: '#00a39d', fg: '#ffffff', group: 'Bank', words: 'bsi syariah' },
  { key: 'btn', label: 'BTN', text: 'BTN', bg: '#0b4ea2', fg: '#ffd400', group: 'Bank', words: 'btn tabungan negara' },
  { key: 'cimb', label: 'CIMB Niaga', text: 'CIMB', bg: '#7b1113', fg: '#ffffff', group: 'Bank', words: 'cimb niaga octo' },
  { key: 'permata', label: 'Permata', text: 'Permata', bg: '#1c8b3c', fg: '#ffffff', group: 'Bank', words: 'permata' },
  { key: 'danamon', label: 'Danamon', text: 'Danamon', bg: '#f7941d', fg: '#ffffff', group: 'Bank', words: 'danamon' },
  { key: 'ocbc', label: 'OCBC', text: 'OCBC', bg: '#e30613', fg: '#ffffff', group: 'Bank', words: 'ocbc nyala' },
  { key: 'jago', label: 'Bank Jago', text: 'jago', bg: '#fdb813', fg: '#1d1d1b', group: 'Bank digital', words: 'jago' },
  { key: 'jenius', label: 'Jenius', text: 'jenius', bg: '#00a9e0', fg: '#ffffff', group: 'Bank digital', words: 'jenius btpn smbc' },
  { key: 'seabank', label: 'SeaBank', text: 'Sea', bg: '#ff6a13', fg: '#ffffff', group: 'Bank digital', words: 'seabank sea' },
  { key: 'blu', label: 'blu BCA', text: 'blu', bg: '#00b5e2', fg: '#ffffff', group: 'Bank digital', words: 'blu bca digital' },
  { key: 'superbank', label: 'Superbank', text: 'super', bg: '#5b2c83', fg: '#ffffff', group: 'Bank digital', words: 'superbank super' },
  { key: 'neo', label: 'Neo Bank', text: 'neo', bg: '#ffcc00', fg: '#1d1d1b', group: 'Bank digital', words: 'neo neobank' },
  { key: 'gopay', label: 'GoPay', text: 'GoPay', bg: '#00aed6', fg: '#ffffff', group: 'E-wallet', words: 'gopay gojek' },
  { key: 'ovo', label: 'OVO', text: 'OVO', bg: '#4c3494', fg: '#ffffff', group: 'E-wallet', words: 'ovo grab' },
  { key: 'dana', label: 'DANA', text: 'DANA', bg: '#118eea', fg: '#ffffff', group: 'E-wallet', words: 'dana' },
  { key: 'shopeepay', label: 'ShopeePay', text: 'Shopee', bg: '#ee4d2d', fg: '#ffffff', group: 'E-wallet', words: 'shopeepay shopee spay' },
  { key: 'linkaja', label: 'LinkAja', text: 'LinkAja', bg: '#e82529', fg: '#ffffff', group: 'E-wallet', words: 'linkaja' },
  { key: 'flip', label: 'Flip', text: 'flip', bg: '#fd6542', fg: '#ffffff', group: 'E-wallet', words: 'flip' },
  { key: 'bibit', label: 'Bibit', text: 'bibit', bg: '#00ab6b', fg: '#ffffff', group: 'Investasi', words: 'bibit reksadana investasi' },
  { key: 'ajaib', label: 'Ajaib', text: 'Ajaib', bg: '#1f5fff', fg: '#ffffff', group: 'Investasi', words: 'ajaib saham investasi' },
  { key: 'stockbit', label: 'Stockbit', text: 'Stockbit', bg: '#1a1a1a', fg: '#ffffff', group: 'Investasi', words: 'stockbit saham' },
  { key: 'pluang', label: 'Pluang', text: 'Pluang', bg: '#0a5cff', fg: '#ffffff', group: 'Investasi', words: 'pluang emas crypto' },
];
export const brandOf = (icon?: string) => icon?.startsWith('brand:') ? brandIcons.find(brand => brand.key === icon.slice(6)) : undefined;
/** Suggests a brand mark from a wallet name such as "BCA Tahapan" or "gopay". */
export function brandForName(name: string) { const words = name.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); return brandIcons.find(brand => words.some(word => word.length > 1 && brand.words.split(' ').includes(word))); }
/** Renders a wallet or category icon: a brand tile for `brand:*`, otherwise the emoji. */
export function AppIcon({ icon, fallback = '💳', className = '' }: { icon?: string; fallback?: string; className?: string }) {
  const brand = brandOf(icon);
  if (brand) return <span className={`brand-icon ${className}`} style={{ background: brand.bg, color: brand.fg, fontSize: `${Math.max(.42, Math.min(.72, 2.6 / brand.text.length))}em` }} title={brand.label} aria-label={brand.label}>{brand.text}</span>;
  return <span className={className} aria-hidden="true"><Emoji e={emojiOrFallback(icon, fallback)}/></span>;
}
export const walletEmojis=['💳','🏦','💵','👛','👝','📱','🏧','💰','🪙','💸','💎','🏡','🌱','🔒','🎯','🚀','🧳','🏪','📈','📊','🛡️','🎓','🕌','🏝️','🚗','💍','🎁','🧧','⭐','❤️','🌙'];
/** Kept for older records that stored a hex colour; the picker itself only shows named swatches. */
export const identityColors = colorPresets.map(preset => preset.hex);
export function emojiOrFallback(value:string|undefined,fallback='🗂️'){if(value==='🐷')return '💰';if(value?.startsWith('brand:'))return brandOf(value)?.group==='E-wallet'?'📱':brandOf(value)?.group==='Uang elektronik'?'💳':brandOf(value)?.group==='Investasi'?'📈':'🏦';return value&&/\p{Extended_Pictographic}/u.test(value)?value:fallback;}
const validHex = (color?: string) => /^#[\da-fA-F]{6}$/.test(color || '');
export function identityStyle(color?:string):CSSProperties{return {'--identity-color':validHex(color)?color:'var(--accent)'} as CSSProperties;}
/** Subcategories without their own colour use the colour of their main category. */
export function categoryColor(categories: Category[], category?: Category | null) {
  if (!category) return undefined;
  if (validHex(category.color)) return category.color;
  return categories.find(parent => parent.id === category.parentId)?.color;
}
export function IdentityBadge({icon,color,label}:{icon?:string;color?:string;label:string}){return <span className="identity-badge" style={identityStyle(color)}>{brandOf(icon)?<AppIcon icon={icon} className="badge-brand"/>:<span aria-hidden="true"><Emoji e={emojiOrFallback(icon)}/></span>}<span>{label}</span></span>}

const recentKey = 'dompet-ajaib:recent-emoji';
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(recentKey) || '[]').slice(0, 12); } catch { return []; } };
function rememberEmoji(emoji: string) { try { localStorage.setItem(recentKey, JSON.stringify([emoji, ...readRecent().filter(item => item !== emoji)].slice(0, 12))); } catch { /* Recent icons are optional. */ } }

/** Small "Cari lainnya" button next to a short emoji list: opens the whole library with search. */
export function EmojiSearchButton({value,onPick,label='Cari lainnya'}:{value?:string;onPick:(emoji:string)=>void;label?:string}){
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[recent,setRecent]=useState<string[]>([]);
 const search=query.trim().toLowerCase();
 const found=search?emojiLibrary.flatMap(group=>group.items.filter(([,keys])=>keys.includes(search)||group.label.toLowerCase().includes(search))).map(([emoji])=>emoji).filter((emoji,index,list)=>list.indexOf(emoji)===index):[];
 const pick=(emoji:string)=>{rememberEmoji(emoji);onPick(emoji);setOpen(false)};
 const button=(emoji:string,key:string)=><button type="button" key={key} aria-label={`Ikon ${emoji}`} aria-pressed={value===emoji} className={value===emoji?'selected':''} onClick={()=>pick(emoji)}><Emoji e={emoji}/></button>;
 return <>
  <button type="button" className="emoji-more-btn" onClick={()=>{setQuery('');setRecent(readRecent());setOpen(true)}}><Search size={14}/> {label}</button>
  <Dialog open={open} onOpenChange={setOpen}><DialogContent title="Cari ikon" className="emoji-search-dialog">
   <label className="emoji-search"><Search size={16}/><input autoFocus value={query} onChange={event=>setQuery(event.target.value)} placeholder="Cari, mis. kopi, rumah, liburan, gaji" aria-label="Cari ikon"/></label>
   <div className="emoji-library emoji-search-library" role="group" aria-label="Pilih ikon">
    {search?<section><h5>Hasil pencarian</h5><div className="emoji-grid">{found.length?found.map(emoji=>button(emoji,`s${emoji}`)):<small>Tidak ada ikon yang cocok. Coba kata lain.</small>}</div></section>:<>
     {recent.length>0&&<section><h5>Terakhir dipakai</h5><div className="emoji-grid">{recent.map(emoji=>button(emoji,`h${emoji}`))}</div></section>}
     {emojiLibrary.map(group=><section key={group.label}><h5>{group.label}</h5><div className="emoji-grid">{group.items.map(([emoji])=>button(emoji,`${group.label}${emoji}`))}</div></section>)}
    </>}
   </div>
  </DialogContent></Dialog>
 </>;
}
/** Collapsed icon choice for forms: shows the current icon, opens the list when tapped. */
export function IconChoice({value,onPick,options,label='Ikon'}:{value:string;onPick:(emoji:string)=>void;options:string[];label?:string}){
 return <details className="look-picker"><summary><span className="look-preview"><Emoji e={value}/></span><span className="look-text"><strong>{label}</strong><small>Ketuk untuk mengubah</small></span><ChevronDown size={18} className="look-chevron" aria-hidden="true"/></summary>
  <div className="look-body"><div className="emoji-head"><span/><EmojiSearchButton value={value} onPick={onPick}/></div><div className="wl-emoji-grid">{withCurrent(options,value).map(e=><button type="button" key={e} className={value===e?'active':''} aria-pressed={value===e} onClick={()=>onPick(e)}><Emoji e={e}/></button>)}</div></div>
 </details>;
}
/** A short list of icons that always shows the current one, even when it was picked from the search. */
export const withCurrent=(list:string[],current?:string)=>current&&!current.startsWith('brand:')&&!list.includes(current)?[current,...list]:list;

export function VisualPicker({icon,color,onIcon,onColor,kind,name='',inheritLabel}:{icon:string;color:string;onIcon:(value:string)=>void;onColor:(value:string)=>void;kind:'wallet'|'category';name?:string;inheritLabel?:string}){
 const [query,setQuery]=useState(''),[recent]=useState<string[]>(()=>typeof window==='undefined'?[]:readRecent());
 const words=useMemo(()=>name.toLowerCase().split(/[^a-z]+/).filter(word=>word.length>2),[name]);
 const recommended=useMemo(()=>words.length?emojiLibrary.flatMap(group=>group.items).filter(([,keys])=>words.some(word=>keys.split(' ').some(key=>key.startsWith(word)))).map(([emoji])=>emoji).filter((emoji,index,list)=>list.indexOf(emoji)===index).slice(0,10):[],[words]);
 const search=query.trim().toLowerCase();
 const found=search?emojiLibrary.flatMap(group=>group.items.filter(([,keys])=>keys.includes(search)||group.label.toLowerCase().includes(search))).map(([emoji])=>emoji).filter((emoji,index,list)=>list.indexOf(emoji)===index):[];
 const choose=(emoji:string)=>{rememberEmoji(emoji);onIcon(emoji)};
 const button=(emoji:string,key:string)=><button type="button" aria-label={`Ikon ${emoji}`} aria-pressed={icon===emoji} className={icon===emoji?'selected':''} onClick={()=>choose(emoji)} key={key}><Emoji e={emoji}/></button>;
 const suggested=kind==='wallet'?brandForName(name):undefined;
 const brandButton=(brand:BrandIcon)=><button type="button" key={`b${brand.key}`} aria-label={`Ikon ${brand.label}`} title={brand.label} aria-pressed={icon===`brand:${brand.key}`} className={`brand-choice ${icon===`brand:${brand.key}`?'selected':''}`} onClick={()=>{onIcon(`brand:${brand.key}`);const hex=brand.bg.toLowerCase();if(!color||colorPresets.some(preset=>preset.hex.toLowerCase()===color.toLowerCase()))onColor(hex)}}><AppIcon icon={`brand:${brand.key}`}/></button>;
 const custom=Boolean(color)&&!colorPresets.some(preset=>preset.hex.toLowerCase()===color.toLowerCase());
 return <details className="look-picker"><summary><span className="look-preview" style={identityStyle(color||undefined)}><AppIcon icon={icon} fallback="🗂️"/></span><span className="look-text"><strong>Ikon & warna</strong><small>Ketuk untuk mengubah tampilan</small></span><ChevronDown size={18} className="look-chevron" aria-hidden="true"/></summary><div className="visual-picker">
  <div className="picker-heading"><strong>Ikon</strong><span className="picker-current"><AppIcon icon={icon} fallback="🗂️"/></span></div>
  {kind==='wallet'?<div className="emoji-library wallet-icon-library" role="group" aria-label="Pilih ikon">
   {suggested&&<section><h5>Disarankan untuk “{name.trim()}”</h5><div className="emoji-grid brand-grid">{brandButton(suggested)}</div></section>}
   {(['Bank','Bank digital','E-wallet','Uang elektronik','Investasi'] as const).map(group=><section key={group}><h5>{group}</h5><div className="emoji-grid brand-grid">{brandIcons.filter(brand=>brand.group===group).map(brandButton)}</div></section>)}
   <section><h5 className="emoji-head">Emoji<EmojiSearchButton value={icon} onPick={choose}/></h5><div className="emoji-grid">{withCurrent(walletEmojis,icon).map(emoji=>button(emoji,emoji))}</div></section>
  </div>:<>
   <label className="emoji-search"><Search size={16}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Cari ikon, mis. kopi, bensin, gaji" aria-label="Cari ikon"/></label>
   <div className="emoji-library" role="group" aria-label="Pilih ikon">
    {search?<section><h5>Hasil pencarian</h5><div className="emoji-grid">{found.length?found.map(emoji=>button(emoji,`s${emoji}`)):<small>Tidak ada ikon yang cocok.</small>}</div></section>:<>
     {recommended.length>0&&<section><h5>Disarankan</h5><div className="emoji-grid">{recommended.map(emoji=>button(emoji,`r${emoji}`))}</div></section>}
     {recent.length>0&&<section><h5>Terakhir dipakai</h5><div className="emoji-grid">{recent.map(emoji=>button(emoji,`h${emoji}`))}</div></section>}
     {emojiLibrary.map(group=><section key={group.label}><h5>{group.label}</h5><div className="emoji-grid">{group.items.map(([emoji])=>button(emoji,`${group.label}${emoji}`))}</div></section>)}
    </>}
   </div></>}
  <strong>Warna</strong>
  <div className="color-grid" role="group" aria-label="Pilih warna">
   {inheritLabel&&<button type="button" className={`color-inherit ${!color?'selected':''}`} aria-pressed={!color} onClick={()=>onColor('')}>{inheritLabel}</button>}
   {colorPresets.map(preset=><button type="button" key={preset.key} title={preset.label} aria-label={`Warna ${preset.label}`} aria-pressed={color.toLowerCase()===preset.hex} className={color.toLowerCase()===preset.hex?'selected':''} onClick={()=>onColor(preset.hex)}><i style={{background:preset.hex}}/></button>)}
  </div>
  <details className="color-more" open={custom||undefined}><summary>Warna lainnya</summary><label className="custom-color"><input type="color" value={validHex(color)?color:'#267e73'} onChange={event=>onColor(event.target.value)} aria-label="Pilih warna lain"/><span>{custom?'Warna pilihan sendiri dipakai':'Pilih warna sendiri'}</span></label></details>
  <small>Tulisan di atas warna menyesuaikan otomatis agar tetap terbaca.</small>
 </div></details>;
}
