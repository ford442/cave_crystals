// @ts-check
/** @import { CampaignArc, LevelDefinition, LevelRuntimeConfig, GameMode, ObjectiveType } from './types.js' */

import { CONTENT } from './content/ContentRegistry.js';

/** @type {Readonly<Record<'SCORE' | 'SURVIVAL' | 'STREAK' | 'CLEARANCE', ObjectiveType>>} */
export const OBJECTIVE_TYPES = {
    SCORE: 'score',
    SURVIVAL: 'survival',
    STREAK: 'streak',
    CLEARANCE: 'clearance',
};

/** @type {Readonly<Record<'CAMPAIGN' | 'ENDLESS', GameMode>>} */
export const GAME_MODES = {
    CAMPAIGN: 'campaign',
    ENDLESS: 'endless',
};

/**
 * Campaign arcs, authored in `src/data/campaign.json` (validated on load).
 * @type {readonly CampaignArc[]}
 */
export const ARCS = CONTENT.arcs;

/**
 * Every campaign level in play order, flattened across arcs.
 * @type {readonly LevelDefinition[]}
 */
export const LEVELS = CONTENT.levels;

/** Endless mode tuning — separate from campaign levels. */
/** @type {LevelRuntimeConfig} */
export const ENDLESS_CONFIG = CONTENT.endless;

/**
 * @param {number} levelId
 * @returns {CampaignArc | null}
 */
export function getArcForLevelId(levelId) {
    const arcId = CONTENT.arcIdByLevelId.get(levelId);
    return ARCS.find(a => a.id === arcId) || null;
}

/**
 * Campaign index (0-based) of the level that hosts `bossId`, or -1.
 * @param {string} bossId
 * @returns {number}
 */
export function getLevelIndexForBoss(bossId) {
    return LEVELS.findIndex(l => l.bossId === bossId);
}
