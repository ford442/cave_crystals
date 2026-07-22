import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

import {
    jsSetSeed,
    jsFastRandom,
    jsCalculateGrowthMultiplier,
    jsCheckCrystalGameOver,
    jsClamp,
    jsLerp,
    jsDistance,
    jsMax,
    jsMin
} from '../../src/modules/WasmFallbacks.js';
import { assertClose, RELAXED_EPS } from './helpers.mjs';
import { loadWasm } from './wasmLoader.mjs';

describe('WASM math exports', () => {
    /** @type {Record<string, Function>} */
    let exp;

    before(async () => {
        const instance = await loadWasm();
        exp = /** @type {Record<string, Function>} */ (instance.exports);
    });

    it('calculateGrowthMultiplier handles zero, positive, and negative scores', () => {
        const cases = [
            [0, 500],
            [500, 500],
            [-250, 500]
        ];
        for (const [score, divisor] of cases) {
            assertClose(
                exp.calculateGrowthMultiplier(score, divisor),
                jsCalculateGrowthMultiplier(score, divisor)
            );
        }
    });

    it('checkCrystalGameOver handles threshold edge cases', () => {
        const cases = [
            [100, 100, 250, false],
            [120, 130, 250, true],
            [125, 125, 250, true]
        ];
        for (const [h1, h2, max, expected] of cases) {
            const wasmResult = exp.checkCrystalGameOver(h1, h2, max);
            const jsResult = jsCheckCrystalGameOver(h1, h2, max);
            assert.equal(Boolean(wasmResult), expected);
            assert.equal(jsResult, expected);
            assert.equal(Boolean(wasmResult), jsResult);
        }
    });

    it('clamp respects bounds', () => {
        const cases = [
            [5, 0, 10, 5],
            [-3, 0, 10, 0],
            [15, 0, 10, 10],
            [0, 0, 10, 0]
        ];
        for (const [value, min, max, expected] of cases) {
            assertClose(exp.clamp(value, min, max), jsClamp(value, min, max));
            assertClose(exp.clamp(value, min, max), expected);
        }
    });

    it('lerp interpolates between endpoints', () => {
        const cases = [
            [0, 10, 0, 0],
            [0, 10, 1, 10],
            [0, 10, 0.5, 5],
            [-4, 4, 0.25, -2]
        ];
        for (const [a, b, t, expected] of cases) {
            assertClose(exp.lerp(a, b, t), jsLerp(a, b, t));
            assertClose(exp.lerp(a, b, t), expected);
        }
    });

    it('distance computes Euclidean length', () => {
        const cases = [
            [0, 0, 3, 4, 5],
            [1, 1, 1, 1, 0],
            [-2, 0, 2, 0, 4]
        ];
        for (const [x1, y1, x2, y2, expected] of cases) {
            assertClose(exp.distance(x1, y1, x2, y2), jsDistance(x1, y1, x2, y2));
            assertClose(exp.distance(x1, y1, x2, y2), expected);
        }
    });

    it('max and min select correct values', () => {
        assertClose(exp.max(3, 7), jsMax(3, 7));
        assertClose(exp.max(-1, -5), jsMax(-1, -5));
        assertClose(exp.min(3, 7), jsMin(3, 7));
        assertClose(exp.min(-1, -5), jsMin(-1, -5));
    });

    it('fastRandom is deterministic with the same seed', () => {
        const seed = 98765;
        exp.setSeed(seed);
        jsSetSeed(seed);

        const draws = 8;
        for (let i = 0; i < draws; i++) {
            assertClose(exp.fastRandom(), jsFastRandom(), RELAXED_EPS);
        }
    });

    it('fastRandom produces different values for different seeds', () => {
        exp.setSeed(1);
        const a = exp.fastRandom();
        exp.setSeed(2);
        const b = exp.fastRandom();
        assert.notEqual(a, b);
    });
});
