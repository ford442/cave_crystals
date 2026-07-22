import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

import {
    jsGenerateBossHeights,
    jsGetBossVulnerableMask,
    jsGetBossTelegraphProgress,
    JS_BOSS_HEIGHTS_MAX,
} from '../../src/modules/WasmFallbacks.js';
import { BOSS_HEIGHTS_MAX } from '../../src/modules/WasmConstants.js';
import { assertClose } from './helpers.mjs';
import { loadWasm, requireExport } from './wasmLoader.mjs';

describe('WASM boss formations', () => {
    /** @type {WebAssembly.Instance} */
    let instance;
    /** @type {Record<string, Function>} */
    let exp;

    before(async () => {
        instance = await loadWasm();
        exp = /** @type {Record<string, Function>} */ (instance.exports);
    });

    it('exports boss formation symbols and capacity', () => {
        assert.equal(requireExport(instance, 'getBossHeightsCapacity')(), BOSS_HEIGHTS_MAX);
        assert.equal(BOSS_HEIGHTS_MAX, JS_BOSS_HEIGHTS_MAX);
        const offset = /** @type {() => number} */ (requireExport(instance, 'getBossHeightsByteOffset'))();
        assert.equal(offset % 8, 0);
    });

    it('generateBossHeights matches JS fallback and is symmetric', () => {
        const cases = [
            [42, 0, 7],
            [99, 1, 5],
            [7, 2, 6],
            [1, 3, 4],
        ];
        for (const [seed, phase, lanes] of cases) {
            const count = /** @type {(s: number, p: number, n: number) => number} */ (
                exp.generateBossHeights
            )(seed, phase, lanes);
            assert.equal(count, lanes);
            const offset = exp.getBossHeightsByteOffset();
            const wasmView = new Float64Array(instance.exports.memory.buffer, offset, count);
            const jsView = jsGenerateBossHeights(seed, phase, lanes);
            assert.equal(jsView.length, count);
            for (let i = 0; i < count; i++) {
                assertClose(wasmView[i], jsView[i]);
            }
            const half = count >> 1;
            for (let i = 0; i < half; i++) {
                assertClose(wasmView[i], wasmView[count - 1 - i]);
            }
        }
    });

    it('getBossVulnerableMask matches JS fallback', () => {
        for (const phase of [0, 1, 2, 9]) {
            for (const lanes of [5, 6, 7]) {
                const wasmMask = exp.getBossVulnerableMask(phase, lanes) >>> 0;
                const jsMask = jsGetBossVulnerableMask(phase, lanes);
                assert.equal(wasmMask, jsMask, `phase=${phase} lanes=${lanes}`);
                assert.ok(wasmMask > 0);
            }
        }
    });

    it('getBossTelegraphProgress clamps to 0..1', () => {
        const cases = [
            [0, 1000, 0],
            [500, 1000, 0.5],
            [1000, 1000, 1],
            [1500, 1000, 1],
            [100, 0, 1],
        ];
        for (const [elapsed, total, expected] of cases) {
            assertClose(exp.getBossTelegraphProgress(elapsed, total), expected);
            assertClose(jsGetBossTelegraphProgress(elapsed, total), expected);
        }
    });
});
