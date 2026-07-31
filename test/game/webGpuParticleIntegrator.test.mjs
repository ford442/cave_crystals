import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { jsIntegrateSimpleBatch, jsIntegrateTrailBatch } from '../../src/modules/WasmFallbacks.js';
import {
    decodeAmbientBatchF32,
    decodeTrailBatchF32,
    encodeAmbientBatchF32,
    encodeTrailBatchF32,
} from '../../src/modules/WebGpuParticleIntegrator.js';
import { SIMPLE_BATCH_STRIDE, TRAIL_BATCH_STRIDE } from '../../src/modules/WasmConstants.js';

describe('WebGpuParticleIntegrator batch codecs', () => {
    it('trail encode/decode matches software integration', () => {
        const timeScale = 1.0;
        const trail = {
            x: 5, y: 8, vx: 1.1, vy: -0.4, life: 0.9, size: 4.2,
            _drawAlpha: 0, _screenSize: 0, _onScreen: true,
        };
        const ref = { ...trail };

        const trailView = encodeTrailBatchF32([trail], 1);
        jsIntegrateTrailBatch(trailView, 1, TRAIL_BATCH_STRIDE, timeScale);
        decodeTrailBatchF32([trail], 1, trailView, 800, 600);

        const refView = new Float64Array(TRAIL_BATCH_STRIDE);
        refView[0] = ref.x;
        refView[1] = ref.y;
        refView[2] = ref.vx;
        refView[3] = ref.vy;
        refView[4] = ref.life;
        refView[5] = ref.size;
        jsIntegrateTrailBatch(refView, 1, TRAIL_BATCH_STRIDE, timeScale);

        assert.ok(Math.abs(trail.x - refView[0]) < 1e-6);
        assert.ok(Math.abs(trail.y - refView[1]) < 1e-6);
        assert.ok(Math.abs(trail.life - refView[4]) < 1e-6);
        assert.ok(Math.abs(trail.size - refView[5]) < 1e-6);
    });

    it('ambient encode/decode matches software integration', () => {
        const timeScale = 1.0;
        const ambient = {
            x: 20,
            y: 40,
            vx: 0.8,
            vy: -0.5,
            life: 1.0,
            gravity: 0.02,
            friction: 0.95,
            rotation: 0,
            rotationSpeed: 0.1,
            angleX: 0,
            angleY: 0,
            velAngleX: 0.02,
            velAngleY: -0.01,
            _cacheDrawState() {},
        };
        const ref = { ...ambient };

        const ambientView = encodeAmbientBatchF32([ambient], 1);
        jsIntegrateSimpleBatch(ambientView, 1, SIMPLE_BATCH_STRIDE, timeScale, 0.015);
        decodeAmbientBatchF32([ambient], 1, ambientView, 800, 600, timeScale);

        const refView = new Float64Array(SIMPLE_BATCH_STRIDE);
        refView[0] = ref.x;
        refView[1] = ref.y;
        refView[2] = ref.vx;
        refView[3] = ref.vy;
        refView[4] = ref.life;
        refView[5] = ref.gravity;
        refView[6] = ref.friction;
        jsIntegrateSimpleBatch(refView, 1, SIMPLE_BATCH_STRIDE, timeScale, 0.015);

        assert.ok(Math.abs(ambient.x - refView[0]) < 1e-6);
        assert.ok(Math.abs(ambient.y - refView[1]) < 1e-6);
        assert.ok(Math.abs(ambient.vx - refView[2]) < 1e-6);
        assert.ok(Math.abs(ambient.vy - refView[3]) < 1e-6);
        assert.ok(Math.abs(ambient.life - refView[4]) < 1e-6);
    });
});
