import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    tickComboTimer,
    applyMatchCombo,
    applyMismatchCombo,
    computeMatchPitch,
    computeMatchJuiceMagnitudes,
} from '../../src/modules/systems/ComboLogic.js';

describe('ComboLogic', () => {
    it('tickComboTimer decays combo when timer expires', () => {
        const state = { combo: 4, comboTimer: 100 };
        tickComboTimer(state, 50, 1);
        assert.equal(state.comboTimer, 50);
        assert.equal(state.combo, 4);

        tickComboTimer(state, 60, 1);
        assert.equal(state.combo, 0);
    });

    it('applyMatchCombo increments combo and triggers slow-mo past threshold', () => {
        const state = {
            combo: 2,
            comboTimer: 0,
            targetTimeScale: 1,
            slowMoTimer: 0,
        };

        const combo = applyMatchCombo(state, { motionScale: 1 });
        assert.equal(combo, 3);
        assert.equal(state.comboTimer, 2000);
        assert.equal(state.targetTimeScale, 0.3);
        assert.equal(state.slowMoTimer, 400);
    });

    it('applyMismatchCombo resets combo state', () => {
        const state = { combo: 5, comboTimer: 1500 };
        applyMismatchCombo(state);
        assert.equal(state.combo, 0);
        assert.equal(state.comboTimer, 0);
    });

    it('computeMatchPitch scales with combo up to cap', () => {
        assert.equal(computeMatchPitch(1), 1.1);
        assert.equal(computeMatchPitch(10), 2.0);
        assert.equal(computeMatchPitch(20), 2.0);
    });

    it('computeMatchJuiceMagnitudes scale with combo and motion', () => {
        const mags = computeMatchJuiceMagnitudes(5, 1);
        assert.equal(mags.shake, 25);
        assert.equal(mags.zoom, 1.07);
        assert.equal(mags.impactFlash, 0.6);
        assert.equal(mags.sleepTimer, 50);
    });
});
