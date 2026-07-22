/** @import { GameMode, LevelDefinition, ObjectiveProgress, SpawnConfig } from './types.js' */

import { LEVELS, ENDLESS_CONFIG, GAME_MODES, OBJECTIVE_TYPES } from './LevelDefinitions.js';
import { wasmManager } from './WasmManager.js';

/**
 * Owns campaign/endless progression state outside the render loop state object.
 */
export class ProgressionManager {
    constructor() {
        /** @type {GameMode} */
        this.mode = GAME_MODES.CAMPAIGN;
        /** @type {number} */
        this.levelIndex = 0;
        /** @type {number} */
        this.scoreAtLevelStart = 0;
        /** @type {number} */
        this.elapsedMs = 0;
        /** @type {number} */
        this.bestStreak = 0;
        /** @type {boolean} */
        this.transitioning = false;
        /** @type {number} */
        this.transitionTimer = 0;
        /** @type {boolean} */
        this.campaignComplete = false;
        /** @type {() => number} */
        this._rng = Math.random;
    }

    /** @param {() => number} rng */
    setRng(rng) {
        this._rng = rng;
    }

    /** @param {GameMode} mode */
    setMode(mode) {
        this.mode = mode;
    }

    reset() {
        this.levelIndex = 0;
        this.scoreAtLevelStart = 0;
        this.elapsedMs = 0;
        this.bestStreak = 0;
        this.transitioning = false;
        this.transitionTimer = 0;
        this.campaignComplete = false;
    }

    /** @returns {boolean} */
    isEndless() {
        return this.mode === GAME_MODES.ENDLESS;
    }

    /** @returns {LevelDefinition | import('./types.js').LevelRuntimeConfig} */
    getActiveConfig() {
        if (this.isEndless()) return ENDLESS_CONFIG;
        return LEVELS[this.levelIndex] || LEVELS[LEVELS.length - 1];
    }

    /** @returns {SpawnConfig} */
    getSpawnConfig() {
        const cfg = this.getActiveConfig();
        return {
            lanes: cfg.lanes,
            colorCount: cfg.colorCount,
            heightMin: cfg.crystalHeight.min,
            heightMax: cfg.crystalHeight.max,
        };
    }

    /**
     * @param {number} score
     * @returns {number}
     */
    getGrowthMultiplier(score) {
        const growth = this.getActiveConfig().growth;
        const levelScore = this.isEndless() ? score : Math.max(0, score - this.scoreAtLevelStart);
        return growth.baseMultiplier * wasmManager.calculateGrowthMultiplier(levelScore, growth.scoreDivisor);
    }

    /** @returns {number} */
    pickRandomColorIndex() {
        const count = this.getActiveConfig().colorCount;
        return Math.floor(this._rng() * count);
    }

    /** @param {number} score */
    beginLevel(score = 0) {
        this.scoreAtLevelStart = score;
        this.elapsedMs = 0;
        this.bestStreak = 0;
        this.transitioning = false;
        this.transitionTimer = 0;
    }

    /**
     * @param {number} dt
     * @param {number} timeScale
     */
    tick(dt, timeScale = 1) {
        if (this.transitioning) {
            this.transitionTimer -= dt;
            return;
        }
        const cfg = this.getActiveConfig();
        if (!this.isEndless() && cfg.objective?.type === OBJECTIVE_TYPES.SURVIVAL) {
            this.elapsedMs += dt * timeScale;
        }
    }

    /**
     * @param {boolean} isMatch
     * @param {number} combo
     */
    onMatchResult(isMatch, combo) {
        if (this.transitioning) return;
        if (isMatch) {
            this.bestStreak = Math.max(this.bestStreak, combo);
        } else if (!this.isEndless()) {
            const cfg = this.getActiveConfig();
            if (cfg.objective?.type === OBJECTIVE_TYPES.STREAK) {
                this.bestStreak = 0;
            }
        }
    }

    /**
     * @param {number} score
     * @param {number} combo
     * @param {import('./Entities.js').Crystal[]} crystals
     * @returns {boolean}
     */
    checkObjectiveComplete(score, combo, crystals) {
        if (this.transitioning || this.isEndless()) return false;

        const cfg = /** @type {LevelDefinition} */ (this.getActiveConfig());
        const obj = cfg.objective;
        const levelScore = score - this.scoreAtLevelStart;

        switch (obj.type) {
            case OBJECTIVE_TYPES.SCORE:
                return levelScore >= obj.target;
            case OBJECTIVE_TYPES.SURVIVAL:
                return this.elapsedMs >= obj.target * 1000;
            case OBJECTIVE_TYPES.STREAK:
                return Math.max(this.bestStreak, combo) >= obj.target;
            case OBJECTIVE_TYPES.CLEARANCE:
                return crystals.length > 0 && crystals.every(c => c.height < obj.target);
            default:
                return false;
        }
    }

    /**
     * @param {number} score
     * @param {number} combo
     * @param {import('./Entities.js').Crystal[]} crystals
     * @returns {ObjectiveProgress}
     */
    getObjectiveProgress(score, combo, crystals) {
        if (this.isEndless()) {
            const endlessLevel = Math.floor(score / ENDLESS_CONFIG.growth.scoreDivisor) + 1;
            const nextThreshold = endlessLevel * ENDLESS_CONFIG.growth.scoreDivisor;
            const prevThreshold = (endlessLevel - 1) * ENDLESS_CONFIG.growth.scoreDivisor;
            const span = nextThreshold - prevThreshold;
            const current = score - prevThreshold;
            return {
                label: `Endless — reach ${nextThreshold} pts`,
                current,
                target: span,
                percent: span > 0 ? Math.min(1, current / span) : 0,
                levelName: `Wave ${endlessLevel}`,
                levelNumber: endlessLevel,
            };
        }

        const cfg = /** @type {LevelDefinition} */ (this.getActiveConfig());
        const obj = cfg.objective;
        const levelScore = score - this.scoreAtLevelStart;
        let current = 0;
        let target = obj.target;
        let label = cfg.description;

        switch (obj.type) {
            case OBJECTIVE_TYPES.SCORE:
                current = levelScore;
                label = `Score ${obj.target} points`;
                break;
            case OBJECTIVE_TYPES.SURVIVAL:
                current = this.elapsedMs / 1000;
                target = obj.target;
                label = `Survive ${obj.target} seconds`;
                break;
            case OBJECTIVE_TYPES.STREAK:
                current = Math.max(this.bestStreak, combo);
                label = `${obj.target}-match streak`;
                break;
            case OBJECTIVE_TYPES.CLEARANCE:
                if (crystals.length === 0) {
                    current = 0;
                    target = 1;
                } else {
                    const cleared = crystals.filter(c => c.height < obj.target).length;
                    current = cleared;
                    target = crystals.length;
                    label = `Clear all crystals (below ${obj.target}px)`;
                }
                break;
        }

        return {
            label,
            current,
            target,
            percent: target > 0 ? Math.min(1, current / target) : 0,
            levelName: cfg.name,
            levelNumber: cfg.id,
        };
    }

    /** @returns {boolean} */
    hasNextLevel() {
        return this.levelIndex < LEVELS.length - 1;
    }

    /** @returns {boolean} */
    advanceLevel() {
        if (!this.hasNextLevel()) {
            this.campaignComplete = true;
            return false;
        }
        this.levelIndex++;
        return true;
    }

    /** @param {number} durationMs */
    startTransition(durationMs = 2500) {
        this.transitioning = true;
        this.transitionTimer = durationMs;
    }

    /** @returns {boolean} */
    isTransitionComplete() {
        return this.transitioning && this.transitionTimer <= 0;
    }

    /** @returns {string} */
    getDisplayLevelText() {
        if (this.isEndless()) return '∞';
        const cfg = /** @type {LevelDefinition} */ (this.getActiveConfig());
        return String(cfg.id);
    }
}
