const UPDATE_BANNER_ID = 'pwaUpdateBanner';
const UPDATE_RELOAD_KEY = 'cave-crystals-pwa-reload';

function canRegisterServiceWorker() {
    if (!import.meta.env.PROD) return false;
    if (!('serviceWorker' in navigator)) return false;
    if (window.location.protocol === 'file:') return false;
    return true;
}

function showUpdateBanner(registration) {
    let banner = document.getElementById(UPDATE_BANNER_ID);
    if (!banner) {
        banner = document.createElement('div');
        banner.id = UPDATE_BANNER_ID;
        banner.className = 'pwa-update-banner hidden';
        banner.innerHTML = `
            <span class="pwa-update-text">A new version is ready.</span>
            <button type="button" id="pwaUpdateBtn" class="pwa-update-btn">Reload</button>
            <button type="button" id="pwaDismissBtn" class="pwa-dismiss-btn" aria-label="Dismiss">×</button>
        `;
        document.body.appendChild(banner);
    }

    banner.classList.remove('hidden');

    const reloadBtn = banner.querySelector('#pwaUpdateBtn');
    const dismissBtn = banner.querySelector('#pwaDismissBtn');

    reloadBtn?.addEventListener('click', () => {
        sessionStorage.setItem(UPDATE_RELOAD_KEY, '1');
        if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            return;
        }
        window.location.reload();
    }, { once: true });

    dismissBtn?.addEventListener('click', () => {
        banner.classList.add('hidden');
    }, { once: true });
}

function bindFullscreenButton() {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return;

    const doc = document;
    const canFullscreen =
        doc.fullscreenEnabled ||
        doc.webkitFullscreenEnabled ||
        doc.mozFullScreenEnabled;

    if (!canFullscreen) {
        btn.classList.add('hidden');
        return;
    }

    const isFullscreen = () =>
        !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement);

    const requestFullscreen = () => {
        const el = doc.documentElement;
        if (el.requestFullscreen) return el.requestFullscreen();
        if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
        if (el.mozRequestFullScreen) return el.mozRequestFullScreen();
        return Promise.reject(new Error('Fullscreen unavailable'));
    };

    const exitFullscreen = () => {
        if (doc.exitFullscreen) return doc.exitFullscreen();
        if (doc.webkitExitFullscreen) return doc.webkitExitFullscreen();
        if (doc.mozCancelFullScreen) return doc.mozCancelFullScreen();
        return Promise.resolve();
    };

    const syncLabel = () => {
        btn.textContent = isFullscreen() ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
        btn.setAttribute('aria-pressed', isFullscreen() ? 'true' : 'false');
    };

    btn.addEventListener('click', async () => {
        try {
            if (isFullscreen()) await exitFullscreen();
            else await requestFullscreen();
        } catch (err) {
            console.warn('[pwa] fullscreen request failed', err);
        }
        syncLabel();
    });

    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange'].forEach((evt) => {
        doc.addEventListener(evt, syncLabel);
    });

    syncLabel();
}

export function registerPwa() {
    bindFullscreenButton();

    if (!canRegisterServiceWorker()) return;

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        if (sessionStorage.getItem(UPDATE_RELOAD_KEY) === '1') {
            refreshing = true;
            sessionStorage.removeItem(UPDATE_RELOAD_KEY);
            window.location.reload();
        }
    });

    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('./sw.js', { scope: './' })
            .then((registration) => {
                if (registration.waiting) {
                    showUpdateBanner(registration);
                }

                registration.addEventListener('updatefound', () => {
                    const installing = registration.installing;
                    if (!installing) return;

                    installing.addEventListener('statechange', () => {
                        if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateBanner(registration);
                        }
                    });
                });

            })
            .catch((err) => {
                console.warn('[pwa] service worker registration failed', err);
            });
    });
}
