/**
 * WASM Manager for Cave Crystals Game
 * Handles loading and interfacing with WebAssembly modules
 *
 * @import { CollisionResult, Crystal, Spore } from './types.js'
 */

import {
    SIMPLE_BATCH_STRIDE,
    SIMPLE_BATCH_FLOAT_COUNT,
    TRAIL_BATCH_STRIDE,
    TRAIL_BATCH_FLOAT_COUNT
} from './WasmConstants.js';
import {
    parseCollisionFlags,
    jsCheckCollisions,
    jsCalculateMatchHeight,
    jsCalculatePenaltyHeight,
    jsGetBounceVy,
    jsGetSmokeVx,
    jsGetSmokeVy,
    jsCalculateHomingVx,
    jsCalculateHomingVy
} from './WasmFallbacks.js';
import { logWasmFallbackOnce, logWasmInfo } from './WasmLogging.js';

export class WasmManager {
    constructor() {
        this.module = null;
        this.instance = null;
        /** @type {import('./types.js').WasmExports | null} */
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
            const wasmUrl = new URL('../../build/release.wasm', import.meta.url).href;

            const response = await fetch(wasmUrl);
            const buffer = await response.arrayBuffer();

            const imports = {
                env: {
                    abort: (msg, file, line, col) => console.error(`WASM abort: ${msg} at ${file}:${line}:${col}`),
                    seed: () => Math.random()
                }
            };

            const wasm = await WebAssembly.instantiate(buffer, imports);

            this.module = wasm.module;
            this.instance = wasm.instance;
            this.exports = /** @type {import('./types.js').WasmExports} */ (wasm.instance.exports);
            this.ready = true;

            const MAX_UINT32 = 0xffffffff;
            const seed = Math.floor(Math.random() * MAX_UINT32);
            if (this.exports.setSeed) {
                this.exports.setSeed(seed);
            }

            logWasmInfo('WASM module loaded successfully');
            return true;
        } catch (error) {
            logWasmFallbackOnce('load', 'Failed to load WASM module, falling back to JavaScript:', error);
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
     * @param {'simple' | 'trail'} kind
     * @returns {{ byteOffset: number, stride: number, maxBatch: number } | null}
     */
    _getBatchLayout(kind) {
        if (!this.ready || !this.exports || !this.instance) return null;

        const memory = this.instance.exports.memory;
        if (!(memory instanceof WebAssembly.Memory)) return null;

        const isSimple = kind === 'simple';
        const getOffset = isSimple ? this.exports.getSimpleBatchByteOffset : this.exports.getTrailBatchByteOffset;
        const getStride = isSimple ? this.exports.getSimpleBatchStride : this.exports.getTrailBatchStride;
        const getFloatCount = isSimple ? this.exports.getSimpleBatchFloatCount : this.exports.getTrailBatchFloatCount;
        const expectedStride = isSimple ? SIMPLE_BATCH_STRIDE : TRAIL_BATCH_STRIDE;
        const expectedFloatCount = isSimple ? SIMPLE_BATCH_FLOAT_COUNT : TRAIL_BATCH_FLOAT_COUNT;

        if (!getOffset || !getStride || !getFloatCount) return null;

        const byteOffset = getOffset();
        const stride = getStride();
        const floatCount = getFloatCount();

        if (stride !== expectedStride || floatCount !== expectedFloatCount) {
            logWasmFallbackOnce(
                `batch-layout-${kind}`,
                `WASM ${kind} batch layout mismatch (stride ${stride}, floats ${floatCount})`
            );
            return null;
        }

        if (byteOffset < 0 || byteOffset % 8 !== 0 || byteOffset + floatCount * 8 > memory.buffer.byteLength) {
            logWasmFallbackOnce(
                `batch-offset-${kind}`,
                `WASM ${kind} batch byteOffset out of bounds (${byteOffset})`
            );
            return null;
        }

        return { byteOffset, stride, maxBatch: Math.floor(floatCount / stride) };
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
        if (!this.ready || !this.exports.checkCollisions) {
            return jsCheckCollisions(spore, topCrystal, bottomCrystal, canvasHeight);
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
        if (this.ready && this.exports.calculateMatchHeight) {
            return this.exports.calculateMatchHeight(currentHeight, shrinkAmount, minHeight);
        }
        return jsCalculateMatchHeight(currentHeight, shrinkAmount, minHeight);
    }

    /**
     * @param {number} currentHeight
     * @param {number} growthAmount
     * @returns {number}
     */
    calculatePenaltyHeight(currentHeight, growthAmount) {
        if (this.ready && this.exports.calculatePenaltyHeight) {
            return this.exports.calculatePenaltyHeight(currentHeight, growthAmount);
        }
        return jsCalculatePenaltyHeight(currentHeight, growthAmount);
    }

    /** @param {number} baseRate @param {number} multiplier @returns {number} */
    calculateCrystalGrowth(baseRate, multiplier) {
        return baseRate * multiplier;
    }

    /** @param {number} score @param {number} [divisor] @returns {number} */
    calculateGrowthMultiplier(score, divisor = 500) {
        return 1 + (score / divisor);
    }

    /** @param {number} height1 @param {number} height2 @param {number} maxHeight @returns {boolean} */
    checkCrystalGameOver(height1, height2, maxHeight) {
        return height1 + height2 >= maxHeight;
    }

    getShatterVx(index, total, force) {
        if (this.ready && this.exports.getShatterVx) {
            return this.exports.getShatterVx(index, total, force);
        }
        const angle = (index / total) * Math.PI * 2;
        return Math.cos(angle) * force;
    }

    getShatterVy(index, total, force) {
        if (this.ready && this.exports.getShatterVy) {
            return this.exports.getShatterVy(index, total, force);
        }
        const angle = (index / total) * Math.PI * 2;
        return Math.sin(angle) * force;
    }

    getBounceVy(vy, damping) {
        if (this.ready && this.exports.getBounceVy) {
            return this.exports.getBounceVy(vy, damping);
        }
        return jsGetBounceVy(vy, damping);
    }

    getDirectionalVx(index, total, force, angle, spread) {
        if (this.ready && this.exports.getDirectionalVx) {
            return this.exports.getDirectionalVx(index, total, force, angle, spread);
        }
        const fraction = index / total;
        const offset = (fraction - 0.5) * spread;
        const finalAngle = angle + offset + (Math.random() - 0.5) * 0.2;
        return Math.cos(finalAngle) * force;
    }

    getDirectionalVy(index, total, force, angle, spread) {
        if (this.ready && this.exports.getDirectionalVy) {
            return this.exports.getDirectionalVy(index, total, force, angle, spread);
        }
        const fraction = index / total;
        const offset = (fraction - 0.5) * spread;
        const finalAngle = angle + offset + (Math.random() - 0.5) * 0.2;
        return Math.sin(finalAngle) * force;
    }

    getSmokeVx(random) {
        if (this.ready && this.exports.getSmokeVx) {
            return this.exports.getSmokeVx(random);
        }
        return jsGetSmokeVx(random);
    }

    getSmokeVy(random) {
        if (this.ready && this.exports.getSmokeVy) {
            return this.exports.getSmokeVy(random);
        }
        return jsGetSmokeVy(random);
    }

    calculateHomingVx(currVx, currVy, x, y, tx, ty, speed, agility) {
        if (this.ready && this.exports.calculateHomingVx) {
            return this.exports.calculateHomingVx(currVx, currVy, x, y, tx, ty, speed, agility);
        }
        return jsCalculateHomingVx(currVx, currVy, x, y, tx, ty, speed, agility);
    }

    calculateHomingVy(currVx, currVy, x, y, tx, ty, speed, agility) {
        if (this.ready && this.exports.calculateHomingVy) {
            return this.exports.calculateHomingVy(currVx, currVy, x, y, tx, ty, speed, agility);
        }
        return jsCalculateHomingVy(currVx, currVy, x, y, tx, ty, speed, agility);
    }

    getSpiralVx(index, total, force, spiralFactor) {
        if (this.ready && this.exports.getSpiralVx) {
            return this.exports.getSpiralVx(index, total, force, spiralFactor);
        }
        const angle = (index / total) * Math.PI * 2;
        return Math.cos(angle) * force + Math.sin(angle) * spiralFactor + (Math.random() - 0.5) * 0.3;
    }

    getSpiralVy(index, total, force, spiralFactor) {
        if (this.ready && this.exports.getSpiralVy) {
            return this.exports.getSpiralVy(index, total, force, spiralFactor);
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
        const MIN_BATCH = 48;
        if (!this.ready || !this.exports.batchIntegrateSimpleParticles || count < MIN_BATCH) {
            return false;
        }

        const layout = this._getBatchLayout('simple');
        if (!layout) return false;

        try {
            const memory = /** @type {WebAssembly.Memory} */ (this.instance.exports.memory);
            const batchCount = Math.min(count, layout.maxBatch);
            const view = new Float64Array(memory.buffer, layout.byteOffset, layout.stride * batchCount);

            for (let j = 0; j < batchCount; j++) {
                const p = ambientParticles[j];
                const base = j * layout.stride;
                view[base] = p.x;
                view[base + 1] = p.y;
                view[base + 2] = p.vx;
                view[base + 3] = p.vy;
                view[base + 4] = p.life;
                view[base + 5] = p.gravity;
                view[base + 6] = p.friction;
            }

            this.exports.batchIntegrateSimpleParticles(batchCount, timeScale, 0.015);

            for (let j = 0; j < batchCount; j++) {
                const p = ambientParticles[j];
                const base = j * layout.stride;
                p.x = view[base];
                p.y = view[base + 1];
                p.vx = view[base + 2];
                p.vy = view[base + 3];
                p.life = view[base + 4];
                p._cacheDrawState(rendererWidth, rendererHeight);
            }

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
        const MIN_BATCH = 24;
        if (!this.ready || !this.exports.batchIntegrateTrailParticles || count < MIN_BATCH) {
            return false;
        }

        const layout = this._getBatchLayout('trail');
        if (!layout) return false;

        try {
            const memory = /** @type {WebAssembly.Memory} */ (this.instance.exports.memory);
            const batchCount = Math.min(count, layout.maxBatch);
            const view = new Float64Array(memory.buffer, layout.byteOffset, layout.stride * batchCount);

            for (let j = 0; j < batchCount; j++) {
                const p = trailParticles[j];
                const base = j * layout.stride;
                view[base] = p.x;
                view[base + 1] = p.y;
                view[base + 2] = p.vx;
                view[base + 3] = p.vy;
                view[base + 4] = p.life;
                view[base + 5] = p.size;
            }

            this.exports.batchIntegrateTrailParticles(batchCount, timeScale);

            for (let j = 0; j < batchCount; j++) {
                const p = trailParticles[j];
                const base = j * layout.stride;
                p.x = view[base];
                p.y = view[base + 1];
                p.vx = view[base + 2];
                p.vy = view[base + 3];
                p.life = view[base + 4];
                p.size = view[base + 5];
                p._drawAlpha = p.life;
                p._screenSize = p.size;
                const s = p.size;
                p._onScreen = p.x + s >= 0 && p.x - s <= rendererWidth
                    && p.y + s >= 0 && p.y - s <= rendererHeight;
            }

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

export const wasmManager = new WasmManager();
