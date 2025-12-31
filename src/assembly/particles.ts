// Particle system module optimized for WebAssembly

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
 */
export function batchUpdateParticles(
    count: i32,
    lifeDecay: f64
): void {
    // Simplified batch processing
    // In a real implementation, this would work with shared memory
    // For now, this serves as a placeholder for future optimization
}
