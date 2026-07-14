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
pip install playwright
playwright install chromium --with-deps
```

Each script starts its own static server on an available port via `verification/server.py`, so nothing needs to be running beforehand.

- `npm run verify` — build, then run one fast Playwright smoke test. This is the single command for a clean-shell check.
- `npm run verify:build` — just the production build.
- `npm run verify:smoke` — just the smoke test (assumes `dist/` is already built).
- `npm run verify:visual` — run the full battery of visual/behavioral Playwright scripts and print a pass/fail summary.

Screenshots are written under `verification/` and logged as `[screenshot] <path>`; failure artifacts are logged as `[failure] <path>`.

## Controls

- **Mouse/Touch**: Move horizontally to aim.
- **Click/Tap**: Shoot a spore.
- **Objective**: Match the spore color to the crystal color to reduce its height. If they touch the ceiling or floor, it's Game Over!
