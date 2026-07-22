import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { QualitySystem, ADAPTIVE_QUALITY } from '../../src/modules/systems/QualitySystem.js';

describe('QualitySystem', () => {
    it('resolveQualityForFps maps fps to render tiers', () => {
        const quality = new QualitySystem({
            state: { renderQuality: 'high', qualityMode: 'auto', adaptiveOverrides: { particleStrideBoost: 0, effectScale: 1 }, perfMetrics: {} },
            renderer: { getQualityProfile: () => ({ maxParticles: 100 }) },
            ui: {},
        });

        assert.equal(quality.resolveQualityForFps(40, 50, 57), 'low');
        assert.equal(quality.resolveQualityForFps(55, 50, 57), 'medium');
        assert.equal(quality.resolveQualityForFps(60, 50, 57), 'high');
    });

    it('getQualityScale reflects render quality', () => {
        const quality = new QualitySystem({
            state: { renderQuality: 'low', qualityMode: 'auto', adaptiveOverrides: { particleStrideBoost: 0, effectScale: 1 }, perfMetrics: {} },
            renderer: { getQualityProfile: () => ({ maxParticles: 100 }) },
            ui: {},
        });
        assert.equal(quality.getQualityScale(), 0.55);

        quality.game.state.renderQuality = 'medium';
        assert.equal(quality.getQualityScale(), 0.8);

        quality.game.state.renderQuality = 'high';
        assert.equal(quality.getQualityScale(), 1.0);
    });

    it('updateAdaptiveQuality downgrades when smoothed fps is low', () => {
        const state = {
            renderQuality: 'high',
            qualityMode: 'auto',
            adaptiveOverrides: { particleStrideBoost: 0, effectScale: 1 },
            perfMetrics: { smoothedFrameMs: 16.7, frameMs: 16.7, instantFps: 60 },
        };
        const quality = new QualitySystem({
            state,
            renderer: { getQualityProfile: () => ({ maxParticles: 100 }) },
            ui: {},
        });

        quality._smoothedFps = ADAPTIVE_QUALITY.downgradeLowFps - 1;
        quality._qualityCooldownUntil = 0;
        quality.updateAdaptiveQuality(30);
        assert.equal(state.renderQuality, 'low');
    });
});
