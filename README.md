# Crystal Cave Spore Hunter

A procedural arcade shooter built with HTML5 Canvas, WebGL, and the Web Audio API.

## Features

- **Procedural Graphics**: Crystals and Spores are rendered using advanced Canvas 2D techniques with gradients and lighting.
- **Dynamic Background**: A custom WebGL shader renders a deep, misty cave environment.
- **Audio**: Sound effects are synthesized in real-time using the Web Audio API.
- **Modern Build**: Built with Vite as a modular ES6 application.

## How to Run

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Start Development Server**:
    ```bash
    npm run dev
    ```
    Open the URL shown in the terminal (usually `http://localhost:5173`).

3.  **Build for Production**:
    ```bash
    npm run build
    ```
    The output will be in the `dist/` directory.

## Verification

Playwright (Python) scripts in `verification/` smoke-test the game against a production build. They require `python3` (not `python`) plus Playwright and its Chromium browser:

```bash
pip install -r verification/requirements.txt
python3 -m playwright install chromium --with-deps
```

Each script starts its own static server on an available port via `verification/server.py`, so nothing needs to be running beforehand.

- `npm run verify:ci` — full merge gate: Node checks, release production build, smoke test, PWA offline check, and post-FX/backend assertions. This is the command that must pass before merge.
- `npm run verify` — release build, then one fast Playwright smoke test.
- `npm run verify:build` — release WASM plus the Vite production build.
- `npm run verify:smoke` — just the smoke test (assumes `dist/` is already built).
- `npm run verify:pwa` — service worker, manifest, and offline-boot assertions (assumes `dist/` is already built).
- `npm run verify:postfx` — Canvas2D context, WebGL/Canvas2D post-FX, and backend recovery assertions.
- `npm run verify:visual` — run six canonical scripts and fail when canvas screenshots diverge from `verification/baselines/`. Non-blocking in CI.
- `npm run verify:visual:update` — refresh committed baselines after intentional art/VFX changes.
- `npm run verify:visual:all` — run the full Playwright battery without baseline comparison.

Screenshots are written under `verification/` and logged as `[screenshot] <path>`; failure artifacts are logged as `[failure] <path>`.

## CI

GitHub Actions runs two workflows on every push to `main` and on pull requests (no secrets required). Together, their **blocking** jobs are exactly `npm run verify:ci`.

| Workflow | What it checks |
|----------|----------------|
| [`.github/workflows/lint.yml`](.github/workflows/lint.yml) | `npm run test:ci` — ESLint, TypeScript, lint fixtures, debug-WASM unit tests, power-up, audio, game, and save tests, plus a check that these scripts still match the workflows |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | `npm run build` (release WASM only), then `verify:smoke`, `verify:pwa`, and `verify:postfx`. Visual regression (`verify:visual`) runs with `continue-on-error` and is **not** part of `verify:ci`. |

`test:game` already includes replay tests, so `test:replay` is not a separate CI step. `test:wasm` stays an on-demand check of the optimized `release.wasm` artifact (assertions and source maps are the debug target used by `test:unit`).

Reproduce the merge gate locally:

```bash
npm ci
pip install -r verification/requirements.txt && python3 -m playwright install chromium --with-deps
npm run verify:ci
```

`npm run verify` is the shorter build-plus-smoke path. `npm run verify:visual` is the optional pixel-diff job.

## Controls

- **Mouse/Touch**: Move horizontally to aim.
- **Click/Tap**: Shoot a spore.
- **Objective**: Match the spore color to the crystal color to reduce its height. If they touch the ceiling or floor, it's Game Over!
