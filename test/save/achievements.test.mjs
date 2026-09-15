import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';

import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, getAchievementsForEvent } from '../../src/modules/AchievementDefinitions.js';
import {
    SaveManager,
    STORAGE_KEY,
    DEFAULT_STATS,
    normalizeSave,
    normalizeStats,
} from '../../src/modules/SaveManager.js';
import { formatPlayTime } from '../../src/modules/systems/AchievementSystem.js';

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

describe('AchievementDefinitions', () => {
    it('every achievement has a unique id, event, and pure check()', () => {
        const ids = new Set();
        for (const def of ACHIEVEMENTS) {
            assert.equal(ids.has(def.id), false, `duplicate id ${def.id}`);
            ids.add(def.id);
            assert.equal(typeof def.check, 'function');
            assert.equal(ACHIEVEMENTS_BY_ID.get(def.id), def);
        }
        assert.ok(ACHIEVEMENTS.length >= 5, 'catalog should have at least 5 achievements');
    });

    it('first_match unlocks once the lifetime match counter reaches 1', () => {
        const def = ACHIEVEMENTS_BY_ID.get('first_match');
        assert.equal(def.check({}, { ...DEFAULT_STATS, totalMatches: 0 }), false);
        assert.equal(def.check({}, { ...DEFAULT_STATS, totalMatches: 1 }), true);
    });

    it('combo_10 unlocks at combo >= 10 and not below', () => {
        const def = ACHIEVEMENTS_BY_ID.get('combo_10');
        assert.equal(def.check({ combo: 9 }, DEFAULT_STATS), false);
        assert.equal(def.check({ combo: 10 }, DEFAULT_STATS), true);
        assert.equal(def.check({ combo: 11 }, DEFAULT_STATS), true);
    });

    it('boss_convergence only unlocks for the convergence boss id', () => {
        const def = ACHIEVEMENTS_BY_ID.get('boss_convergence');
        assert.equal(def.check({ bossId: 'convergence' }, DEFAULT_STATS), true);
        assert.equal(def.check({ bossId: 'other-boss' }, DEFAULT_STATS), false);
        assert.equal(def.check({ bossId: undefined }, DEFAULT_STATS), false);
    });

    it('perfect_level requires a non-endless level with zero mismatches', () => {
        const def = ACHIEVEMENTS_BY_ID.get('perfect_level');
        assert.equal(def.check({ endless: false, mismatches: 0 }, DEFAULT_STATS), true);
        assert.equal(def.check({ endless: false, mismatches: 1 }, DEFAULT_STATS), false);
        assert.equal(def.check({ endless: true, mismatches: 0 }, DEFAULT_STATS), false);
    });

    it('survivor_60 requires at least 60000ms elapsed', () => {
        const def = ACHIEVEMENTS_BY_ID.get('survivor_60');
        assert.equal(def.check({ elapsedMs: 59_999 }, DEFAULT_STATS), false);
        assert.equal(def.check({ elapsedMs: 60_000 }, DEFAULT_STATS), true);
    });

    it('getAchievementsForEvent filters by event type only', () => {
        const matchDefs = getAchievementsForEvent('match');
        assert.ok(matchDefs.every((d) => d.event === 'match'));
        assert.ok(matchDefs.some((d) => d.id === 'first_match'));
        assert.equal(matchDefs.some((d) => d.id === 'combo_10'), false);
    });
});

describe('formatPlayTime', () => {
    it('formats seconds, minutes, and hours', () => {
        assert.equal(formatPlayTime(0), '0s');
        assert.equal(formatPlayTime(45_000), '45s');
        assert.equal(formatPlayTime(125_000), '2m 5s');
        assert.equal(formatPlayTime(3 * 3600_000 + 10 * 60_000), '3h 10m');
    });
});

describe('SaveManager achievements + lifetime stats', () => {
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

    it('unlockAchievement persists a timestamp and is idempotent', () => {
        const save = new SaveManager();
        save.load();

        assert.equal(save.unlockAchievement('first_match', 1000), true);
        assert.equal(save.getStats().achievements.first_match, 1000);

        // Re-unlocking the same id is a no-op and keeps the original timestamp.
        assert.equal(save.unlockAchievement('first_match', 2000), false);
        assert.equal(save.getStats().achievements.first_match, 1000);

        const reloaded = new SaveManager();
        reloaded.load();
        assert.equal(reloaded.getStats().achievements.first_match, 1000);
    });

    it('recordBossDefeat and recordGameEnd accumulate lifetime stats', () => {
        const save = new SaveManager();
        save.load();

        save.recordBossDefeat();
        save.recordBossDefeat();
        assert.equal(save.getStats().bossesDefeated, 2);

        save.recordGameEnd({ score: 500, combo: 4, playTimeMs: 12_000 });
        save.recordGameEnd({ score: 100, combo: 2, playTimeMs: 3_000 });
        assert.equal(save.getStats().timePlayedMs, 15_000);
        assert.equal(save.getStats().highScore, 500);

        const reloaded = new SaveManager();
        reloaded.load();
        assert.equal(reloaded.getStats().bossesDefeated, 2);
        assert.equal(reloaded.getStats().timePlayedMs, 15_000);
    });

    it('normalizeStats safely migrates a pre-achievements localStorage blob', () => {
        // Simulates a save written before bossesDefeated/timePlayedMs/achievements existed.
        const legacyRaw = {
            version: 1,
            settings: {},
            stats: { highScore: 42, bestCombo: 7, totalGames: 3 },
        };
        globalThis.localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyRaw));

        const save = new SaveManager();
        save.load();
        const stats = save.getStats();
        assert.equal(stats.highScore, 42);
        assert.equal(stats.bestCombo, 7);
        assert.equal(stats.bossesDefeated, 0);
        assert.equal(stats.timePlayedMs, 0);
        assert.deepEqual(stats.achievements, {});

        // Further writes against the migrated save round-trip normally.
        assert.equal(save.unlockAchievement('survivor_60'), true);
        save.save();
        const reloaded = normalizeSave(JSON.parse(globalThis.localStorage.getItem(STORAGE_KEY)));
        assert.ok(reloaded.stats.achievements.survivor_60);
    });

    it('normalizeStats tolerates a corrupt achievements field', () => {
        const stats = normalizeStats({ achievements: 'not-an-object' });
        assert.deepEqual(stats.achievements, {});
    });
});
