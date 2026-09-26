/**
 * Mode desktop Zenith (v0.3.2).
 *
 * Mengapa dulu "tidak muncul": mengganti User-Agent saja TIDAK cukup —
 * situs modern menentukan tata letak dari LEBAR viewport (media query CSS),
 * dan WebView tidak memperbarui navigator.userAgentData saat UA dioverride.
 *
 * Solusi 3 lapis:
 *  1. UA desktop macOS Chrome (paling kompatibel dengan deteksi situs —
 *     beberapa situs khusus memeriksa "Macintosh"/"Windows" untuk halaman
 *     unduh desktop).
 *  2. Skrip document-start yang menyamar MacIntel + userAgentData mobile:false
 *     (client hints) dan MEMAKSA <meta viewport width=1280> — termasuk
 *     memasang MutationObserver agar situs yang menulis ulang meta-nya
 *     tetap dipaksa versi desktop.
 *  3. scalesPageToFit=true saat desktop → WebView menampilkan 1280px
 *     dalam mode zoom-out (seperti Kiwi/Via).
 *
 * Skrip ini aktif otomatis hanya bila UA bertuliskan desktop
 * (Windows/Macintosh/X11) — jadi aman selalu disuntik dan tidak butuh
 * penyesuaian prop saat toggle.
 */

export const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** UA desktop lama (v0.3.0–0.3.1) — tetap dikenali agar setelan tersimpan tidak rusak. */
export const LEGACY_DESKTOP_UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function isDesktopUa(ua?: string | null): boolean {
  return !!ua && (ua === DESKTOP_UA || ua === LEGACY_DESKTOP_UA);
}

export const DESKTOP_VIEWPORT_WIDTH = 1280;

/** Disuntik setelah BRIDGE_SCRIPT pada document-start. */
export const DESKTOP_INJECT_SCRIPT = `(function(){
try{
var ua=navigator.userAgent||'';
if(!/Windows NT|Macintosh|X11|CrOS/.test(ua))return;
if(window.__ZEN_DESKTOP__)return;window.__ZEN_DESKTOP__=1;
var W=${DESKTOP_VIEWPORT_WIDTH};
try{Object.defineProperty(navigator,'platform',{get:function(){return 'MacIntel';},configurable:true});}catch(e){}
try{
var brands=[{brand:'Chromium',version:'131'},{brand:'Google Chrome',version:'131'},{brand:'Not A(Brand',version:'24'}];
Object.defineProperty(navigator,'userAgentData',{get:function(){return {brands:brands,mobile:false,platform:'macOS'};},configurable:true});
}catch(e){}
var MINE='data-zenith-vp';
function force(){
try{
var metas=document.querySelectorAll?document.querySelectorAll('meta[name="viewport"]'):[];
var foreign=0;
for(var i=0;i<metas.length;i++){if(!metas[i].hasAttribute(MINE))foreign++;}
var mine=document.querySelector('meta[name="viewport"]['+MINE+']');
if(foreign===0&&mine)return;
for(var j=metas.length-1;j>=0;j--){var p=metas[j].parentNode;if(p)p.removeChild(metas[j]);}
var m=document.createElement('meta');
m.setAttribute('name','viewport');m.setAttribute(MINE,'1');
m.setAttribute('content','width='+W);
(document.head||document.documentElement).appendChild(m);
}catch(e){}
}
force();
function watch(){
try{
new MutationObserver(function(){force();}).observe(document.head||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['content','name']});
}catch(e){}
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',watch,true);}else{watch();}
window.addEventListener('load',function(){force();},true);
}catch(e){}
})();`;
