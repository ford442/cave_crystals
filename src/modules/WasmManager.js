/**
 * WASM Manager for Cave Crystals Game
 * Handles loading and interfacing with WebAssembly modules
 */

export class WasmManager {
    constructor() {
        this.module = null;
        this.instance = null;
        this.exports = null;
        this.ready = false;
        this.loadPromise = null;
    }

    /**
     * Initialize and load the WASM module
     */
    async init() {
        if (this.loadPromise) {
            return this.loadPromise;
        }

        this.loadPromise = this._loadModule();
        return this.loadPromise;
    }

    async _loadModule() {
        try {
            // Import the generated WASM module using Vite's dynamic import
            const wasmUrl = new URL('../../build/release.wasm', import.meta.url).href;
            
            // Load and instantiate the WASM module
            const response = await fetch(wasmUrl);
            const buffer = await response.arrayBuffer();
            
            const wasm = await WebAssembly.instantiate(buffer);
            
            this.module = wasm.module;
            this.instance = wasm.instance;
            this.exports = wasm.instance.exports;
            this.ready = true;

            // Initialize with a random seed
            const MAX_UINT32 = 0xffffffff;
            const seed = Math.floor(Math.random() * MAX_UINT32);
            if (this.exports.setSeed) {
                this.exports.setSeed(seed);
            }

            console.log('WASM module loaded successfully');
            return true;
        } catch (error) {
            console.warn('Failed to load WASM module, falling back to JavaScript:', error);
            this.ready = false;
            return false;
        }
    }

    /**
     * Check if WASM is ready to use
     */
    isReady() {
        return this.ready;
    }

    /**
     * Check collisions between a spore and crystals
     * Returns an object with collision results
     */
    checkCollisions(spore, topCrystal, bottomCrystal, canvasHeight) {
        if (!this.ready || !this.exports.checkCollisions) {
            // Fallback to JavaScript implementation
            return this._jsCheckCollisions(spore, topCrystal, bottomCrystal, canvasHeight);
        }

        try {
            const result = this.exports.checkCollisions(
                spore.y,
                spore.radius,
                spore.lane,
                spore.colorIdx,
                topCrystal.height,
                topCrystal.colorIdx,
                bottomCrystal.height,
                bottomCrystal.colorIdx,
                canvasHeight
            );

            // Parse bit flags
            const COLLISION_TOP_HIT = 1;
            const COLLISION_TOP_MATCH = 2;
            const COLLISION_BOTTOM_HIT = 4;
            const COLLISION_BOTTOM_MATCH = 8;

            return {
                topHit: (result & COLLISION_TOP_HIT) !== 0,
                topMatch: (result & COLLISION_TOP_MATCH) !== 0,
                bottomHit: (result & COLLISION_BOTTOM_HIT) !== 0,
                bottomMatch: (result & COLLISION_BOTTOM_MATCH) !== 0
            };
        } catch (error) {
            console.warn('WASM collision check failed, falling back:', error);
            return this._jsCheckCollisions(spore, topCrystal, bottomCrystal, canvasHeight);
        }
    }

    /**
     * JavaScript fallback for collision detection
     */
    _jsCheckCollisions(spore, topCrystal, bottomCrystal, canvasHeight) {
        const topHit = spore.y - spore.radius < topCrystal.height;
        const bottomHit = spore.y + spore.radius > canvasHeight - bottomCrystal.height;

        return {
            topHit: topHit,
            topMatch: topHit && spore.colorIdx === topCrystal.colorIdx,
            bottomHit: bottomHit,
            bottomMatch: bottomHit && spore.colorIdx === bottomCrystal.colorIdx
        };
    }

    /**
     * Calculate new crystal height after a match
     */
    calculateMatchHeight(currentHeight, shrinkAmount, minHeight) {
        if (this.ready && this.exports.calculateMatchHeight) {
            return this.exports.calculateMatchHeight(currentHeight, shrinkAmount, minHeight);
        }
        return Math.max(minHeight, currentHeight - shrinkAmount);
    }

    /**
     * Calculate new crystal height after a penalty
     */
    calculatePenaltyHeight(currentHeight, growthAmount) {
        if (this.ready && this.exports.calculatePenaltyHeight) {
            return this.exports.calculatePenaltyHeight(currentHeight, growthAmount);
        }
        return currentHeight + growthAmount;
    }

    /**
     * Calculate crystal growth rate
     */
    calculateCrystalGrowth(baseRate, multiplier) {
        if (this.ready && this.exports.calculateCrystalGrowth) {
            return this.exports.calculateCrystalGrowth(baseRate, multiplier);
        }
        return baseRate * multiplier;
    }

    /**
     * Calculate growth multiplier based on score
     */
    calculateGrowthMultiplier(score, divisor = 500) {
        if (this.ready && this.exports.calculateGrowthMultiplier) {
            return this.exports.calculateGrowthMultiplier(score, divisor);
        }
        return 1 + (score / divisor);
    }

    /**
     * Check if crystals have collided (game over)
     */
    checkCrystalGameOver(height1, height2, maxHeight) {
        if (this.ready && this.exports.checkCrystalGameOver) {
            return this.exports.checkCrystalGameOver(height1, height2, maxHeight);
        }
        return height1 + height2 >= maxHeight;
    }

    /**
     * Calculate X velocity for particle shatter
     */
    getShatterVx(index, total, force) {
        if (this.ready && this.exports.getShatterVx) {
            return this.exports.getShatterVx(index, total, force);
        }
        // Fallback: Random angle
        const angle = (index / total) * Math.PI * 2;
        return Math.cos(angle) * force;
    }

    /**
     * Calculate Y velocity for particle shatter
     */
    getShatterVy(index, total, force) {
        if (this.ready && this.exports.getShatterVy) {
            return this.exports.getShatterVy(index, total, force);
        }
        const angle = (index / total) * Math.PI * 2;
        return Math.sin(angle) * force;
    }

    /**
     * Calculate bounce Y velocity
     */
    getBounceVy(vy, damping) {
        if (this.ready && this.exports.getBounceVy) {
            return this.exports.getBounceVy(vy, damping);
        }
        return -vy * damping;
    }
}

// Create and export a singleton instance
export const wasmManager = new WasmManager();
