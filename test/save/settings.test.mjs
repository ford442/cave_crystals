import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { SettingsManager } from '../../src/modules/SettingsManager.js';
import {
    SaveManager,
    STORAGE_KEY,
    LEGACY_AUDIO_KEY,
    normalizeSave,
} from '../../src/modules/SaveManager.js';
import { getActivePalette, COLOR_BLIND_PALETTE, DEFAULT_PALETTE } from '../../src/modules/ColorPalettes.js';
import { InputManager } from '../../src/modules/InputManager.js';

/** @returns {Storage} */
function createMemoryStorage() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, String(value));
        },
        removeItem(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        },
        key() {
            return null;
        },
        get length() {
            return store.size;
        },
    };
}

describe('SaveManager', () => {
    /** @type {Storage | undefined} */
    let originalLocalStorage;

    beforeEach(() => {
        originalLocalStorage = globalThis.localStorage;
        Object.defineProperty(globalThis, 'localStorage', {
            configurable: true,
            value: createMemoryStorage(),
        });
    });

    afterEach(() => {
        if (originalLocalStorage) {
            Object.defineProperty(globalThis, 'localStorage', {
                configurable: true,
                value: originalLocalStorage,
            });
        }
    });

    it('round-trips save data', () => {
        const save = new SaveManager();
        save.load();
        save.updateSettings({ reducedMotion: true, colorBlindMode: true });
        save.updateStats({ highScore: 1200, bestCombo: 5 });
        save.save();

        const reloaded = new SaveManager();
        reloaded.load();
        assert.equal(reloaded.getSettings().reducedMotion, true);
        assert.equal(reloaded.getSettings().colorBlindMode, true);
        assert.equal(reloaded.getStats().highScore, 1200);
        assert.equal(reloaded.getStats().bestCombo, 5);
        assert.ok(globalThis.localStorage.getItem(STORAGE_KEY));
    });

    it('migrates legacy audio settings into unified save', () => {
        globalThis.localStorage.setItem(
            LEGACY_AUDIO_KEY,
            JSON.stringify({ master: 0.3, music: 0.4, sfx: 0.9, muted: true, reducedIntensity: true })
        );

        const save = new SaveManager();
        save.load();
        assert.equal(save.getSettings().audio.master, 0.3);
        assert.equal(save.getSettings().audio.muted, true);
        assert.equal(
            globalThis.localStorage.getItem(LEGACY_AUDIO_KEY),
            JSON.stringify({ master: 0.3, music: 0.4, sfx: 0.9, muted: true, reducedIntensity: true })
        );
    });
});

describe('SettingsManager', () => {
    it('returns reduced motion scale', () => {
        const save = new SaveManager();
        save.data = normalizeSave({ settings: { reducedMotion: true } });
        const settings = new SettingsManager(save);
        assert.equal(settings.getMotionScale(), 0.2);
        save.data = normalizeSave({ settings: { reducedMotion: false } });
        assert.equal(settings.getMotionScale(), 1);
    });
});

describe('ColorPalettes', () => {
    it('swaps palette and shape metadata for color-blind mode', () => {
        const standard = getActivePalette(false);
        const accessible = getActivePalette(true);
        assert.notEqual(standard[0].hex, accessible[0].hex);
        assert.equal(standard, DEFAULT_PALETTE);
        assert.equal(accessible, COLOR_BLIND_PALETTE);
        assert.ok(standard[0].shape);
        assert.ok(accessible[0].glyph);
    });
});

describe('InputManager', () => {
    it('detects lane delta and fire edges from keyboard state', () => {
        const listeners = new Map();
        globalThis.window = {
            addEventListener(type, handler) {
                listeners.set(type, handler);
            },
            removeEventListener(type) {
                listeners.delete(type);
            },
        };

        const input = new InputManager();
        input._keysPressed.add('ArrowRight');
        input._keysDown.add('ArrowRight');
        const result = input.poll({ keyboard: true, gamepad: false }, 16);
        assert.equal(result.laneDelta, 1);
        assert.equal(result.fire, false);

        input._keysPressed.clear();
        input._keysPressed.add('Space');
        const fireResult = input.poll({ keyboard: true, gamepad: false }, 16);
        assert.equal(fireResult.fire, true);
        assert.equal(fireResult.laneDelta, 0);

        const stillBuffered = input.poll({ keyboard: true, gamepad: false }, 16);
        assert.equal(stillBuffered.fire, true);

        input.consumeFire();
        const afterConsume = input.poll({ keyboard: true, gamepad: false }, 16);
        assert.equal(afterConsume.fire, false);
        input.dispose();
    });
});
