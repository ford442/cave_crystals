/**
 * Pure JavaScript implementations mirrored from AssemblyScript exports.
 * Used by WasmManager fallbacks and WASM parity tests.
 */

/**
 * @param {number} result
 * @returns {import('./types.js').CollisionResult}
 */
export function parseCollisionFlags(result) {
    return {
        topHit: (result & 1) !== 0,
        topMatch: (result & 2) !== 0,
        bottomHit: (result & 4) !== 0,
        bottomMatch: (result & 8) !== 0
    };
}

/**
 * @param {import('./types.js').Spore} spore
 * @param {import('./types.js').Crystal} topCrystal
 * @param {import('./types.js').Crystal} bottomCrystal
 * @param {number} canvasHeight
 * @returns {import('./types.js').CollisionResult}
 */
export function jsCheckCollisions(spore, topCrystal, bottomCrystal, canvasHeight) {
    const topHit = spore.y - spore.radius < topCrystal.height;
    const bottomHit = spore.y + spore.radius > canvasHeight - bottomCrystal.height;

    return {
        topHit,
        topMatch: topHit && spore.colorIdx === topCrystal.colorIdx,
        bottomHit,
        bottomMatch: bottomHit && spore.colorIdx === bottomCrystal.colorIdx
    };
}

/** @param {number} currentHeight @param {number} shrinkAmount @param {number} minHeight */
export function jsCalculateMatchHeight(currentHeight, shrinkAmount, minHeight) {
    return Math.max(minHeight, currentHeight - shrinkAmount);
}

/** @param {number} currentHeight @param {number} growthAmount */
export function jsCalculatePenaltyHeight(currentHeight, growthAmount) {
    return currentHeight + growthAmount;
}

/** @param {number} vy @param {number} damping */
export function jsGetBounceVy(vy, damping) {
    return -vy * damping;
}

/** @param {number} random */
export function jsGetSmokeVx(random) {
    return (random - 0.5) * 2.0;
}

/** @param {number} random */
export function jsGetSmokeVy(random) {
    return -(random * 2.0 + 1.0);
}

/**
 * @param {number} currVx
 * @param {number} currVy
 * @param {number} x
 * @param {number} y
 * @param {number} tx
 * @param {number} ty
 * @param {number} speed
 * @param {number} agility
 */
export function jsCalculateHomingVx(currVx, currVy, x, y, tx, ty, speed, agility) {
    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1.0) return currVx;
    const desiredVx = (dx / dist) * speed;
    return currVx + (desiredVx - currVx) * agility;
}

/**
 * @param {number} currVx
 * @param {number} currVy
 * @param {number} x
 * @param {number} y
 * @param {number} tx
 * @param {number} ty
 * @param {number} speed
 * @param {number} agility
 */
export function jsCalculateHomingVy(currVx, currVy, x, y, tx, ty, speed, agility) {
    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1.0) return currVy;
    const desiredVy = (dy / dist) * speed;
    return currVy + (desiredVy - currVy) * agility;
}

/**
 * Reference integrator for simple (aura/ember) particles — mirrors batchIntegrateSimpleParticles.
 * @param {Float64Array} view
 * @param {number} count
 * @param {number} stride
 * @param {number} timeScale
 * @param {number} lifeDecay
 */
export function jsIntegrateSimpleBatch(view, count, stride, timeScale, lifeDecay) {
    const lifeDecayScale = timeScale < 0.25 ? 0.25 : timeScale;
    for (let i = 0; i < count; i++) {
        const base = i * stride;
        let x = view[base];
        let y = view[base + 1];
        let vx = view[base + 2];
        let vy = view[base + 3];
        let life = view[base + 4];
        const gravity = view[base + 5];
        const friction = view[base + 6];

        x += vx * timeScale;
        y += vy * timeScale;
        vy += gravity * timeScale;
        const adjFriction = 1 - (1 - friction) * timeScale;
        vx *= adjFriction;
        vy *= adjFriction;
        life -= lifeDecay * lifeDecayScale;

        view[base] = x;
        view[base + 1] = y;
        view[base + 2] = vx;
        view[base + 3] = vy;
        view[base + 4] = life;
    }
}

/**
 * Reference integrator for trail particles — mirrors batchIntegrateTrailParticles.
 * @param {Float64Array} view
 * @param {number} count
 * @param {number} stride
 * @param {number} timeScale
 */
export function jsIntegrateTrailBatch(view, count, stride, timeScale) {
    const lifeDecayScale = timeScale < 0.25 ? 0.25 : timeScale;
    const shrink = 1 - 0.1 * timeScale;
    for (let i = 0; i < count; i++) {
        const base = i * stride;
        let x = view[base];
        let y = view[base + 1];
        let vx = view[base + 2];
        let vy = view[base + 3];
        let life = view[base + 4];
        let size = view[base + 5];

        x += vx * timeScale;
        y += vy * timeScale;
        life -= 0.05 * lifeDecayScale;
        size *= shrink;

        view[base] = x;
        view[base + 1] = y;
        view[base + 2] = vx;
        view[base + 3] = vy;
        view[base + 4] = life;
        view[base + 5] = size;
    }
}

/** @type {number} */
let jsRandomSeed = 12345;

/** @param {number} seed */
export function jsSetSeed(seed) {
    jsRandomSeed = seed >>> 0;
}

/** @returns {number} */
export function jsFastRandom() {
    jsRandomSeed = (Math.imul(jsRandomSeed, 1103515245) + 12345) | 0;
    jsRandomSeed = jsRandomSeed & 0x7fffffff;
    return jsRandomSeed / 0x7fffffff;
}

/** @param {number} score @param {number} divisor */
export function jsCalculateGrowthMultiplier(score, divisor) {
    return 1.0 + (score / divisor);
}

/** @param {number} crystalHeight1 @param {number} crystalHeight2 @param {number} maxHeight */
export function jsCheckCrystalGameOver(crystalHeight1, crystalHeight2, maxHeight) {
    return crystalHeight1 + crystalHeight2 >= maxHeight;
}

/** @param {number} value @param {number} min @param {number} max */
export function jsClamp(value, min, max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

/** @param {number} a @param {number} b @param {number} t */
export function jsLerp(a, b, t) {
    return a + (b - a) * t;
}

/** @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2 */
export function jsDistance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

/** @param {number} a @param {number} b */
export function jsMax(a, b) {
    return a > b ? a : b;
}

/** @param {number} a @param {number} b */
export function jsMin(a, b) {
    return a < b ? a : b;
}

/** @param {number} index @param {number} total @param {number} force */
export function jsGetShatterVx(index, total, force) {
    const angle = (index / total) * Math.PI * 2;
    const randomVariation = (jsFastRandom() - 0.5) * 0.5;
    return Math.cos(angle) * force + randomVariation;
}

/** @param {number} index @param {number} total @param {number} force */
export function jsGetShatterVy(index, total, force) {
    const angle = (index / total) * Math.PI * 2;
    const randomVariation = (jsFastRandom() - 0.5) * 0.5;
    return Math.sin(angle) * force + randomVariation;
}

/**
 * @param {number} index
 * @param {number} total
 * @param {number} force
 * @param {number} angle
 * @param {number} spread
 */
export function jsGetDirectionalVx(index, total, force, angle, spread) {
    const fraction = index / total;
    const offset = (fraction - 0.5) * spread;
    const finalAngle = angle + offset + (jsFastRandom() - 0.5) * 0.2;
    return Math.cos(finalAngle) * force;
}

/**
 * @param {number} index
 * @param {number} total
 * @param {number} force
 * @param {number} angle
 * @param {number} spread
 */
export function jsGetDirectionalVy(index, total, force, angle, spread) {
    const fraction = index / total;
    const offset = (fraction - 0.5) * spread;
    const finalAngle = angle + offset + (jsFastRandom() - 0.5) * 0.2;
    return Math.sin(finalAngle) * force;
}

/**
 * @param {number} index
 * @param {number} total
 * @param {number} force
 * @param {number} spiralFactor
 */
export function jsGetSpiralVx(index, total, force, spiralFactor) {
    const angle = (index / total) * Math.PI * 2;
    const randomVariation = (jsFastRandom() - 0.5) * 0.3;
    return Math.cos(angle) * force + Math.sin(angle) * spiralFactor + randomVariation;
}

/**
 * @param {number} index
 * @param {number} total
 * @param {number} force
 * @param {number} spiralFactor
 */
export function jsGetSpiralVy(index, total, force, spiralFactor) {
    const angle = (index / total) * Math.PI * 2;
    const randomVariation = (jsFastRandom() - 0.5) * 0.3;
    return Math.sin(angle) * force - Math.cos(angle) * spiralFactor + randomVariation;
}

/**
 * Encode collision flags from expected hit/match booleans (mirrors collision.ts bit layout).
 * @param {boolean} topHit
 * @param {boolean} topMatch
 * @param {boolean} bottomHit
 * @param {boolean} bottomMatch
 * @returns {number}
 */
export function encodeCollisionFlags(topHit, topMatch, bottomHit, bottomMatch) {
    let result = 0;
    if (topHit) result |= 1;
    if (topMatch) result |= 2;
    if (bottomHit) result |= 4;
    if (bottomMatch) result |= 8;
    return result;
}
