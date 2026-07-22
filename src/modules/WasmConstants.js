/** Collision result bit flags (must match src/assembly/collision.ts). */
export const COLLISION_TOP_HIT = 1;
export const COLLISION_TOP_MATCH = 2;
export const COLLISION_BOTTOM_HIT = 4;
export const COLLISION_BOTTOM_MATCH = 8;

/** Simple (aura/ember) batch buffer layout (must match src/assembly/particles.ts). */
export const SIMPLE_BATCH_STRIDE = 7;
export const SIMPLE_BATCH_MAX = 384;
export const SIMPLE_BATCH_FLOAT_COUNT = SIMPLE_BATCH_MAX * SIMPLE_BATCH_STRIDE;

/** Trail batch buffer layout (must match src/assembly/particles.ts). */
export const TRAIL_BATCH_STRIDE = 6;
export const TRAIL_BATCH_MAX = 512;
export const TRAIL_BATCH_FLOAT_COUNT = TRAIL_BATCH_MAX * TRAIL_BATCH_STRIDE;

/** Dust batch buffer layout (JS-only; see particleBatchCodec.js). */
export const DUST_BATCH_STRIDE = 8;
export const DUST_BATCH_MAX = 200;

/** Exports WasmManager and ABI tests expect on build/release.wasm. */
export const REQUIRED_WASM_EXPORTS = [
    'memory',
    'setSeed',
    'checkCollisions',
    'calculateMatchHeight',
    'calculatePenaltyHeight',
    'getSimpleBatchByteOffset',
    'getSimpleBatchFloatCount',
    'getSimpleBatchStride',
    'batchIntegrateSimpleParticles',
    'getTrailBatchByteOffset',
    'getTrailBatchFloatCount',
    'getTrailBatchStride',
    'batchIntegrateTrailParticles',
    'getSmokeVx',
    'getSmokeVy',
    'calculateHomingVx',
    'calculateHomingVy',
    'getBounceVy'
];

/**
 * WASM exports WasmManager delegates to at runtime (subset of release.d.ts).
 * Contract-tested in test/wasm/bindings-contract.test.mjs.
 */
export const WASM_MANAGER_WASM_EXPORTS = [
    ...REQUIRED_WASM_EXPORTS,
    'getShatterVx',
    'getShatterVy',
    'getDirectionalVx',
    'getDirectionalVy',
    'getSpiralVx',
    'getSpiralVy',
];
