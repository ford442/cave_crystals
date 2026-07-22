/** @import { PowerUpDefinition, PowerUpActivation } from './types.js' */

/** @type {Readonly<Record<'RAINBOW' | 'FREEZE' | 'LANE_SHOCKWAVE', string>>} */
export const POWER_UP_TYPES = {
    RAINBOW: 'rainbow',
    FREEZE: 'freeze',
    LANE_SHOCKWAVE: 'lane_shockwave',
};

/** @type {Readonly<Record<'ON_SHOOT' | 'ON_ACTIVATE' | 'ON_PICKUP', PowerUpActivation>>} */
export const ACTIVATION_MODES = {
    ON_SHOOT: 'on_shoot',
    ON_ACTIVATE: 'on_activate',
    ON_PICKUP: 'on_pickup',
};

/**
 * Data-driven power-up catalog. Effect behavior is implemented in PowerUpEffects.js.
 * @type {Record<string, PowerUpDefinition>}
 */
export const POWER_UPS = {
    [POWER_UP_TYPES.RAINBOW]: {
        id: POWER_UP_TYPES.RAINBOW,
        name: 'Rainbow Spore',
        activation: ACTIVATION_MODES.ON_SHOOT,
        durationMs: null,
        rarity: 0.09,
        color: '#ffffff',
        hudLabel: 'RAINBOW',
        icon: '◈',
        description: 'Next shot matches any color',
    },
    [POWER_UP_TYPES.FREEZE]: {
        id: POWER_UP_TYPES.FREEZE,
        name: 'Crystal Freeze',
        activation: ACTIVATION_MODES.ON_PICKUP,
        durationMs: 5000,
        rarity: 0.07,
        color: '#88ddff',
        hudLabel: 'FREEZE',
        icon: '❄',
        description: 'Stop crystal growth for 5s',
    },
    [POWER_UP_TYPES.LANE_SHOCKWAVE]: {
        id: POWER_UP_TYPES.LANE_SHOCKWAVE,
        name: 'Lane Shockwave',
        activation: ACTIVATION_MODES.ON_ACTIVATE,
        durationMs: null,
        rarity: 0.06,
        color: '#ffaa00',
        hudLabel: 'SHOCK',
        icon: '⚡',
        description: 'Shrink crystals in your lane (E / tap USE)',
        activateKey: 'KeyE',
    },
};

/** Minimum combo before power-up drops can roll. */
export const POWER_UP_MIN_COMBO = 3;

/** Base chance added per combo point above minimum. */
export const POWER_UP_COMBO_BONUS = 0.015;
