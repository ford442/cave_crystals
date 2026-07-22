import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

import {
    SIMPLE_BATCH_MAX,
    SIMPLE_BATCH_STRIDE,
    TRAIL_BATCH_MAX,
    TRAIL_BATCH_STRIDE
} from '../../src/modules/WasmConstants.js';
import {
    jsSetSeed,
    jsGetShatterVx,
    jsGetShatterVy,
    jsGetDirectionalVx,
    jsGetDirectionalVy,
    jsGetSpiralVx,
    jsGetSpiralVy,
    jsGetBounceVy,
    jsIntegrateSimpleBatch,
    jsIntegrateTrailBatch
} from '../../src/modules/WasmFallbacks.js';
import { assertClose, assertFloat64ArraysClose, RELAXED_EPS } from './helpers.mjs';
import { loadWasm } from './wasmLoader.mjs';

describe('WASM particle exports', () => {
    /** @type {WebAssembly.Instance} */
    let instance;
    /** @type {Record<string, Function>} */
    let exp;

    before(async () => {
        instance = await loadWasm();
        exp = /** @type {Record<string, Function>} */ (instance.exports);
    });

    it('getShatterVx/Vy match JS fallback with fixed seed', () => {
        const force = 8;
        const total = 12;
        const seed = 42;
        for (let index = 0; index < total; index++) {
            exp.setSeed(seed);
            const wasmVx = exp.getShatterVx(index, total, force);
            jsSetSeed(seed);
            assertClose(wasmVx, jsGetShatterVx(index, total, force), RELAXED_EPS);

            exp.setSeed(seed);
            exp.getShatterVx(index, total, force);
            const wasmVy = exp.getShatterVy(index, total, force);
            jsSetSeed(seed);
            jsGetShatterVx(index, total, force);
            assertClose(wasmVy, jsGetShatterVy(index, total, force), RELAXED_EPS);
        }
    });

    it('getShatterVx/Vy distribute around circle with jitter bounds', () => {
        exp.setSeed(100);
        const total = 8;
        const force = 5;
        let minVx = Infinity;
        let maxVx = -Infinity;
        for (let i = 0; i < total; i++) {
            const vx = exp.getShatterVx(i, total, force);
            const vy = exp.getShatterVy(i, total, force);
            minVx = Math.min(minVx, vx);
            maxVx = Math.max(maxVx, vx);
            const mag = Math.hypot(vx, vy);
            assert.ok(mag <= force + 1.0, `shatter magnitude ${mag} exceeds force + jitter`);
        }
        assert.ok(maxVx - minVx > 1, 'shatter vx should spread across indices');
    });

    it('getDirectionalVx/Vy match JS fallback with fixed seed', () => {
        const force = 6;
        const angle = 1.2;
        const spread = 0.8;
        const total = 12;
        const seed = 77;
        for (let index = 0; index < total; index++) {
            exp.setSeed(seed);
            const wasmVx = exp.getDirectionalVx(index, total, force, angle, spread);
            jsSetSeed(seed);
            assertClose(wasmVx, jsGetDirectionalVx(index, total, force, angle, spread), RELAXED_EPS);

            exp.setSeed(seed);
            exp.getDirectionalVx(index, total, force, angle, spread);
            const wasmVy = exp.getDirectionalVy(index, total, force, angle, spread);
            jsSetSeed(seed);
            jsGetDirectionalVx(index, total, force, angle, spread);
            assertClose(wasmVy, jsGetDirectionalVy(index, total, force, angle, spread), RELAXED_EPS);
        }
    });

    it('getDirectionalVx/Vy produce vectors at force magnitude', () => {
        const total = 10;
        const force = 4;
        for (let i = 0; i < total; i++) {
            const seed = 55 + i;
            exp.setSeed(seed);
            const vx = exp.getDirectionalVx(i, total, force, 0, Math.PI);
            exp.setSeed(seed);
            exp.getDirectionalVx(i, total, force, 0, Math.PI);
            const vy = exp.getDirectionalVy(i, total, force, 0, Math.PI);
            const mag = Math.hypot(vx, vy);
            assert.ok(mag >= force * 0.99 && mag <= force * 1.01, `magnitude ${mag} not near force ${force}`);
        }
    });

    it('getSpiralVx/Vy match JS fallback with fixed seed', () => {
        const force = 7;
        const spiralFactor = 2.5;
        const total = 12;
        const seed = 33;
        for (let index = 0; index < total; index++) {
            exp.setSeed(seed);
            const wasmVx = exp.getSpiralVx(index, total, force, spiralFactor);
            jsSetSeed(seed);
            assertClose(wasmVx, jsGetSpiralVx(index, total, force, spiralFactor), RELAXED_EPS);

            exp.setSeed(seed);
            exp.getSpiralVx(index, total, force, spiralFactor);
            const wasmVy = exp.getSpiralVy(index, total, force, spiralFactor);
            jsSetSeed(seed);
            jsGetSpiralVx(index, total, force, spiralFactor);
            assertClose(wasmVy, jsGetSpiralVy(index, total, force, spiralFactor), RELAXED_EPS);
        }
    });

    it('getBounceVy flips sign and applies damping', () => {
        assertClose(exp.getBounceVy(6, 0.6), jsGetBounceVy(6, 0.6));
        assertClose(exp.getBounceVy(-3.5, 0.6), jsGetBounceVy(-3.5, 0.6));
        assert.ok(exp.getBounceVy(5, 0.5) < 0);
        assert.ok(Math.abs(exp.getBounceVy(5, 0.5)) < 5);
    });

    it('batchIntegrateSimpleParticles floors lifeDecayScale when timeScale < 0.25', () => {
        const byteOffset = exp.getSimpleBatchByteOffset();
        const stride = exp.getSimpleBatchStride();
        const count = 3;
        const timeScale = 0.1;
        const lifeDecay = 0.02;

        const memory = instance.exports.memory;
        const wasmView = new Float64Array(memory.buffer, byteOffset, stride * count);
        const jsView = new Float64Array(stride * count);

        for (let i = 0; i < wasmView.length; i++) {
            wasmView[i] = (i + 1) * 0.41;
            jsView[i] = wasmView[i];
        }

        exp.batchIntegrateSimpleParticles(count, timeScale, lifeDecay);
        jsIntegrateSimpleBatch(jsView, count, stride, timeScale, lifeDecay);

        assertFloat64ArraysClose(wasmView, jsView);
    });

    it('batchIntegrateSimpleParticles caps count at batch max', () => {
        const byteOffset = exp.getSimpleBatchByteOffset();
        const stride = exp.getSimpleBatchStride();
        const requestedCount = SIMPLE_BATCH_MAX + 50;
        const cap = SIMPLE_BATCH_MAX;
        const timeScale = 1.0;
        const lifeDecay = 0.015;

        const memory = instance.exports.memory;
        const wasmView = new Float64Array(memory.buffer, byteOffset, stride * cap);
        const jsView = new Float64Array(stride * cap);

        for (let i = 0; i < wasmView.length; i++) {
            wasmView[i] = (i % 7) * 0.19 + 1;
            jsView[i] = wasmView[i];
        }

        exp.batchIntegrateSimpleParticles(requestedCount, timeScale, lifeDecay);
        jsIntegrateSimpleBatch(jsView, cap, stride, timeScale, lifeDecay);

        assertFloat64ArraysClose(wasmView, jsView);
    });

    it('batchIntegrateTrailParticles floors lifeDecayScale when timeScale < 0.25', () => {
        const byteOffset = exp.getTrailBatchByteOffset();
        const stride = exp.getTrailBatchStride();
        const count = 4;
        const timeScale = 0.15;

        const memory = instance.exports.memory;
        const wasmView = new Float64Array(memory.buffer, byteOffset, stride * count);
        const jsView = new Float64Array(stride * count);

        for (let i = 0; i < wasmView.length; i++) {
            wasmView[i] = (i + 3) * 0.23;
            jsView[i] = wasmView[i];
        }

        exp.batchIntegrateTrailParticles(count, timeScale);
        jsIntegrateTrailBatch(jsView, count, stride, timeScale);

        assertFloat64ArraysClose(wasmView, jsView);
    });

    it('batchIntegrateTrailParticles caps count at batch max', () => {
        const byteOffset = exp.getTrailBatchByteOffset();
        const stride = exp.getTrailBatchStride();
        const requestedCount = TRAIL_BATCH_MAX + 100;
        const cap = TRAIL_BATCH_MAX;
        const timeScale = 0.85;

        const memory = instance.exports.memory;
        const wasmView = new Float64Array(memory.buffer, byteOffset, stride * cap);
        const jsView = new Float64Array(stride * cap);

        for (let i = 0; i < wasmView.length; i++) {
            wasmView[i] = (i % 5) * 0.31 + 0.5;
            jsView[i] = wasmView[i];
        }

        exp.batchIntegrateTrailParticles(requestedCount, timeScale);
        jsIntegrateTrailBatch(jsView, cap, stride, timeScale);

        assertFloat64ArraysClose(wasmView, jsView);
    });
});
