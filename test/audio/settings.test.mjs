import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import {
    DEFAULT_AUDIO_SETTINGS,
    applyToBuses,
    getIntensityMultiplier,
    normalizeSettings,
} from '../../src/modules/audio/AudioSettings.js';

/** @returns {{ masterGain: { gain: { value: number } }, musicGain: { gain: { value: number } }, sfxGain: { gain: { value: number } }, uiGain: { gain: { value: number } } }} */
function createMockBuses() {
    return {
        masterGain: { gain: { value: 0 } },
        musicGain: { gain: { value: 0 } },
        sfxGain: { gain: { value: 0 } },
        uiGain: { gain: { value: 0 } },
    };
}

describe('AudioSettings', () => {
    it('normalizes partial settings', () => {
        const normalized = normalizeSettings({ master: 1.5, sfx: -2, muted: true });
        assert.equal(normalized.master, 1);
        assert.equal(normalized.sfx, 0);
        assert.equal(normalized.muted, true);
        assert.equal(normalized.music, DEFAULT_AUDIO_SETTINGS.music);
    });

    it('applyToBuses respects mute and music ducking', () => {
        const buses = createMockBuses();
        applyToBuses(buses, {
            ...DEFAULT_AUDIO_SETTINGS,
            master: 0.9,
            music: 0.6,
            sfx: 0.7,
            ui: 0.5,
            muted: true,
            reducedIntensity: false,
        });
        assert.equal(buses.masterGain.gain.value, 0);
        assert.equal(buses.sfxGain.gain.value, 0.7);
        assert.equal(buses.uiGain.gain.value, 0.5);
        assert.equal(buses.musicGain.gain.value, 0.6);

        applyToBuses(
            buses,
            {
                ...DEFAULT_AUDIO_SETTINGS,
                muted: false,
                music: 0.5,
            },
            { musicDuck: 0.7 }
        );
        assert.equal(buses.masterGain.gain.value, DEFAULT_AUDIO_SETTINGS.master);
        assert.equal(buses.musicGain.gain.value, 0.35);
    });

    it('getIntensityMultiplier lowers output in reduced mode', () => {
        assert.equal(getIntensityMultiplier({ ...DEFAULT_AUDIO_SETTINGS, reducedIntensity: false }), 1);
        assert.equal(getIntensityMultiplier({ ...DEFAULT_AUDIO_SETTINGS, reducedIntensity: true }), 0.55);
    });
});
