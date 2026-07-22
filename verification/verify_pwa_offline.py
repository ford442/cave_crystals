import os
import sys
import time

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer, report_screenshot


def wait_for_service_worker(page, timeout_ms=15000):
    deadline = time.time() + (timeout_ms / 1000)
    while time.time() < deadline:
        ready = page.evaluate(
            """
            async () => {
                if (!('serviceWorker' in navigator)) return false;
                const reg = await navigator.serviceWorker.getRegistration();
                if (!reg || !reg.active) return false;
                const keys = await caches.keys();
                return keys.some((key) => key.startsWith('cave-crystals-'));
            }
            """
        )
        if ready:
            return True
        time.sleep(0.25)
    return False


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            context = browser.new_context(
                viewport={"width": 390, "height": 844},
                service_workers="allow",
            )
            page = context.new_page()

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")

            sw_ready = wait_for_service_worker(page)
            print(f"Service worker active with cache: {sw_ready}")
            assert sw_ready is True

            manifest_ok = page.evaluate(
                """
                async () => {
                    const res = await fetch('./manifest.webmanifest');
                    if (!res.ok) return false;
                    const manifest = await res.json();
                    return manifest.name && Array.isArray(manifest.icons) && manifest.icons.length > 0;
                }
                """
            )
            print(f"Manifest available: {manifest_ok}")
            assert manifest_ok is True

            wasm_cached = page.evaluate(
                """
                async () => {
                    const script = [...document.querySelectorAll('script[type="module"]')]
                        .map((el) => el.getAttribute('src'))
                        .find((src) => src && src.includes('/assets/'));
                    if (!script) return false;
                    const moduleUrl = new URL(script, location.href).href;
                    const res = await fetch(moduleUrl);
                    return res.ok;
                }
                """
            )
            print(f"Bundled assets reachable: {wasm_cached}")
            assert wasm_cached is True

            page.screenshot(path="verification/verify_pwa_online.png")
            report_screenshot("verification/verify_pwa_online.png")

            page.evaluate("localStorage.setItem('cave-crystals-pwa-test', 'ok')")
            context.set_offline(True)
            page.reload()
            page.wait_for_selector("#gameCanvas", timeout=10000)

            offline_boot = page.evaluate("typeof window.game !== 'undefined'")
            print(f"Game boots offline after reload: {offline_boot}")
            assert offline_boot is True

            save_intact = page.evaluate(
                "() => localStorage.getItem('cave-crystals-pwa-test') === 'ok'"
            )
            print(f"localStorage intact after offline reload: {save_intact}")
            assert save_intact is True

            page.click("#startBtn")
            time.sleep(0.75)

            spores_before = page.evaluate("window.game.state.spores.length")
            page.keyboard.press("Space")
            time.sleep(0.5)
            spores_after = page.evaluate("window.game.state.spores.length")
            offline_play = spores_after > spores_before
            print(f"Gameplay works offline: {offline_play}")
            assert offline_play is True

            wasm_offline = page.evaluate(
                """
                async () => {
                    const keys = await caches.keys();
                    const cacheName = keys.find((key) => key.startsWith('cave-crystals-') && !key.endsWith('-fonts'));
                    if (!cacheName) return false;
                    const cache = await caches.open(cacheName);
                    const entries = await cache.keys();
                    return entries.some((req) => req.url.includes('.wasm'));
                }
                """
            )
            print(f"WASM present in precache: {wasm_offline}")
            assert wasm_offline is True

            page.screenshot(path="verification/verify_pwa_offline.png")
            report_screenshot("verification/verify_pwa_offline.png")

            browser.close()
            print("PWA offline verification passed.")


if __name__ == "__main__":
    run()
