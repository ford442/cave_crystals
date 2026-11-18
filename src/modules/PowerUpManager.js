/** @import { ActivePowerUpTimer, HudPowerUpSlot, PowerUpDefinition, SporeModifiers } from './types.js' */

import {
    POWER_UPS,
    ACTIVATION_MODES,
    DEFAULT_POWER_UP_POOL,
    POWER_UP_MIN_COMBO,
    POWER_UP_COMBO_BONUS,
} from './PowerUpDefinitions.js';
import { applyLaneShockwave, rollPowerUpDrop } from './PowerUpEffects.js';

/** Catalog entries in authored order — iteration order decides which held item is used first. */
const CATALOG = Object.values(POWER_UPS);

/**
 * Owns held inventory, timed effects, and activation plumbing for power-ups.
 * Behaviour is chosen by each definition's `effect.kind`, never by its id, so new
 * power-ups that reuse an existing kind are pure data (src/data/powerups.json).
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
        /** @type {readonly string[]} */
        this._pool = DEFAULT_POWER_UP_POOL;
    }

    /**
     * Restrict drops to these ids (a level's `powerUpPool`); pass nothing for the default pool.
     * Unknown ids are ignored — content validation already rejects them.
     * @param {readonly string[] | null} [ids]
     */
    setPool(ids) {
        this._pool = ids && ids.length ? ids.filter(id => POWER_UPS[id]) : DEFAULT_POWER_UP_POOL;
    }

    /** @returns {readonly string[]} */
    getPool() {
        return this._pool;
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

        const perPickup = def.effect.kind === 'rainbow_shot' ? (def.effect.charges ?? 1) : 1;
        this.held[typeId] = (this.held[typeId] || 0) + count * perPickup;
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
        const catalog = this._pool.map(id => ({ id, rarity: POWER_UPS[id].rarity }));
        return rollPowerUpDrop(
            catalog,
            combo,
            this._rng,
            POWER_UP_MIN_COMBO,
            POWER_UP_COMBO_BONUS
        );
    }

    /** @param {string} typeId */
    _consumeOne(typeId) {
        this.held[typeId]--;
        if (this.held[typeId] <= 0) delete this.held[typeId];
    }

    /** @returns {string | null} First held on-shoot power-up, in catalog order. */
    _nextShotModifierId() {
        for (const def of CATALOG) {
            if (def.activation === ACTIVATION_MODES.ON_SHOOT && (this.held[def.id] || 0) > 0) return def.id;
        }
        return null;
    }

    /** @returns {boolean} */
    hasShotModifierHeld() {
        return this._nextShotModifierId() !== null;
    }

    /** @returns {SporeModifiers} */
    consumeShotModifiers() {
        const typeId = this._nextShotModifierId();
        if (!typeId) return {};
        this._consumeOne(typeId);
        // rainbow_shot is the only on_shoot effect kind today.
        return { rainbow: true };
    }

    /** @returns {string | null} First held on-activate power-up, in catalog order. */
    getNextActivatableId() {
        for (const def of CATALOG) {
            if (def.activation === ACTIVATION_MODES.ON_ACTIVATE && (this.held[def.id] || 0) > 0) return def.id;
        }
        return null;
    }

    /** @returns {boolean} */
    hasActivatableHeld() {
        return this.getNextActivatableId() !== null;
    }

    /**
     * Use a held on-activate power-up centred on `lane`.
     * @param {number} lane
     * @param {import('./types.js').Crystal[]} crystals
     * @param {string} [preferredType] Use this id if held; otherwise the first held in catalog order.
     * @returns {{ typeId: string, lane: number, lanes: number[], affected: import('./types.js').Crystal[] } | null}
     */
    activateHeld(lane, crystals, preferredType) {
        const typeId = preferredType && (this.held[preferredType] || 0) > 0
            && POWER_UPS[preferredType]?.activation === ACTIVATION_MODES.ON_ACTIVATE
            ? preferredType
            : this.getNextActivatableId();
        if (!typeId) return null;
        const effect = POWER_UPS[typeId].effect;
        this._consumeOne(typeId);

        if (effect.kind === 'lane_shockwave') {
            const radius = effect.radius ?? 0;
            const lanes = [];
            /** @type {import('./types.js').Crystal[]} */
            const affected = [];
            for (let l = lane - radius; l <= lane + radius; l++) {
                if (l < 0) continue;
                lanes.push(l);
                affected.push(...applyLaneShockwave(crystals, l, effect.shrink, effect.minHeight ?? 10));
            }
            return { typeId, lane, lanes, affected };
        }
        return { typeId, lane, lanes: [lane], affected: [] };
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

    /**
     * Combined growth multiplier from active growth_scale effects (strongest wins).
     * @returns {number}
     */
    getGrowthScale() {
        let scale = 1;
        for (const t of this.activeTimers) {
            if (t.remainingMs <= 0) continue;
            const effect = POWER_UPS[t.typeId]?.effect;
            if (effect?.kind === 'growth_scale') scale = Math.min(scale, effect.scale ?? 1);
        }
        return scale;
    }

    /** @returns {boolean} */
    isGrowthFrozen() {
        return this.getGrowthScale() === 0;
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

    /** @param {string} typeId @returns {number} */
    getHeldCount(typeId) {
        return this.held[typeId] || 0;
    }
}
