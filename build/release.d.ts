/** Exported memory */
export declare const memory: WebAssembly.Memory;
/** src/assembly/index/VERSION_MAJOR */
export declare const VERSION_MAJOR: {
  /** @type `i32` */
  get value(): number
};
/** src/assembly/index/VERSION_MINOR */
export declare const VERSION_MINOR: {
  /** @type `i32` */
  get value(): number
};
/** src/assembly/index/VERSION_PATCH */
export declare const VERSION_PATCH: {
  /** @type `i32` */
  get value(): number
};
/**
 * src/assembly/index/initialize
 * @param seed `u32`
 */
export declare function initialize(seed: number): void;
/**
 * src/assembly/collision/checkCollisions
 * @param sporeY `f64`
 * @param sporeRadius `f64`
 * @param sporeLane `i32`
 * @param sporeColorIdx `i32`
 * @param topCrystalHeight `f64`
 * @param topCrystalColorIdx `i32`
 * @param bottomCrystalHeight `f64`
 * @param bottomCrystalColorIdx `i32`
 * @param canvasHeight `f64`
 * @returns `u32`
 */
export declare function checkCollisions(sporeY: number, sporeRadius: number, sporeLane: number, sporeColorIdx: number, topCrystalHeight: number, topCrystalColorIdx: number, bottomCrystalHeight: number, bottomCrystalColorIdx: number, canvasHeight: number): number;
/**
 * src/assembly/collision/calculateMatchHeight
 * @param currentHeight `f64`
 * @param shrinkAmount `f64`
 * @param minHeight `f64`
 * @returns `f64`
 */
export declare function calculateMatchHeight(currentHeight: number, shrinkAmount: number, minHeight: number): number;
/**
 * src/assembly/collision/calculatePenaltyHeight
 * @param currentHeight `f64`
 * @param growthAmount `f64`
 * @returns `f64`
 */
export declare function calculatePenaltyHeight(currentHeight: number, growthAmount: number): number;
/** src/assembly/collision/COLLISION_TOP_HIT */
export declare const COLLISION_TOP_HIT: {
  /** @type `u32` */
  get value(): number
};
/** src/assembly/collision/COLLISION_TOP_MATCH */
export declare const COLLISION_TOP_MATCH: {
  /** @type `u32` */
  get value(): number
};
/** src/assembly/collision/COLLISION_BOTTOM_HIT */
export declare const COLLISION_BOTTOM_HIT: {
  /** @type `u32` */
  get value(): number
};
/** src/assembly/collision/COLLISION_BOTTOM_MATCH */
export declare const COLLISION_BOTTOM_MATCH: {
  /** @type `u32` */
  get value(): number
};
/**
 * src/assembly/particles/updateParticle
 * @param x `f64`
 * @param y `f64`
 * @param vx `f64`
 * @param vy `f64`
 * @param life `f64`
 * @returns `f64`
 */
export declare function updateParticle(x: number, y: number, vx: number, vy: number, life: number): number;
/**
 * src/assembly/particles/calculateParticleVelocity
 * @param random `f64`
 * @returns `f64`
 */
export declare function calculateParticleVelocity(random: number): number;
/**
 * src/assembly/particles/calculateParticleSize
 * @param random `f64`
 * @returns `f64`
 */
export declare function calculateParticleSize(random: number): number;
/**
 * src/assembly/particles/updateParticlePosition
 * @param pos `f64`
 * @param velocity `f64`
 * @returns `f64`
 */
export declare function updateParticlePosition(pos: number, velocity: number): number;
/**
 * src/assembly/particles/isParticleAlive
 * @param life `f64`
 * @returns `bool`
 */
export declare function isParticleAlive(life: number): boolean;
/**
 * src/assembly/particles/batchUpdateParticles
 * @param count `i32`
 * @param lifeDecay `f64`
 * @returns `i32`
 */
export declare function batchUpdateParticles(count: number, lifeDecay: number): number;
/**
 * src/assembly/particles/getSimpleBatchByteOffset
 * @returns `i32`
 */
export declare function getSimpleBatchByteOffset(): number;
/**
 * src/assembly/particles/getSimpleBatchFloatCount
 * @returns `i32`
 */
export declare function getSimpleBatchFloatCount(): number;
/**
 * src/assembly/particles/getSimpleBatchStride
 * @returns `i32`
 */
export declare function getSimpleBatchStride(): number;
/**
 * src/assembly/particles/batchIntegrateSimpleParticles
 * @param count `i32`
 * @param timeScale `f64`
 * @param lifeDecay `f64`
 */
export declare function batchIntegrateSimpleParticles(count: number, timeScale: number, lifeDecay: number): void;
/**
 * src/assembly/particles/getTrailBatchByteOffset
 * @returns `i32`
 */
export declare function getTrailBatchByteOffset(): number;
/**
 * src/assembly/particles/getTrailBatchFloatCount
 * @returns `i32`
 */
export declare function getTrailBatchFloatCount(): number;
/**
 * src/assembly/particles/getTrailBatchStride
 * @returns `i32`
 */
export declare function getTrailBatchStride(): number;
/**
 * src/assembly/particles/batchIntegrateTrailParticles
 * @param count `i32`
 * @param timeScale `f64`
 */
export declare function batchIntegrateTrailParticles(count: number, timeScale: number): void;
/**
 * src/assembly/particles/getShatterVx
 * @param index `i32`
 * @param total `i32`
 * @param force `f64`
 * @returns `f64`
 */
export declare function getShatterVx(index: number, total: number, force: number): number;
/**
 * src/assembly/particles/getShatterVy
 * @param index `i32`
 * @param total `i32`
 * @param force `f64`
 * @returns `f64`
 */
export declare function getShatterVy(index: number, total: number, force: number): number;
/**
 * src/assembly/particles/getDirectionalVx
 * @param index `i32`
 * @param total `i32`
 * @param force `f64`
 * @param angle `f64`
 * @param spread `f64`
 * @returns `f64`
 */
export declare function getDirectionalVx(index: number, total: number, force: number, angle: number, spread: number): number;
/**
 * src/assembly/particles/getDirectionalVy
 * @param index `i32`
 * @param total `i32`
 * @param force `f64`
 * @param angle `f64`
 * @param spread `f64`
 * @returns `f64`
 */
export declare function getDirectionalVy(index: number, total: number, force: number, angle: number, spread: number): number;
/**
 * src/assembly/particles/getBounceVy
 * @param vy `f64`
 * @param damping `f64`
 * @returns `f64`
 */
export declare function getBounceVy(vy: number, damping: number): number;
/**
 * src/assembly/particles/getSmokeVx
 * @param random `f64`
 * @returns `f64`
 */
export declare function getSmokeVx(random: number): number;
/**
 * src/assembly/particles/getSmokeVy
 * @param random `f64`
 * @returns `f64`
 */
export declare function getSmokeVy(random: number): number;
/**
 * src/assembly/particles/calculateHomingVx
 * @param currVx `f64`
 * @param currVy `f64`
 * @param x `f64`
 * @param y `f64`
 * @param tx `f64`
 * @param ty `f64`
 * @param speed `f64`
 * @param agility `f64`
 * @returns `f64`
 */
export declare function calculateHomingVx(currVx: number, currVy: number, x: number, y: number, tx: number, ty: number, speed: number, agility: number): number;
/**
 * src/assembly/particles/calculateHomingVy
 * @param currVx `f64`
 * @param currVy `f64`
 * @param x `f64`
 * @param y `f64`
 * @param tx `f64`
 * @param ty `f64`
 * @param speed `f64`
 * @param agility `f64`
 * @returns `f64`
 */
export declare function calculateHomingVy(currVx: number, currVy: number, x: number, y: number, tx: number, ty: number, speed: number, agility: number): number;
/**
 * src/assembly/particles/getSpiralVx
 * @param index `i32`
 * @param total `i32`
 * @param force `f64`
 * @param spiralFactor `f64`
 * @returns `f64`
 */
export declare function getSpiralVx(index: number, total: number, force: number, spiralFactor: number): number;
/**
 * src/assembly/particles/getSpiralVy
 * @param index `i32`
 * @param total `i32`
 * @param force `f64`
 * @param spiralFactor `f64`
 * @returns `f64`
 */
export declare function getSpiralVy(index: number, total: number, force: number, spiralFactor: number): number;
/**
 * src/assembly/math/calculateCrystalGrowth
 * @param baseRate `f64`
 * @param multiplier `f64`
 * @returns `f64`
 */
export declare function calculateCrystalGrowth(baseRate: number, multiplier: number): number;
/**
 * src/assembly/math/calculateGrowthMultiplier
 * @param score `i32`
 * @param divisor `f64`
 * @returns `f64`
 */
export declare function calculateGrowthMultiplier(score: number, divisor: number): number;
/**
 * src/assembly/math/checkCrystalGameOver
 * @param crystalHeight1 `f64`
 * @param crystalHeight2 `f64`
 * @param maxHeight `f64`
 * @returns `bool`
 */
export declare function checkCrystalGameOver(crystalHeight1: number, crystalHeight2: number, maxHeight: number): boolean;
/**
 * src/assembly/math/calculateSporeExpansion
 * @param currentRadius `f64`
 * @param expandRate `f64`
 * @returns `f64`
 */
export declare function calculateSporeExpansion(currentRadius: number, expandRate: number): number;
/**
 * src/assembly/math/setSeed
 * @param seed `u32`
 */
export declare function setSeed(seed: number): void;
/**
 * src/assembly/math/fastRandom
 * @returns `f64`
 */
export declare function fastRandom(): number;
/**
 * src/assembly/math/randomInt
 * @param max `i32`
 * @returns `i32`
 */
export declare function randomInt(max: number): number;
/**
 * src/assembly/math/randomRange
 * @param min `f64`
 * @param max `f64`
 * @returns `f64`
 */
export declare function randomRange(min: number, max: number): number;
/**
 * src/assembly/math/clamp
 * @param value `f64`
 * @param min `f64`
 * @param max `f64`
 * @returns `f64`
 */
export declare function clamp(value: number, min: number, max: number): number;
/**
 * src/assembly/math/lerp
 * @param a `f64`
 * @param b `f64`
 * @param t `f64`
 * @returns `f64`
 */
export declare function lerp(a: number, b: number, t: number): number;
/**
 * src/assembly/math/distance
 * @param x1 `f64`
 * @param y1 `f64`
 * @param x2 `f64`
 * @param y2 `f64`
 * @returns `f64`
 */
export declare function distance(x1: number, y1: number, x2: number, y2: number): number;
/**
 * src/assembly/math/max
 * @param a `f64`
 * @param b `f64`
 * @returns `f64`
 */
export declare function max(a: number, b: number): number;
/**
 * src/assembly/math/min
 * @param a `f64`
 * @param b `f64`
 * @returns `f64`
 */
export declare function min(a: number, b: number): number;
/**
 * src/assembly/formations/getBossHeightsByteOffset
 * @returns `i32`
 */
export declare function getBossHeightsByteOffset(): number;
/**
 * src/assembly/formations/getBossHeightsCapacity
 * @returns `i32`
 */
export declare function getBossHeightsCapacity(): number;
/**
 * src/assembly/formations/generateBossHeights
 * @param seed `u32`
 * @param phase `i32`
 * @param lanes `i32`
 * @returns `i32`
 */
export declare function generateBossHeights(seed: number, phase: number, lanes: number): number;
/**
 * src/assembly/formations/getBossVulnerableMask
 * @param phase `i32`
 * @param lanes `i32`
 * @returns `u32`
 */
export declare function getBossVulnerableMask(phase: number, lanes: number): number;
/**
 * src/assembly/formations/getBossTelegraphProgress
 * @param elapsedMs `f64`
 * @param telegraphMs `f64`
 * @returns `f64`
 */
export declare function getBossTelegraphProgress(elapsedMs: number, telegraphMs: number): number;
