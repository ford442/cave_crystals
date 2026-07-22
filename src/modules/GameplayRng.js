/**
 * Seeded LCG for Tier-1 gameplay randomness (crystal spawn, spore colors, match recolor, etc.).
 * Mirrors the WASM / WasmFallbacks algorithm for predictable replay.
 */

/** @type {number} */
let seed = 12345;

/** @param {number} nextSeed */
export function setGameplaySeed(nextSeed) {
    seed = nextSeed >>> 0;
}

/** @returns {number} */
export function getGameplaySeed() {
    return seed >>> 0;
}

/** @returns {number} Float in [0, 1) */
export function next() {
    seed = (Math.imul(seed, 1103515245) + 12345) | 0;
    seed = seed & 0x7fffffff;
    return seed / 0x7fffffff;
}

/**
 * @param {number} max Exclusive upper bound
 * @returns {number}
 */
export function nextInt(max) {
    if (max <= 0) return 0;
    return Math.floor(next() * max);
}

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function nextRange(min, max) {
    return min + next() * (max - min);
}

/** @returns {() => number} */
export function asRandomFn() {
    return next;
}
