import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DustParticle } from '../../src/modules/Entities.js';
import {
    DUST_BATCH_STRIDE,
    TRAIL_BATCH_STRIDE,
} from '../../src/modules/WasmConstants.js';
import {
    packTrailBatch,
    scatterTrailBatch,
    packDustBatch,
    scatterDustBatch,
    jsIntegrateDustBatch,
    applyTrailDrawCache,
} from '../../src/modules/particleBatchCodec.js';

describe('particleBatchCodec', () => {
    it('packs and scatters trail particles', () => {
        const trail = {
            x: 10, y: 20, vx: 1, vy: -2, life: 0.8, size: 4,
            _drawAlpha: 0, _screenSize: 0, _onScreen: true,
        };
        const view = new Float64Array(TRAIL_BATCH_STRIDE);
        packTrailBatch([trail], 1, view);
        assert.equal(view[0], 10);
        assert.equal(view[4], 0.8);

        view[0] = 15;
        view[4] = 0.5;
        scatterTrailBatch([trail], 1, view, 800, 600);
        assert.equal(trail.x, 15);
        assert.equal(trail.life, 0.5);
        assert.equal(trail._drawAlpha, 0.5);
    });

    it('applyTrailDrawCache sets on-screen flag', () => {
        const trail = { x: 50, y: 50, life: 1, size: 5, _drawAlpha: 0, _screenSize: 0, _onScreen: false };
        applyTrailDrawCache(trail, 800, 600);
        assert.equal(trail._onScreen, true);
    });

    it('jsIntegrateDustBatch matches DustParticle.update', () => {
        const dust = new DustParticle(100, 200);
        dust.vx = 0.2;
        dust.vy = -0.1;

        const ref = new DustParticle(dust.x, dust.y);
        ref.vx = dust.vx;
        ref.vy = dust.vy;
        ref.baseVx = dust.baseVx;
        ref.baseVy = dust.baseVy;
        ref.alpha = dust.alpha;
        ref.phase = dust.phase;
        ref.size = dust.size;

        const view = new Float64Array(DUST_BATCH_STRIDE);
        packDustBatch([dust], 1, view);
        jsIntegrateDustBatch(view, 1, 800, 600, 1.0);
        scatterDustBatch([dust], 1, view);

        ref.update(800, 600, 1.0);

        assert.ok(Math.abs(dust.x - ref.x) < 1e-9);
        assert.ok(Math.abs(dust.y - ref.y) < 1e-9);
        assert.ok(Math.abs(dust.vx - ref.vx) < 1e-9);
        assert.ok(Math.abs(dust.vy - ref.vy) < 1e-9);
        assert.ok(Math.abs(dust.renderAlpha - ref.renderAlpha) < 1e-9);
    });
});
