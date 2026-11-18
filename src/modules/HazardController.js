// @ts-check
/**
 * Lane hazards declared per level in `src/data/campaign.json`.
 *
 * - overgrowth  — static: listed lanes grow `growthMultiplier`× faster.
 * - tremor      — every `intervalMs`, telegraphs `laneCount` lanes for `warningMs`, then
 *                 jolts their crystals up by `growth` px.
 * - color_shift — same cadence; re-rolls the crystal color in the chosen lanes.
 *
 * Lane picks draw from the injected gameplay RNG, so hazards replay deterministically.
 * Pure logic: Game turns returned events into juice, the renderer reads getRenderState().
 */

/** @import { Crystal, LevelHazard } from './types.js' */

/**
 * @typedef {Object} HazardEvent
 * @property {'tremor' | 'color_shift'} kind
 * @property {'warning' | 'trigger'} type
 * @property {number[]} lanes
 */

/**
 * @typedef {Object} HazardWarning
 * @property {'tremor' | 'color_shift'} kind
 * @property {number[]} lanes
 * @property {number} progress 0 → 1 across the warning window.
 */

/**
 * @typedef {Object} HazardRenderState
 * @property {Array<{ lane: number, multiplier: number }>} overgrowth
 * @property {HazardWarning[]} warnings
 */

/**
 * @typedef {Object} TimedHazard
 * @property {LevelHazard} def
 * @property {number} timerMs
 * @property {'idle' | 'warning'} phase
 * @property {number[]} lanes
 */

export class HazardController {
    constructor() {
        /** @type {() => number} */
        this._rng = Math.random;
        /** @type {number} */
        this.lanes = 0;
        /** @type {number} */
        this.colorCount = 1;
        /** @type {Float64Array} */
        this._laneGrowth = new Float64Array(0);
        /** @type {TimedHazard[]} */
        this._timed = [];
        /** @type {Array<{ lane: number, multiplier: number }>} */
        this._overgrowth = [];
    }

    /** @param {() => number} rng */
    setRng(rng) {
        this._rng = rng;
    }

    reset() {
        this.configure([], { lanes: 0, colorCount: 1 });
    }

    /**
     * @param {readonly LevelHazard[] | null | undefined} defs
     * @param {{ lanes: number, colorCount: number }} opts
     */
    configure(defs, { lanes, colorCount }) {
        this.lanes = lanes;
        this.colorCount = colorCount;
        this._laneGrowth = new Float64Array(lanes).fill(1);
        this._timed = [];
        this._overgrowth = [];

        for (const def of defs || []) {
            if (def.kind === 'overgrowth') {
                for (const lane of def.lanes || []) {
                    if (lane < 0 || lane >= lanes) continue;
                    this._laneGrowth[lane] *= def.growthMultiplier ?? 1;
                }
            } else if (def.kind === 'tremor' || def.kind === 'color_shift') {
                this._timed.push({ def, timerMs: 0, phase: 'idle', lanes: [] });
            }
        }
        for (let lane = 0; lane < lanes; lane++) {
            if (this._laneGrowth[lane] !== 1) {
                this._overgrowth.push({ lane, multiplier: this._laneGrowth[lane] });
            }
        }
    }

    /** @returns {boolean} */
    hasHazards() {
        return this._timed.length > 0 || this._overgrowth.length > 0;
    }

    /**
     * @param {number} lane
     * @returns {number}
     */
    getLaneGrowthMultiplier(lane) {
        return this._laneGrowth[lane] ?? 1;
    }

    /**
     * Pick `count` distinct lanes from the hazard's candidates (partial Fisher–Yates).
     * @param {LevelHazard} def
     * @returns {number[]}
     */
    _pickLanes(def) {
        const pool = (def.lanes && def.lanes.length ? def.lanes : Array.from({ length: this.lanes }, (_, i) => i))
            .filter(l => l >= 0 && l < this.lanes);
        const count = Math.min(def.laneCount ?? 1, pool.length);
        for (let i = 0; i < count; i++) {
            const j = i + Math.floor(this._rng() * (pool.length - i));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        return pool.slice(0, count).sort((a, b) => a - b);
    }

    /**
     * Advance timed hazards and apply any that fire this frame.
     * @param {number} dt
     * @param {number} timeScale
     * @param {Crystal[]} crystals
     * @param {{ maxHeight?: number }} [opts]
     * @returns {HazardEvent[]}
     */
    update(dt, timeScale, crystals, opts = {}) {
        /** @type {HazardEvent[]} */
        const events = [];
        const maxHeight = opts.maxHeight ?? Infinity;

        for (const h of this._timed) {
            const interval = h.def.intervalMs ?? 0;
            const warning = h.def.warningMs ?? 0;
            const kind = /** @type {'tremor' | 'color_shift'} */ (h.def.kind);
            h.timerMs += dt * timeScale;

            if (h.phase === 'idle' && h.timerMs >= interval - warning) {
                h.phase = 'warning';
                h.lanes = this._pickLanes(h.def);
                events.push({ kind, type: 'warning', lanes: h.lanes });
            }
            if (h.phase === 'warning' && h.timerMs >= interval) {
                if (kind === 'tremor') this._applyTremor(h, crystals, maxHeight);
                else this._applyColorShift(h, crystals);
                events.push({ kind, type: 'trigger', lanes: h.lanes });
                h.timerMs = 0;
                h.phase = 'idle';
                h.lanes = [];
            }
        }
        return events;
    }

    /**
     * @param {TimedHazard} h
     * @param {Crystal[]} crystals
     * @param {number} maxHeight
     */
    _applyTremor(h, crystals, maxHeight) {
        const growth = h.def.growth ?? 0;
        for (const c of crystals) {
            if (!h.lanes.includes(c.lane)) continue;
            c.height = Math.min(maxHeight, c.height + growth);
            c.flash = 1;
            c.velScaleY += 0.35;
            c.velScaleX -= 0.1;
        }
    }

    /**
     * Both crystals in a lane switch to the same new color (never their current one).
     * @param {TimedHazard} h
     * @param {Crystal[]} crystals
     */
    _applyColorShift(h, crystals) {
        if (this.colorCount < 2) return;
        for (const lane of h.lanes) {
            const inLane = crystals.filter(c => c.lane === lane);
            if (!inLane.length) continue;
            const current = inLane[0].colorIdx;
            const next = (current + 1 + Math.floor(this._rng() * (this.colorCount - 1))) % this.colorCount;
            for (const c of inLane) {
                c.colorIdx = next;
                c.flash = 1;
                c.velScaleX += 0.2;
            }
        }
    }

    /** @returns {HazardRenderState | null} */
    getRenderState() {
        if (!this.hasHazards()) return null;
        /** @type {HazardWarning[]} */
        const warnings = [];
        for (const h of this._timed) {
            if (h.phase !== 'warning') continue;
            const interval = h.def.intervalMs ?? 0;
            const warning = h.def.warningMs ?? 0;
            const into = h.timerMs - (interval - warning);
            warnings.push({
                kind: /** @type {'tremor' | 'color_shift'} */ (h.def.kind),
                lanes: h.lanes,
                progress: warning > 0 ? Math.min(1, Math.max(0, into / warning)) : 1,
            });
        }
        return { overgrowth: this._overgrowth, warnings };
    }
}
