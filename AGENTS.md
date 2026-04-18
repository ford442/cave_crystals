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
- **Deployment**: Python/paramiko SFTP script

## Directory Structure

```
.
├── package.json          # npm scripts and dependencies
├── asconfig.json         # AssemblyScript compiler configuration
├── vite.config.js        # Vite build configuration
├── index.html            # Single-page app HTML entry
├── deploy.py             # SFTP deployment script
├── plan.md               # Game enhancement plan (feature backlog)
├── src/
│   ├── main.js           # App entry point: imports Game class
│   ├── style.css         # UI styles, HUD, responsive layout
│   ├── assets/
│   │   └── background.png
│   ├── modules/
│   │   ├── Game.js           # Core game loop, state, input, scoring, juice
│   │   ├── Renderer.js       # Canvas 2D rendering, lighting, post-processing
│   │   ├── Entities.js       # Crystal, Spore, Particle, Launcher, etc.
│   │   ├── Audio.js          # SoundManager (Web Audio API)
│   │   ├── WasmManager.js    # WASM loader with JS fallbacks
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

Development (compiles WASM and starts Vite dev server):

```bash
npm run dev
```

Production build (compiles WASM debug + release, then Vite bundles to `dist/`):

```bash
npm run build
```

Preview production build locally:

```bash
npm run preview
```

Build WASM only (debug + release):

```bash
npm run asbuild
```

## Build Configuration Details

- `asconfig.json` defines two AssemblyScript targets:
  - **debug** → `build/debug.wasm` + `build/debug.wat` (source maps enabled)
  - **release** → `build/release.wasm` + `build/release.wat` (optimizeLevel 3)
- `vite.config.js` sets:
  - `base: './'` for relative paths
  - `assetsInlineLimit: 0` so WASM files are **not** inlined
  - `optimizeDeps.exclude: ['@assemblyscript/loader']`
  - `assetsInclude: ['**/*.wasm']`
- The `.gitignore` excludes `node_modules/`, `dist/`, `build/`, `.DS_Store`, `*.wasm`, and `*.wat`.

## Code Style & Conventions

- **ES6 modules**: All JS files use `import`/`export`. Import paths include the `.js` extension (e.g., `import { Game } from './modules/Game.js'`).
- **Classes**: Game entities are ES6 classes (e.g., `Crystal`, `Spore`, `Particle`, `Launcher`).
- **Game state**: The `Game` class holds a single `this.state` object with arrays for `crystals`, `spores`, `particles`, `shockwaves`, `floatingTexts`, etc.
- **Game loop**: Uses `requestAnimationFrame` with delta-time via `timeScale` for slow-motion effects.
- **Juice comments**: Visual/audio polish code is often marked with `// JUICE:` comments (e.g., `// JUICE: Recoil Screen Kick`).
- **WASM integration**: `WasmManager.js` wraps every WASM export with a JavaScript fallback. If WASM fails to load or a function is missing, the game continues using the JS implementation.
- **Audio**: `SoundManager` is a plain object (not a class) with methods like `shoot()`, `match()`, `mismatch()`. It lazily initializes an `AudioContext` on first user interaction.
- **Colors**: Defined in `Constants.js` as an array of 5 colors with `name`, `hex`, and `glow` properties.

## WASM Development Notes

- The AssemblyScript source lives in `src/assembly/`.
- The entry file `index.ts` re-exports functions from the other modules.
- **Important**: Do not export classes from AssemblyScript — only variables, functions, and enums become WASM exports. The compiler warns about exported classes (`AS235`).
- The release build is the one bundled by Vite (`build/release.wasm`).
- `WasmManager` fetches the WASM file at runtime using `fetch()` + `WebAssembly.instantiate()`, not the `@assemblyscript/loader` ESM bindings (despite being in `devDependencies`).
- `env` imports provided to WASM:
  - `abort` → logs to console.error
  - `seed` → `Math.random()`
- The WASM module includes a custom LCG random number generator (`fastRandom`) seeded from JS.

## Testing / Verification

The `verification/` directory contains 18 Python scripts using **Playwright** to test game features visually. They fall into two patterns:

1. **Direct file access** (for `verify_game.py`):
   ```python
   url = f"file://{cwd}/dist/index.html"
   ```
2. **Local HTTP server** (most others):
   ```python
   server = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--directory", "dist"], ...)
   ```

Typical test flow:
1. Launch headless Chromium.
2. Navigate to the game (file or localhost).
3. Wait for `#gameCanvas` and click `#startBtn`.
4. Inject game state or simulate input via `page.evaluate()` / `page.mouse.click()`.
5. Take screenshots to `verification/` or assert state values.

### Running a verification script

```bash
npm run build
python verification/verify_game_http.py
```

Some scripts require the **Vite dev server** (`npm run dev`) running on port `5173` (e.g., `verify_gameplay.py`). Others require the **production build** served from `dist/`.

**Note**: These are visual/integration smoke tests, not unit tests. They verify that effects render correctly by taking screenshots and sometimes inspecting `window.game.state` values.

## Deployment

`deploy.py` uploads the contents of `dist/` to a remote server via SFTP (paramiko). It recursively creates directories and copies files.

**Configuration in `deploy.py`:**
- `HOSTNAME = "1ink.us"`
- `USERNAME = "ford442"`
- `REMOTE_DIRECTORY = "test.1ink.us/cave-crystals"`
- `LOCAL_DIRECTORY = "dist"`

### Deploy steps

```bash
npm run build
python deploy.py
```

## Security Considerations

- **`deploy.py` contains a hardcoded password** (`password = 'GoogleBez12!'`). This is a significant security risk. Agents should not expose this value in generated code or logs, and the project should be migrated to SSH keys or environment variables.
- No `.env` file or secrets management is currently in place.
- No Content Security Policy headers are defined.

## Game Architecture Quick Reference

### Main loop (`Game.js`)
1. `requestAnimationFrame` calls `loop(timestamp)`.
2. Calculates delta time and applies `timeScale` for slow-motion.
3. Updates crystals (growth + spring physics for scale animation).
4. Updates spores (expansion + WASM collision check).
5. Updates particles, shockwaves, floating text, soul particles, dust.
6. Calculates screen shake / recoil offsets.
7. Calls `renderer.draw(state, launcher)`.

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

### Renderer effects
- Additive lighting pass (`lighter` composite) for crystal glow.
- Chromatic aberration (red/blue channel offsets) during high-speed movement.
- Shockwave distortion on crystals and launcher.
- Holographic scanlines and glitch when `criticalIntensity` is high.
- Red radial vignette with pulsing "CRITICAL!" text.
- Warp grid and targeting system overlays.

## Common Tasks for Agents

- **Add a new color**: Update `COLORS` in `src/modules/Constants.js`. Ensure `GAME_CONFIG.lanes` and renderer logic handle the palette size.
- **Add a new particle type**: Add the class/type in `src/modules/Entities.js`, update the particle update/render logic in `Game.js` and `Renderer.js`.
- **Add a new WASM function**: Write it in the appropriate `src/assembly/*.ts` file, re-export from `index.ts`, add a wrapper + JS fallback in `src/modules/WasmManager.js`, then call it from `Game.js` or `Entities.js`.
- **Add a new sound**: Add a method to `SoundManager` in `src/modules/Audio.js` using oscillators and gains.
- **Add a verification test**: Create a new Python file in `verification/` using the Playwright patterns shown in existing scripts.
