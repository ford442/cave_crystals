// @ts-check

import { ACHIEVEMENTS, getAchievementsForEvent } from '../AchievementDefinitions.js';

const TOAST_DURATION_MS = 3200;
const TOAST_DURATION_REDUCED_MS = 2200;

/**
 * Evaluates achievement predicates against gameplay events, persists unlocks via
 * SaveManager, and drives a small toast + the game-over stats panel.
 */
export class AchievementSystem {
    /** @param {import('../Game.js').Game} game */
    constructor(game) {
        this.game = game;

        /** @type {import('../AchievementDefinitions.js').AchievementDefinition[]} */
        this._toastQueue = [];
        /** @type {import('../AchievementDefinitions.js').AchievementDefinition | null} */
        this._activeToast = null;
        this._toastTimer = 0;

        /** Ids unlocked during the current run, for "recent unlock" panel highlighting. */
        this._sessionUnlocked = new Set();

        this.el = typeof document !== 'undefined' ? document.getElementById('achievementToast') : null;
    }

    resetSession() {
        this._sessionUnlocked.clear();
        this._toastQueue.length = 0;
        this._hideToast();
    }

    /**
     * @param {import('../AchievementDefinitions.js').AchievementEvent} event
     * @param {any} payload
     */
    _evaluate(event, payload) {
        const stats = this.game.save.getStats();
        for (const def of getAchievementsForEvent(event)) {
            if (stats.achievements[def.id]) continue;
            if (def.check(payload, stats)) {
                this._unlock(def);
            }
        }
    }

    /** @param {import('../AchievementDefinitions.js').AchievementDefinition} def */
    _unlock(def) {
        if (!this.game.save.unlockAchievement(def.id)) return;
        this._sessionUnlocked.add(def.id);
        this._toastQueue.push(def);
    }

    /** @param {number} combo */
    onMatch(combo) {
        this._evaluate('match', { combo });
        this._evaluate('combo', { combo });
    }

    /** @param {string | undefined | null} bossId */
    onBossDefeat(bossId) {
        this._evaluate('boss_defeat', { bossId });
    }

    /** @param {{ endless: boolean, mismatches: number }} payload */
    onLevelComplete(payload) {
        this._evaluate('level_complete', payload);
    }

    /** @param {number} elapsedMs */
    onSurvivalTick(elapsedMs) {
        this._evaluate('survival', { elapsedMs });
    }

    /** @param {number} dt */
    update(dt) {
        if (!this.el) return;
        if (!this._activeToast && this._toastQueue.length) {
            this._activeToast = /** @type {import('../AchievementDefinitions.js').AchievementDefinition} */ (this._toastQueue.shift());
            this._showToast(this._activeToast);
            this._toastTimer = this.game.state.reducedMotion ? TOAST_DURATION_REDUCED_MS : TOAST_DURATION_MS;
        } else if (this._activeToast) {
            this._toastTimer -= dt;
            if (this._toastTimer <= 0) {
                this._hideToast();
            }
        }
    }

    /** @param {import('../AchievementDefinitions.js').AchievementDefinition} def */
    _showToast(def) {
        if (!this.el) return;
        this.el.innerHTML = '';

        const icon = document.createElement('span');
        icon.className = 'achievement-toast-icon';
        icon.textContent = def.icon;

        const text = document.createElement('span');
        text.className = 'achievement-toast-text';
        const title = document.createElement('strong');
        title.textContent = `Achievement unlocked: ${def.name}`;
        const desc = document.createElement('span');
        desc.className = 'achievement-toast-desc';
        desc.textContent = def.description;
        text.appendChild(title);
        text.appendChild(desc);

        this.el.appendChild(icon);
        this.el.appendChild(text);
        this.el.classList.remove('hidden');
        this.el.classList.toggle('achievement-toast--reduced-motion', Boolean(this.game.state.reducedMotion));
        // Restart the entrance transition even if a toast was already visible.
        this.el.classList.remove('achievement-toast--visible');
        void this.el.offsetWidth;
        this.el.classList.add('achievement-toast--visible');
    }

    _hideToast() {
        if (this.el) {
            this.el.classList.remove('achievement-toast--visible');
            this.el.classList.add('hidden');
        }
        this._activeToast = null;
    }

    /** Populates the game-over lifetime stats + achievements panel. */
    renderPanel() {
        const game = this.game;
        const stats = game.save.getStats();
        const ui = game.ui;

        if (ui.totalGamesVal) ui.totalGamesVal.textContent = String(stats.totalGames);
        if (ui.totalShotsVal) ui.totalShotsVal.textContent = String(stats.totalShots);
        if (ui.bossesDefeatedVal) ui.bossesDefeatedVal.textContent = String(stats.bossesDefeated);
        if (ui.timePlayedVal) ui.timePlayedVal.textContent = formatPlayTime(stats.timePlayedMs);

        const unlockedCount = Object.keys(stats.achievements).length;
        if (ui.achievementsUnlockedCount) ui.achievementsUnlockedCount.textContent = String(unlockedCount);
        if (ui.achievementsTotalCount) ui.achievementsTotalCount.textContent = String(ACHIEVEMENTS.length);

        if (!ui.achievementsList) return;
        ui.achievementsList.innerHTML = '';
        const ordered = [...ACHIEVEMENTS].sort((a, b) => {
            const recentDelta = Number(this._sessionUnlocked.has(b.id)) - Number(this._sessionUnlocked.has(a.id));
            if (recentDelta !== 0) return recentDelta;
            return Number(Boolean(stats.achievements[b.id])) - Number(Boolean(stats.achievements[a.id]));
        });

        for (const def of ordered) {
            const unlocked = Boolean(stats.achievements[def.id]);
            const recent = this._sessionUnlocked.has(def.id);

            const badge = document.createElement('div');
            badge.className = 'achievement-badge' + (unlocked ? ' achievement-badge--unlocked' : ' achievement-badge--locked')
                + (recent ? ' achievement-badge--recent' : '');
            badge.title = unlocked ? `${def.name}: ${def.description}` : 'Locked';

            const icon = document.createElement('span');
            icon.className = 'achievement-badge-icon';
            icon.textContent = unlocked ? def.icon : '🔒';

            const label = document.createElement('span');
            label.className = 'achievement-badge-label';
            label.textContent = unlocked ? def.name : '???';

            badge.appendChild(icon);
            badge.appendChild(label);
            ui.achievementsList.appendChild(badge);
        }
    }
}

/**
 * @param {number} ms
 * @returns {string}
 */
export function formatPlayTime(ms) {
    const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}
