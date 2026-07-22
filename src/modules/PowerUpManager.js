/** @import { ActivePowerUpTimer, HudPowerUpSlot, PowerUpDefinition, SporeModifiers } from './types.js' */

import {
    POWER_UPS,
    POWER_UP_TYPES,
    ACTIVATION_MODES,
    POWER_UP_MIN_COMBO,
    POWER_UP_COMBO_BONUS,
} from './PowerUpDefinitions.js';
import { applyLaneShockwave, rollPowerUpDrop } from './PowerUpEffects.js';

/**
 * Owns held inventory, timed effects, and activation plumbing for power-ups.
 */
export class PowerUpManager {
    constructor() {
        /** @type {Record<string, number>} */
        this.held = {};
        /** @type {ActivePowerUpTimer[]} */
        this.activeTimers = [];
        /** @type {number} */
        this.totalMatches = 0;
        /** @type {() => number} */
        this._rng = Math.random;
    }

    /** @param {() => number} rng */
    setRng(rng) {
        this._rng = rng;
    }

    reset() {
        this.held = {};
        this.activeTimers = [];
        this.totalMatches = 0;
    }

    /** @param {string} typeId @param {number} [count] */
    grant(typeId, count = 1) {
        const def = POWER_UPS[typeId];
        if (!def) return false;

        if (def.activation === ACTIVATION_MODES.ON_PICKUP) {
            this._startTimedEffect(typeId, def.durationMs || 0, count);
            return true;
        }

        this.held[typeId] = (this.held[typeId] || 0) + count;
        return true;
    }

    /**
     * @param {string} typeId
     * @param {number} durationMs
     * @param {number} [stacks]
     */
    _startTimedEffect(typeId, durationMs, stacks = 1) {
        const existing = this.activeTimers.find(t => t.typeId === typeId);
        if (existing) {
            existing.remainingMs = Math.max(existing.remainingMs, durationMs);
            existing.durationMs = Math.max(existing.durationMs, durationMs);
            existing.stacks = (existing.stacks || 1) + stacks - 1;
            return;
        }
        this.activeTimers.push({
            typeId,
            remainingMs: durationMs,
            durationMs,
            stacks,
        });
    }

    /**
     * @param {number} combo
     * @returns {string | null}
     */
    rollPickup(combo) {
        this.totalMatches++;
        const catalog = Object.values(POWER_UPS).map(def => ({ id: def.id, rarity: def.rarity }));
        return rollPowerUpDrop(
            catalog,
            combo,
            this._rng,
            POWER_UP_MIN_COMBO,
            POWER_UP_COMBO_BONUS
        );
    }

    /** @returns {SporeModifiers} */
    consumeShotModifiers() {
        if (!this.held[POWER_UP_TYPES.RAINBOW]) return {};
        this.held[POWER_UP_TYPES.RAINBOW]--;
        if (this.held[POWER_UP_TYPES.RAINBOW] <= 0) delete this.held[POWER_UP_TYPES.RAINBOW];
        return { rainbow: true };
    }

    /** @returns {boolean} */
    hasActivatableHeld() {
        return Object.entries(POWER_UPS).some(([id, def]) => {
            return def.activation === ACTIVATION_MODES.ON_ACTIVATE && (this.held[id] || 0) > 0;
        });
    }

    /**
     * @param {number} lane
     * @param {import('./Entities.js').Crystal[]} crystals
     * @param {string} [preferredType]
     * @returns {{ typeId: string, lane: number, affected: import('./types.js').Crystal[] } | null}
     */
    activateHeld(lane, crystals, preferredType) {
        const candidates = preferredType
            ? [preferredType]
            : Object.keys(POWER_UPS).filter(id => POWER_UPS[id].activation === ACTIVATION_MODES.ON_ACTIVATE);

        for (const typeId of candidates) {
            if (!this.held[typeId]) continue;
            this.held[typeId]--;
            if (this.held[typeId] <= 0) delete this.held[typeId];

            if (typeId === POWER_UP_TYPES.LANE_SHOCKWAVE) {
                return {
                    typeId,
                    lane,
                    affected: applyLaneShockwave(crystals, lane),
                };
            }
        }
        return null;
    }

    /** @param {number} dt */
    update(dt) {
        for (let i = this.activeTimers.length - 1; i >= 0; i--) {
            this.activeTimers[i].remainingMs -= dt;
            if (this.activeTimers[i].remainingMs <= 0) {
                this.activeTimers.splice(i, 1);
            }
        }
    }

    /** @returns {boolean} */
    isGrowthFrozen() {
        return this.activeTimers.some(t => t.typeId === POWER_UP_TYPES.FREEZE && t.remainingMs > 0);
    }

    /** @param {string} typeId @returns {PowerUpDefinition | undefined} */
    getDefinition(typeId) {
        return POWER_UPS[typeId];
    }

    /** @returns {HudPowerUpSlot[]} */
    getHudSlots() {
        /** @type {HudPowerUpSlot[]} */
        const slots = [];

        for (const [typeId, count] of Object.entries(this.held)) {
            const def = POWER_UPS[typeId];
            if (!def || count <= 0) continue;
            slots.push({
                typeId,
                label: def.hudLabel,
                color: def.color,
                icon: def.icon,
                count,
                remainingMs: null,
                durationMs: null,
                activation: def.activation,
            });
        }

        for (const timer of this.activeTimers) {
            const def = POWER_UPS[timer.typeId];
            if (!def) continue;
            slots.push({
                typeId: timer.typeId,
                label: def.hudLabel,
                color: def.color,
                icon: def.icon,
                count: timer.stacks || 1,
                remainingMs: timer.remainingMs,
                durationMs: timer.durationMs,
                activation: def.activation,
            });
        }

        return slots;
    }

    /** @returns {number} */
    getHeldCount(typeId) {
        return this.held[typeId] || 0;
    }
}
