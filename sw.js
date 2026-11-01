// kill-switch: retire the old build-14 cache-first worker
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.map(x=>caches.delete(x)))).then(()=>self.registration.unregister()).then(()=>self.clients.matchAll({type:'window'})).then(cs=>cs.forEach(c=>{try{c.navigate(c.url)}catch(_){}})))});
self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request))});
