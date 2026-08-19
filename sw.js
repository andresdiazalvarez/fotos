const C="fotos-github-v19",A=["./","./index.html","./app.css?v=19","./app.js?v=19","./video-studio.js?v=19","./manifest.webmanifest","./icon-192.png","./icon-512.png","./vendor/pdf.min.mjs","./vendor/pdf.worker.min.mjs","./vendor/jspdf.umd.min.js"];
self.addEventListener("install",e=>{
  e.waitUntil(caches.open(C).then(c=>c.addAll(A)));
  self.skipWaiting();
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener("fetch",e=>{
  if(e.request.method!=="GET")return;
  e.respondWith(
    fetch(e.request)
      .then(r=>{let x=r.clone();caches.open(C).then(c=>c.put(e.request,x));return r})
      .catch(()=>caches.match(e.request).then(r=>r||caches.match("./")))
  );
});
