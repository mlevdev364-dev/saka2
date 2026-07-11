// ===============================
// SAKA TRACKER - Service Worker v5.8.0
// ===============================
// PENTING - SINKRONISASI VERSI (Semantic Versioning):
// SW_VERSION di file ini HARUS selalu sama persis dengan APP_VERSION di
// index.html dan "version" di manifest.json. Saat SW ini aktif, versinya
// dikirim ke semua client terbuka lewat postMessage({type:'SW_ACTIVATED'})
// sehingga index.html dapat memverifikasi kecocokan versi secara otomatis
// (lihat checkVersionSync() di index.html).

const SW_VERSION = '5.8.0';
const CACHE_NAME = 'saka-tracker-v5-8-0';
const ASSETS = [
  './',
  './index.html',
  './assets/formgear/formgear-v2.css',
  './assets/formgear/firebase-manager.js',
  './assets/formgear/form-builder.js',
  './assets/formgear/demo-forms.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/fonts/bootstrap-icons.woff2',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.all.min.js'
];

// ===============================
// INSTALL - Cache assets
// ===============================
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching assets...');
        return cache.addAll(ASSETS);
      })
      .then(() => {
        console.log('[SW] Installation complete!');
        return self.skipWaiting();
      })
      .catch(err => {
        console.error('[SW] Installation failed:', err);
      })
  );
});

// ===============================
// ACTIVATE - Clean old caches
// ===============================
self.addEventListener('activate', event => {
  console.log('[SW] Activating v' + SW_VERSION + '...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[SW] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll())
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_ACTIVATED', version: SW_VERSION });
        });
        console.log('[SW] Activation complete, version broadcast to', clients.length, 'client(s)');
      })
  );
});

// ===============================
// FETCH - Serve from cache or network
// ===============================
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return event.respondWith(fetch(event.request));
  }

  const url = new URL(event.request.url);

  // Skip tracking/analytics requests
  if (url.hostname.includes('google-analytics') ||
    url.hostname.includes('googletagmanager')) {
    return event.respondWith(fetch(event.request));
  }

  // Skip API requests (AI providers)
  if (url.hostname.includes('api.openai.com') ||
    url.hostname.includes('generativelanguage.googleapis.com') ||
    url.hostname.includes('api.mistral.ai')) {
    return event.respondWith(fetch(event.request));
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response if found
        if (cachedResponse) {
          // For HTML, always try to fetch fresh version
          if (event.request.headers.get('accept').includes('text/html')) {
            return fetch(event.request)
              .then(response => {
                // Update cache with fresh response
                caches.open(CACHE_NAME).then(cache => {
                  cache.put(event.request, response.clone());
                });
                return response;
              })
              .catch(() => {
                // If network fails, return cached HTML
                return cachedResponse;
              });
          }
          return cachedResponse;
        }

        // Not in cache, fetch from network
        return fetch(event.request)
          .then(response => {
            // Cache the response for future
            if (response.ok && response.status === 200) {
              const responseClone = response.clone();
              caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, responseClone);
              });
            }
            return response;
          })
          .catch(() => {
            // Offline fallback
            if (event.request.headers.get('accept').includes('text/html')) {
              return new Response(
                `<html>
                  <head>
                    <title>Saka Tracker - Offline</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
                    <style>
                      body { 
                        background: #0b1120; 
                        color: #f1f5f9; 
                        font-family: system-ui, sans-serif;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                        text-align: center;
                      }
                      .offline-box {
                        background: #1e293b;
                        padding: 40px 30px;
                        border-radius: 16px;
                        border: 1px solid #334155;
                        max-width: 400px;
                      }
                      .offline-icon { font-size: 4rem; margin-bottom: 16px; color: #f59e0b; }
                      h1 { font-size: 1.5rem; margin-bottom: 8px; color: #f1f5f9; }
                      p { color: #94a3b8; margin-bottom: 20px; line-height: 1.6; }
                      .btn { 
                        background: #3b82f6; 
                        color: white; 
                        border: none; 
                        padding: 12px 24px; 
                        border-radius: 12px;
                        font-weight: 600;
                        cursor: pointer;
                        font-size: 0.9rem;
                        display: inline-flex;
                        align-items: center;
                        gap: 8px;
                      }
                      .btn:hover { background: #2563eb; }
                    </style>
                  </head>
                  <body>
                    <div class="offline-box">
                      <div class="offline-icon"><i class="bi bi-wifi-off"></i></div>
                      <h1>Luring / Offline</h1>
                      <p>Koneksi internet tidak tersedia.<br>Silakan coba lagi nanti.</p>
                      <button class="btn" onclick="location.reload()"><i class="bi bi-arrow-repeat"></i> Coba Lagi</button>
                    </div>
                  </body>
                </html>`,
                { headers: { 'Content-Type': 'text/html' } }
              );
            }
            return new Response('Offline - tidak dapat memuat resource', { status: 503 });
          });
      })
  );
});

// ===============================
// MESSAGE - Handle messages from client
// ===============================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

console.log('[SW] Saka Tracker Service Worker v' + SW_VERSION + ' loaded');
