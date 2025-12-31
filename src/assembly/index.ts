// Main entry point for Cave Crystals WASM module
// Exports all optimized functions for JavaScript integration

export {
    SporeCollision,
    CrystalData,
    checkCollisions,
    calculateMatchHeight,
    calculatePenaltyHeight,
    COLLISION_TOP_HIT,
    COLLISION_TOP_MATCH,
    COLLISION_BOTTOM_HIT,
    COLLISION_BOTTOM_MATCH
} from './collision';

export {
    Particle,
    updateParticle,
    calculateParticleVelocity,
    calculateParticleSize,
    updateParticlePosition,
    isParticleAlive,
    batchUpdateParticles
} from './particles';

export {
    calculateCrystalGrowth,
    calculateGrowthMultiplier,
    checkCrystalGameOver,
    calculateSporeExpansion,
    setSeed,
    fastRandom,
    randomInt,
    randomRange,
    clamp,
    lerp,
    distance,
    max,
    min
} from './math';

// Module version information
export const VERSION_MAJOR: i32 = 1;
export const VERSION_MINOR: i32 = 0;
export const VERSION_PATCH: i32 = 0;

/**
 * Initialize the WASM module with a random seed
 */
export function initialize(seed: u32): void {
    // Future initialization logic can go here
}
