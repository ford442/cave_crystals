# Determinism contract

Crystal Cave is intentionally **non-deterministic** for visual juice, but **replayable** for gameplay outcomes when a run seed and input log are provided.

## RNG tiers

### Tier 0 — Fully deterministic (no RNG)

- Collision geometry (`checkCollisions`, match/penalty height math)
- Crystal growth rates and endless wave thresholds
- Campaign level objectives and progression gates

### Tier 1 — Gameplay RNG (must match on replay)

Seeded from `replay.seed` via [`GameplayRng`](../src/modules/GameplayRng.js):

| System | Draw |
|--------|------|
| `Game.initCrystals()` | Crystal height and initial `colorIdx` per lane |
| `ProgressionManager.pickRandomColorIndex()` | Next spore color after each shot / level start |
| `CollisionSystem.applyCrystalHit()` | Match recolor (`colorCount` from active level) |
| `ComboSystem.handleSporeScore()` | Soul-orb count per match (`3 + [0,1]`) |
| `PowerUpManager.rollPickup()` | Weighted power-up drop rolls |

WASM juice LCG (`fastRandom`) is synced at session start: `wasm.setSeed(seed ^ 0xc0ffee)` and `jsSetSeed(seed ^ 0xc0ffee)` in [`WasmManager.setGameplaySeed()`](../src/modules/WasmManager.js).

### Tier 2 — Visual / audio fluff (may diverge)

Uses `Math.random()` — does not affect score or win/loss:

- Particle velocities, sizes, trails, film grain, screen shake offsets
- Audio pitch jitter, environmental motes, dust spawn positions
- Level-up confetti colors

### Tier 3 — Environment (deterministic per canvas size)

- Cave stalactite layout (`CaveRenderer` LCG from canvas dimensions)

## Replay mode rules

When `game.replay.player.isActive()`:

1. Live DOM and polled keyboard/gamepad input are ignored.
2. `GameplayRng` is seeded from the replay file at `start`.
3. `config.gameMode`, `config.graphics`, and `config.levelIndex` override user settings.
4. Tutorial is skipped.

## WASM boundary

| Export | Randomness |
|--------|------------|
| `getSmokeVx/Vy(random)` | Caller supplies float; WASM is pure |
| `getSpiral/Shatter/DirectionalVx/Vy` | Internal `fastRandom()` — stateful; synced at session start |
| `checkCollisions`, growth helpers | No RNG |
| Batch integrators | No RNG |

See also [`WASM.md`](./WASM.md).

## Testing

- Unit: `npm run test:replay`
- Browser golden file: `python3 verification/verify_replay.py` (stepped `runToCompletion`, score tolerance `0`)

Wall-clock Playwright `wait_for_timeout` playback is discouraged; use `ReplayPlayer.runToCompletion()` for stable results.
