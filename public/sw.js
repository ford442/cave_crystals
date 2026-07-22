/* Crystal Cave Spore Hunter — production service worker.
 * CACHE_VERSION is injected at build time; bump via new deploy (precache hash changes).
 */
const CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = `cave-crystals-${CACHE_VERSION}`;
const FONT_CACHE = `${CACHE_NAME}-fonts`;

const PRECACHE_MANIFEST_URL = './precache-manifest.json';

/** @type {string[]} */
let precacheUrls = ['./index.html', './manifest.webmanifest'];

const isFontRequest = (url) =>
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';

const isSameOrigin = (url) => url.origin === self.location.origin;

const cacheFirst = async (request) => {
    const cached = await caches.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
    }
    return response;
};

const networkFirst = async (request) => {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        return caches.match('./index.html');
    }
};

const staleWhileRevalidate = async (request) => {
    const cache = await caches.open(FONT_CACHE);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then((response) => {
            if (response.ok) cache.put(request, response.clone());
            return response;
        })
        .catch(() => null);
    return cached || network || new Response('', { status: 504 });
};

self.addEventListener('install', (event) => {
    event.waitUntil(
        (async () => {
            try {
                const manifestResponse = await fetch(PRECACHE_MANIFEST_URL, { cache: 'no-store' });
                if (manifestResponse.ok) {
                    const manifest = await manifestResponse.json();
                    if (Array.isArray(manifest.urls) && manifest.urls.length > 0) {
                        precacheUrls = manifest.urls;
                    }
                }
            } catch (err) {
                console.warn('[sw] precache manifest fetch failed, using defaults', err);
            }

            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(precacheUrls);
        })()
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(
                keys
                    .filter((key) => key.startsWith('cave-crystals-') && key !== CACHE_NAME && key !== FONT_CACHE)
                    .map((key) => caches.delete(key))
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    if (isFontRequest(url)) {
        event.respondWith(staleWhileRevalidate(event.request));
        return;
    }

    if (!isSameOrigin(url)) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(networkFirst(event.request));
        return;
    }

    if (url.pathname.endsWith('precache-manifest.json') || url.pathname.endsWith('sw.js')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(cacheFirst(event.request));
});
