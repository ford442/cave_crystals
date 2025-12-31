// Collision detection module optimized for WebAssembly

export class SporeCollision {
    x: f64;
    y: f64;
    radius: f64;
    lane: i32;
    colorIdx: i32;

    constructor(x: f64, y: f64, radius: f64, lane: i32, colorIdx: i32) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.lane = lane;
        this.colorIdx = colorIdx;
    }
}

export class CrystalData {
    lane: i32;
    type: i32; // 0 = top, 1 = bottom
    height: f64;
    colorIdx: i32;

    constructor(lane: i32, type: i32, height: f64, colorIdx: i32) {
        this.lane = lane;
        this.type = type;
        this.height = height;
        this.colorIdx = colorIdx;
    }
}

// Result flags for collision detection
// Bit 0: top collision occurred
// Bit 1: top color matched
// Bit 2: bottom collision occurred
// Bit 3: bottom color matched
export const COLLISION_TOP_HIT: u32 = 1;
export const COLLISION_TOP_MATCH: u32 = 2;
export const COLLISION_BOTTOM_HIT: u32 = 4;
export const COLLISION_BOTTOM_MATCH: u32 = 8;

/**
 * Check collisions between a spore and crystals in the same lane
 * Returns bit flags indicating collision results
 */
export function checkCollisions(
    sporeY: f64,
    sporeRadius: f64,
    sporeLane: i32,
    sporeColorIdx: i32,
    topCrystalHeight: f64,
    topCrystalColorIdx: i32,
    bottomCrystalHeight: f64,
    bottomCrystalColorIdx: i32,
    canvasHeight: f64
): u32 {
    let result: u32 = 0;

    // Check top collision
    const topHit = sporeY - sporeRadius < topCrystalHeight;
    if (topHit) {
        result |= COLLISION_TOP_HIT;
        if (sporeColorIdx === topCrystalColorIdx) {
            result |= COLLISION_TOP_MATCH;
        }
    }

    // Check bottom collision
    const botHit = sporeY + sporeRadius > canvasHeight - bottomCrystalHeight;
    if (botHit) {
        result |= COLLISION_BOTTOM_HIT;
        if (sporeColorIdx === bottomCrystalColorIdx) {
            result |= COLLISION_BOTTOM_MATCH;
        }
    }

    return result;
}

/**
 * Calculate new crystal height after a match
 */
export function calculateMatchHeight(currentHeight: f64, shrinkAmount: f64, minHeight: f64): f64 {
    const newHeight = currentHeight - shrinkAmount;
    return newHeight > minHeight ? newHeight : minHeight;
}

/**
 * Calculate new crystal height after a penalty
 */
export function calculatePenaltyHeight(currentHeight: f64, growthAmount: f64): f64 {
    return currentHeight + growthAmount;
}
