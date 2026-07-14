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
