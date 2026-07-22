import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ParticleWorkerBridge } from '../../src/modules/ParticleWorkerBridge.js';
import { WORKER_MIN_PARTICLES } from '../../src/modules/particleBatchCodec.js';

describe('ParticleWorkerBridge', () => {
    it('falls back to main-thread integration when worker is unavailable', () => {
        const bridge = new ParticleWorkerBridge();
        bridge.enabled = false;
        bridge.ready = false;

        const trail = {
            x: 0, y: 0, vx: 1, vy: 0, life: 1, size: 3,
            update(ts, rw, rh) {
                this.x += this.vx * ts;
                this.life -= 0.05 * ts;
                this._drawAlpha = this.life;
                this._screenSize = this.size;
                this._onScreen = true;
            },
        };

        let mainTrailCalled = false;
        const wasmManager = {
            batchIntegrateTrailParticles() {
                mainTrailCalled = true;
                return false;
            },
            batchIntegrateAmbientParticles() {
                return false;
            },
        };

        const result = bridge.scheduleVisualIntegration({
            trailBatch: [trail],
            trailCount: 1,
            dustParticles: [],
            ambientBatch: [],
            ambientCount: 0,
            timeScale: 1,
            rw: 800,
            rh: 600,
            renderQuality: 'high',
            wasmManager,
        });

        assert.equal(result.usedWorker, false);
        assert.equal(bridge.getStatus().path, 'main');
        assert.ok(trail.x > 0 || mainTrailCalled);
    });

    it('does not prefer worker below particle threshold', () => {
        const bridge = new ParticleWorkerBridge();
        bridge.enabled = true;
        bridge.ready = true;
        bridge.worker = { postMessage() {} };

        const canUse = bridge._canUseWorker(WORKER_MIN_PARTICLES - 1, 'high');
        assert.equal(canUse, false);

        const canUseLow = bridge._canUseWorker(WORKER_MIN_PARTICLES + 10, 'low');
        assert.equal(canUseLow, false);
    });

    it('is disabled when __PARTICLE_WORKER__ is false', () => {
        const bridge = new ParticleWorkerBridge();
        const hadKey = Object.prototype.hasOwnProperty.call(globalThis, '__PARTICLE_WORKER__');
        const prev = globalThis.__PARTICLE_WORKER__;
        try {
            globalThis.__PARTICLE_WORKER__ = false;
            assert.equal(bridge.isExplicitlyDisabled(), true);
        } finally {
            if (hadKey) {
                globalThis.__PARTICLE_WORKER__ = prev;
            } else {
                delete globalThis.__PARTICLE_WORKER__;
            }
        }
    });
});
