<!-- From: /root/cave_crystals/AGENTS.md -->
# Crystal Cave Spore Hunter — Agent Guide

## Project Overview

Crystal Cave Spore Hunter is a browser-based procedural arcade shooter. The player shoots colored spores at matching crystals growing from the top and bottom of the screen. Matching colors shrinks crystals; mismatches make them grow. If top and bottom crystals touch, the game ends.

The project emphasizes "game juice" — extensive screen shake, chromatic aberration, time dilation, particle effects, lighting, floating text, combo systems, and synthesized audio feedback.

## Technology Stack

- **Frontend**: Vanilla ES6 modules, HTML5 Canvas 2D, CSS3
- **Build Tool**: Vite v5.0.0 (bundles JS/CSS, copies assets, handles WASM imports)
- **WebAssembly**: AssemblyScript v0.28.9 compiled to `.wasm`
- **Audio**: Web Audio API (all sound effects synthesized in real time; no audio files)
- **Background**: Static PNG image (`src/assets/background.png`) inserted as a DOM `<img>` behind the canvas
- **Verification**: Playwright (Python) scripts for visual/integration testing
- **Deployment**: Python bundle upload script (`deploy.py` → Contabo deploy API; `DEPLOY_TOKEN` from env or gitignored local config)

## Directory Structure

```
.
├── package.json          # npm scripts and dependencies
├── asconfig.json         # AssemblyScript compiler configuration
├── vite.config.js        # Vite build configuration
├── index.html            # Single-page app HTML entry
├── deploy.py             # Production deploy script (env-based token auth)
├── plan.md               # Game enhancement plan (feature backlog)
├── src/
│   ├── main.js           # App entry point: imports Game class
│   ├── style.css         # UI styles, HUD, responsive layout
│   ├── assets/
│   │   └── background.png
│   ├── modules/
│   │   ├── Game.js           # Core game loop, state, input, scoring, juice
│   │   ├── Renderer.js       # Canvas 2D rendering, lighting, post-processing (~1233 lines)
│   │   ├── Entities.js       # Crystal, Spore, Particle, TrailParticle, Shockwave,
│   │   │                       FloatingText, Launcher, SoulParticle, DustParticle, ParticlePool
│   │   ├── Audio.js          # SoundManager (Web Audio API)
│   │   ├── WasmManager.js    # WASM loader with JS fallbacks for every export
│   │   ├── Background.js     # DOM image background
│   │   └── Constants.js      # Color palette and game constants
│   └── assembly/
│       ├── index.ts          # WASM module entry / re-exports
│       ├── collision.ts      # Collision detection with bit flags
│       ├── math.ts           # Growth math, RNG, utilities
│       └── particles.ts      # Particle velocity calculations
├── verification/
│   └── *.py              # Playwright screenshot/behavior tests
└── dist/                 # Production build output (generated)
```

## Build Commands

Install dependencies first:

```bash
npm install
```

Development (compiles WASM once, then starts Vite — no AssemblyScript watch):

```bash
npm run dev
```

WASM development (rebuilds `build/release.wasm` on every edit under `src/assembly/`, then full-reloads the browser):

```bash
npm run dev:watch
```

`ASC_WATCH=1` enables a Vite dev-server plugin (`scripts/assemblyscript-watch-plugin.js`) because the ASC CLI has no `--watch` flag. The app loads `build/release.js` bindings in dev, so only the **release** target is rebuilt.

Production build (compiles WASM debug + release, then Vite bundles to `dist/`):

```bash
npm run build
```

Type-check JavaScript sources (`checkJs` via `tsconfig.json`):

```bash
npm run typecheck
```

Preview production build locally:

```bash
npm run preview
```

Build WASM only (debug + release):

```bash
npm run asbuild
```

Validate WASM ABI and JS/WASM parity (requires release build):

Validate WASM ABI and JS/WASM parity after building:

```bash
npm run test:unit
```

For the shipping `release.wasm` artifact:

```bash
npm run test:wasm
```

Lint JavaScript (ESLint flat config; regression fixtures in `test/lint/`):

```bash
npm run lint
npm run test:lint
```

See `docs/WASM.md` for what belongs in WASM vs JavaScript.

## Build Configuration Details

- `asconfig.json` defines two AssemblyScript targets:
  - **debug** → `build/debug.wasm` + `build/debug.wat` (source maps enabled)
  - **release** → `build/release.wasm` + `build/release.wat` (optimizeLevel 3)
- `vite.config.js` sets:
  - `base: './'` for relative paths
  - `assetsInlineLimit: 0` so WASM files are **not** inlined
  - `server.fs.allow: ['..']` to allow serving ASC output from `build/` during dev
  - `ASC_WATCH=1` (`npm run dev:watch`) enables `assemblyscriptWatchPlugin` for automatic release WASM rebuilds
- `package.json` sets `"type": "module"` so Node loads `vite.config.js` and `eslint.config.js` as native ESM (avoids Vite's deprecated CJS Node API warning).
- The `.gitignore` excludes `node_modules/`, `dist/`, `build/`, `.DS_Store`, `*.wasm`, and `*.wat`.

## Code Style & Conventions

- **ES6 modules**: All JS files use `import`/`export`. Import paths include the `.js` extension (e.g., `import { Game } from './modules/Game.js'`).
- **Classes**: Game entities are ES6 classes (e.g., `Crystal`, `Spore`, `Particle`, `Launcher`).
- **Game state**: The `Game` class holds a single `this.state` object with arrays for `crystals`, `spores`, `particles`, `shockwaves`, `floatingTexts`, `soulParticles`, `dustParticles`, etc.
- **Game loop**: Uses `requestAnimationFrame` with delta-time via `timeScale` for slow-motion effects.
- **Juice comments**: Visual/audio polish code is often marked with `// JUICE:` comments (e.g., `// JUICE: Recoil Screen Kick`).
- **Object pooling**: High-frequency particles use `ParticlePool` (defined in `Entities.js`) to reduce GC pressure. The game maintains a `particlePool` (for `Particle`) and a `trailPool` (for `TrailParticle`).
- **WASM integration**: `wasmBridge.js` lazy-loads ASC-generated `build/release.js` bindings; `WasmManager.js` wraps every export with a JavaScript fallback. If WASM fails to load or a call throws, the game continues using the JS implementation.
- **Audio**: `SoundManager` is a plain object (not a class) with methods like `shoot()`, `match()`, `mismatch()`. It lazily initializes an `AudioContext` on first user interaction.
- **Colors**: Defined in `Constants.js` as an array of 5 colors with `name`, `hex`, and `glow` properties.

## WASM Development Notes

- The AssemblyScript source lives in `src/assembly/`.
- The entry file `index.ts` re-exports functions from the other modules.
- **Important**: Do not export classes from AssemblyScript — only variables, functions, and enums become WASM exports. The compiler warns about exported classes (`AS235`).
- The release build is the one bundled by Vite (`build/release.wasm` + `build/release.js` glue).
- `WasmManager` imports bindings through `wasmBridge.js` — no manual `fetch()` / `WebAssembly.instantiate()` in application code.
- `env` imports provided to WASM:
  - `abort` → logs to console.error
  - `seed` → `Math.random()`
- The WASM module includes a custom LCG random number generator (`fastRandom`) seeded from JS.
- **JS fallback behavior**: `WasmManager` provides JS fallbacks for every export. For trivial math (e.g., `calculateCrystalGrowth`, `calculateGrowthMultiplier`, `checkCrystalGameOver`), the manager intentionally always uses JS to avoid WASM call overhead. Functions that may actually invoke WASM when ready include collision detection (`checkCollisions`), particle velocity helpers (`getShatterVx`, `getDirectionalVx`, etc.), bounce physics (`getBounceVy`), smoke drift (`getSmokeVx`), and homing steering (`calculateHomingVx`/`Vy`).
- **Contract tests**: `npm run test:unit` compiles debug WASM and validates ABI + JS/WASM parity (CI gate). `npm run test:wasm` runs the same suite against `release.wasm`. See `docs/WASM.md`.

## Testing / Verification

### Continuous integration

Two GitHub Actions workflows run on every push to `main` and on pull requests (no secrets required):

| Workflow | What it gates |
|----------|---------------|
| [`.github/workflows/lint.yml`](.github/workflows/lint.yml) | ESLint, TypeScript (`tsc --noEmit`), lint regression fixtures (`test:lint`), WASM unit tests (`test:unit`) |
| [`.github/workflows/ci.yml`](.github/workflows/ci.yml) | Production build (`npm run build`) + Playwright smoke test (`verify_juice.py`) + non-blocking visual regression (`run_visual.py`) |

The smoke job downloads the `dist/` artifact from the build job — it does not run `npm ci`. CI uses `verify_juice.py` (wired as `npm run verify:smoke`) because it asserts audio, save, keyboard, gameplay, and zero page errors.

The **visual** job (also in `ci.yml`, `continue-on-error: true` for now) runs `python3 verification/run_visual.py`: six canonical scripts capture deterministic `#gameCanvas` screenshots and compare them to committed baselines under `verification/baselines/` using per-channel pixel diff (Pillow). Failed comparisons write diff images to `verification/diffs/`.

Reproduce CI locally:

```bash
npm ci
npm run lint && npm run typecheck && npm run test:lint && npm run test:unit   # lint.yml
npm run build                                                                  # ci.yml build job
pip install -r verification/requirements.txt && python3 -m playwright install chromium --with-deps
python3 verification/verify_juice.py                                           # ci.yml smoke job
python3 verification/run_visual.py                                               # ci.yml visual job (non-blocking)
# or: npm run verify   # build + verify_juice.py
```

### Visual regression baselines

Canonical scripts and thresholds live in [`verification/visual_manifest.py`](verification/visual_manifest.py). `npm run verify:visual` runs those scripts and **fails when canvas screenshots diverge** beyond the configured per-baseline ratio (default pixel threshold: sum of channel deltas ≤ 12).

**Update baselines after intentional art/VFX changes:**

```bash
npm run build
python3 verification/update_baselines.py                    # refresh all canonical baselines
python3 verification/update_baselines.py verify_juice.py    # or one script at a time
git add verification/baselines/
```

Helpers:

- [`verification/screenshot_utils.py`](verification/screenshot_utils.py) — seeded `Math.random`, frozen render timestamp, canvas-only capture
- [`verification/visual_diff.py`](verification/visual_diff.py) — Pillow pixel-diff comparison
- [`verification/run_visual.py`](verification/run_visual.py) — canonical runner + baseline gate (backs `npm run verify:visual`)
- [`verification/update_baselines.py`](verification/update_baselines.py) — refresh committed PNGs (backs `npm run verify:visual:update`)

`verify_critical_vignette.py`, `verify_settings.py`, and the `game_spore_http` frame capture screenshots but are not gated yet — their scenes are still too variable for stable pixel diff. `npm run verify:visual:all` runs the full `run_all.py` battery without baseline comparison.

### Replay recording and playback

Session replays use versioned `.ccreplay` JSON files. See [`docs/REPLAY.md`](docs/REPLAY.md) and [`docs/DETERMINISM.md`](docs/DETERMINISM.md).

| Module | Role |
|--------|------|
| `src/modules/ReplayRecorder.js` | Append-only event log during live play |
| `src/modules/ReplayPlayer.js` | Feeds recorded events into `Game` input handlers |
| `src/modules/GameplayRng.js` | Seeded Tier-1 gameplay RNG |
| `src/modules/replayFormat.js` | Schema parse/validate (`REPLAY_VERSION`) |

- **Dev export**: Ctrl+Shift+R during an active session (dev mode) downloads `session.ccreplay`.
- **URL hook**: `?replay=fixtures/foo.ccreplay` — press Start to play.
- **Golden test**: `python3 verification/verify_replay.py` (fixture: `verification/fixtures/golden_campaign_l1.ccreplay`).
- **Unit tests**: `npm run test:replay`

Playwright replay tests must use `ReplayPlayer.runToCompletion()` (fixed 16 ms steps), not wall-clock waits.

### Playwright verification scripts

The `verification/` directory contains Python scripts using **Playwright** to test game features visually, plus two shared support files:

- `server.py` — a `DistServer` context manager that starts `python3 -m http.server` over `dist/` on an OS-assigned free port, blocks until it actually answers requests (no fixed `time.sleep` guesswork), and stops it afterward. Also exports `CHROMIUM_ARGS` (`--no-sandbox`, `--disable-dev-shm-usage`, `--disable-gpu`) for reliable headless launches in CI/containers, and `report_screenshot()` / `report_failure()` helpers that print consistently tagged `[screenshot] <path>` / `[failure] <path>` lines.
- `run_all.py` — discovers and runs every `verify_*.py` script in sequence, printing a pass/fail summary. This backs `npm run verify:visual:all` (no baseline comparison).

Every script is self-contained: it starts its own server via `DistServer` (or, for `verify_game.py`, opens `dist/index.html` directly via `file://`) and requires nothing pre-running. Import the helper with `sys.path.insert(0, os.path.dirname(__file__)); from server import ...` since scripts run standalone from the repo root.

Typical test flow:
1. `with DistServer() as server:` to serve `dist/`.
2. Launch headless Chromium with `args=CHROMIUM_ARGS`.
3. Navigate to `server.url`, wait for `#gameCanvas`, click `#startBtn`.
4. Inject game state or simulate input via `page.evaluate()` / `page.mouse.click()`.
5. Take screenshots to `verification/`, reporting them via `report_screenshot()`.

Both **sync** (`playwright.sync_api`) and **async** (`playwright.async_api`) Playwright APIs are used across different scripts; async scripts call `DistServer().start()` / `.stop()` manually instead of using the `with` block.

**Note**: This environment (and most CI containers) only has `python3` on PATH, not `python` — always invoke scripts with `python3`.

### Running verification

```bash
npm run build          # or: npm run verify:build
npm run verify          # build + one fast Playwright smoke test (verify_juice.py)
npm run verify:smoke    # just the smoke test, assumes dist/ already built
npm run verify:visual         # canonical scripts + baseline pixel-diff gate
npm run verify:visual:update  # refresh verification/baselines/ after intentional art changes
npm run verify:visual:all     # run every verification/verify_*.py script, print a summary
python3 verification/verify_game_http.py   # run any individual script directly
```

**Note**: These are visual/integration smoke tests, not unit tests. They verify that effects render correctly by taking screenshots and sometimes inspecting `window.game.state` values.

## Deployment

`deploy.py` zips `dist/` and uploads it to the Contabo deploy service (bundle API). Server-side SFTP credentials never leave the VPS; local auth uses `DEPLOY_TOKEN` only.

See [`docs/DEPLOY.md`](docs/DEPLOY.md) and [`.env.example`](.env.example) for configuration. Copy `.env.example` to `.env` or `deploy.local.json.example` to `deploy.local.json` (both gitignored) and set `DEPLOY_TOKEN`.

### Deploy steps

```bash
npm run build
set -a && source .env && set +a   # or export DEPLOY_TOKEN=...
python3 deploy.py
```

## Security Considerations

- **Never commit secrets.** Use `.env` / `deploy.local.json` (gitignored) or environment variables for `DEPLOY_TOKEN`. `deploy.py` does not print tokens or API error bodies that may contain sensitive data.
- **Rotate compromised credentials.** If tokens or passwords were ever committed, revoke and reissue them on the server (see [`docs/DEPLOY.md`](docs/DEPLOY.md#rotating-exposed-credentials)). Past git history may still contain old values.
- **Git remotes** should use `https://github.com/ford442/cave_crystals.git` or `git@github.com:ford442/cave_crystals.git` — not embedded tokens in the URL. Use `gh auth login`, a credential manager, or SSH keys.
- No Content Security Policy headers are defined.

## Game Architecture Quick Reference

### Main loop (`Game.js`)
1. `requestAnimationFrame` calls `loop(timestamp)`.
2. Calculates delta time (capped at 100ms) and applies `timeScale` for slow-motion.
3. **Hit Stop**: If `state.sleepTimer > 0`, the loop draws a frozen frame and returns early.
4. Updates crystals (growth + spring physics for scale animation).
5. Updates spores (expansion + WASM collision check).
6. Updates particles, shockwaves, floating text, soul particles, dust.
7. Calculates screen shake / recoil offsets.
8. Calls `renderer.draw(state, launcher)`.

### Input
- **Mouse move**: aims launcher to lane under cursor.
- **Mouse click / Touch**: fires spore.
- Touch events set the lane and fire immediately.

### Key state fields
- `state.active` — is the game running?
- `state.timeScale` / `state.targetTimeScale` — for slow-motion effects.
- `state.shake` / `state.shakeOffset` — screen shake magnitude and offset.
- `state.zoom` / `state.zoomFocus` — impact zoom effect.
- `state.criticalIntensity` — triggers red vignette, scanlines, glitch.
- `state.impactFlash` / `state.impactFlashColor` — full-screen flash.
- `state.combo` / `state.comboTimer` — combo tracking.
- `state.sleepTimer` — hit stop / impact freeze duration in ms.
- `state.kickY` — recoil kick offset.
- `state.displayScore` — lerped score for animated counting.
- `state.laneMap` — `Map<lane, {top: Crystal, bottom: Crystal}>` for fast lane lookups.
- `state.soulParticles` — homing score orbs.
- `state.dustParticles` — atmospheric background motes.

### Renderer effects
- Additive lighting pass (`lighter` composite) for crystal glow.
- Chromatic aberration (red/blue channel offsets) during high-speed movement.
- Shockwave distortion on crystals and launcher.
- Holographic scanlines and glitch when `criticalIntensity` is high.
- Red radial vignette with pulsing "CRITICAL!" text.
- Warp grid and targeting system overlays.
- Impact flash overlay.

### Post-FX dual backend (Canvas2D / WebGL2)

At **`renderQuality === 'high'`** with bloom enabled, the game auto-selects a **WebGL2** post-processing chain when `WebGL2` is available. Medium/low (or missing WebGL2) use the original Canvas2D passes unchanged.

| Backend | When | Core passes | Canvas2D overlays |
|---------|------|-------------|-------------------|
| `webgl2` | High + `host.postFxGlReady` | Threshold bloom (Kawase), chroma + vignette, grade + grain on `#gameCanvas` | Light shafts, scanlines, glitch, `CRITICAL!` text, impact flash on `#postOverlayCanvas` |
| `canvas2d` | Fallback | Full stack on `#gameCanvas` 2D context | N/A (same canvas) |

**Scene capture:** When WebGL is active, the 2D scene (lighting through particles) renders to a hidden `_sceneCanvas`; each frame uploads to a GPU texture for the shader chain.

**Debug / test overrides:** `window.__FORCE_WEBGL_POSTFX__ = true` or `window.__FORCE_CANVAS_POSTFX__ = true` before load. Inspect `game.renderer.postFxBackend` (`'webgl2' | 'canvas2d'`).

**GPU memory (approximate, scales with pixel count):**

| Resource | 1920×1080 estimate |
|----------|-------------------|
| Scene upload texture | ~8 MB |
| Full-res ping-pong FBOs (×2) | ~16 MB |
| Bloom pyramid (½ res) | ~2 MB |
| **Typical total** | **~25–30 MB VRAM** |

FBOs are rebuilt on resize; WebGL is only acquired on the display canvas while the high-quality backend is active.

**Verification:** `python3 verification/verify_webgl_postfx.py` (programmatic backend assertions + optional screenshot). Not yet in the gated visual manifest — threshold bloom differs from legacy entity-blob baselines.

**Key files:** `src/modules/renderers/postfx/PostFxUniforms.js`, `Canvas2DPostFxBackend.js`, `WebGL2PostFxBackend.js`, `src/modules/renderers/webgl/glUtils.js`, `src/modules/renderers/webgl/shaders.js`.

### Canvas 2D context attributes

All canvas contexts are created in `src/modules/renderers/RendererHost.js` via presets in `src/modules/renderers/canvasContext.js`. Attributes are fixed at creation time (resizing only resets drawing state).

| Canvas | Preset | Attributes | Why |
|--------|--------|------------|-----|
| Main (`#gameCanvas`) | `MAIN_CANVAS_CONTEXT` or **WebGL2** (high post-FX) | `alpha: false`, `desynchronized: true` (2D only) | Opaque framebuffer; at high quality with WebGL2, `#gameCanvas` becomes the GPU present target and scene drawing moves to `_sceneCanvas`. |
| Overlay (`#postOverlayCanvas`) | `OFFSCREEN_FX_CONTEXT` | `alpha: true` | WebGL-only: light shafts, scanlines, glitch, impact flash composited above the GPU output. Hidden when Canvas2D backend is active. |
| Bloom (`_bloomCanvas`) | `OFFSCREEN_FX_CONTEXT` | `alpha: true`, `willReadFrequently: false` | Quarter-res additive glow; cleared areas must stay transparent. GPU draw-only, no readback. |
| Grain (`_grainCanvas`) | `GRAIN_BUFFER_CONTEXT` | `alpha: true`, `willReadFrequently: true` | **Exception:** refreshed via `createImageData` + `putImageData` (CPU write path), not `getImageData`. |
| Scanline (`scanlineCanvas`) | `OFFSCREEN_FX_CONTEXT` | `alpha: true`, `willReadFrequently: false` | 1×4 stripe tile with transparent gaps; drawn once as a pattern. |

**Desynchronized fallback:** `createCanvas2DContext()` retries without `desynchronized` if the first `getContext` returns `null`. `RendererHost._desynchronizedActive` records the effective value; the dev perf overlay shows `Canvas desync: ON|OFF`.

**Manual perf check (before/after context changes):**
1. `npm run build && npm run preview`
2. Set graphics to High (or `game.setQualityMode('high')`); press `P` for dev perf overlay (or set `__DEV_PERF__=true` before load).
3. Play actively for ~30s and compare `smoothedFrameMs` in the overlay.
4. Optional: Chrome DevTools → Performance with 4× CPU throttle + mobile device emulation.

**Automated check:** `python3 verification/verify_canvas_context.py` asserts context attributes and logs a short frame-time sample (sanity guard, not a benchmark).

### Entity types
- `Crystal` — top/bottom lane crystals with elastic scale animation, flash, critical state, and seeded shard configurations.
- `Spore` — expanding projectile with color-matching logic.
- `Particle` — physics-based spark/debris/shard/chunk with gravity, friction, floor bounce, wall bounce, and 3D rotation simulation.
- `TrailParticle` — lightweight fade-and-shrink trail dot.
- `Shockwave` — expanding ring with inner echo.
- `FloatingText` — pop-in text that drifts upward.
- `Launcher` — player cursor with lerp movement, tilt banking, recoil, squash/stretch, and hover bobbing.
- `SoulParticle` — homing orb that steers toward the score HUD and adds score on arrival.
- `DustParticle` — slow-drifting atmospheric mote that reacts to shockwaves.

## Threading (particle worker)

Visual-only particle integration (trail, dust, aura/ember) can run on a **DedicatedWorker** via `ParticleWorkerBridge` (`src/modules/ParticleWorkerBridge.js`) and `src/workers/particleIntegrator.worker.js`.

| Thread | Responsibility |
|--------|----------------|
| **Main** | Input, collision, crystal growth, spawn/kill/pooling, rendering, audio, gameplay WASM (`checkCollisions`, scalar helpers) |
| **Worker** | Batch integrate trail (WASM), ambient/aura/ember (WASM), dust (JS in `particleBatchCodec.js`) |

**Dual WASM instances:** Main-thread `wasmManager` and the worker each load `release.wasm` into separate linear memory. Collision and gameplay helpers stay on the main thread only.

**Pipelined frames:** The bridge applies the **previous frame’s** worker result at the start of `updateSharedVisuals`, then posts the current frame. Trail/dust/aura may lag ~1 frame (~16 ms at 60 FPS); this is acceptable for VFX.

**Fallback to main thread** when:
- `Worker` unavailable or worker init fails
- `window.__PARTICLE_WORKER__ === false`
- `renderQuality === 'low'`
- Total visual particles (trail + dust + ambient) &lt; 64
- Worker backlog (`inFlight > 1`)

**Buffer layouts** live in `src/modules/particleBatchCodec.js` (must match `WasmConstants.js` / `particles.ts` for WASM batches). Dust uses a JS-only stride-8 layout.

**Dev overlay** (`P` key): shows `integrator path`, `workerMs`, and `backlog` in `perfMetrics`.

**Phase C (optional):** `SharedArrayBuffer` + COOP/COEP headers would allow same-frame integration; not enabled by default. See `docs/DEPLOY.md` if adding cross-origin isolation.

## Common Tasks for Agents

- **Add a new color**: Update `COLORS` in `src/modules/Constants.js`. Ensure `GAME_CONFIG.lanes` and renderer logic handle the palette size.
- **Add a new particle type**: Add the class/type in `src/modules/Entities.js`, update the particle update/render logic in `Game.js` and `Renderer.js`. If it spawns frequently, consider adding it to the `ParticlePool` in `Game.js`.
- **Add a new WASM function**: Write it in the appropriate `src/assembly/*.ts` file, re-export from `index.ts`, add a wrapper + JS fallback in `WasmManager.js`, add the name to `WASM_MANAGER_WASM_EXPORTS`, then call it from `Game.js` or `Entities.js`.
- **Add a new sound**: Add a method to `SoundManager` in `src/modules/Audio.js` using oscillators and gains.
- **Add a verification test**: Create a new `verify_*.py` file in `verification/` using the `DistServer` helper from `server.py` (see other scripts for the pattern). It is picked up by `npm run verify:visual:all`. To gate visual regressions, add the script and screenshot mapping to `visual_manifest.py`, then run `npm run verify:visual:update`.

## Cursor Cloud specific instructions

Dependencies are refreshed automatically by the startup update script (`npm install`, plus `playwright` + its Chromium browser for the Python verification scripts). Below are the non-obvious runtime caveats; standard commands live in the Build/Verification sections above.

- **Dev server**: `npm run dev` serves on `http://localhost:5173/` (Vite default) and recompiles WASM once before starting. Use `npm run dev:watch` when editing `src/assembly/*.ts` — it rebuilds release WASM on save and full-reloads the page. Both are foreground/long-running processes; run them in a persistent shell (tmux), not a blocking one-shot.
- **Playwright CLI is not on PATH**: `pip install playwright` puts the `playwright` script in `~/.local/bin`, which isn't on PATH here. Always invoke it as `python3 -m playwright ...` (e.g. `python3 -m playwright install chromium`). Likewise the verification scripts use `python3`, never `python`.
- **Verification needs a build first**: `npm run verify:smoke` and `npm run verify:visual` run headless Chromium against `dist/`, so run `npm run build` (or `npm run verify:build`) beforehand or they'll test a stale/missing bundle. `npm run verify` bundles the build + smoke test together. Each script starts its own static server on a free port, so nothing needs to be running first.
- **Everything runs locally, no secrets/services**: The game is a static client-side app with no backend. `deploy.py` is for production deploys only and requires `DEPLOY_TOKEN` from env or a gitignored local config — do not run it in routine dev setup.
