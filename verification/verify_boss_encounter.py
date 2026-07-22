"""Force-spawn The Convergence and drive it from intro through defeat."""
import os
import sys

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from screenshot_utils import advance, capture_deterministic_screenshot, new_deterministic_page
from server import CHROMIUM_ARGS, DistServer, report_screenshot


def run():
    with DistServer() as server:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = new_deterministic_page(browser, viewport={"width": 1280, "height": 800})
            page_errors = []
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))

            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            advance(page, 800)
            page.click("#startBtn")
            advance(page, 600)

            started = page.evaluate("""
                () => {
                    if (!window.game || !window.game.forceStartBoss) return false;
                    return window.game.forceStartBoss('convergence');
                }
            """)
            print(f"Boss forced start: {started}")
            assert started is True

            intro = page.evaluate("""
                () => {
                    const b = window.game.boss;
                    return {
                        state: b.state,
                        name: b.definition && b.definition.name,
                        hp: b.hp,
                        maxHp: b.maxHp,
                        hudActive: !!(window.game.state.boss && window.game.state.boss.active),
                        heightsLen: b.targetHeights ? b.targetHeights.length : 0,
                        symmetric: (() => {
                            const h = b.targetHeights;
                            if (!h || h.length < 2) return false;
                            for (let i = 0; i < (h.length >> 1); i++) {
                                if (Math.abs(h[i] - h[h.length - 1 - i]) > 0.01) return false;
                            }
                            return true;
                        })(),
                    };
                }
            """)
            print(f"Intro state: {intro}")
            assert intro["state"] == "intro"
            assert intro["name"] == "The Convergence"
            assert intro["hp"] == intro["maxHp"]
            assert intro["hudActive"] is True
            assert intro["heightsLen"] >= 2
            assert intro["symmetric"] is True

            # Advance controller into vulnerable window
            page.evaluate("""
                () => {
                    const g = window.game;
                    const b = g.boss;
                    b.timerMs = (b.definition.introMs || 2800) + 50;
                    b.update(16, 1);
                    const phase = b.definition.phases[0];
                    b.timerMs = phase.telegraphMs + 50;
                    b.update(16, 1);
                    b.timerMs = phase.surgeMs + 50;
                    b.update(16, 1);
                    g.state.boss = b.getHudState();
                }
            """)
            advance(page, 100)

            vulnerable = page.evaluate("""
                () => ({
                    state: window.game.boss.state,
                    step: window.game.boss.phaseStep,
                    mask: window.game.boss.vulnerableMask,
                    hp: window.game.boss.hp,
                })
            """)
            print(f"Vulnerable: {vulnerable}")
            assert vulnerable["state"] == "vulnerable"
            assert vulnerable["mask"] > 0

            # Drain HP on vulnerable lanes, then let the game loop finish defeat
            page.evaluate("""
                () => {
                    const b = window.game.boss;
                    let safety = 0;
                    while (b.hp > 0 && safety < 64) {
                        safety++;
                        let hit = false;
                        for (let lane = 0; lane < b.lanes; lane++) {
                            if (((b.vulnerableMask >>> lane) & 1) === 1) {
                                if (b.onMatch(lane, true) > 0) hit = true;
                            }
                        }
                        if (!hit) b.vulnerableMask = 0xffffffff;
                    }
                }
            """)

            # ~defeatMs of simulated frames so handleBossDefeat runs
            page.evaluate("""
                () => {
                    const g = window.game;
                    for (let i = 0; i < 180; i++) {
                        g.systems.loop.update(16);
                        if (!g.boss.isBusy() && g.progression.transitioning) break;
                    }
                }
            """)
            advance(page, 400)

            outcome = page.evaluate("""
                () => {
                    const g = window.game;
                    return {
                        bossBusy: g.boss.isBusy(),
                        bossState: g.boss.state,
                        rainbow: g.powerUps.getHeldCount('rainbow'),
                        score: g.state.score,
                        transitioning: g.progression.transitioning,
                        campaignComplete: g.progression.campaignComplete,
                        gameOverVisible: g.ui.gameOver && !g.ui.gameOver.classList.contains('hidden'),
                    };
                }
            """)
            print(f"Outcome: {outcome}")
            assert outcome["bossBusy"] is False
            assert outcome["bossState"] == "idle"
            # Defeat grants rainbows and/or advances campaign complete / level transition
            assert (
                outcome["rainbow"] >= 1
                or outcome["transitioning"] is True
                or outcome["campaignComplete"] is True
                or outcome["gameOverVisible"] is True
            )

            print(f"Page errors: {page_errors}")
            assert page_errors == []

            path = capture_deterministic_screenshot(page, "verification/verify_boss_encounter.png")
            report_screenshot(path)
            browser.close()


if __name__ == "__main__":
    run()
