// Particle system module optimized for WebAssembly
import { fastRandom } from "./math";

/**
 * Update a single particle's position and life
 * Returns updated life value
 */
export function updateParticle(
    x: f64,
    y: f64,
    vx: f64,
    vy: f64,
    life: f64
): f64 {
    // Just return updated life, actual position updates handled in JS
    // to avoid complex memory management
    return life - 0.02;
}

/**
 * Calculate particle velocity component
 */
export function calculateParticleVelocity(random: f64): f64 {
    return (random - 0.5) * 10.0;
}

/**
 * Calculate particle size
 */
export function calculateParticleSize(random: f64): f64 {
    return random * 4.0 + 1.0;
}

/**
 * Update particle position
 */
export function updateParticlePosition(pos: f64, velocity: f64): f64 {
    return pos + velocity;
}

/**
 * Check if particle is alive
 */
export function isParticleAlive(life: f64): bool {
    return life > 0.0;
}

/**
 * Batch process multiple particles
 * This is optimized for processing many particles at once
 * Currently a placeholder for future optimization
 */
export function batchUpdateParticles(
    count: i32,
    lifeDecay: f64
): i32 {
    // Returns the count for validation
    // In a real implementation, this would work with shared memory
    return count;
}

const SIMPLE_BATCH_MAX: i32 = 384;
const SIMPLE_BATCH_STRIDE: i32 = 7;
// Layout per particle: x, y, vx, vy, life, gravity, friction
const _simpleBatch = new Float64Array(SIMPLE_BATCH_MAX * SIMPLE_BATCH_STRIDE);

const TRAIL_BATCH_MAX: i32 = 512;
const TRAIL_BATCH_STRIDE: i32 = 6;
// Layout per trail: x, y, vx, vy, life, size
const _trailBatch = new Float64Array(TRAIL_BATCH_MAX * TRAIL_BATCH_STRIDE);

export function getSimpleBatchByteOffset(): i32 {
    return _simpleBatch.byteOffset;
}

export function getSimpleBatchFloatCount(): i32 {
    return SIMPLE_BATCH_MAX * SIMPLE_BATCH_STRIDE;
}

export function getSimpleBatchStride(): i32 {
    return SIMPLE_BATCH_STRIDE;
}

export function getTrailBatchByteOffset(): i32 {
    return _trailBatch.byteOffset;
}

export function getTrailBatchFloatCount(): i32 {
    return TRAIL_BATCH_MAX * TRAIL_BATCH_STRIDE;
}

export function getTrailBatchStride(): i32 {
    return TRAIL_BATCH_STRIDE;
}

/**
 * Integrate trail particles in a single WASM pass (drift, fade, shrink).
 */
export function batchIntegrateTrailParticles(count: i32, timeScale: f64): void {
    const stride = TRAIL_BATCH_STRIDE;
    const cap = count > TRAIL_BATCH_MAX ? TRAIL_BATCH_MAX : count;
    const lifeDecayScale = timeScale < 0.25 ? 0.25 : timeScale;
    const shrink = 1.0 - 0.1 * timeScale;
    for (let i: i32 = 0; i < cap; i++) {
        const base = i * stride;
        let x = _trailBatch[base];
        let y = _trailBatch[base + 1];
        let vx = _trailBatch[base + 2];
        let vy = _trailBatch[base + 3];
        let life = _trailBatch[base + 4];
        let size = _trailBatch[base + 5];

        x += vx * timeScale;
        y += vy * timeScale;
        life -= 0.05 * lifeDecayScale;
        size *= shrink;

        _trailBatch[base] = x;
        _trailBatch[base + 1] = y;
        _trailBatch[base + 2] = vx;
        _trailBatch[base + 3] = vy;
        _trailBatch[base + 4] = life;
        _trailBatch[base + 5] = size;
    }
}

/**
 * Integrate ambient particles (aura/ember) in a single WASM pass.
 * Data is read/written in the exported Float64Array buffer.
 */
export function batchIntegrateSimpleParticles(count: i32, timeScale: f64, lifeDecay: f64): void {
    const stride = SIMPLE_BATCH_STRIDE;
    const cap = count > SIMPLE_BATCH_MAX ? SIMPLE_BATCH_MAX : count;
    for (let i: i32 = 0; i < cap; i++) {
        const base = i * stride;
        let x = _simpleBatch[base];
        let y = _simpleBatch[base + 1];
        let vx = _simpleBatch[base + 2];
        let vy = _simpleBatch[base + 3];
        let life = _simpleBatch[base + 4];
        const gravity = _simpleBatch[base + 5];
        const friction = _simpleBatch[base + 6];

        x += vx * timeScale;
        y += vy * timeScale;
        vy += gravity * timeScale;
        const adjFriction = 1.0 - (1.0 - friction) * timeScale;
        vx *= adjFriction;
        vy *= adjFriction;
        const lifeDecayScale = timeScale < 0.25 ? 0.25 : timeScale;
        life -= lifeDecay * lifeDecayScale;

        _simpleBatch[base] = x;
        _simpleBatch[base + 1] = y;
        _simpleBatch[base + 2] = vx;
        _simpleBatch[base + 3] = vy;
        _simpleBatch[base + 4] = life;
    }
}

/**
 * Calculate X velocity for a shatter burst particle
 * Distributes particles in a circle
 */
export function getShatterVx(index: i32, total: i32, force: f64): f64 {
    const angle: f64 = (f64(index) / f64(total)) * 6.28318530718; // 2 * PI
    const randomVariation: f64 = (fastRandom() - 0.5) * 0.5;
    return Math.cos(angle) * force + randomVariation;
}

/**
 * Calculate Y velocity for a shatter burst particle
 * Distributes particles in a circle
 */
export function getShatterVy(index: i32, total: i32, force: f64): f64 {
    const angle: f64 = (f64(index) / f64(total)) * 6.28318530718; // 2 * PI
    const randomVariation: f64 = (fastRandom() - 0.5) * 0.5;
    return Math.sin(angle) * force + randomVariation;
}

/**
 * Calculate X velocity for a directional burst particle
 * Distributes particles in a cone
 */
export function getDirectionalVx(index: i32, total: i32, force: f64, angle: f64, spread: f64): f64 {
    const fraction: f64 = f64(index) / f64(total);
    // Map fraction 0..1 to -spread/2 .. +spread/2
    const offset: f64 = (fraction - 0.5) * spread;
    const finalAngle: f64 = angle + offset + (fastRandom() - 0.5) * 0.2;
    return Math.cos(finalAngle) * force;
}

/**
 * Calculate Y velocity for a directional burst particle
 * Distributes particles in a cone
 */
export function getDirectionalVy(index: i32, total: i32, force: f64, angle: f64, spread: f64): f64 {
    const fraction: f64 = f64(index) / f64(total);
    const offset: f64 = (fraction - 0.5) * spread;
    const finalAngle: f64 = angle + offset + (fastRandom() - 0.5) * 0.2;
    return Math.sin(finalAngle) * force;
}

/**
 * Calculate new vertical velocity after bouncing off floor
 */
export function getBounceVy(vy: f64, damping: f64): f64 {
    return -vy * damping;
}

/**
 * Calculate X velocity for smoke/steam particles (gentle drift)
 */
export function getSmokeVx(random: f64): f64 {
    return (random - 0.5) * 2.0;
}

/**
 * Calculate Y velocity for smoke/steam particles (upward float)
 */
export function getSmokeVy(random: f64): f64 {
    return -(random * 2.0 + 1.0);
}

/**
 * Calculate X velocity for a spiral burst particle
 * Combines radial outward force with tangential spin to create a spiral path
 */
export function getSpiralVx(index: i32, total: i32, force: f64, spiralFactor: f64): f64 {
    const angle: f64 = (f64(index) / f64(total)) * 6.28318530718;
    const randomVariation: f64 = (fastRandom() - 0.5) * 0.3;
    return Math.cos(angle) * force + Math.sin(angle) * spiralFactor + randomVariation;
}

/**
 * Calculate Y velocity for a spiral burst particle
 */
export function getSpiralVy(index: i32, total: i32, force: f64, spiralFactor: f64): f64 {
    const angle: f64 = (f64(index) / f64(total)) * 6.28318530718;
    const randomVariation: f64 = (fastRandom() - 0.5) * 0.3;
    return Math.sin(angle) * force - Math.cos(angle) * spiralFactor + randomVariation;
}

/**
 * Calculate X velocity for homing particle (steering towards target)
 * Uses steering behavior: Steering = Desired - Velocity
 */
export function calculateHomingVx(currVx: f64, currVy: f64, x: f64, y: f64, tx: f64, ty: f64, speed: f64, agility: f64): f64 {
    const dx: f64 = tx - x;
    const dy: f64 = ty - y;
    const dist: f64 = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.0) return currVx;

    // Desired velocity
    const desiredVx: f64 = (dx / dist) * speed;

    // Lerp current to desired
    return currVx + (desiredVx - currVx) * agility;
}

/**
 * Calculate Y velocity for homing particle (steering towards target)
 */
export function calculateHomingVy(currVx: f64, currVy: f64, x: f64, y: f64, tx: f64, ty: f64, speed: f64, agility: f64): f64 {
    const dx: f64 = tx - x;
    const dy: f64 = ty - y;
    const dist: f64 = Math.sqrt(dx * dx + dy * dy);

    if (dist < 1.0) return currVy;

    // Desired velocity
    const desiredVy: f64 = (dy / dist) * speed;

    // Lerp current to desired
    return currVy + (desiredVy - currVy) * agility;
}
