import os
import sys
import json

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(__file__))
from server import CHROMIUM_ARGS, DistServer

FIXTURE_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "golden_campaign_l1.ccreplay")

REPLAY_JS = """
(replay) => {
    const g = window.game;
    if (!g?.replay?.player) {
        throw new Error('Replay API not available on window.game');
    }
    g.replay.player.load(replay);
    g.replay.player.runToCompletion(g);
    return {
        score: g.state.score,
        complete: g.replay.player.isComplete(),
        milestones: g.replay.player.getMilestones().length,
    };
}
"""


def run():
    with open(FIXTURE_PATH, encoding="utf-8") as handle:
        replay = json.load(handle)

    expect = replay.get("expect", {})
    final_score = expect.get("finalScore")
    tolerance = expect.get("tolerance", 0)

    if final_score is None:
        raise AssertionError("Golden replay missing expect.finalScore")

    with DistServer() as server:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, args=CHROMIUM_ARGS)
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto(server.url)
            page.wait_for_selector("#gameCanvas")
            page.wait_for_timeout(500)

            result = page.evaluate(REPLAY_JS, replay)
            browser.close()

    print(f"Replay complete: {result}")
    print(f"Expected score: {final_score} (tolerance {tolerance})")

    assert result["complete"] is True, "Replay did not finish dispatching all events"
    assert abs(result["score"] - final_score) <= tolerance, (
        f"Score mismatch: got {result['score']}, expected {final_score}"
    )
    print("Golden replay verification passed.")


if __name__ == "__main__":
    run()
