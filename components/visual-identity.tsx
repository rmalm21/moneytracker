'use client';
import type { CSSProperties } from 'react';

export const identityColors=['#267e73','#a94f45','#326b96','#705aa1','#4b7554','#c48153','#9b4d69','#58848b','#966339','#b6565c','#536ba5','#687f48','#835aa0','#456e83'];
export const categoryEmojis=['🍽️','🍔','🛒','☕','🚗','⛽','🏠','💡','🎧','🎬','🩺','📚','✈️','🎁','💼','💰','🐱','👗','⚽','🧾','💳','🎯','🌿','📦'];
export const walletEmojis=['💳','🏦','💵','👛','📱','🏧','💰','🪙','🏡','🌱','🔒','🎯','🚀','💎','🧳','🏪'];
export function emojiOrFallback(value:string|undefined,fallback='🗂️'){return value&&/\p{Extended_Pictographic}/u.test(value)?value:fallback;}
export function identityStyle(color?:string):CSSProperties{return {'--identity-color':/^#[\da-fA-F]{6}$/.test(color||'')?color:'var(--accent)'} as CSSProperties;}
export function IdentityBadge({icon,color,label}:{icon?:string;color?:string;label:string}){return <span className="identity-badge" style={identityStyle(color)}><span aria-hidden="true">{emojiOrFallback(icon)}</span><span>{label}</span></span>}
export function VisualPicker({icon,color,onIcon,onColor,kind}:{icon:string;color:string;onIcon:(value:string)=>void;onColor:(value:string)=>void;kind:'wallet'|'category'}){
 return <div className="visual-picker"><strong>Ikon</strong><div className="emoji-grid" role="group" aria-label="Pilih ikon">{(kind==='wallet'?walletEmojis:categoryEmojis).map(emoji=><button type="button" aria-label={`Ikon ${emoji}`} aria-pressed={icon===emoji} className={icon===emoji?'selected':''} onClick={()=>onIcon(emoji)} key={emoji}>{emoji}</button>)}</div><strong>Warna</strong><div className="color-grid" role="group" aria-label="Pilih warna">{identityColors.map(shade=><button type="button" key={shade} aria-label={`Warna ${shade}`} aria-pressed={color===shade} className={color===shade?'selected':''} onClick={()=>onColor(shade)}><i style={{background:shade}}/></button>)}</div><small>Warna tetap terbaca di tema terang dan gelap.</small></div>;
}
