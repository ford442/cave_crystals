"""Fixed-step browser clock for deterministic Playwright verification.

The live game loop is driven by ``requestAnimationFrame`` and reads
``performance.now()``; gameplay also schedules a few ``setTimeout`` callbacks
(level transitions, game-over overlay). Under real time, the *number* of frames
that run between two Playwright calls depends on machine load, so even with a
seeded ``Math.random`` two runs of the same script diverge.

``FIXED_STEP_INIT`` is an init script that replaces those clocks in the page's
main world before any app code runs:

* ``requestAnimationFrame`` / ``cancelAnimationFrame`` queue callbacks instead
  of scheduling them; nothing runs until the test steps the clock.
* ``performance.now()`` returns virtual milliseconds.
* ``setTimeout`` / ``setInterval`` (and their ``clear*`` twins) fire in virtual
  time, ordered by due time then creation order.

``step(page, ms)`` advances the clock in fixed 16 ms frames inside a single
``page.evaluate``: each frame fires due timers, then every queued rAF callback
with the virtual timestamp, then drains microtasks. Only the step's final
frame is painted by default (see :func:`step`). Real wall-clock time
between Playwright calls no longer changes what the game does.

Playwright's own machinery runs in an isolated world and keeps the real
clocks, so ``page.click``, ``wait_for_selector`` and screenshots still work.
DOM input (clicks, key presses) is handled synchronously by the page as usual
and takes effect on the next stepped frame.

The particle worker and WebGPU integrator are disabled
(``__PARTICLE_WORKER__`` / ``__PARTICLE_WEBGPU__ = false``): their results arrive
asynchronously at wall-clock-dependent times, which would reintroduce
nondeterminism. Main-thread integration is the same code path the
game uses when the worker is unavailable.

Typical use::

    page = new_fixed_step_page(browser, viewport={"width": 1280, "height": 800})
    open_game(page, server.url)          # goto + wait for WASM, zero frames run
    page.click("#startBtn")
    step(page, 500)                      # 31 frames (496 ms of virtual time)
    capture_fixed_step_screenshot(page, "verification/foo.png")
"""
from __future__ import annotations

from pathlib import Path
from urllib.parse import urlsplit

from server import report_screenshot

FRAME_MS = 16
LOCAL_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})

# Seeded LCG for Math.random (shared with screenshot_utils' legacy helpers).
DETERMINISTIC_RNG_INIT = """
(() => {
    let seed = 0xC0FFEE42;
    Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
})();
"""

FIXED_STEP_INIT = """
(() => {
    if (window.__fixedStep) return;
    const FRAME_MS = %(frame_ms)d;
    let now = 0;
    let frame = 0;

    let rafSeq = 0;
    let rafQueue = new Map();
    window.requestAnimationFrame = (cb) => {
        const id = ++rafSeq;
        rafQueue.set(id, cb);
        return id;
    };
    window.cancelAnimationFrame = (id) => { rafQueue.delete(id); };

    let timerSeq = 0;
    const timers = new Map();
    const addTimer = (cb, delay, args, repeat) => {
        const id = ++timerSeq;
        const ms = Math.max(0, Number(delay) || 0);
        timers.set(id, { id, cb, args, at: now + ms, interval: repeat ? Math.max(1, ms) : 0 });
        return id;
    };
    window.setTimeout = (cb, delay, ...args) => addTimer(cb, delay, args, false);
    window.setInterval = (cb, delay, ...args) => addTimer(cb, delay, args, true);
    window.clearTimeout = (id) => { timers.delete(id); };
    window.clearInterval = (id) => { timers.delete(id); };

    performance.now = () => now;

    const report = (err) => {
        if (typeof window.reportError === 'function') window.reportError(err);
        else console.error(err);
    };

    const runTimersUntil = (limit) => {
        for (;;) {
            let next = null;
            for (const t of timers.values()) {
                if (t.at <= limit && (!next || t.at < next.at || (t.at === next.at && t.id < next.id))) {
                    next = t;
                }
            }
            if (!next) return;
            if (next.interval) next.at += next.interval;
            else timers.delete(next.id);
            try {
                if (typeof next.cb === 'function') next.cb(...next.args);
            } catch (err) {
                report(err);
            }
        }
    };

    const runCallbacks = () => {
        const queue = rafQueue;
        rafQueue = new Map();
        for (const cb of queue.values()) {
            try {
                cb(now);
            } catch (err) {
                report(err);
            }
        }
    };

    // Simulate a frame without painting it: the game loop still runs in full,
    // only Renderer#draw is swapped for a no-op for the duration of the frame.
    const runWithoutDraw = (fn) => {
        const renderer = window.game && window.game.renderer;
        if (!renderer) return fn();
        const own = Object.getOwnPropertyDescriptor(renderer, 'draw');
        renderer.draw = () => {};
        try {
            return fn();
        } finally {
            if (own) Object.defineProperty(renderer, 'draw', own);
            else delete renderer.draw;
        }
    };

    const runFrame = (draw) => {
        frame += 1;
        now += FRAME_MS;
        runTimersUntil(now);
        if (draw) runCallbacks();
        else runWithoutDraw(runCallbacks);
    };

    window.__fixedStep = {
        frameMs: FRAME_MS,
        now: () => now,
        frame: () => frame,
        pendingFrameCallbacks: () => rafQueue.size,
        pendingTimers: () => timers.size,
        /**
         * Advance virtual time by `ms`, rounded to whole frames (minimum one
         * frame for any positive value). Only the last frame is drawn unless
         * `drawEveryFrame` is set. Resolves with the new virtual time.
         */
        async advance(ms, drawEveryFrame = false) {
            const frames = ms > 0 ? Math.max(1, Math.round(ms / FRAME_MS)) : 0;
            for (let i = 0; i < frames; i++) {
                runFrame(drawEveryFrame || i === frames - 1);
                // Let promise continuations settle between frames, as a browser would.
                await Promise.resolve();
            }
            return now;
        },
    };
})();
""" % {"frame_ms": FRAME_MS}

# Both off-thread particle integrators deliver results asynchronously (worker
# postMessage / WebGPU buffer readback), so which frame applies them depends on
# wall-clock timing. Main-thread integration is the game's own fallback path.
DISABLE_PARTICLE_WORKER_INIT = (
    "window.__PARTICLE_WORKER__ = false; window.__PARTICLE_WEBGPU__ = false;"
)

# Canvas2D post-FX at high quality costs ~5 ms/frame headless; Chromium's software
# WebGL2 (SwiftShader under --disable-gpu) costs ~800 ms/frame, which makes stepping
# hundreds of frames impractical. The WebGL2 backend keeps its own assertion-based
# gate (verify_webgl_postfx.py, verify_backend_recovery.py).
FORCE_CANVAS_POSTFX_INIT = "window.__FORCE_CANVAS_POSTFX__ = true;"

# Pin graphics through the same settings control a player uses, so the choice is
# saved and survives reloads and startGame() (which re-applies settings.graphics).
# 'auto' would let the adaptive-quality system pick a tier from frame timings.
SET_GRAPHICS_JS = """
(mode) => {
    const select = document.querySelector('[data-setting="graphics"]');
    if (!select) throw new Error('graphics setting control not found');
    if (![...select.options].some((o) => o.value === mode)) {
        throw new Error(`unknown graphics mode: ${mode}`);
    }
    select.value = mode;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return window.game.state.renderQuality;
}
"""

DEFAULT_QUALITY = "high"

WAIT_FOR_GAME_JS = """
async () => {
    const g = window.game;
    if (!g) throw new Error('window.game not initialised');
    if (g.wasmReady) await g.wasmReady;
    return {
        frames: window.__fixedStep ? window.__fixedStep.frame() : null,
        pendingFrameCallbacks: window.__fixedStep ? window.__fixedStep.pendingFrameCallbacks() : null,
    };
}
"""


def new_fixed_step_context(browser, viewport=None, *, force_canvas_postfx: bool = True):
    """Browser context with seeded RNG, virtual clocks, and main-thread particles."""
    kwargs = {"device_scale_factor": 1}
    if viewport is not None:
        kwargs["viewport"] = viewport
    context = browser.new_context(**kwargs)
    context.add_init_script(DETERMINISTIC_RNG_INIT)
    context.add_init_script(FIXED_STEP_INIT)
    context.add_init_script(DISABLE_PARTICLE_WORKER_INIT)
    if force_canvas_postfx:
        context.add_init_script(FORCE_CANVAS_POSTFX_INIT)
    # Only the local dist server is allowed. The stylesheet @imports a Google
    # Fonts face that canvas text uses; whether that fetch finishes before a given
    # frame (or at all, offline) would change rendered glyphs between runs.
    context.route(_is_external_url, lambda route: route.abort())
    return context


def _is_external_url(url: str) -> bool:
    host = urlsplit(url).hostname or ""
    return url.startswith(("http://", "https://")) and host not in LOCAL_HOSTS


def new_fixed_step_page(browser, viewport=None, *, force_canvas_postfx: bool = True):
    """Page whose game loop only advances when :func:`step` is called."""
    return new_fixed_step_context(
        browser, viewport, force_canvas_postfx=force_canvas_postfx
    ).new_page()


def _wait_for_game(page, timeout: int) -> dict:
    page.wait_for_selector("#gameCanvas", timeout=timeout)
    page.wait_for_function(
        "() => !!window.game && !!window.__fixedStep", polling=50, timeout=timeout
    )
    info = page.evaluate(WAIT_FOR_GAME_JS)
    if info["frames"] != 0:
        raise AssertionError(f"Fixed-step clock advanced before the test stepped it: {info}")
    return info


def open_game(
    page, url: str, *, quality: str | None = DEFAULT_QUALITY, timeout: int = 15000
) -> None:
    """Navigate, then wait for ``window.game`` and WASM without running any frames.

    Waiting on ``game.wasmReady`` matters: WASM load draws from ``Math.random``
    and swaps particle-velocity helpers from JS to WASM, so the first stepped
    frame must always see the same module state.
    """
    page.goto(url)
    _wait_for_game(page, timeout)
    if quality is not None:
        set_graphics(page, quality)


def set_graphics(page, mode: str) -> str:
    """Select a graphics mode via the settings UI; returns the resulting renderQuality."""
    return page.evaluate(SET_GRAPHICS_JS, mode)


def step(page, milliseconds: int, *, draw_every_frame: bool = False) -> float:
    """Advance the game by ``milliseconds`` of virtual time in fixed 16 ms frames.

    Every frame runs the full ``game.loop()`` (update, juice, audio session),
    but by default only the final frame of the step is painted. Software
    Canvas2D drawing is most of a headless frame's cost (10-700 ms with
    hundreds of particles on a loaded runner), and the renderer only writes its
    own caches, never simulation state. The skip pattern is fixed by the
    script, so results stay deterministic either way. Pass
    ``draw_every_frame=True`` when a test depends on renderer history.

    Returns the virtual ``performance.now()`` after stepping.
    """
    if milliseconds <= 0:
        return page.evaluate("() => window.__fixedStep.now()")
    return page.evaluate(
        "([ms, every]) => window.__fixedStep.advance(ms, every)",
        [milliseconds, draw_every_frame],
    )


def reload_game(page, *, timeout: int = 15000) -> None:
    """Reload the page; init scripts reinstall a fresh clock at t=0 and RNG seed."""
    page.reload()
    _wait_for_game(page, timeout)


def render_frame(page) -> None:
    """Redraw the current state at the current virtual time without simulating.

    Use after injecting state with ``page.evaluate`` when the injected values
    must appear exactly as set (a stepped frame would run ``update`` first).
    """
    page.evaluate(
        "() => { const g = window.game; g.renderer.draw(g.state, g.launcher, performance.now()); }"
    )


def capture_fixed_step_screenshot(page, path: str | Path, *, redraw: bool = False) -> None:
    """Capture ``#gameCanvas`` exactly as the last stepped frame drew it.

    No freeze patch, particle clearing, or fixed snapshot timestamp is needed:
    with the clock stopped between steps, the canvas cannot change while the
    screenshot is taken, and every input to the frame was deterministic. CSS
    animations on overlapping DOM are disabled for the capture.
    Pass ``redraw=True`` to draw injected state first (see :func:`render_frame`).
    """
    if redraw:
        render_frame(page)
    # The element screenshot includes DOM overlays composited above the canvas
    # (HUD, tutorial card). Their CSS animations run on the compositor's real
    # clock, which the virtual clock can't reach. For example, the tutorial focus
    # ring pulses scale(1) -> scale(1.01) forever. "disabled" finishes transitions
    # and resets infinite animations to their initial state.
    page.locator("#gameCanvas").screenshot(path=str(path), animations="disabled")
    report_screenshot(str(path))
