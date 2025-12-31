// Math utilities module optimized for WebAssembly

/**
 * Calculate crystal growth with multiplier
 */
export function calculateCrystalGrowth(baseRate: f64, multiplier: f64): f64 {
    return baseRate * multiplier;
}

/**
 * Calculate growth multiplier based on score
 */
export function calculateGrowthMultiplier(score: i32, divisor: f64): f64 {
    return 1.0 + (f64(score) / divisor);
}

/**
 * Check if crystals have collided (game over condition)
 */
export function checkCrystalGameOver(
    crystalHeight1: f64,
    crystalHeight2: f64,
    maxHeight: f64
): bool {
    return crystalHeight1 + crystalHeight2 >= maxHeight;
}

/**
 * Calculate spore expansion
 */
export function calculateSporeExpansion(currentRadius: f64, expandRate: f64): f64 {
    return currentRadius + expandRate;
}

// Constants for random seed management
const MAX_UINT32: u32 = 0xffffffff;

/**
 * Fast random number generation (Linear Congruential Generator)
 * For better performance than calling back to JS
 */
let randomSeed: u32 = 12345;

export function setSeed(seed: u32): void {
    randomSeed = seed;
}

export function fastRandom(): f64 {
    randomSeed = (randomSeed * 1103515245 + 12345) & 0x7fffffff;
    return f64(randomSeed) / f64(0x7fffffff);
}

/**
 * Generate random integer in range [0, max)
 */
export function randomInt(max: i32): i32 {
    return i32(fastRandom() * f64(max));
}

/**
 * Generate random float in range [min, max]
 */
export function randomRange(min: f64, max: f64): f64 {
    return min + fastRandom() * (max - min);
}

/**
 * Clamp value between min and max
 */
export function clamp(value: f64, min: f64, max: f64): f64 {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/**
 * Linear interpolation
 */
export function lerp(a: f64, b: f64, t: f64): f64 {
    return a + (b - a) * t;
}

/**
 * Calculate distance between two points
 */
export function distance(x1: f64, y1: f64, x2: f64, y2: f64): f64 {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Fast maximum of two numbers
 */
export function max(a: f64, b: f64): f64 {
    return a > b ? a : b;
}

/**
 * Fast minimum of two numbers
 */
export function min(a: f64, b: f64): f64 {
    return a < b ? a : b;
}
