import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

import {
    SIMPLE_BATCH_STRIDE,
    TRAIL_BATCH_STRIDE
} from '../../src/modules/WasmConstants.js';
import {
    parseCollisionFlags,
    encodeCollisionFlags,
    jsCheckCollisions,
    jsCalculateMatchHeight,
    jsCalculatePenaltyHeight,
    jsGetBounceVy,
    jsGetSmokeVx,
    jsGetSmokeVy,
    jsCalculateHomingVx,
    jsCalculateHomingVy,
    jsIntegrateSimpleBatch,
    jsIntegrateTrailBatch
} from '../../src/modules/WasmFallbacks.js';
import { assertClose, assertFloat64ArraysClose } from './helpers.mjs';
import { loadWasm } from './wasmLoader.mjs';

/** Collision flag matrix: all valid bit combinations. */
const COLLISION_MATRIX = [
  {
    label: 'no hit',
    y: 300, r: 10, lane: 0, color: 0, topH: 20, topC: 0, botH: 20, botC: 0, canvas: 600,
    expected: 0
  },
  {
    label: 'top hit only',
    y: 25, r: 10, lane: 1, color: 0, topH: 50, topC: 1, botH: 20, botC: 0, canvas: 600,
    expected: encodeCollisionFlags(true, false, false, false)
  },
  {
    label: 'top hit + match',
    y: 25, r: 10, lane: 1, color: 2, topH: 50, topC: 2, botH: 20, botC: 0, canvas: 600,
    expected: encodeCollisionFlags(true, true, false, false)
  },
  {
    label: 'bottom hit only',
    y: 570, r: 10, lane: 2, color: 0, topH: 20, topC: 0, botH: 50, botC: 1, canvas: 600,
    expected: encodeCollisionFlags(false, false, true, false)
  },
  {
    label: 'both hits, no matches',
    y: 300, r: 10, lane: 3, color: 0, topH: 400, topC: 1, botH: 400, botC: 2, canvas: 600,
    expected: encodeCollisionFlags(true, false, true, false)
  },
  {
    label: 'top match + bottom hit',
    y: 300, r: 10, lane: 0, color: 1, topH: 400, topC: 1, botH: 400, botC: 2, canvas: 600,
    expected: encodeCollisionFlags(true, true, true, false)
  },
  {
    label: 'bottom hit + match',
    y: 570, r: 10, lane: 2, color: 3, topH: 20, topC: 0, botH: 50, botC: 3, canvas: 600,
    expected: encodeCollisionFlags(false, false, true, true)
  },
  {
    label: 'all flags',
    y: 300, r: 10, lane: 4, color: 2, topH: 400, topC: 2, botH: 400, botC: 2, canvas: 600,
    expected: encodeCollisionFlags(true, true, true, true)
  }
];

describe('WASM / JS fallback parity', () => {
    /** @type {WebAssembly.Instance} */
    let instance;
    /** @type {Record<string, Function>} */
    let exp;

    before(async () => {
        instance = await loadWasm();
        exp = /** @type {Record<string, Function>} */ (instance.exports);
        exp.setSeed(42);
    });

    it('checkCollisions flags match JS fallback for all valid combinations', () => {
        for (const c of COLLISION_MATRIX) {
            const wasmFlags = exp.checkCollisions(
                c.y, c.r, c.lane, c.color, c.topH, c.topC, c.botH, c.botC, c.canvas
            );
            assert.equal(wasmFlags, c.expected, `raw flags mismatch for: ${c.label}`);
            const wasmParsed = parseCollisionFlags(wasmFlags);
            const jsParsed = jsCheckCollisions(
                { y: c.y, radius: c.r, lane: c.lane, colorIdx: c.color },
                { height: c.topH, colorIdx: c.topC },
                { height: c.botH, colorIdx: c.botC },
                c.canvas
            );
            assert.deepEqual(wasmParsed, jsParsed, `parsed flags mismatch for: ${c.label}`);
        }
    });

    it('calculateMatchHeight matches JS fallback', () => {
        const cases = [
            [120, 40, 10],
            [15, 30, 10],
            [50, 5, 10],
            [8, 50, 10]
        ];
        for (const [h, shrink, min] of cases) {
            assertClose(exp.calculateMatchHeight(h, shrink, min), jsCalculateMatchHeight(h, shrink, min));
        }
    });

    it('calculatePenaltyHeight matches JS fallback', () => {
        assertClose(exp.calculatePenaltyHeight(80, 40), jsCalculatePenaltyHeight(80, 40));
        assertClose(exp.calculatePenaltyHeight(10, 5), jsCalculatePenaltyHeight(10, 5));
    });

    it('getBounceVy matches JS fallback', () => {
        assertClose(exp.getBounceVy(6, 0.6), jsGetBounceVy(6, 0.6));
        assertClose(exp.getBounceVy(-3.5, 0.6), jsGetBounceVy(-3.5, 0.6));
    });

    it('getSmokeVx/Vy match JS fallback', () => {
        for (const random of [0, 0.25, 0.5, 0.75, 1]) {
            assertClose(exp.getSmokeVx(random), jsGetSmokeVx(random));
            assertClose(exp.getSmokeVy(random), jsGetSmokeVy(random));
        }
    });

    it('calculateHomingVx/Vy match JS fallback', () => {
        const cases = [
            [0, 0, 10, 10, 200, 50, 20, 0.08],
            [3, -2, 100, 100, 120, 80, 15, 0.12],
            [0.5, 0.5, 5, 5, 5.2, 5.1, 10, 0.2]
        ];
        for (const args of cases) {
            assertClose(exp.calculateHomingVx(...args), jsCalculateHomingVx(...args));
            assertClose(exp.calculateHomingVy(...args), jsCalculateHomingVy(...args));
        }
    });

    it('batchIntegrateSimpleParticles matches JS reference integrator', () => {
        const byteOffset = exp.getSimpleBatchByteOffset();
        const stride = exp.getSimpleBatchStride();
        const count = 4;
        const timeScale = 0.9;
        const lifeDecay = 0.015;

        const memory = instance.exports.memory;
        const wasmView = new Float64Array(memory.buffer, byteOffset, stride * count);
        const jsView = new Float64Array(stride * count);

        for (let i = 0; i < wasmView.length; i++) {
            wasmView[i] = (i + 1) * 0.37;
            jsView[i] = wasmView[i];
        }

        exp.batchIntegrateSimpleParticles(count, timeScale, lifeDecay);
        jsIntegrateSimpleBatch(jsView, count, stride, timeScale, lifeDecay);

        assertFloat64ArraysClose(wasmView, jsView);
    });

    it('batchIntegrateTrailParticles matches JS reference integrator', () => {
        const byteOffset = exp.getTrailBatchByteOffset();
        const stride = exp.getTrailBatchStride();
        const count = 5;
        const timeScale = 1.1;

        const memory = instance.exports.memory;
        const wasmView = new Float64Array(memory.buffer, byteOffset, stride * count);
        const jsView = new Float64Array(stride * count);

        for (let i = 0; i < wasmView.length; i++) {
            wasmView[i] = (i + 2) * 0.29;
            jsView[i] = wasmView[i];
        }

        exp.batchIntegrateTrailParticles(count, timeScale);
        jsIntegrateTrailBatch(jsView, count, stride, timeScale);

        assertFloat64ArraysClose(wasmView, jsView);
    });
});
