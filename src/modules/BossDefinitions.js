// @ts-check
/** @import { BossDefinition, BossPhaseDefinition } from './types.js' */

import bossesData from '../data/bosses.json' with { type: 'json' };

/**
 * @returns {BossDefinition[]}
 */
export function getAllBosses() {
    return /** @type {BossDefinition[]} */ (bossesData.bosses || []);
}

/**
 * @param {string} id
 * @returns {BossDefinition | null}
 */
export function getBossById(id) {
    if (!id) return null;
    return getAllBosses().find((b) => b.id === id) || null;
}

/**
 * @param {number} levelId
 * @returns {BossDefinition | null}
 */
export function getBossForLevelId(levelId) {
    return getAllBosses().find((b) => b.triggerLevelId === levelId) || null;
}

/**
 * @param {BossDefinition} def
 * @param {number} index
 * @returns {BossPhaseDefinition | null}
 */
export function getBossPhase(def, index) {
    if (!def?.phases?.length) return null;
    if (index < 0 || index >= def.phases.length) return null;
    return def.phases[index];
}
