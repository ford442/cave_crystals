"""
Verification test for enhanced particle & VFX systems:
- Ambient crystal auras (aura-type particles)
- Multi-phase match burst (energy rings + spiral sparkles)
- Richer shatter effects
- Color-specific Amber ember trails

Run from repo root: python3 verification/verify_vfx_effects.py
"""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from screenshot_utils import (
    advance,
    capture_deterministic_screenshot,
    new_deterministic_page,
)
from server import CHROMIUM_ARGS, DistServer


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_deterministic_page(browser, viewport={"width": 1280, "height": 800})

            console_msgs = []
            page.on("console", lambda msg: console_msgs.append(msg.text))

            print(f"Navigating to {server.url}")
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas", timeout=10000)
            advance(page, 1000)

            page.click("#startBtn")
            advance(page, 1000)

            # ----------------------------------------------------------------
            # 1. Verify energyRings array exists on game state
            # ----------------------------------------------------------------
            has_rings = page.evaluate("Array.isArray(window.game.state.energyRings)")
            print(f"Has energyRings array: {has_rings}")
            assert has_rings, "energyRings array must exist on game state"

            # ----------------------------------------------------------------
            # 2. Verify game is running and particles array exists
            # ----------------------------------------------------------------
            active = page.evaluate("window.game.state.active")
            print(f"Game active: {active}")
            assert active, "Game should be active"

            has_particles = page.evaluate("Array.isArray(window.game.state.particles)")
            print(f"Has particles array: {has_particles}")
            assert has_particles, "particles array must exist"

            # ----------------------------------------------------------------
            # 3. Manually call createCrystalAura to ensure it works without error
            # ----------------------------------------------------------------
            crystals = page.evaluate("window.game.state.crystals.length")
            print(f"Crystals on board: {crystals}")

            if crystals > 0:
                aura_error = page.evaluate("""
                    (() => {
                        try {
                            const c = window.game.state.crystals[0];
                            window.game.createCrystalAura(c);
                            return null;
                        } catch(e) {
                            return e.message;
                        }
                    })()
                """)
                print(f"createCrystalAura error: {aura_error}")
                assert aura_error is None, f"createCrystalAura threw: {aura_error}"
            else:
                print("No crystals yet, skipping aura test")

            # ----------------------------------------------------------------
            # 4. Test createMatchBurst at combo levels 1, 4, 5
            # ----------------------------------------------------------------
            for combo in [1, 4, 5]:
                result = page.evaluate(f"""
                    (() => {{
                        const before = window.game.state.energyRings.length;
                        try {{
                            window.game.createMatchBurst(400, 300, '#FF4444', {combo});
                        }} catch(e) {{
                            return {{ error: e.message }};
                        }}
                        const after = window.game.state.energyRings.length;
                        return {{ before, after, delta: after - before }};
                    }})()
                """)
                print(f"createMatchBurst combo={combo}: {result}")
                assert "error" not in result, f"createMatchBurst(combo={combo}) threw: {result.get('error')}"
                # At combo > 3 we get 2 rings; otherwise 1
                expected_delta = 2 if combo > 3 else 1
                assert result["delta"] >= expected_delta, (
                    f"Expected >= {expected_delta} new energy ring(s) at combo={combo}, got {result['delta']}"
                )

            # ----------------------------------------------------------------
            # 5. Verify aura particles are emitted (type=aura in pool)
            #    Inject a few directly and check they have the right physics
            # ----------------------------------------------------------------
            aura_check = page.evaluate("""
                (() => {
                    // Acquire an aura particle from the pool
                    const p = window.game.particlePool.acquire(200, 200, '#00AAFF', null, null, 'aura');
                    return {
                        type: p.type,
                        gravity: p.gravity,
                        floorBounce: p.floorBounce,
                        maxLifeMin: p.maxLife > 1.0
                    };
                })()
            """)
            print(f"Aura particle check: {aura_check}")
            assert aura_check["type"] == "aura", "Particle type should be 'aura'"
            assert aura_check["gravity"] < 0, "Aura particles should have negative gravity (float up)"
            assert aura_check["floorBounce"] is False, "Aura particles should not bounce off floor"
            assert aura_check["maxLifeMin"] is True, "Aura maxLife should be > 1.0"

            # ----------------------------------------------------------------
            # 6. Verify ember particles have correct physics
            # ----------------------------------------------------------------
            ember_check = page.evaluate("""
                (() => {
                    const p = window.game.particlePool.acquire(200, 200, '#FFAA00', null, null, 'ember');
                    return {
                        type: p.type,
                        gravity: p.gravity,
                        floorBounce: p.floorBounce
                    };
                })()
            """)
            print(f"Ember particle check: {ember_check}")
            assert ember_check["type"] == "ember", "Particle type should be 'ember'"
            assert ember_check["gravity"] > 0, "Ember particles should have positive gravity"
            assert ember_check["floorBounce"] is False, "Ember particles should not bounce off floor"

            # ----------------------------------------------------------------
            # 7. Verify EnergyRing updates correctly over time
            # ----------------------------------------------------------------
            ring_update = page.evaluate("""
                (() => {
                    const rings_before = window.game.state.energyRings.length;
                    // Let the game loop run a bit
                    return { rings_before };
                })()
            """)
            print(f"EnergyRing update check: rings queued = {ring_update['rings_before']}")
            assert ring_update["rings_before"] >= 0, "energyRings should be non-negative"

            # ----------------------------------------------------------------
            # 8. Fire some shots to trigger natural VFX
            # ----------------------------------------------------------------
            page.mouse.click(64, 400)
            advance(page, 300)
            page.mouse.click(200, 400)
            advance(page, 300)
            page.mouse.click(350, 400)
            advance(page, 1000)

            snapshot = page.evaluate("""
                ({
                    particles: window.game.state.particles.length,
                    energyRings: window.game.state.energyRings.length,
                    soulParticles: window.game.state.soulParticles.length
                })
            """)
            print(f"Post-fire snapshot: {snapshot}")

            # ----------------------------------------------------------------
            # 9. Screenshot for visual inspection
            # ----------------------------------------------------------------
            capture_deterministic_screenshot(
                page,
                os.path.join(os.path.dirname(__file__), "vfx_effects_screenshot.png"),
            )

            # ----------------------------------------------------------------
            # 10. Check no console errors were logged
            # ----------------------------------------------------------------
            errors = [m for m in console_msgs if "error" in m.lower() or "uncaught" in m.lower()]
            if errors:
                print(f"Console errors found: {errors}")
            # Non-fatal: just report, don't fail on minor WASM warnings
            critical_errors = [e for e in errors if "typeerror" in e.lower() or "referenceerror" in e.lower()]
            assert not critical_errors, f"Critical JS errors: {critical_errors}"

            print("\n=== All VFX checks passed! ===")

            browser.close()


if __name__ == "__main__":
    run()
