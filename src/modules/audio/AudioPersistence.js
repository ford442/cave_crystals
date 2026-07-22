// @ts-nocheck
import { LEGACY_AUDIO_KEY, STORAGE_KEY } from '../SaveManager.js';
import { normalizeSettings } from './AudioSettings.js';

/**
 * Load saved audio preferences from localStorage (main save, then legacy key).
 * @returns {import('./AudioSettings.js').AudioSettingsData | null}
 */
export function loadPersistedAudioSettings() {
    if (typeof localStorage === 'undefined') return null;

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const save = JSON.parse(raw);
            if (save?.settings?.audio) {
                return normalizeSettings(save.settings.audio);
            }
        }
    } catch {
        // Fall through to legacy key.
    }

    try {
        const legacy = localStorage.getItem(LEGACY_AUDIO_KEY);
        if (legacy) return normalizeSettings(JSON.parse(legacy));
    } catch {
        return null;
    }

    return null;
}

/**
 * @param {import('./AudioSettings.js').AudioSettingsData} settings
 */
export function persistAudioSettings(settings) {
    if (typeof localStorage === 'undefined') return;

    const normalized = normalizeSettings(settings);

    try {
        localStorage.setItem(LEGACY_AUDIO_KEY, JSON.stringify(normalized));
    } catch {
        // Ignore quota errors.
    }

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return;
        const save = JSON.parse(raw);
        save.settings = save.settings || {};
        save.settings.audio = normalized;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
    } catch {
        // Ignore quota / parse errors.
    }
}
