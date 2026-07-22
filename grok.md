# grok.md — Grok AI Assistant Guide for Crystal Cave Spore Hunter

> Read this first.

## Project Overview

**Crystal Cave Spore Hunter** is a browser-based procedural arcade shooter. The player shoots colored spores at matching crystals growing from the top and bottom of the screen. Matching colors shrinks crystals; mismatches make them grow. If top and bottom crystals touch, the game ends.

The project emphasizes **"game juice"** — extensive screen shake, chromatic aberration, time dilation, particle effects, lighting, floating text, combo systems, and synthesized audio feedback.

## Technology Stack

- **Frontend**: Vanilla ES6 modules, HTML5 Canvas 2D, CSS3
- **Build Tool**: Vite v5.0.0 (bundles JS/CSS, copies assets, handles WASM imports)
- **WebAssembly**: AssemblyScript v0.28.9 compiled to `.wasm`
- **Audio**: Web Audio API (all sound effects synthesized in real time; no audio files)
- **Background**: Static PNG image (`src/assets/background.png`) inserted as a DOM `<img>` behind the canvas
- **Verification**: Playwright (Python) scripts for visual/integration testing
- **Deployment**: Python bundle upload via Contabo deploy API (`deploy.py`, token from env)

## Directory Structure

```
.
├── package.json          # npm scripts and dependencies
├── asconfig.json         # AssemblyScript compiler configuration
├── vite.config.js        # Vite build configuration
├── index.html            # Single-page app HTML entry
├── deploy.py             # Production deploy script (env-based token auth)
├── plan.md               # Game enhancement plan (feature backlog)
├── AGENTS.md             # Full detailed agent instructions (also read this)
├── grok.md               # This file — Grok quick-start guide
├── src/
│   ├── main.js           # App entry point
│   ├── style.css         # UI styles, HUD
│   ├── assets/
│   │   └── background.png
│   ├── modules/
│   │   ├── Game.js           # Core game loop, state, input, scoring, juice
│   │   ├── Renderer.js       # Canvas 2D rendering, lighting, post-processing (~1233 lines)
│   │   ├── Entities.js       # Crystal, Spore, Particle, ... ParticlePool
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

```bash
npm install          # Install dependencies (required first)
npm run dev          # Compile WASM + start Vite dev server (http://localhost:5173)
npm run build        # Compile WASM (debug + release) + Vite production build to dist/
npm run preview      # Preview the production build locally
npm run asbuild      # Build WASM only (debug + release)
```

**Important Vite config notes** (vite.config.js):
- `base: './'` for relative paths
- `assetsInlineLimit: 0` — WASM files are **never** inlined
- WASM files served from `build/release.wasm` (the release target is what ships)

## Grok Guidelines

- **Read AGENTS.md too**: It contains the complete, authoritative instructions. This grok.md is a quick-reference companion.
- **Always follow the coding conventions** in AGENTS.md (ES6 modules with explicit `.js` extensions in imports, class-based entities, `// JUICE:` comments for polish, object pooling via ParticlePool, etc.).
- **WASM integration**: All WASM exports have JS fallbacks in `WasmManager.js`. Never call WASM directly — always go through the manager. Trivial math functions intentionally always use the JS path.
- **Game juice is sacred**: Screen shake, time dilation (`state.timeScale`), hit-stop (`state.sleepTimer`), chromatic aberration, impact flashes, recoil (`state.kickY`), shockwaves — these are core to the experience.
- **Multi-step work**: Use the `todo_write` tool for any task with 3+ steps. Keep todos updated in real time.
- **Verification**: Many visual/integration tests live in `verification/`. They use Playwright (sync + async). Typical flow: build → start server (port 8081 or Vite 5173) → interact via `page.evaluate()` → screenshot or assert state.
- **Input handling**: Mouse, touch (canvas `touchstart` with `preventDefault` + ghost-click suppression), and keyboard/gamepad via `InputManager` (arrows/A/D, Space/Enter). Fire input buffers one frame when combined with a lane change.
- **State shape**: All game state lives under `this.state` in the Game class (crystals, spores, particles, soulParticles, dustParticles, laneMap, combo, sleepTimer, etc.).
- **Renderer**: Heavy use of Canvas 2D with multiple composite passes (lighter for glows), shockwave distortion, post-processing effects.

## Common Tasks

- Add a new color → update `COLORS` in `src/modules/Constants.js` and ensure lane count matches.
- Add a new particle type → define class in `Entities.js`, wire up update/render in `Game.js` + `Renderer.js`. High-frequency particles should use the pool.
- Add a new sound → add method to the plain `SoundManager` object in `src/modules/Audio.js` using Web Audio oscillators/gains.
- Add a new WASM function → implement in the appropriate `src/assembly/*.ts`, re-export from `index.ts`, add wrapper + fallback in `WasmManager.js`, call via the manager.
- Create a verification test → follow patterns in existing `verification/*.py` scripts. Match the server access style (file:// for quick, localhost:8081 for most, 5173 for dev-server tests).
- Work on gameplay juice or balance → start by reading the relevant sections of `Game.js`, `Renderer.js`, and `plan.md`.

## Security Notes

- Store `DEPLOY_TOKEN` in `.env` or `deploy.local.json` (gitignored). See `docs/DEPLOY.md`.
- Use credential-free git remotes (`https://github.com/...` or `git@github.com:...`) with external auth.
- No CSP headers are defined in the static hosting setup.

## Notes

- The release WASM (`build/release.wasm`) is the one bundled into production.
- `SoundManager` lazily initializes its `AudioContext` on first user gesture.
- Dust particles (`state.dustParticles`) and soul particles (`state.soulParticles`) are atmospheric / scoring feedback and react to shockwaves.
- The game uses a custom LCG RNG inside WASM (`fastRandom`) seeded from JS.
- Both sync and async Playwright APIs are used across the verification scripts.

---

**When starting any non-trivial session on this repo, read both `grok.md` and `AGENTS.md`.**

Let's make the crystals breathe, the spores sing, and the screen shake with purpose.
