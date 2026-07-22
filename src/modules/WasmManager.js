// @ts-check
/**
 * WASM Manager for Cave Crystals Game
 * Loads ASC-generated bindings via wasmBridge and exposes {@link WasmManagerApi} with JS fallbacks.
 *
 * @import { CollisionResult, Crystal, Spore, WasmManagerApi } from './types.js'
 * @import { loadWasmBindings } from './wasmBridge.js'
 */

import {
    parseCollisionFlags,
    jsCheckCollisions,
    jsCalculateMatchHeight,
    jsCalculatePenaltyHeight,
    jsGetBounceVy,
    jsGetSmokeVx,
    jsGetSmokeVy,
    jsCalculateHomingVx,
    jsCalculateHomingVy,
    jsSetSeed,
} from './WasmFallbacks.js';
import {
    getWasmBatchLayout,
    packAmbientBatch,
    scatterAmbientBatch,
    packTrailBatch,
    scatterTrailBatch,
    AMBIENT_MIN_BATCH,
    TRAIL_MIN_BATCH,
} from './particleBatchCodec.js';
import { logWasmFallbackOnce, logWasmInfo } from './WasmLogging.js';
import { loadWasmBindings } from './wasmBridge.js';

/** @typedef {Awaited<ReturnType<typeof loadWasmBindings>>} WasmBindings */

/**
 * Loads release WASM and exposes {@link WasmManagerApi} with JavaScript fallbacks.
 * @implements {WasmManagerApi}
 */
export class WasmManager {
    constructor() {
        /** @type {WasmBindings | null} */
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
            const wasm = await loadWasmBindings();
            this.exports = wasm;
            this.ready = true;

            const MAX_UINT32 = 0xffffffff;
            const seed = Math.floor(Math.random() * MAX_UINT32);
            this.setGameplaySeed(seed);

            logWasmInfo('WASM module loaded successfully');
            return true;
        } catch (error) {
            logWasmFallbackOnce('load', 'Failed to load WASM module, falling back to JavaScript:', error);
            this.exports = null;
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
     * Sync WASM and JS fallback LCG streams for juice helpers that use fastRandom.
     * @param {number} seed
     */
    setGameplaySeed(seed) {
        const mixed = (seed >>> 0) ^ 0xc0ffee;
        jsSetSeed(mixed);
        const wasm = this.exports;
        if (this.ready && wasm?.setSeed) {
            wasm.setSeed(mixed);
        }
    }

    /**
     * @param {'simple' | 'trail'} kind
     * @returns {{ byteOffset: number, stride: number, maxBatch: number } | null}
     */
    _getBatchLayout(kind) {
        return getWasmBatchLayout(this.exports, kind);
    }

    /**
     * Check collisions between a spore and crystals
     * @param {import('./types.js').Spore} spore
     * @param {import('./types.js').Crystal} topCrystal
     * @param {import('./types.js').Crystal} bottomCrystal
     * @param {number} canvasHeight
     * @returns {CollisionResult}
     */
    checkCollisions(spore, topCrystal, bottomCrystal, canvasHeight) {
        const wasm = this.exports;
        if (!this.ready || !wasm) {
            return jsCheckCollisions(spore, topCrystal, bottomCrystal, canvasHeight);
        }

        try {
            const result = wasm.checkCollisions(
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
            return parseCollisionFlags(result);
        } catch (error) {
            logWasmFallbackOnce('checkCollisions', 'WASM collision check failed, falling back:', error);
            return jsCheckCollisions(spore, topCrystal, bottomCrystal, canvasHeight);
        }
    }

    /**
     * @param {number} currentHeight
     * @param {number} shrinkAmount
     * @param {number} minHeight
     * @returns {number}
     */
    calculateMatchHeight(currentHeight, shrinkAmount, minHeight) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.calculateMatchHeight(currentHeight, shrinkAmount, minHeight);
        }
        return jsCalculateMatchHeight(currentHeight, shrinkAmount, minHeight);
    }

    /**
     * @param {number} currentHeight
     * @param {number} growthAmount
     * @returns {number}
     */
    calculatePenaltyHeight(currentHeight, growthAmount) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.calculatePenaltyHeight(currentHeight, growthAmount);
        }
        return jsCalculatePenaltyHeight(currentHeight, growthAmount);
    }

    /** @param {number} baseRate @param {number} multiplier @returns {number} */
    calculateCrystalGrowth(baseRate, multiplier) {
        return baseRate * multiplier;
    }

    /** @param {number} score @param {number} [motionDivisor] @returns {number} */
    calculateGrowthMultiplier(score, motionDivisor = 500) {
        return 1 + (score / motionDivisor);
    }

    /** @param {number} height1 @param {number} height2 @param {number} maxHeight @returns {boolean} */
    checkCrystalGameOver(height1, height2, maxHeight) {
        return height1 + height2 >= maxHeight;
    }

    getShatterVx(index, total, force) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getShatterVx(index, total, force);
        }
        const angle = (index / total) * Math.PI * 2;
        return Math.cos(angle) * force;
    }

    getShatterVy(index, total, force) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getShatterVy(index, total, force);
        }
        const angle = (index / total) * Math.PI * 2;
        return Math.sin(angle) * force;
    }

    getBounceVy(vy, damping) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getBounceVy(vy, damping);
        }
        return jsGetBounceVy(vy, damping);
    }

    getDirectionalVx(index, total, force, angle, spread) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getDirectionalVx(index, total, force, angle, spread);
        }
        const fraction = index / total;
        const offset = (fraction - 0.5) * spread;
        const finalAngle = angle + offset + (Math.random() - 0.5) * 0.2;
        return Math.cos(finalAngle) * force;
    }

    getDirectionalVy(index, total, force, angle, spread) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getDirectionalVy(index, total, force, angle, spread);
        }
        const fraction = index / total;
        const offset = (fraction - 0.5) * spread;
        const finalAngle = angle + offset + (Math.random() - 0.5) * 0.2;
        return Math.sin(finalAngle) * force;
    }

    getSmokeVx(random) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getSmokeVx(random);
        }
        return jsGetSmokeVx(random);
    }

    getSmokeVy(random) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getSmokeVy(random);
        }
        return jsGetSmokeVy(random);
    }

    calculateHomingVx(currVx, currVy, x, y, tx, ty, speed, agility) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.calculateHomingVx(currVx, currVy, x, y, tx, ty, speed, agility);
        }
        return jsCalculateHomingVx(currVx, currVy, x, y, tx, ty, speed, agility);
    }

    calculateHomingVy(currVx, currVy, x, y, tx, ty, speed, agility) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.calculateHomingVy(currVx, currVy, x, y, tx, ty, speed, agility);
        }
        return jsCalculateHomingVy(currVx, currVy, x, y, tx, ty, speed, agility);
    }

    getSpiralVx(index, total, force, spiralFactor) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getSpiralVx(index, total, force, spiralFactor);
        }
        const angle = (index / total) * Math.PI * 2;
        return Math.cos(angle) * force + Math.sin(angle) * spiralFactor + (Math.random() - 0.5) * 0.3;
    }

    getSpiralVy(index, total, force, spiralFactor) {
        const wasm = this.exports;
        if (this.ready && wasm) {
            return wasm.getSpiralVy(index, total, force, spiralFactor);
        }
        const angle = (index / total) * Math.PI * 2;
        return Math.sin(angle) * force - Math.cos(angle) * spiralFactor + (Math.random() - 0.5) * 0.3;
    }

    /**
     * @param {InstanceType<typeof import('./Entities.js').Particle>[]} ambientParticles
     * @param {number} count
     * @param {number} timeScale
     * @param {number} rendererWidth
     * @param {number} rendererHeight
     * @returns {boolean}
     */
    batchIntegrateAmbientParticles(ambientParticles, count, timeScale, rendererWidth, rendererHeight) {
        const wasm = this.exports;
        if (!this.ready || !wasm || count < AMBIENT_MIN_BATCH) {
            return false;
        }

        const layout = this._getBatchLayout('simple');
        if (!layout) return false;

        try {
            const memory = wasm.memory;
            const batchCount = Math.min(count, layout.maxBatch);
            const view = new Float64Array(memory.buffer, layout.byteOffset, layout.stride * batchCount);

            packAmbientBatch(ambientParticles, batchCount, view);

            wasm.batchIntegrateSimpleParticles(batchCount, timeScale, 0.015);

            scatterAmbientBatch(ambientParticles, batchCount, view, rendererWidth, rendererHeight);

            if (batchCount < count) {
                for (let j = batchCount; j < count; j++) {
                    ambientParticles[j].updateAmbient(rendererWidth, rendererHeight, timeScale);
                }
            }
            return true;
        } catch (error) {
            logWasmFallbackOnce('batch-ambient', 'WASM ambient particle batch failed, falling back:', error);
            return false;
        }
    }

    /**
     * @param {InstanceType<typeof import('./Entities.js').TrailParticle>[]} trailParticles
     * @param {number} count
     * @param {number} timeScale
     * @param {number} rendererWidth
     * @param {number} rendererHeight
     * @returns {boolean}
     */
    batchIntegrateTrailParticles(trailParticles, count, timeScale, rendererWidth, rendererHeight) {
        const wasm = this.exports;
        if (!this.ready || !wasm || count < TRAIL_MIN_BATCH) {
            return false;
        }

        const layout = this._getBatchLayout('trail');
        if (!layout) return false;

        try {
            const memory = wasm.memory;
            const batchCount = Math.min(count, layout.maxBatch);
            const view = new Float64Array(memory.buffer, layout.byteOffset, layout.stride * batchCount);

            packTrailBatch(trailParticles, batchCount, view);

            wasm.batchIntegrateTrailParticles(batchCount, timeScale);

            scatterTrailBatch(trailParticles, batchCount, view, rendererWidth, rendererHeight);

            if (batchCount < count) {
                for (let j = batchCount; j < count; j++) {
                    trailParticles[j].update(timeScale, rendererWidth, rendererHeight);
                }
            }
            return true;
        } catch (error) {
            logWasmFallbackOnce('batch-trail', 'WASM trail particle batch failed, falling back:', error);
            return false;
        }
    }
}

export const wasmManager = /** @type {WasmManagerApi} */ (new WasmManager());
