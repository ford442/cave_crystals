// @ts-check
/**
 * Shared pack/scatter helpers for particle batch integration (main thread + worker).
 */

import {
    SIMPLE_BATCH_STRIDE,
    SIMPLE_BATCH_FLOAT_COUNT,
    TRAIL_BATCH_STRIDE,
    TRAIL_BATCH_FLOAT_COUNT,
    TRAIL_BATCH_MAX,
    DUST_BATCH_STRIDE,
} from './WasmConstants.js';
import { jsIntegrateSimpleBatch, jsIntegrateTrailBatch } from './WasmFallbacks.js';

export { DUST_BATCH_STRIDE, DUST_BATCH_MAX } from './WasmConstants.js';

export const TRAIL_MIN_BATCH = 24;
export const AMBIENT_MIN_BATCH = 48;
export const WORKER_MIN_PARTICLES = 64;

/** @typedef {import('./types.js').WasmBindings} WasmBindings */

/**
 * @param {WasmBindings | null | undefined} wasm
 * @param {'simple' | 'trail'} kind
 * @returns {{ byteOffset: number, stride: number, maxBatch: number } | null}
 */
export function getWasmBatchLayout(wasm, kind) {
    if (!wasm) return null;

    const memory = wasm.memory;
    if (!(memory instanceof WebAssembly.Memory)) return null;

    const isSimple = kind === 'simple';
    const getOffset = isSimple ? wasm.getSimpleBatchByteOffset : wasm.getTrailBatchByteOffset;
    const getStride = isSimple ? wasm.getSimpleBatchStride : wasm.getTrailBatchStride;
    const getFloatCount = isSimple ? wasm.getSimpleBatchFloatCount : wasm.getTrailBatchFloatCount;
    const expectedStride = isSimple ? SIMPLE_BATCH_STRIDE : TRAIL_BATCH_STRIDE;
    const expectedFloatCount = isSimple ? SIMPLE_BATCH_FLOAT_COUNT : TRAIL_BATCH_FLOAT_COUNT;

    if (typeof getOffset !== 'function' || typeof getStride !== 'function' || typeof getFloatCount !== 'function') {
        return null;
    }

    const byteOffset = getOffset();
    const stride = getStride();
    const floatCount = getFloatCount();

    if (stride !== expectedStride || floatCount !== expectedFloatCount) {
        return null;
    }

    if (byteOffset < 0 || byteOffset % 8 !== 0 || byteOffset + floatCount * 8 > memory.buffer.byteLength) {
        return null;
    }

    return { byteOffset, stride, maxBatch: Math.floor(floatCount / stride) };
}

/**
 * @param {import('./Entities.js').TrailParticle[]} particles
 * @param {number} count
 * @param {Float64Array} view
 */
export function packTrailBatch(particles, count, view) {
    for (let j = 0; j < count; j++) {
        const p = particles[j];
        const base = j * TRAIL_BATCH_STRIDE;
        view[base] = p.x;
        view[base + 1] = p.y;
        view[base + 2] = p.vx;
        view[base + 3] = p.vy;
        view[base + 4] = p.life;
        view[base + 5] = p.size;
    }
}

/**
 * @param {import('./Entities.js').TrailParticle[]} particles
 * @param {number} count
 * @param {Float64Array} view
 * @param {number} rendererWidth
 * @param {number} rendererHeight
 */
export function scatterTrailBatch(particles, count, view, rendererWidth, rendererHeight) {
    for (let j = 0; j < count; j++) {
        const p = particles[j];
        const base = j * TRAIL_BATCH_STRIDE;
        p.x = view[base];
        p.y = view[base + 1];
        p.vx = view[base + 2];
        p.vy = view[base + 3];
        p.life = view[base + 4];
        p.size = view[base + 5];
        applyTrailDrawCache(p, rendererWidth, rendererHeight);
    }
}

/**
 * @param {import('./Entities.js').TrailParticle} p
 * @param {number} rendererWidth
 * @param {number} rendererHeight
 */
export function applyTrailDrawCache(p, rendererWidth, rendererHeight) {
    p._drawAlpha = p.life;
    p._screenSize = p.size;
    const s = p.size;
    p._onScreen = rendererWidth > 0
        ? (p.x + s >= 0 && p.x - s <= rendererWidth && p.y + s >= 0 && p.y - s <= rendererHeight)
        : true;
}

/**
 * @param {import('./Entities.js').Particle[]} particles
 * @param {number} count
 * @param {Float64Array} view
 */
export function packAmbientBatch(particles, count, view) {
    for (let j = 0; j < count; j++) {
        const p = particles[j];
        const base = j * SIMPLE_BATCH_STRIDE;
        view[base] = p.x;
        view[base + 1] = p.y;
        view[base + 2] = p.vx;
        view[base + 3] = p.vy;
        view[base + 4] = p.life;
        view[base + 5] = p.gravity;
        view[base + 6] = p.friction;
    }
}

/**
 * @param {import('./Entities.js').Particle[]} particles
 * @param {number} count
 * @param {Float64Array} view
 * @param {number} rendererWidth
 * @param {number} rendererHeight
 */
export function scatterAmbientBatch(particles, count, view, rendererWidth, rendererHeight) {
    for (let j = 0; j < count; j++) {
        const p = particles[j];
        const base = j * SIMPLE_BATCH_STRIDE;
        p.x = view[base];
        p.y = view[base + 1];
        p.vx = view[base + 2];
        p.vy = view[base + 3];
        p.life = view[base + 4];
        p._cacheDrawState(rendererWidth, rendererHeight);
    }
}

/**
 * @param {import('./Entities.js').Particle[]} particles
 * @param {number} count
 * @param {number} timeScale
 */
export function applyAmbientRotation(particles, count, timeScale) {
    for (let j = 0; j < count; j++) {
        const p = particles[j];
        p.rotation += p.rotationSpeed * timeScale;
        p.angleX += p.velAngleX * timeScale;
        p.angleY += p.velAngleY * timeScale;
    }
}

/**
 * @param {import('./Entities.js').DustParticle[]} dustParticles
 * @param {number} count
 * @param {Float64Array} view
 */
export function packDustBatch(dustParticles, count, view) {
    for (let j = 0; j < count; j++) {
        const p = dustParticles[j];
        const base = j * DUST_BATCH_STRIDE;
        view[base] = p.x;
        view[base + 1] = p.y;
        view[base + 2] = p.vx;
        view[base + 3] = p.vy;
        view[base + 4] = p.phase;
        view[base + 5] = p.alpha;
        view[base + 6] = p.baseVx;
        view[base + 7] = p.baseVy;
    }
}

/**
 * @param {import('./Entities.js').DustParticle[]} dustParticles
 * @param {number} count
 * @param {Float64Array} view
 */
export function scatterDustBatch(dustParticles, count, view) {
    for (let j = 0; j < count; j++) {
        const p = dustParticles[j];
        const base = j * DUST_BATCH_STRIDE;
        p.x = view[base];
        p.y = view[base + 1];
        p.vx = view[base + 2];
        p.vy = view[base + 3];
        p.phase = view[base + 4];
        p.alpha = view[base + 5];
        p.baseVx = view[base + 6];
        p.baseVy = view[base + 7];
        const alphaPulse = 1.0 + Math.sin(p.phase) * 0.2;
        p.renderAlpha = Math.min(1.0, Math.max(0, p.alpha * alphaPulse));
    }
}

/**
 * Integrate dust particles in a flat buffer — mirrors DustParticle.update.
 * @param {Float64Array} view
 * @param {number} count
 * @param {number} width
 * @param {number} height
 * @param {number} timeScale
 */
export function jsIntegrateDustBatch(view, count, width, height, timeScale = 1.0) {
    const drag = 0.05 * timeScale;
    for (let j = 0; j < count; j++) {
        const base = j * DUST_BATCH_STRIDE;
        let x = view[base];
        let y = view[base + 1];
        let vx = view[base + 2];
        let vy = view[base + 3];
        let phase = view[base + 4];
        const alpha = view[base + 5];
        const baseVx = view[base + 6];
        const baseVy = view[base + 7];

        x += vx * timeScale;
        y += vy * timeScale;

        phase += 0.05 * timeScale;

        if (x < 0) x += width;
        if (x > width) x -= width;
        if (y < 0) y += height;
        if (y > height) y -= height;

        vx += (baseVx - vx) * drag;
        vy += (baseVy - vy) * drag;

        view[base] = x;
        view[base + 1] = y;
        view[base + 2] = vx;
        view[base + 3] = vy;
        view[base + 4] = phase;
        view[base + 5] = alpha;
        view[base + 6] = baseVx;
        view[base + 7] = baseVy;
    }
}

/**
 * Integrate trail batch via WASM or JS fallback inside a view.
 * @param {WasmBindings | null} wasm
 * @param {Float64Array} view
 * @param {number} count
 * @param {number} timeScale
 * @returns {boolean} whether WASM was used
 */
export function integrateTrailView(wasm, view, count, timeScale) {
    const batchCount = Math.min(count, TRAIL_BATCH_MAX);
    if (batchCount < TRAIL_MIN_BATCH) {
        jsIntegrateTrailBatch(view, batchCount, TRAIL_BATCH_STRIDE, timeScale);
        return false;
    }

    const layout = wasm ? getWasmBatchLayout(wasm, 'trail') : null;
    if (!layout || !wasm?.batchIntegrateTrailParticles) {
        jsIntegrateTrailBatch(view, batchCount, TRAIL_BATCH_STRIDE, timeScale);
        return false;
    }

    try {
        const memory = wasm.memory;
        const memView = new Float64Array(memory.buffer, layout.byteOffset, layout.stride * batchCount);
        memView.set(view.subarray(0, batchCount * TRAIL_BATCH_STRIDE));
        wasm.batchIntegrateTrailParticles(batchCount, timeScale);
        view.set(memView);
        return true;
    } catch {
        jsIntegrateTrailBatch(view, batchCount, TRAIL_BATCH_STRIDE, timeScale);
        return false;
    }
}

/**
 * Integrate ambient batch via WASM or JS fallback inside a view.
 * @param {WasmBindings | null} wasm
 * @param {Float64Array} view
 * @param {number} count
 * @param {number} timeScale
 * @returns {boolean} whether WASM was used
 */
export function integrateAmbientView(wasm, view, count, timeScale) {
    const batchCount = Math.min(count, Math.floor(SIMPLE_BATCH_FLOAT_COUNT / SIMPLE_BATCH_STRIDE));
    if (batchCount < AMBIENT_MIN_BATCH) {
        jsIntegrateSimpleBatch(view, batchCount, SIMPLE_BATCH_STRIDE, timeScale, 0.015);
        return false;
    }

    const layout = wasm ? getWasmBatchLayout(wasm, 'simple') : null;
    if (!layout || !wasm?.batchIntegrateSimpleParticles) {
        jsIntegrateSimpleBatch(view, batchCount, SIMPLE_BATCH_STRIDE, timeScale, 0.015);
        return false;
    }

    try {
        const memory = wasm.memory;
        const memView = new Float64Array(memory.buffer, layout.byteOffset, layout.stride * batchCount);
        memView.set(view.subarray(0, batchCount * SIMPLE_BATCH_STRIDE));
        wasm.batchIntegrateSimpleParticles(batchCount, timeScale, 0.015);
        view.set(memView);
        return true;
    } catch {
        jsIntegrateSimpleBatch(view, batchCount, SIMPLE_BATCH_STRIDE, timeScale, 0.015);
        return false;
    }
}
