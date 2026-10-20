/* ============================================================
   Wojażer — tryb offline

   Co robi: po pierwszej wizycie zapisuje w pamięci przeglądarki samą stronę
   oraz zdjęcia miejsc, które już widziałeś. Dzięki temu Twoje potwierdzone
   podróże — Safepocket, plan dnia, adres noclegu, Niezbędnik — otwierają się
   za granicą bez internetu i bez roamingu.

   Co NIE działa offline (i działać nie może): pogoda, nowe zdjęcia, linki do
   partnerów i cokolwiek, co wymaga świeżych danych z sieci.
   ============================================================ */
const WERSJA      = 'wojazer-v1';
const SHELL_CACHE = WERSJA + '-shell';
const FOTO_CACHE  = WERSJA + '-foto';

// Plik strony plus ikony — to wystarcza, żeby aplikacja wstała bez sieci.
const SHELL = ['/', '/index.html', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL).catch(() => c.add('/')))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.indexOf(WERSJA) !== 0).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (err) { return; }

  // 1) Sama strona: najpierw sieć (żeby łapać aktualizacje), offline z pamięci.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // 2) Zdjęcia miejsc z Wikimedia: raz pobrane zostają na stałe.
  if (url.hostname.indexOf('upload.wikimedia.org') !== -1 || url.hostname.indexOf('flagcdn.com') !== -1) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(FOTO_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit))
    );
    return;
  }

  // 3) Pogoda i reszta: zawsze z sieci, bez udawania że mamy świeże dane.
  if (url.hostname.indexOf('api.open-meteo.com') !== -1) return;

  // 4) Pozostałe zasoby z tej samej domeny: z pamięci, gdy sieci brak.
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit))
    );
  }
});

// Strona prosi o wyczyszczenie pamięci (np. po wylogowaniu).
self.addEventListener('message', (e) => {
  if (e.data === 'wyczysc-offline') {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
});
