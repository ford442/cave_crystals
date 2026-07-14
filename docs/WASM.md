# WASM boundary guide

Crystal Cave loads `build/release.wasm` at runtime through `WasmManager`. AssemblyScript sources live in `src/assembly/`.

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

## Fallback behavior

Every WASM export used in gameplay has a JS implementation in `WasmFallbacks.js`. If the module fails to load or a call throws, `WasmManager` falls back silently in production (warnings are rate-limited / dev-only).

## Contract tests

After building WASM:

```bash
npm run test:wasm
```

This runs:

- **ABI tests** — required exports exist; batch offsets/strides/counts match constants; buffers are aligned and non-overlapping
- **Parity tests** — WASM output matches JS fallbacks for collision flags, match/penalty height, smoke velocity, homing velocity, bounce, and both batch integrators

If an export is removed or a stride changes, ABI tests fail until `WasmConstants.js` and AssemblyScript are updated together.

## Adding a new WASM function

1. Implement in `src/assembly/*.ts` and re-export from `index.ts`
2. Add JS fallback to `WasmFallbacks.js`
3. Wrap in `WasmManager.js` (with rate-limited fallback logging)
4. Add export name to `REQUIRED_WASM_EXPORTS` in `WasmConstants.js` if gameplay-critical
5. Add parity test case in `test/wasm/parity.test.mjs` when deterministic
6. Run `npm run test:wasm`
