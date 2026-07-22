import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import {
    loadPersistedAudioSettings,
    persistAudioSettings,
} from '../../src/modules/audio/AudioPersistence.js';
import { DEFAULT_AUDIO_SETTINGS, normalizeSettings, applyToBuses } from '../../src/modules/audio/AudioSettings.js';
import { LEGACY_AUDIO_KEY, STORAGE_KEY } from '../../src/modules/SaveManager.js';

describe('AudioPersistence', () => {
    /** @type {Record<string, string>} */
    let store;

    beforeEach(() => {
        store = {};
        globalThis.localStorage = {
            getItem: (key) => (key in store ? store[key] : null),
            setItem: (key, value) => { store[key] = String(value); },
            removeItem: (key) => { delete store[key]; },
        };
    });

    afterEach(() => {
        delete globalThis.localStorage;
    });

    it('persists and restores from the main save key', () => {
        store[STORAGE_KEY] = JSON.stringify({
            version: 1,
            settings: {
                audio: { master: 0.4, music: 0.3, sfx: 0.6, ui: 0.5, muted: true, reducedIntensity: false },
            },
            stats: {},
        });

        const loaded = loadPersistedAudioSettings();
        assert.ok(loaded);
        assert.equal(loaded.master, 0.4);
        assert.equal(loaded.muted, true);
    });

    it('falls back to the legacy audio key', () => {
        store[LEGACY_AUDIO_KEY] = JSON.stringify({ master: 0.25, muted: false });
        const loaded = loadPersistedAudioSettings();
        assert.ok(loaded);
        assert.equal(loaded.master, 0.25);
    });

    it('writes to both legacy and main save keys', () => {
        store[STORAGE_KEY] = JSON.stringify({
            version: 1,
            settings: { audio: { ...DEFAULT_AUDIO_SETTINGS } },
            stats: {},
        });

        persistAudioSettings({ ...DEFAULT_AUDIO_SETTINGS, master: 0.33, muted: true });

        const legacy = JSON.parse(store[LEGACY_AUDIO_KEY]);
        const save = JSON.parse(store[STORAGE_KEY]);
        assert.equal(legacy.master, 0.33);
        assert.equal(legacy.muted, true);
        assert.equal(save.settings.audio.master, 0.33);
        assert.equal(save.settings.audio.muted, true);
    });
});

describe('SoundManager volume API (logic)', () => {
    it('normalizeSettings clamps volume and preserves mute', () => {
        const settings = normalizeSettings({ master: 2, muted: true });
        assert.equal(settings.master, 1);
        assert.equal(settings.muted, true);
    });

    it('effective master bus level is zero when muted', () => {
        const buses = {
            masterGain: { gain: { value: 0 } },
            musicGain: { gain: { value: 0 } },
            sfxGain: { gain: { value: 0 } },
            uiGain: { gain: { value: 0 } },
        };
        applyToBuses(buses, { ...DEFAULT_AUDIO_SETTINGS, master: 0.9, muted: true });
        assert.equal(buses.masterGain.gain.value, 0);
    });
});
