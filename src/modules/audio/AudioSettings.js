// @ts-nocheck

/** @typedef {{ master: number, music: number, sfx: number, ui: number, muted: boolean, reducedIntensity: boolean }} AudioSettingsData */

/** @type {AudioSettingsData} */
export const DEFAULT_AUDIO_SETTINGS = {
    master: 0.8,
    music: 0.5,
    sfx: 0.8,
    ui: 0.8,
    muted: false,
    reducedIntensity: false,
};

/**
 * @param {unknown} value
 * @returns {number}
 */
function clampUnit(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
}

/**
 * @param {Partial<AudioSettingsData>} raw
 * @returns {AudioSettingsData}
 */
export function normalizeSettings(raw = {}) {
    return {
        master: clampUnit(raw.master ?? DEFAULT_AUDIO_SETTINGS.master),
        music: clampUnit(raw.music ?? DEFAULT_AUDIO_SETTINGS.music),
        sfx: clampUnit(raw.sfx ?? DEFAULT_AUDIO_SETTINGS.sfx),
        ui: clampUnit(raw.ui ?? DEFAULT_AUDIO_SETTINGS.ui),
        muted: Boolean(raw.muted),
        reducedIntensity: Boolean(raw.reducedIntensity),
    };
}

/**
 * @typedef {{ masterGain: GainNode, musicGain: GainNode, sfxGain: GainNode, uiGain: GainNode }} AudioBuses
 * @param {AudioBuses} buses
 * @param {AudioSettingsData} settings
 * @param {{ musicDuck?: number }} [options]
 */
export function applyToBuses(buses, settings, options = {}) {
    const normalized = normalizeSettings(settings);
    const master = normalized.muted ? 0 : normalized.master;
    buses.masterGain.gain.value = master;
    buses.sfxGain.gain.value = normalized.sfx;
    buses.uiGain.gain.value = normalized.ui;
    const duck = options.musicDuck ?? 1;
    buses.musicGain.gain.value = normalized.music * duck;
}

/**
 * @param {AudioSettingsData} settings
 * @returns {number}
 */
export function getIntensityMultiplier(settings) {
    return settings.reducedIntensity ? 0.55 : 1;
}
