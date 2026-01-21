// Particle system module optimized for WebAssembly
import { fastRandom } from "./math";

export class Particle {
    x: f64;
    y: f64;
    vx: f64;
    vy: f64;
    life: f64;
    size: f64;

    constructor(x: f64, y: f64, vx: f64, vy: f64, life: f64, size: f64) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.life = life;
        this.size = size;
    }
}

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
 * Currently a placeholder for future batch optimization
 */
export function batchUpdateParticles(
    count: i32,
    lifeDecay: f64
): i32 {
    // Returns the count for validation
    // In a real implementation, this would work with shared memory
    return count;
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
