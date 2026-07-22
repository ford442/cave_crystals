// @ts-check
/**
 * Boss encounter state machine: intro → phase(telegraph/surge/vulnerable)×N → defeat.
 * Formation heights and vulnerable masks come from WASM (with JS fallbacks).
 */

/** @import { BossDefinition, BossHudState, BossPhaseDefinition } from './types.js' */

import { wasmManager } from './WasmManager.js';
import { getBossById, getBossForLevelId, getBossPhase } from './BossDefinitions.js';

/** @typedef {'idle' | 'intro' | 'phase' | 'vulnerable' | 'defeat'} BossState */

/**
 * @typedef {Object} BossUpdateResult
 * @property {boolean} active
 * @property {boolean} defeated
 * @property {boolean} justEnteredVulnerable
 * @property {boolean} justSurged
 * @property {boolean} justDefeated
 * @property {string | null} phaseId
 */

export class BossController {
    constructor() {
        /** @type {BossDefinition | null} */
        this.definition = null;
        /** @type {BossState} */
        this.state = 'idle';
        /** @type {number} */
        this.hp = 0;
        /** @type {number} */
        this.maxHp = 0;
        /** @type {number} */
        this.phaseIndex = 0;
        /** @type {number} */
        this.timerMs = 0;
        /** @type {number} */
        this.seed = 1;
        /** @type {number} */
        this.lanes = 5;
        /** @type {Float64Array | null} */
        this.targetHeights = null;
        /** @type {number} */
        this.vulnerableMask = 0;
        /** @type {'telegraph' | 'surge' | 'vulnerable'} */
        this.phaseStep = 'telegraph';
        /** @type {number} */
        this.telegraphProgress = 0;
        /** @type {boolean} */
        this._surgeFired = false;
        /** @type {boolean} */
        this._formationApplied = false;
    }

    reset() {
        this.definition = null;
        this.state = 'idle';
        this.hp = 0;
        this.maxHp = 0;
        this.phaseIndex = 0;
        this.timerMs = 0;
        this.seed = 1;
        this.lanes = 5;
        this.targetHeights = null;
        this.vulnerableMask = 0;
        this.phaseStep = 'telegraph';
        this.telegraphProgress = 0;
        this._surgeFired = false;
        this._formationApplied = false;
    }

    /** @returns {boolean} */
    isActive() {
        return this.state !== 'idle' && this.state !== 'defeat';
    }

    /** @returns {boolean} */
    isBusy() {
        return this.state !== 'idle';
    }

    /** @returns {boolean} */
    isDefeated() {
        return this.state === 'defeat';
    }

    /**
     * @param {string} bossId
     * @param {{ seed?: number, lanes?: number }} [opts]
     * @returns {boolean}
     */
    start(bossId, opts = {}) {
        const def = getBossById(bossId);
        if (!def) return false;
        return this._begin(def, opts);
    }

    /**
     * @param {number} levelId
     * @param {{ seed?: number, lanes?: number }} [opts]
     * @returns {boolean}
     */
    startForLevel(levelId, opts = {}) {
        const def = getBossForLevelId(levelId);
        if (!def) return false;
        return this._begin(def, opts);
    }

    /**
     * @param {BossDefinition} def
     * @param {{ seed?: number, lanes?: number }} [opts]
     * @returns {boolean}
     */
    _begin(def, opts = {}) {
        this.definition = def;
        this.seed = (opts.seed ?? 1) >>> 0 || 1;
        this.lanes = opts.lanes ?? 5;
        this.maxHp = Math.max(1, def.hp | 0);
        this.hp = this.maxHp;
        this.phaseIndex = 0;
        this.timerMs = 0;
        this.telegraphProgress = 0;
        this._surgeFired = false;
        this._formationApplied = false;
        this.phaseStep = 'telegraph';
        this.state = 'intro';
        this._refreshFormation(0);
        return true;
    }

    /** @param {number} formationPhase */
    _refreshFormation(formationPhase) {
        this.targetHeights = wasmManager.generateBossHeights(this.seed + formationPhase * 97, formationPhase, this.lanes);
        this.vulnerableMask = wasmManager.getBossVulnerableMask(formationPhase, this.lanes);
    }

    /** @returns {BossPhaseDefinition | null} */
    _currentPhase() {
        if (!this.definition) return null;
        return getBossPhase(this.definition, this.phaseIndex);
    }

    /**
     * Snap crystals to the current formation profile (mirrored top/bottom).
     * @param {import('./Entities.js').Crystal[]} crystals
     * @param {number} [colorCount]
     */
    applyFormationToCrystals(crystals, colorCount = 5) {
        if (!this.targetHeights) return;
        const heights = this.targetHeights;
        const lock = Boolean(this.definition?.colorLockAlternating);
        for (const c of crystals) {
            if (c.lane < 0 || c.lane >= heights.length) continue;
            c.height = heights[c.lane];
            c.displayHeight = c.height;
            if (lock) {
                // Alternating color locks: even lanes locked to color 0, odd to color 1
                c.colorIdx = (c.lane + (c.type === 'bottom' ? 1 : 0)) % Math.max(1, colorCount);
            }
        }
        this._formationApplied = true;
    }

    /**
     * Drive crystal growth during the active boss encounter.
     * @param {import('./Entities.js').Crystal[]} crystals
     * @param {number} dt
     * @param {number} timeScale
     * @param {number} canvasHeight
     * @param {number} [colorCount]
     */
    applyGrowth(crystals, dt, timeScale, canvasHeight, colorCount = 5) {
        if (!this.isActive() || !this.targetHeights) return;

        const phase = this._currentPhase();
        let growth = 0;

        if (this.state === 'intro') {
            growth = 0;
        } else if (this.state === 'phase' && this.phaseStep === 'surge' && phase) {
            growth = (phase.surgeGrowth || 0.5) * timeScale;
        } else if (this.state === 'phase' || this.state === 'vulnerable') {
            growth = (phase?.idleGrowth ?? 0.04) * timeScale;
        }

        const maxPerCrystal = canvasHeight * 0.48;
        const lock = Boolean(this.definition?.colorLockAlternating);
        const colors = Math.max(1, colorCount | 0);
        for (const c of crystals) {
            if (growth > 0) {
                c.height = Math.min(maxPerCrystal, c.height + growth);
            }
            // Softly pull toward formation silhouette
            if (c.lane >= 0 && c.lane < this.targetHeights.length) {
                const target = this.targetHeights[c.lane];
                c.height += (target - c.height) * 0.015 * timeScale;
            }
            if (lock) {
                c.colorIdx = (c.lane + (c.type === 'bottom' ? 1 : 0)) % colors;
            }
        }
    }

    /**
     * @param {number} lane
     * @returns {boolean}
     */
    isLaneVulnerable(lane) {
        if (this.state !== 'vulnerable' && !(this.state === 'phase' && this.phaseStep === 'vulnerable')) {
            return false;
        }
        return ((this.vulnerableMask >>> lane) & 1) === 1;
    }

    /**
     * Deal damage when the player matches a vulnerable lane.
     * @param {number} lane
     * @param {boolean} isMatch
     * @returns {number} damage dealt (0 or 1)
     */
    onMatch(lane, isMatch) {
        if (!isMatch || !this.isActive()) return 0;
        if (!this.isLaneVulnerable(lane)) return 0;
        if (this.hp <= 0) return 0;
        this.hp -= 1;
        if (this.hp <= 0) {
            this.hp = 0;
            this.state = 'defeat';
            this.timerMs = 0;
        }
        return 1;
    }

    /** @returns {number} */
    getFireRateMultiplier() {
        if (!this.isActive() || !this.definition) return 1;
        const m = this.definition.fireRateMultiplier;
        return typeof m === 'number' && m > 0 ? m : 1;
    }

    /**
     * @param {number} dt
     * @param {number} [timeScale]
     * @returns {BossUpdateResult}
     */
    update(dt, timeScale = 1) {
        /** @type {BossUpdateResult} */
        const result = {
            active: this.isBusy(),
            defeated: false,
            justEnteredVulnerable: false,
            justSurged: false,
            justDefeated: false,
            phaseId: null,
        };

        if (this.state === 'idle') return result;

        const scaled = dt * timeScale;
        this.timerMs += scaled;

        if (this.state === 'intro') {
            const introMs = this.definition?.introMs ?? 2500;
            if (!this._formationApplied) {
                // Caller applies formation once crystals exist
            }
            if (this.timerMs >= introMs) {
                this.timerMs = 0;
                this.state = 'phase';
                this.phaseStep = 'telegraph';
                this._surgeFired = false;
                const phase = this._currentPhase();
                if (phase) this._refreshFormation(phase.formationPhase);
            }
            return result;
        }

        if (this.state === 'defeat') {
            const defeatMs = this.definition?.defeatMs ?? 2000;
            if (this.timerMs >= defeatMs) {
                result.defeated = true;
                result.justDefeated = true;
                this.state = 'idle';
            }
            return result;
        }

        const phase = this._currentPhase();
        if (!phase) {
            this.state = 'defeat';
            this.timerMs = 0;
            return result;
        }
        result.phaseId = phase.id;

        if (this.phaseStep === 'telegraph') {
            this.telegraphProgress = wasmManager.getBossTelegraphProgress(this.timerMs, phase.telegraphMs);
            if (this.timerMs >= phase.telegraphMs) {
                this.timerMs = 0;
                this.phaseStep = 'surge';
                this.telegraphProgress = 1;
                this._surgeFired = false;
            }
            return result;
        }

        if (this.phaseStep === 'surge') {
            if (!this._surgeFired) {
                this._surgeFired = true;
                result.justSurged = true;
            }
            if (this.timerMs >= phase.surgeMs) {
                this.timerMs = 0;
                this.phaseStep = 'vulnerable';
                this.state = 'vulnerable';
                result.justEnteredVulnerable = true;
                this.vulnerableMask = wasmManager.getBossVulnerableMask(phase.formationPhase, this.lanes);
            }
            return result;
        }

        // vulnerable step
        this.telegraphProgress = 0;
        if (this.hp <= 0) {
            this.state = 'defeat';
            this.timerMs = 0;
            return result;
        }

        if (this.timerMs >= phase.vulnerableMs) {
            this.phaseIndex += 1;
            if (this.phaseIndex >= (this.definition?.phases?.length ?? 0)) {
                // Ran out of phases without kill — keep last vulnerable briefly then force vulnerable until HP cleared
                // Soft fail-forward: open all lanes and stay vulnerable
                this.phaseIndex = (this.definition?.phases?.length ?? 1) - 1;
                this.vulnerableMask = wasmManager.getBossVulnerableMask(99, this.lanes);
                this.timerMs = 0;
                this.phaseStep = 'vulnerable';
                this.state = 'vulnerable';
            } else {
                const next = this._currentPhase();
                if (next) this._refreshFormation(next.formationPhase);
                this.timerMs = 0;
                this.phaseStep = 'telegraph';
                this.state = 'phase';
                this._surgeFired = false;
                this.telegraphProgress = 0;
            }
        }

        return result;
    }

    /** @returns {BossHudState} */
    getHudState() {
        const def = this.definition;
        const active = this.isBusy();
        return {
            active,
            name: def?.name || '',
            hp: this.hp,
            maxHp: this.maxHp,
            telegraph: this.telegraphProgress,
            phaseIndex: this.phaseIndex,
            phaseCount: def?.phases?.length ?? 0,
            state: this.state,
            phaseStep: this.phaseStep,
            colors: def?.colors || {
                primary: '#FF4466',
                secondary: '#FFD700',
                telegraph: '#FF8800',
                vulnerable: '#44FFAA',
            },
            vulnerableMask: this.vulnerableMask,
            lanes: this.lanes,
        };
    }
}
