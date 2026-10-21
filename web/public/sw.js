const CACHE='tempmail-v1';
const SHELL=['/','/login','/inbox','/aliases','/manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).catch(()=>{})));self.skipWaiting();});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
self.addEventListener('fetch',e=>{const url=new URL(e.request.url);
if(url.pathname.startsWith('/api/')){e.respondWith(fetch(e.request));return;}
if(url.protocol==='ws:'||url.protocol==='wss:')return;
if(url.pathname.startsWith('/_next/static/')||url.pathname.startsWith('/icons/')){e.respondWith(caches.match(e.request).then(cached=>{if(cached)return cached;return fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));}return r;});}));return;}
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)||new Response('<h1>Offline</h1>',{headers:{'Content-Type':'text/html'}})));return;}
e.respondWith(fetch(e.request).catch(()=>caches.match(e.request)));});
