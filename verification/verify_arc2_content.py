"""Drive Arc II content end to end: hazards, new power-ups, and The Fractured Heart.

Assertion-based (not in visual_manifest.py): it checks that data-driven level content
actually reaches the running game, and saves one screenshot of a tremor telegraph.
"""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from fixed_step import capture_fixed_step_screenshot, new_fixed_step_page, open_game, step
from server import CHROMIUM_ARGS, DistServer


def jump_to_level(page, level_id):
    return page.evaluate(
        """(id) => {
            const g = window.game;
            if (g.tutorial.isActive()) g.tutorial.skip();
            g.progression.levelIndex = id - 1;  // level ids run 1..N (enforced by content validation)
            g.beginCurrentLevel();
            const cfg = g.progression.getActiveConfig();
            return { id: cfg.id, name: cfg.name, lanes: g.state.crystals.length / 2 };
        }""",
        level_id,
    )


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_fixed_step_page(browser, viewport={"width": 1280, "height": 800})
            page_errors = []
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))

            open_game(page, server.url)
            step(page, 500)
            page.click("#startBtn")
            step(page, 500)

            # Level 6 — overgrowth on the edge lanes, arc II pool.
            info = jump_to_level(page, 6)
            print(f"Level 6: {info}")
            assert info["id"] == 6 and info["name"] == "Fault Lines"
            step(page, 1000)
            l6 = page.evaluate(
                """() => {
                    const g = window.game;
                    const top = (lane) => g.state.crystals.find(c => c.lane === lane && c.type === 'top');
                    return {
                        hazards: g.state.hazards,
                        mult0: g.hazards.getLaneGrowthMultiplier(0),
                        mult2: g.hazards.getLaneGrowthMultiplier(2),
                        pool: [...g.powerUps.getPool()],
                        h0: top(0).height, h2: top(2).height,
                    };
                }"""
            )
            print(f"Level 6 state: {l6}")
            assert l6["mult0"] == 1.6 and l6["mult2"] == 1
            assert l6["hazards"] and len(l6["hazards"]["overgrowth"]) == 2
            assert "temporal_drift" in l6["pool"]

            # Level 7 — tremor telegraph then jolt.
            jump_to_level(page, 7)
            step(page, 5600)  # intervalMs 7000 - warningMs 1600 = 5400
            warned = page.evaluate(
                """() => {
                    const g = window.game;
                    const w = g.state.hazards && g.state.hazards.warnings[0];
                    if (!w) return null;
                    return { lanes: w.lanes, progress: w.progress,
                             heights: w.lanes.map(l => g.state.crystals.find(c => c.lane === l && c.type === 'top').height) };
                }"""
            )
            print(f"Tremor warning: {warned}")
            assert warned and len(warned["lanes"]) == 1 and 0 < warned["progress"] < 1
            capture_fixed_step_screenshot(page, "verification/verify_arc2_tremor.png")
            step(page, 1600)
            after = page.evaluate(
                """(lanes) => lanes.map(l => window.game.state.crystals.find(c => c.lane === l && c.type === 'top').height)""",
                warned["lanes"],
            )
            print(f"Heights before/after tremor: {warned['heights']} -> {after}")
            assert after[0] - warned["heights"][0] >= 30, "tremor should jolt the warned lane by ~32px"
            assert page.evaluate("() => window.game.state.active") is True

            # New power-ups through the real Game API and the E key.
            jump_to_level(page, 9)
            page.evaluate("() => window.game.grantPowerUp('fault_quake')")
            step(page, 100)
            assert page.is_visible("#powerUpActivateBtn"), "USE button should show for fault_quake"
            before = page.evaluate(
                """() => { const g = window.game; g.setTargetLane(3);
                    return g.state.crystals.filter(c => c.type === 'top').map(c => c.height); }"""
            )
            step(page, 300)
            page.keyboard.press("KeyE")
            step(page, 32)
            quake = page.evaluate(
                """() => ({ heights: window.game.state.crystals.filter(c => c.type === 'top').map(c => c.height),
                            held: window.game.powerUps.getHeldCount('fault_quake') })"""
            )
            print(f"Fault quake: {before} -> {quake}")
            assert quake["held"] == 0
            for lane in (2, 3, 4):
                assert quake["heights"][lane] < before[lane] - 40, f"lane {lane} should shrink"
            assert quake["heights"][0] >= before[0] - 1, "lane 0 is outside the quake radius"

            page.evaluate("() => window.game.grantPowerUp('temporal_drift')")
            assert page.evaluate("() => window.game.powerUps.getGrowthScale()") == 0.4
            page.evaluate("() => window.game.grantPowerUp('prism_volley')")
            assert page.evaluate("() => window.game.powerUps.getHeldCount('prism_volley')") == 3

            # Arc II boss: forceStartBoss jumps to level 10 by bossId.
            started = page.evaluate("() => window.game.forceStartBoss('fractured_heart')")
            boss = page.evaluate(
                """() => ({ level: window.game.progression.getActiveConfig().id,
                            name: window.game.boss.definition.name,
                            phases: window.game.boss.definition.phases.length,
                            hp: window.game.boss.maxHp })"""
            )
            print(f"Boss: started={started} {boss}")
            assert started is True and boss == {"level": 10, "name": "The Fractured Heart", "phases": 5, "hp": 10}

            page.evaluate(
                """() => { const b = window.game.boss; b.state = 'defeat'; b.hp = 0; b.timerMs = 1e6; }"""
            )
            step(page, 48)
            rewards = page.evaluate(
                """() => ({ prism: window.game.powerUps.getHeldCount('prism_volley'),
                            quake: window.game.powerUps.getHeldCount('fault_quake'),
                            transitioning: window.game.progression.transitioning })"""
            )
            print(f"Boss rewards: {rewards}")
            assert rewards["quake"] == 1 and rewards["prism"] >= 3 and rewards["transitioning"] is True

            assert not page_errors, f"page errors: {page_errors}"
            browser.close()
            print("[ok] Arc II content verified")


if __name__ == "__main__":
    run()
