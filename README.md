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

- `npm run verify` — build, then run one fast Playwright smoke test. This is the single command for a clean-shell check.
- `npm run verify:build` — just the production build.
- `npm run verify:smoke` — just the smoke test (assumes `dist/` is already built).
- `npm run verify:visual` — run six canonical scripts and fail when canvas screenshots diverge from `verification/baselines/`.
- `npm run verify:visual:update` — refresh committed baselines after intentional art/VFX changes.
- `npm run verify:visual:all` — run the full Playwright battery without baseline comparison.

Screenshots are written under `verification/` and logged as `[screenshot] <path>`; failure artifacts are logged as `[failure] <path>`.

## CI

GitHub Actions runs two workflows on every push to `main` and on pull requests (no secrets required):

| Workflow | What it checks |
|----------|----------------|
| [`.github/workflows/lint.yml`](.github/workflows/lint.yml) | ESLint, TypeScript (`tsc --noEmit`), lint regression fixtures, WASM unit tests |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Production build (`npm run build`) + Playwright smoke test + non-blocking visual regression |

Reproduce CI locally:

```bash
npm ci
npm run lint && npm run typecheck && npm run test:lint && npm run test:unit   # lint.yml
npm run build                                                                  # ci.yml build job
pip install -r verification/requirements.txt && python3 -m playwright install chromium --with-deps
python3 verification/verify_juice.py                                           # ci.yml smoke job
python3 verification/run_visual.py                                           # ci.yml visual job (non-blocking)
```

Or use the combined shortcut for the build + smoke path:

```bash
npm run verify   # build + verify_juice.py
```

## Controls

- **Mouse/Touch**: Move horizontally to aim.
- **Click/Tap**: Shoot a spore.
- **Objective**: Match the spore color to the crystal color to reduce its height. If they touch the ceiling or floor, it's Game Over!
