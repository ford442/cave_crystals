// @ts-check
/** @import { PowerUpDefinition, PowerUpActivation } from './types.js' */

import { CONTENT } from './content/ContentRegistry.js';

/**
 * Upper-snake alias for every catalog id (`POWER_UP_TYPES.LANE_SHOCKWAVE === 'lane_shockwave'`),
 * derived from `src/data/powerups.json`.
 * @type {Readonly<Record<string, string>>}
 */
export const POWER_UP_TYPES = Object.freeze(Object.fromEntries(
    CONTENT.powerUps.map(def => [def.id.toUpperCase(), def.id])
));

/** @type {Readonly<Record<'ON_SHOOT' | 'ON_ACTIVATE' | 'ON_PICKUP', PowerUpActivation>>} */
export const ACTIVATION_MODES = {
    ON_SHOOT: 'on_shoot',
    ON_ACTIVATE: 'on_activate',
    ON_PICKUP: 'on_pickup',
};

/**
 * Data-driven power-up catalog keyed by id, in authored order. Effect behaviour is chosen
 * by `effect.kind` (see PowerUpManager / validateContent.POWER_UP_EFFECT_KINDS).
 * @type {Readonly<Record<string, PowerUpDefinition>>}
 */
export const POWER_UPS = Object.freeze(Object.fromEntries(CONTENT.powerUps.map(def => [def.id, def])));

/** Drop pool used when a level does not declare `powerUpPool` (and in endless mode). */
/** @type {readonly string[]} */
export const DEFAULT_POWER_UP_POOL = CONTENT.defaultPowerUpPool;

/** Minimum combo before power-up drops can roll. */
export const POWER_UP_MIN_COMBO = CONTENT.drops.minCombo;

/** Base chance added per combo point above minimum. */
export const POWER_UP_COMBO_BONUS = CONTENT.drops.comboBonus;
