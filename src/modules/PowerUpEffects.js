/** @import { CollisionResult, SporeModifiers } from './types.js' */

/**
 * Resolve whether a spore matches a crystal color, accounting for power-up modifiers.
 * @param {number} sporeColorIdx
 * @param {number} crystalColorIdx
 * @param {SporeModifiers} [modifiers]
 * @returns {boolean}
 */
export function resolveColorMatch(sporeColorIdx, crystalColorIdx, modifiers = {}) {
    if (modifiers.rainbow) return true;
    return sporeColorIdx === crystalColorIdx;
}

/**
 * Apply power-up semantics to a raw collision result from WASM/JS.
 * @param {CollisionResult} collision
 * @param {SporeModifiers} [modifiers]
 * @returns {CollisionResult}
 */
export function resolveCollisionResult(collision, modifiers = {}) {
    if (!modifiers.rainbow) return collision;
    return {
        topHit: collision.topHit,
        topMatch: collision.topHit,
        bottomHit: collision.bottomHit,
        bottomMatch: collision.bottomHit,
    };
}

/**
 * @param {number} baseGrowthRate
 * @param {boolean} frozen
 * @returns {number}
 */
export function getEffectiveGrowthRate(baseGrowthRate, frozen) {
    return frozen ? 0 : baseGrowthRate;
}

/**
 * Shrink all crystals in a lane — lane shockwave effect.
 * @param {import('./types.js').Crystal[]} crystals
 * @param {number} lane
 * @param {number} [shrinkAmount]
 * @param {number} [minHeight]
 * @returns {import('./types.js').Crystal[]}
 */
export function applyLaneShockwave(crystals, lane, shrinkAmount = 80, minHeight = 10) {
    /** @type {import('./types.js').Crystal[]} */
    const affected = [];
    for (const crystal of crystals) {
        if (crystal.lane !== lane) continue;
        crystal.height = Math.max(minHeight, crystal.height - shrinkAmount);
        crystal.flash = 1;
        crystal.matchFlash = 0.8;
        crystal.velScaleY -= 0.4;
        crystal.velScaleX += 0.15;
        affected.push(crystal);
    }
    return affected;
}

/**
 * Weighted random power-up roll from catalog entries.
 * @param {Array<{ id: string, rarity: number }>} catalog
 * @param {number} combo
 * @param {() => number} [rng]
 * @param {number} [minCombo]
 * @param {number} [comboBonus]
 * @returns {string | null}
 */
export function rollPowerUpDrop(
    catalog,
    combo,
    rng = Math.random,
    minCombo = 3,
    comboBonus = 0.015
) {
    if (combo < minCombo) return null;

    const chanceBoost = Math.min(combo - minCombo, 8) * comboBonus;
    const roll = rng();
    let cumulative = 0;

    for (const entry of catalog) {
        cumulative += entry.rarity + chanceBoost * 0.5;
        if (roll < cumulative) return entry.id;
    }
    return null;
}
