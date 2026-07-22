import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildPostFxUniforms } from '../../src/modules/renderers/postfx/PostFxUniforms.js';
import { RENDER_QUALITY_PROFILES } from '../../src/modules/RendererConstants.js';

const mockHost = {
    width: 1280,
    height: 800,
    hexToRgb: (hex) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16),
        } : null;
    },
};

describe('buildPostFxUniforms', () => {
    it('mirrors drawColorGrade comboT and drawFilmPass comboPulse math', () => {
        const profile = RENDER_QUALITY_PROFILES.high;
        const gameState = {
            combo: 6,
            criticalIntensity: 0.5,
            motionScale: 0.8,
            adaptiveOverrides: { effectScale: 0.9 },
            shake: 2,
            impactFlash: 0.2,
            impactFlashColor: '#ff8800',
        };
        const launcher = { speed: 4 };

        const u = buildPostFxUniforms(gameState, profile, launcher, mockHost, 2000);

        assert.equal(u.comboT, Math.min(1, (6 - 2) / 8));
        assert.equal(u.comboPulse, Math.min(1, (6 - 2) / 10));
        assert.equal(u.criticalIntensity, 0.5);
        assert.equal(u.motionScale, 0.8);
        assert.equal(u.effectScale, 0.8 * 0.9);
        assert.equal(u.bloomStrength, profile.bloomStrength * 0.8 * 0.9);
        assert.equal(u.grainAmount, profile.grainAmount * 0.8 * 0.9);
        assert.equal(u.time, 2);
        assert.equal(u.bloomSynergy, 0.2 * 0.5);
        assert.equal(u.chromaOffset, (4 + (2 + 4 * 2.5) * 0.2) * 0.8);
        assert.deepEqual(u.resolution, [1280, 800]);
        assert.equal(u.impactFlashColor?.r, 255);
    });

    it('defaults combo and danger to zero', () => {
        const u = buildPostFxUniforms({}, RENDER_QUALITY_PROFILES.medium, null, mockHost, 0);
        assert.equal(u.comboT, 0);
        assert.equal(u.comboPulse, 0);
        assert.equal(u.criticalIntensity, 0);
        assert.equal(u.chromaOffset, 4);
    });
});
