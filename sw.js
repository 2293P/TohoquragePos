const CACHE = 'doujinpos-shell-v6';
const ASSETS = ['./','./index.html','./styles.css?v=6','./app.js?v=6','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png'];

self.addEventListener('install', event => event.waitUntil(
  caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
));

self.addEventListener('activate', event => event.waitUntil(
  caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('doujinpos-shell-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim())
));

async function networkFirst(request, fallback){
  try{
    const resp = await fetch(request, {cache:'no-store'});
    if(resp && resp.ok){
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(request, copy));
    }
    return resp;
  }catch(e){
    return (await caches.match(request)) || (fallback ? await caches.match(fallback) : undefined) || Response.error();
  }
}

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;

  if(event.request.mode === 'navigate'){
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  if(/\.(?:js|css|webmanifest)$/.test(url.pathname)){
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(resp => {
    if(resp && resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}
    return resp;
  })));
});
