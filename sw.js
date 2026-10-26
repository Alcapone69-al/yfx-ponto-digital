/* YFX Ponto Digital — service worker: guarda a app para abrir sem internet. Nunca guarda pedidos à API. */
const VERSAO="ponto-v1";
const BASE=["./","./index.html","./app.js","./offline.js","./config.js","./manifest.webmanifest","./icon-192.png","./icon-512.png"];
const CDN=["https://unpkg.com/lucide@0.453.0/dist/umd/lucide.min.js","https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(VERSAO).then(async c=>{await c.addAll(BASE);await Promise.all(CDN.map(u=>c.add(new Request(u,{mode:"cors"})).catch(()=>{})))}).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==VERSAO).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=="GET")return;
  if(u.hostname.endsWith("supabase.co"))return; // dados e autenticação: sempre directo ao servidor
  if(r.mode==="navigate"){e.respondWith(fetch(r).then(res=>{const c=res.clone();caches.open(VERSAO).then(x=>x.put("./index.html",c));return res}).catch(()=>caches.match("./index.html")));return}
  const estatico=u.origin===location.origin||/(^|\.)(unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if(!estatico)return;
  e.respondWith(caches.match(r).then(hit=>{
    const rede=fetch(r).then(res=>{if(res&&(res.ok||res.type==="opaque")){const c=res.clone();caches.open(VERSAO).then(x=>x.put(r,c))}return res}).catch(()=>hit);
    return hit||rede;
  }));
});
