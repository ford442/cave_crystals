# WASM boundary guide

Crystal Cave loads WASM through ASC-generated ESM bindings in `build/release.js` (imported lazily via `src/modules/wasmBridge.js` and wrapped by `WasmManager`). AssemblyScript sources live in `src/assembly/`.

## What belongs in WASM

| Category | Examples | Rationale |
|----------|----------|-----------|
| **Batch hot loops** | `batchIntegrateSimpleParticles`, `batchIntegrateTrailParticles` | Many particles per frame; linear memory avoids per-particle JS↔WASM calls |
| **Deterministic gameplay helpers** | `checkCollisions`, `calculateMatchHeight`, `calculatePenaltyHeight` | Stable ABI; parity-tested against JS fallbacks |
| **Scalar physics helpers used at scale** | `getSmokeVx/Vy`, `calculateHomingVx/Vy`, `getBounceVy` | Pure functions; cheap to call but must match fallback math |

## What stays in JavaScript

| Category | Examples | Rationale |
|----------|----------|-----------|
| **Trivial scalar math** | `calculateCrystalGrowth`, `calculateGrowthMultiplier`, `checkCrystalGameOver` | Bridge overhead exceeds compute cost; intentionally always JS in `WasmManager` |
| **DOM / render / audio** | all canvas and Web Audio code | Not WASM targets |
| **Entity lifecycle** | spawning particles, pooling, callbacks | Object-heavy; poor fit for linear-memory WASM |

## Memory-backed batch buffers

Exported layout (must stay in sync with `src/modules/WasmConstants.js` and `test/wasm/abi.test.mjs`):

**Simple (aura/ember) batch**

- Stride: **7** floats per particle — `x, y, vx, vy, life, gravity, friction`
- Capacity: **384** particles
- Access: `getSimpleBatchByteOffset()` (linear-memory **dataStart**, not `TypedArray.byteOffset`), `getSimpleBatchStride()`, `getSimpleBatchFloatCount()`

**Trail batch**

- Stride: **6** floats per particle — `x, y, vx, vy, life, size`
- Capacity: **512** particles
- Access: `getTrailBatchByteOffset()` (linear-memory **dataStart**), `getTrailBatchStride()`, `getTrailBatchFloatCount()`

`WasmManager` validates stride/count before writing `Float64Array` views into `memory.buffer`.

**Dust batch (JS-only, worker path)**

- Stride: **8** floats — `x, y, vx, vy, phase, alpha, baseVx, baseVy`
- Capacity: **200** particles (`DUST_BATCH_MAX` in `WasmConstants.js`)
- Integrated in the particle worker via `jsIntegrateDustBatch` in `particleBatchCodec.js` (not a WASM export)

## Worker duplicate instance

The particle integrator worker (`src/workers/particleIntegrator.worker.js`) loads its **own** copy of `release.wasm` for batch integration off the main thread. ABI constants (`WasmConstants.js`, `particles.ts`) must stay in sync — worker and main thread both call the same exports (`batchIntegrateTrailParticles`, `batchIntegrateSimpleParticles`). If strides or capacities change, update `particleBatchCodec.js` and `test/wasm/abi.test.mjs` together.

## Fallback behavior

Every WASM export used in gameplay has a JS implementation in `WasmFallbacks.js`. If the module fails to load or a call throws, `WasmManager` falls back silently in production (warnings are rate-limited / dev-only).

Gameplay RNG seeding (`setSeed` / `jsSetSeed`) and replay determinism tiers are documented in [`DETERMINISM.md`](./DETERMINISM.md).

## Contract tests

Primary dev/CI gate (compiles debug WASM with assertions and source maps):

```bash
npm run test:unit
```

Optional pre-deploy check against the shipping artifact:

```bash
npm run test:wasm
```

`test:unit` runs:

- **ABI tests** (`abi.test.mjs`) — required exports exist; batch offsets/strides/counts match constants; buffers are aligned and non-overlapping
- **Bindings contract** (`bindings-contract.test.mjs`) — every name in `WASM_MANAGER_WASM_EXPORTS` is declared in `build/release.d.ts`
- **Parity tests** (`parity.test.mjs`) — collision flag matrix, match/penalty height, smoke velocity, homing velocity, bounce, and both batch integrators
- **Math tests** (`math.test.mjs`) — `calculateGrowthMultiplier`, `checkCrystalGameOver`, `clamp`, `lerp`, `distance`, `max`, `min`, `fastRandom`/`setSeed`
- **Particle tests** (`particles.test.mjs`) — `getShatterVx/Vy`, `getDirectionalVx/Vy`, `getSpiralVx/Vy`, `getBounceVy`, batch integrator edge cases

WASM output is compared to deterministic JS mirrors in `WasmFallbacks.js`. Update those mirrors whenever AssemblyScript logic changes.

If an export is removed or a stride changes, ABI tests fail until `WasmConstants.js` and AssemblyScript are updated together.

## Adding a new WASM function

1. Implement in `src/assembly/*.ts` and re-export from `index.ts`
2. Add JS fallback to `WasmFallbacks.js`
3. Wrap in `WasmManager.js` (with rate-limited fallback logging); add the export name to `WASM_MANAGER_WASM_EXPORTS` in `WasmConstants.js`
4. Add parity test case in `test/wasm/` when deterministic
5. Run `npm run test:unit` and `npm run test:wasm` (includes `bindings-contract.test.mjs`)
