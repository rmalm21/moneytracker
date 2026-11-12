/**
 * 9.9.2 The script that puts the last copy of Beranda on screen the moment the app opens (components/home-shot.tsx keeps
 * the copy and swaps it for the live Beranda). It runs in the page before the app's code, so it is plain and small.
 */
import { APP_VERSION } from './version';

export const HOME_SHOT_ID = 'home-shot';
export const homeShotKey = (uid: string) => `dompet-ajaib:home-shot:${uid}`;
const MAX_AGE = 3 * 864e5;

/** Runs in the page before the app's code: puts the copy on screen. Kept small and self-contained. */
export const homeShotBoot = `(function(){try{
var l=location;if(l.search||!/^\\/(index\\.html)?$/.test(l.pathname))return;
var s=localStorage,uid=s.getItem('dompet-ajaib:appearance:last');if(!uid)return;
var r=JSON.parse(s.getItem('dompet-ajaib:home-shot:'+uid)||'null');
if(!r||r.v!==${JSON.stringify(APP_VERSION)}||!(Date.now()-r.at<${MAX_AGE}))return;
if((s.getItem('dompet-ajaib:mode:'+uid)||'')!==r.mode)return;
if(!r.hidden&&(s.getItem('dompet-ajaib:hide-amounts-always')==='1'||s.getItem('dompet-ajaib:hide-amounts')==='1'))return;
var h=document.documentElement;for(var k in r.attrs)h.setAttribute(k,r.attrs[k]);
h.classList.add('home-shot-on');var d=document.createElement('div');d.id='${HOME_SHOT_ID}';d.inert=true;d.setAttribute('aria-hidden','true');d.innerHTML=r.html;document.body.appendChild(d);
var drop=function(){h.classList.remove('home-shot-on');var e=document.getElementById('${HOME_SHOT_ID}');if(e)e.remove();};
var touch=function(){if(document.querySelector('body > .app-layout .home-dash'))drop();};
addEventListener('pointerdown',touch,true);addEventListener('wheel',touch,true);addEventListener('keydown',touch,true);
setTimeout(drop,15000);
}catch(e){}})();`;

