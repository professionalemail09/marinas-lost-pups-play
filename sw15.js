// v1.20 service worker (file name kept as sw15.js so existing installs update in place). peerjs.min.js is not precached; it is cached on first use.
// index.html / navigations: network-first (new builds always win; cache only when offline).
// Versioned ?v= scripts: cache-first (URL changes every release, so never stale).
// Other static assets: stale-while-revalidate. Old version caches are deleted on activate.
// mlp-images is kept across version bumps: Park Hunt and terrain photos, plus the Fetch quiz bank.
const C='mlp-v0-6-1',IMG='mlp-images',F=["./", "index.html", "manifest.json", "fonts/fredoka.woff2", "fonts/dmsans.woff2", "fonts/nunito.woff2", "fonts/atkinson-400.woff2", "fonts/atkinson-700.woff2", "fonts/outfit.woff2", "assets/parks/CREDITS.md", "logo.webp", "marina_face.webp", "content.json", "icons/icon-1024.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "art/bg_home.webp", "art/bg_map.webp", "art/bg_shop.webp", "art/bg_title.webp", "app.v0-6-0.js?v=0-6-1","audio/mlp-audio.js"];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>Promise.all(F.map(f=>c.add(new Request(f,{cache:'reload'})).catch(()=>{})))));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C&&x!==IMG).map(x=>caches.delete(x)))).then(()=>self.clients.claim()));});
const put=(r,res)=>{if(res&&res.ok&&res.type==='basic'){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp));}return res;};
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;const u=new URL(r.url);if(u.origin!==location.origin)return;
 const p=u.pathname;
 if(r.mode==='navigate'||p.endsWith('/')||p.endsWith('index.html')||p.endsWith('manifest.json')||p.endsWith('content.json')){
  e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>put(r,res)).catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match('index.html'))));return;}
 if(/\/assets\/(parks|terrain)\//.test(p)&&!p.endsWith('.md')){
  e.respondWith(caches.open(IMG).then(cache=>cache.match(r,{ignoreSearch:true}).then(hit=>{
   const net=fetch(r).then(res=>{if(res&&res.ok&&res.type==='basic')cache.put(r,res.clone());return res;}).catch(()=>hit);
   return hit||net;})));return;}
 if(p.includes('/data/trivia/')&&p.endsWith('.json')){
  e.respondWith(fetch(r).then(res=>{if(res&&res.ok&&res.type==='basic')caches.open(IMG).then(cache=>cache.put(r,res.clone()));return res;}).catch(()=>caches.open(IMG).then(cache=>cache.match(r,{ignoreSearch:true}))));return;}
 if(u.searchParams.has('v')){
  e.respondWith(caches.match(r).then(m=>m||fetch(r).then(res=>put(r,res)).catch(()=>caches.match(r,{ignoreSearch:true}))));return;}
 e.respondWith(caches.match(r,{ignoreSearch:true}).then(m=>{const net=fetch(r,{cache:'no-cache'}).then(res=>put(r,res)).catch(()=>m);if(m){e.waitUntil(net.then(()=>{},()=>{}));return m;}return net;}));});
