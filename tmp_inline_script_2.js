
        window.__SAKA_UPDATE_SW_REG = null;

        function checkVersionSync(swVersion) {
            if (typeof APP_VERSION === 'undefined') return;
            if (swVersion && swVersion !== APP_VERSION) {
                console.warn('[VERSION] Ketidaksinkronan versi terdeteksi -> index.html: ' + APP_VERSION + ', sw.js: ' + swVersion);
            }
        }

        function checkManifestVersionSync() {
            fetch(new URL('./manifest.json', window.location.href), { cache: 'no-store' })
                .then(function (res) { return res.json(); })
                .then(function (manifest) {
                    if (typeof APP_VERSION === 'undefined') return;
                    if (manifest.version && manifest.version !== APP_VERSION) {
                        console.warn('[VERSION] Ketidaksinkronan versi terdeteksi -> index.html: ' + APP_VERSION + ', manifest.json: ' + manifest.version);
                    }
                })
                .catch(function () { /* manifest tidak dapat diakses (mis. mode offline) */ });
        }

        function showUpdateBanner() {
            const banner = document.getElementById('update-banner');
            if (banner) banner.classList.add('show');
        }

        function applyUpdate() {
            const reg = window.__SAKA_UPDATE_SW_REG;
            if (reg && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            } else {
                window.location.reload();
            }
        }

        if ('serviceWorker' in navigator) {
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', function () {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });

            navigator.serviceWorker.addEventListener('message', function (event) {
                if (event.data && event.data.type === 'SW_ACTIVATED') {
                    checkVersionSync(event.data.version);
                }
            });

            window.addEventListener('load', function () {
                navigator.serviceWorker.register(new URL('./sw.js', window.location.href), { scope: './' })
                    .then(function (registration) {
                        console.log('[SW] Service Worker registered successfully:', registration);
                        window.__SAKA_UPDATE_SW_REG = registration;
                        checkManifestVersionSync();

                        if (registration.waiting && navigator.serviceWorker.controller) {
                            showUpdateBanner();
                        }

                        registration.addEventListener('updatefound', function () {
                            const newWorker = registration.installing;
                            if (!newWorker) return;
                            newWorker.addEventListener('statechange', function () {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    showUpdateBanner();
                                }
                            });
                        });
                    })
                    .catch(function (error) {
                        console.log('[SW] Service Worker registration failed:', error);
                    });
            });
        }

        // Check if app is installed (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches) {
            console.log('[PWA] Saka Tracker running in standalone mode');
            document.body.classList.add('pwa-mode');
        }
    