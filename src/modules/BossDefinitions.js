// @ts-check
/** @import { BossDefinition, BossPhaseDefinition } from './types.js' */

import { CONTENT } from './content/ContentRegistry.js';

/**
 * @returns {BossDefinition[]}
 */
export function getAllBosses() {
    return /** @type {BossDefinition[]} */ (CONTENT.bosses);
}

/**
 * @param {string} id
 * @returns {BossDefinition | null}
 */
export function getBossById(id) {
    if (!id) return null;
    return CONTENT.bossesById.get(id) || null;
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
