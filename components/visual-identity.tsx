'use client';
import { useMemo, useState, type CSSProperties } from 'react';
import { Search } from 'lucide-react';
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
  g('Keuangan', `💰 uang gaji tabungan
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
    🐷 celengan
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
export const walletEmojis=['💳','🏦','💵','👛','👝','📱','🏧','💰','🪙','💸','💎','🐷','🏡','🌱','🔒','🎯','🚀','🧳','🏪','📈','📊','🛡️','🎓','🕌','🏝️','🚗','💍','🎁','🧧','⭐','❤️','🌙'];
/** Kept for older records that stored a hex colour; the picker itself only shows named swatches. */
export const identityColors = colorPresets.map(preset => preset.hex);
export function emojiOrFallback(value:string|undefined,fallback='🗂️'){return value&&/\p{Extended_Pictographic}/u.test(value)?value:fallback;}
const validHex = (color?: string) => /^#[\da-fA-F]{6}$/.test(color || '');
export function identityStyle(color?:string):CSSProperties{return {'--identity-color':validHex(color)?color:'var(--accent)'} as CSSProperties;}
/** Subcategories without their own colour use the colour of their main category. */
export function categoryColor(categories: Category[], category?: Category | null) {
  if (!category) return undefined;
  if (validHex(category.color)) return category.color;
  return categories.find(parent => parent.id === category.parentId)?.color;
}
export function IdentityBadge({icon,color,label}:{icon?:string;color?:string;label:string}){return <span className="identity-badge" style={identityStyle(color)}><span aria-hidden="true">{emojiOrFallback(icon)}</span><span>{label}</span></span>}

const recentKey = 'dompet-ajaib:recent-emoji';
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(recentKey) || '[]').slice(0, 12); } catch { return []; } };
function rememberEmoji(emoji: string) { try { localStorage.setItem(recentKey, JSON.stringify([emoji, ...readRecent().filter(item => item !== emoji)].slice(0, 12))); } catch { /* Recent icons are optional. */ } }

export function VisualPicker({icon,color,onIcon,onColor,kind,name='',inheritLabel}:{icon:string;color:string;onIcon:(value:string)=>void;onColor:(value:string)=>void;kind:'wallet'|'category';name?:string;inheritLabel?:string}){
 const [query,setQuery]=useState(''),[recent]=useState<string[]>(()=>typeof window==='undefined'?[]:readRecent());
 const words=useMemo(()=>name.toLowerCase().split(/[^a-z]+/).filter(word=>word.length>2),[name]);
 const recommended=useMemo(()=>words.length?emojiLibrary.flatMap(group=>group.items).filter(([,keys])=>words.some(word=>keys.split(' ').some(key=>key.startsWith(word)))).map(([emoji])=>emoji).filter((emoji,index,list)=>list.indexOf(emoji)===index).slice(0,10):[],[words]);
 const search=query.trim().toLowerCase();
 const found=search?emojiLibrary.flatMap(group=>group.items.filter(([,keys])=>keys.includes(search)||group.label.toLowerCase().includes(search))).map(([emoji])=>emoji).filter((emoji,index,list)=>list.indexOf(emoji)===index):[];
 const choose=(emoji:string)=>{rememberEmoji(emoji);onIcon(emoji)};
 const button=(emoji:string,key:string)=><button type="button" aria-label={`Ikon ${emoji}`} aria-pressed={icon===emoji} className={icon===emoji?'selected':''} onClick={()=>choose(emoji)} key={key}>{emoji}</button>;
 const custom=Boolean(color)&&!colorPresets.some(preset=>preset.hex.toLowerCase()===color.toLowerCase());
 return <div className="visual-picker">
  <div className="picker-heading"><strong>Ikon</strong><span className="picker-current" aria-hidden="true">{emojiOrFallback(icon)}</span></div>
  {kind==='wallet'?<div className="emoji-grid" role="group" aria-label="Pilih ikon">{walletEmojis.map(emoji=>button(emoji,emoji))}</div>:<>
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
 </div>;
}
