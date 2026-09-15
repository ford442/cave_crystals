// @ts-check

/**
 * Achievement events emitted by gameplay systems. Each achievement listens to exactly one.
 * @typedef {'match' | 'combo' | 'boss_defeat' | 'level_complete' | 'survival'} AchievementEvent
 */

/**
 * @typedef {Object} AchievementDefinition
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} icon
 * @property {AchievementEvent} event
 * @property {(payload: any, stats: import('./SaveManager.js').GameStats) => boolean} check
 */

/**
 * Data-driven achievement catalog. Pure, side-effect-free predicates so unlock logic
 * can be unit tested without a running game. Wiring/persistence lives in
 * systems/AchievementSystem.js.
 * @type {AchievementDefinition[]}
 */
export const ACHIEVEMENTS = [
    {
        id: 'first_match',
        name: 'First Contact',
        description: 'Match your first crystal.',
        icon: '✨',
        event: 'match',
        check: (payload, stats) => stats.totalMatches >= 1,
    },
    {
        id: 'combo_10',
        name: 'Chain Reaction',
        description: 'Reach a combo of 10.',
        icon: '🔥',
        event: 'combo',
        check: (payload) => payload.combo >= 10,
    },
    {
        id: 'boss_convergence',
        name: 'Convergence Broken',
        description: "Defeat the Convergence boss.",
        icon: '👑',
        event: 'boss_defeat',
        check: (payload) => payload.bossId === 'convergence',
    },
    {
        id: 'perfect_level',
        name: 'Flawless',
        description: 'Complete a campaign level with zero mismatches.',
        icon: '💎',
        event: 'level_complete',
        check: (payload) => !payload.endless && payload.mismatches === 0,
    },
    {
        id: 'survivor_60',
        name: 'Survivor',
        description: 'Survive 60 seconds in Endless mode.',
        icon: '⏱️',
        event: 'survival',
        check: (payload) => payload.elapsedMs >= 60_000,
    },
];

/** @type {Map<string, AchievementDefinition>} */
export const ACHIEVEMENTS_BY_ID = new Map(ACHIEVEMENTS.map((def) => [def.id, def]));

/**
 * @param {AchievementEvent} event
 * @returns {AchievementDefinition[]}
 */
export function getAchievementsForEvent(event) {
    return ACHIEVEMENTS.filter((def) => def.event === event);
}
