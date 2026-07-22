// @ts-nocheck
import { normalizeSettings as normalizeAudio, DEFAULT_AUDIO_SETTINGS } from './audio/AudioSettings.js';

export const STORAGE_KEY = 'cave-crystals-save';
export const LEGACY_AUDIO_KEY = 'cave-crystals-audio';

/** @typedef {import('./audio/AudioSettings.js').AudioSettingsData} AudioSettingsData */

/**
 * @typedef {Object} InputSettings
 * @property {boolean} keyboard
 * @property {boolean} gamepad
 */

/**
 * @typedef {Object} GameSettings
 * @property {import('./types.js').QualityMode} graphics
 * @property {import('./types.js').GameMode} gameMode
 * @property {boolean} reducedMotion
 * @property {boolean} colorBlindMode
 * @property {boolean} showTutorial
 * @property {boolean} tutorialCompleted
 * @property {InputSettings} input
 * @property {AudioSettingsData} audio
 */

/**
 * @typedef {Object} GameStats
 * @property {number} highScore
 * @property {number} bestCombo
 * @property {number} totalGames
 * @property {number} totalShots
 * @property {number} totalMatches
 * @property {number} totalMismatches
 * @property {Record<string, number>} achievements
 */

/**
 * @typedef {Object} SaveData
 * @property {number} version
 * @property {GameSettings} settings
 * @property {GameStats} stats
 */

/** @type {GameSettings} */
export const DEFAULT_SETTINGS = {
    graphics: 'auto',
    gameMode: 'campaign',
    reducedMotion: false,
    colorBlindMode: false,
    showTutorial: true,
    tutorialCompleted: false,
    input: { keyboard: true, gamepad: true },
    audio: { ...DEFAULT_AUDIO_SETTINGS },
};

/** @type {GameStats} */
export const DEFAULT_STATS = {
    highScore: 0,
    bestCombo: 0,
    totalGames: 0,
    totalShots: 0,
    totalMatches: 0,
    totalMismatches: 0,
    achievements: {},
};

const QUALITY_MODES = new Set(['auto', 'low', 'medium', 'high', 'dev']);
const GAME_MODES = new Set(['campaign', 'endless']);

/**
 * @param {Partial<GameSettings>} raw
 * @returns {GameSettings}
 */
export function normalizeSettings(raw = {}) {
    const graphics = QUALITY_MODES.has(raw.graphics) ? raw.graphics : DEFAULT_SETTINGS.graphics;
    const gameMode = GAME_MODES.has(raw.gameMode) ? raw.gameMode : DEFAULT_SETTINGS.gameMode;
    const input = raw.input || {};
    return {
        graphics,
        gameMode,
        reducedMotion: Boolean(raw.reducedMotion),
        colorBlindMode: Boolean(raw.colorBlindMode),
        showTutorial: raw.showTutorial !== false,
        tutorialCompleted: Boolean(raw.tutorialCompleted),
        input: {
            keyboard: input.keyboard !== false,
            gamepad: input.gamepad !== false,
        },
        audio: normalizeAudio(raw.audio || {}),
    };
}

/**
 * @param {Partial<GameStats>} raw
 * @returns {GameStats}
 */
export function normalizeStats(raw = {}) {
    return {
        highScore: Math.max(0, Number(raw.highScore) || 0),
        bestCombo: Math.max(0, Number(raw.bestCombo) || 0),
        totalGames: Math.max(0, Number(raw.totalGames) || 0),
        totalShots: Math.max(0, Number(raw.totalShots) || 0),
        totalMatches: Math.max(0, Number(raw.totalMatches) || 0),
        totalMismatches: Math.max(0, Number(raw.totalMismatches) || 0),
        achievements: raw.achievements && typeof raw.achievements === 'object' ? { ...raw.achievements } : {},
    };
}

/**
 * @param {Partial<SaveData>} raw
 * @returns {SaveData}
 */
export function normalizeSave(raw = {}) {
    return {
        version: 1,
        settings: normalizeSettings(raw.settings),
        stats: normalizeStats(raw.stats),
    };
}

/**
 * @returns {SaveData}
 */
function createDefaultSave() {
    return normalizeSave({});
}

/**
 * @returns {AudioSettingsData | null}
 */
function loadLegacyAudio() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const raw = localStorage.getItem(LEGACY_AUDIO_KEY);
        if (!raw) return null;
        return normalizeAudio(JSON.parse(raw));
    } catch {
        return null;
    }
}

/**
 * @param {SaveData} save
 * @returns {SaveData}
 */
export function migrate(save) {
    const legacyAudio = loadLegacyAudio();
    if (legacyAudio) {
        save.settings.audio = normalizeAudio({ ...save.settings.audio, ...legacyAudio });
    }
    return save;
}

export class SaveManager {
    constructor() {
        /** @type {SaveData} */
        this.data = createDefaultSave();
    }

    load() {
        if (typeof localStorage === 'undefined') {
            this.data = createDefaultSave();
            return this.data;
        }
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                this.data = migrate(createDefaultSave());
                return this.data;
            }
            this.data = migrate(normalizeSave(JSON.parse(raw)));
            return this.data;
        } catch {
            this.data = migrate(createDefaultSave());
            return this.data;
        }
    }

    save() {
        if (typeof localStorage === 'undefined') return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch {
            // Ignore quota errors.
        }
    }

    /** @returns {GameSettings} */
    getSettings() {
        return this.data.settings;
    }

    /** @param {Partial<GameSettings>} patch */
    updateSettings(patch) {
        this.data.settings = normalizeSettings({ ...this.data.settings, ...patch });
    }

    /** @returns {GameStats} */
    getStats() {
        return this.data.stats;
    }

    /** @param {Partial<GameStats>} patch */
    updateStats(patch) {
        this.data.stats = normalizeStats({ ...this.data.stats, ...patch });
    }

    /**
     * @param {number} score
     * @param {number} [combo]
     */
    recordRunEnd(score, combo = 0) {
        const stats = this.data.stats;
        stats.highScore = Math.max(stats.highScore, score);
        stats.bestCombo = Math.max(stats.bestCombo, combo);
        this.save();
    }

    getAccuracy() {
        const { totalMatches, totalShots } = this.data.stats;
        if (totalShots <= 0) return 0;
        return totalMatches / totalShots;
    }

    recordGameStart() {
        this.data.stats.totalGames += 1;
        this.save();
    }

    recordShot() {
        this.data.stats.totalShots += 1;
        this.save();
    }

    /**
     * @param {number} combo
     */
    recordMatch(combo = 0) {
        this.data.stats.totalMatches += 1;
        this.data.stats.bestCombo = Math.max(this.data.stats.bestCombo, combo);
        this.save();
    }

    recordMismatch() {
        this.data.stats.totalMismatches += 1;
        this.save();
    }

    /**
     * @param {{ score: number, combo?: number }} result
     */
    recordGameEnd(result) {
        this.recordRunEnd(result.score, result.combo || 0);
    }
}
