// Service worker de l'appli mobile CorrigePro : hors ligne + réception de fichiers partagés.
const CACHE = '__CACHE__';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('corrigepro-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Android : « Partager vers CorrigePro » d'un fichier de synchro → boîte de réception, puis ouverture de l'appli
  if (e.request.method === 'POST' && url.pathname.endsWith('/recevoir')) {
    e.respondWith((async () => {
      const form = await e.request.formData();
      const file = form.get('file');
      if (file) await (await caches.open('cp-inbox')).put('inbox.json', new Response(await file.text()));
      return Response.redirect('./?recu=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Hors ligne d'abord : réponse immédiate depuis le cache, la nouvelle version est prise au lancement suivant
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
