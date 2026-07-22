/** @import { LevelDefinition, GameMode, ObjectiveType } from './types.js' */

/** @type {Readonly<Record<'SCORE' | 'SURVIVAL' | 'STREAK' | 'CLEARANCE', ObjectiveType>>} */
export const OBJECTIVE_TYPES = {
    SCORE: 'score',
    SURVIVAL: 'survival',
    STREAK: 'streak',
    CLEARANCE: 'clearance',
};

/** @type {Record<string, GameMode>} */
export const GAME_MODES = {
    CAMPAIGN: 'campaign',
    ENDLESS: 'endless',
};

/**
 * Data-driven level definitions. Rules live here — not in Game.js.
 * @type {LevelDefinition[]}
 */
export const LEVELS = [
    {
        id: 1,
        name: 'Crystal Awakening',
        lanes: 5,
        colorCount: 3,
        crystalHeight: { min: 20, max: 50 },
        growth: { baseMultiplier: 0.75, scoreDivisor: 1000 },
        objective: { type: OBJECTIVE_TYPES.SCORE, target: 300 },
        description: 'Score 300 points',
    },
    {
        id: 2,
        name: 'Narrow Passage',
        lanes: 4,
        colorCount: 3,
        crystalHeight: { min: 30, max: 70 },
        growth: { baseMultiplier: 0.9, scoreDivisor: 900 },
        objective: { type: OBJECTIVE_TYPES.SURVIVAL, target: 45 },
        description: 'Survive 45 seconds',
    },
    {
        id: 3,
        name: 'Perfect Harmony',
        lanes: 6,
        colorCount: 4,
        crystalHeight: { min: 25, max: 60 },
        growth: { baseMultiplier: 1.0, scoreDivisor: 700 },
        objective: { type: OBJECTIVE_TYPES.STREAK, target: 8 },
        description: 'Hit an 8-match streak',
    },
    {
        id: 4,
        name: 'Deep Clearance',
        lanes: 6,
        colorCount: 4,
        crystalHeight: { min: 50, max: 90 },
        growth: { baseMultiplier: 1.1, scoreDivisor: 600 },
        objective: { type: OBJECTIVE_TYPES.CLEARANCE, target: 35 },
        description: 'Shrink all crystals below 35px',
    },
    {
        id: 5,
        name: 'Amber Trial',
        lanes: 7,
        colorCount: 5,
        crystalHeight: { min: 35, max: 75 },
        growth: { baseMultiplier: 1.25, scoreDivisor: 450 },
        objective: { type: OBJECTIVE_TYPES.SCORE, target: 800 },
        description: 'Score 800 points',
    },
];

/** Endless mode tuning — separate from campaign levels. */
/** @type {import('./types.js').LevelRuntimeConfig} */
export const ENDLESS_CONFIG = {
    lanes: 7,
    colorCount: 5,
    crystalHeight: { min: 20, max: 60 },
    growth: { baseMultiplier: 1.0, scoreDivisor: 500 },
};
