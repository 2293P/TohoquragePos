const CACHE = 'doujinpos-shell-v8-brandfix';
const ASSETS = ['./','./index.html','./styles.css?v=7','./app.js?v=7','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/tohoqurage-180-v035.png'];
const BRAND_CSS = `.brand-mark{width:48px!important;height:48px!important;border-radius:50%!important;background:#fff url('./icons/tohoqurage-180-v035.png') center/cover no-repeat!important;color:transparent!important;font-size:0!important;display:block!important;flex:0 0 48px!important;border:2px solid rgba(255,255,255,.85)!important;box-shadow:0 2px 8px rgba(0,0,0,.16)!important}`;

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

async function brandPatchedCss(request){
  let resp;
  try{
    resp = await fetch(request, {cache:'no-store'});
    if(resp && resp.ok){
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(request, copy));
    }
  }catch(e){
    resp = await caches.match(request);
  }
  if(!resp) return Response.error();
  const css = await resp.text();
  const headers = new Headers(resp.headers);
  headers.set('content-type','text/css; charset=utf-8');
  return new Response(css + '\n' + BRAND_CSS + '\n', {status:resp.status,statusText:resp.statusText,headers});
}

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin) return;

  if(event.request.mode === 'navigate'){
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  if(url.pathname.endsWith('/styles.css')){
    event.respondWith(brandPatchedCss(event.request));
    return;
  }

  if(/\.(?:js|webmanifest)$/.test(url.pathname)){
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(resp => {
    if(resp && resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}
    return resp;
  })));
});
