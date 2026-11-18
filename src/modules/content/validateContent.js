// @ts-check
/**
 * Validation for authored game content (`src/data/*.json`).
 *
 * Shape rules live in the specs below; rules that span fields or files (activation ↔ effect
 * compatibility, lane indices inside the level's lane count, boss ↔ level links, drop pools
 * that can actually roll every entry) are checked afterwards. Everything is pure so the
 * tests can feed malformed content straight in.
 */

import { checkValue, checkUniqueBy } from './schema.js';
import { COLORS } from '../Constants.js';

/** @typedef {import('./schema.js').FieldSpec} FieldSpec */

export const ID_PATTERN = /^[a-z][a-z0-9_]*$/;
export const MAX_LANES = 12;
export const MAX_COLORS = COLORS.length;
/** formationPhase values 0–2 are authored silhouettes; higher values select seeded sine waves with every lane vulnerable. */
export const MAX_FORMATION_PHASE = 15;

export const OBJECTIVE_TYPE_IDS = /** @type {const} */ (['score', 'survival', 'streak', 'clearance']);
export const ACTIVATION_IDS = /** @type {const} */ (['on_shoot', 'on_activate', 'on_pickup']);

/**
 * Power-up effect kinds the runtime implements. A new power-up that reuses one of these
 * (with its own tuning) is a data-only change; a new kind needs code in PowerUpManager.
 * `activation` is the only activation mode the kind's behaviour makes sense with.
 * @type {Record<string, { activation: typeof ACTIVATION_IDS[number], timed: boolean, fields: Record<string, FieldSpec> }>}
 */
export const POWER_UP_EFFECT_KINDS = {
    rainbow_shot: {
        activation: 'on_shoot',
        timed: false,
        fields: {
            charges: { type: 'number', required: true, integer: true, min: 1, max: 10 },
        },
    },
    growth_scale: {
        activation: 'on_pickup',
        timed: true,
        fields: {
            scale: { type: 'number', required: true, min: 0, max: 0.95 },
        },
    },
    lane_shockwave: {
        activation: 'on_activate',
        timed: false,
        fields: {
            shrink: { type: 'number', required: true, exclusiveMin: 0, max: 400 },
            minHeight: { type: 'number', min: 0, max: 100 },
            radius: { type: 'number', integer: true, min: 0, max: 3 },
        },
    },
};

/**
 * Lane hazard kinds the runtime implements (HazardController.js).
 * @type {Record<string, Record<string, FieldSpec>>}
 */
export const HAZARD_KINDS = {
    overgrowth: {
        lanes: { type: 'array', required: true, minItems: 1, uniqueItems: true, items: { type: 'number', integer: true, min: 0 } },
        growthMultiplier: { type: 'number', required: true, exclusiveMin: 0, max: 4 },
    },
    tremor: {
        intervalMs: { type: 'number', required: true, min: 1000 },
        warningMs: { type: 'number', required: true, min: 0 },
        growth: { type: 'number', required: true, exclusiveMin: 0, max: 120 },
        laneCount: { type: 'number', required: true, integer: true, min: 1 },
        lanes: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'number', integer: true, min: 0 } },
    },
    color_shift: {
        intervalMs: { type: 'number', required: true, min: 1000 },
        warningMs: { type: 'number', required: true, min: 0 },
        laneCount: { type: 'number', required: true, integer: true, min: 1 },
        lanes: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'number', integer: true, min: 0 } },
    },
};

const idSpec = /** @type {FieldSpec} */ ({ type: 'string', required: true, pattern: ID_PATTERN });
const nameSpec = /** @type {FieldSpec} */ ({ type: 'string', required: true, minLength: 1 });

/** @type {Record<string, FieldSpec>} */
const RUNTIME_CONFIG_FIELDS = {
    lanes: { type: 'number', required: true, integer: true, min: 2, max: MAX_LANES },
    colorCount: { type: 'number', required: true, integer: true, min: 1, max: MAX_COLORS },
    crystalHeight: {
        type: 'object',
        required: true,
        fields: {
            min: { type: 'number', required: true, min: 0, max: 200 },
            max: { type: 'number', required: true, min: 0, max: 200 },
        },
    },
    growth: {
        type: 'object',
        required: true,
        fields: {
            baseMultiplier: { type: 'number', required: true, exclusiveMin: 0, max: 5 },
            scoreDivisor: { type: 'number', required: true, exclusiveMin: 0 },
        },
    },
};

/** @type {FieldSpec} */
const LEVEL_SPEC = {
    type: 'object',
    fields: {
        id: { type: 'number', required: true, integer: true, min: 1 },
        name: nameSpec,
        ...RUNTIME_CONFIG_FIELDS,
        objective: {
            type: 'object',
            required: true,
            fields: {
                type: { type: 'string', required: true, enum: OBJECTIVE_TYPE_IDS },
                target: { type: 'number', required: true, exclusiveMin: 0 },
            },
        },
        description: nameSpec,
        bossId: { type: 'string', pattern: ID_PATTERN },
        hazards: {
            type: 'array',
            items: {
                type: 'object',
                allowUnknown: true, // per-kind fields are checked in validateHazard()
                fields: { kind: { type: 'string', required: true, enum: Object.keys(HAZARD_KINDS) } },
            },
        },
        powerUpPool: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', pattern: ID_PATTERN } },
    },
};

/** @type {FieldSpec} */
export const CAMPAIGN_SPEC = {
    type: 'object',
    fields: {
        endless: { type: 'object', required: true, fields: RUNTIME_CONFIG_FIELDS },
        arcs: {
            type: 'array',
            required: true,
            minItems: 1,
            items: {
                type: 'object',
                fields: {
                    id: idSpec,
                    name: nameSpec,
                    subtitle: { type: 'string', minLength: 1 },
                    color: { type: 'color' },
                    levels: { type: 'array', required: true, minItems: 1, items: LEVEL_SPEC },
                },
            },
        },
    },
};

/** @type {FieldSpec} */
export const POWER_UP_CATALOG_SPEC = {
    type: 'object',
    fields: {
        drops: {
            type: 'object',
            required: true,
            fields: {
                minCombo: { type: 'number', required: true, integer: true, min: 0 },
                comboBonus: { type: 'number', required: true, min: 0, max: 0.1 },
            },
        },
        defaultPool: { type: 'array', required: true, minItems: 1, uniqueItems: true, items: { type: 'string', pattern: ID_PATTERN } },
        powerUps: {
            type: 'array',
            required: true,
            minItems: 1,
            items: {
                type: 'object',
                fields: {
                    id: idSpec,
                    name: nameSpec,
                    activation: { type: 'string', required: true, enum: ACTIVATION_IDS },
                    durationMs: { type: 'number', nullable: true, exclusiveMin: 0 },
                    rarity: { type: 'number', required: true, min: 0, max: 1 },
                    color: { type: 'color', required: true },
                    hudLabel: { type: 'string', required: true, minLength: 1 },
                    icon: { type: 'string', required: true, minLength: 1 },
                    description: nameSpec,
                    activateKey: { type: 'string', pattern: /^(Key[A-Z]|Digit[0-9]|Space)$/ },
                    activateText: { type: 'string', minLength: 1 },
                    effect: {
                        type: 'object',
                        required: true,
                        allowUnknown: true, // per-kind fields are checked in validatePowerUps()
                        fields: { kind: { type: 'string', required: true, enum: Object.keys(POWER_UP_EFFECT_KINDS) } },
                    },
                },
            },
        },
    },
};

/** @type {FieldSpec} */
export const BOSS_CATALOG_SPEC = {
    type: 'object',
    fields: {
        bosses: {
            type: 'array',
            required: true,
            items: {
                type: 'object',
                fields: {
                    id: idSpec,
                    name: nameSpec,
                    triggerLevelId: { type: 'number', required: true, integer: true, min: 1 },
                    colors: {
                        type: 'object',
                        required: true,
                        fields: {
                            primary: { type: 'color', required: true },
                            secondary: { type: 'color', required: true },
                            telegraph: { type: 'color', required: true },
                            vulnerable: { type: 'color' },
                        },
                    },
                    hp: { type: 'number', required: true, integer: true, min: 1, max: 99 },
                    introMs: { type: 'number', min: 0 },
                    defeatMs: { type: 'number', min: 0 },
                    fireRateMultiplier: { type: 'number', exclusiveMin: 0, max: 1 },
                    colorLockAlternating: { type: 'boolean' },
                    phases: {
                        type: 'array',
                        required: true,
                        minItems: 1,
                        items: {
                            type: 'object',
                            fields: {
                                id: idSpec,
                                formationPhase: { type: 'number', required: true, integer: true, min: 0, max: MAX_FORMATION_PHASE },
                                telegraphMs: { type: 'number', required: true, min: 0 },
                                surgeMs: { type: 'number', required: true, min: 0 },
                                vulnerableMs: { type: 'number', required: true, exclusiveMin: 0 },
                                surgeGrowth: { type: 'number', min: 0, max: 5 },
                                idleGrowth: { type: 'number', min: 0, max: 1 },
                            },
                        },
                    },
                    rewards: {
                        type: 'object',
                        fields: {
                            scoreBonus: { type: 'number', integer: true, min: 0 },
                            powerUps: {
                                type: 'map',
                                keyPattern: ID_PATTERN,
                                values: { type: 'number', required: true, integer: true, min: 1, max: 10 },
                            },
                        },
                    },
                },
            },
        },
    },
};

/** @param {unknown} v @returns {v is Record<string, any>} */
function isObject(v) {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @param {unknown} v @returns {any[]} */
function arr(v) {
    return Array.isArray(v) ? v : [];
}

/**
 * @param {unknown} data powerups.json contents
 * @returns {string[]}
 */
export function validatePowerUps(data) {
    /** @type {string[]} */
    const errors = [];
    checkValue(data, { ...POWER_UP_CATALOG_SPEC, required: true }, 'powerups', errors);
    if (!isObject(data)) return errors;

    const list = arr(data.powerUps);
    checkUniqueBy(list, 'id', 'powerups.powerUps', errors);

    list.forEach((def, i) => {
        if (!isObject(def)) return;
        const path = `powerups.powerUps[${i}]`;
        const kind = isObject(def.effect) ? def.effect.kind : undefined;
        const kindSpec = typeof kind === 'string' ? POWER_UP_EFFECT_KINDS[kind] : undefined;
        if (!kindSpec) return; // enum error already reported

        checkValue(
            def.effect,
            { type: 'object', fields: { kind: { type: 'string' }, ...kindSpec.fields } },
            `${path}.effect`,
            errors
        );
        if (def.activation !== kindSpec.activation) {
            errors.push(`${path}.activation: effect "${kind}" requires activation "${kindSpec.activation}", got "${def.activation}"`);
        }
        const hasDuration = typeof def.durationMs === 'number';
        if (kindSpec.timed && !hasDuration) {
            errors.push(`${path}.durationMs: timed effect "${kind}" needs a positive durationMs`);
        }
        if (!kindSpec.timed && hasDuration) {
            errors.push(`${path}.durationMs: effect "${kind}" is not timed; use null`);
        }
        if (def.activation === 'on_activate' && !def.activateText) {
            errors.push(`${path}.activateText: on_activate power-ups need the floating text shown on use`);
        }
    });

    const ids = new Set(list.filter(isObject).map(d => d.id));
    arr(data.defaultPool).forEach((id, i) => {
        if (!ids.has(id)) errors.push(`powerups.defaultPool[${i}]: unknown power-up "${id}"`);
    });
    if (isObject(data.drops) && Array.isArray(data.defaultPool)) {
        checkPoolReach('powerups.defaultPool', data.defaultPool, list, data.drops, errors);
    }
    return errors;
}

/**
 * At max combo every pool entry gets +4×comboBonus (see rollPowerUpDrop). If the cumulative
 * probability passes 1, entries past that point can never drop — almost always an authoring slip.
 * @param {string} path
 * @param {unknown[]} pool
 * @param {any[]} catalog
 * @param {Record<string, any>} drops
 * @param {string[]} errors
 */
function checkPoolReach(path, pool, catalog, drops, errors) {
    const byId = new Map(catalog.filter(isObject).map(d => [d.id, d]));
    const perEntryBoost = 8 * (Number(drops.comboBonus) || 0) * 0.5;
    let total = 0;
    for (const id of pool) {
        const def = byId.get(id);
        if (!def || typeof def.rarity !== 'number') return; // reported elsewhere
        total += def.rarity + perEntryBoost;
    }
    if (total > 1 + 1e-9) {
        errors.push(`${path}: drop chances sum to ${total.toFixed(3)} at max combo (> 1), so later entries can never drop`);
    }
}

/**
 * @param {unknown} data bosses.json contents
 * @param {{ powerUpIds?: Set<string> }} [refs]
 * @returns {string[]}
 */
export function validateBosses(data, refs = {}) {
    /** @type {string[]} */
    const errors = [];
    checkValue(data, { ...BOSS_CATALOG_SPEC, required: true }, 'bosses', errors);
    if (!isObject(data)) return errors;

    const list = arr(data.bosses);
    checkUniqueBy(list, 'id', 'bosses.bosses', errors);
    list.forEach((boss, i) => {
        if (!isObject(boss)) return;
        checkUniqueBy(arr(boss.phases), 'id', `bosses.bosses[${i}].phases`, errors);
        const rewards = isObject(boss.rewards) && isObject(boss.rewards.powerUps) ? boss.rewards.powerUps : {};
        if (refs.powerUpIds) {
            for (const id of Object.keys(rewards)) {
                if (!refs.powerUpIds.has(id)) {
                    errors.push(`bosses.bosses[${i}].rewards.powerUps.${id}: unknown power-up "${id}"`);
                }
            }
        }
    });
    return errors;
}

/**
 * @param {Record<string, any>} hazard
 * @param {number} lanes
 * @param {number} colorCount
 * @param {string} path
 * @param {string[]} errors
 */
function validateHazard(hazard, lanes, colorCount, path, errors) {
    const fields = HAZARD_KINDS[hazard.kind];
    if (!fields) return; // enum error already reported
    checkValue(hazard, { type: 'object', fields: { kind: { type: 'string' }, ...fields } }, path, errors);

    const laneList = arr(hazard.lanes);
    laneList.forEach((lane, j) => {
        if (typeof lane === 'number' && lane >= lanes) {
            errors.push(`${path}.lanes[${j}]: lane ${lane} is outside this level's ${lanes} lanes`);
        }
    });
    if (typeof hazard.laneCount === 'number') {
        const available = laneList.length || lanes;
        if (hazard.laneCount > available) {
            errors.push(`${path}.laneCount: ${hazard.laneCount} exceeds the ${available} lane(s) it can pick from`);
        }
    }
    if (typeof hazard.warningMs === 'number' && typeof hazard.intervalMs === 'number'
        && hazard.warningMs >= hazard.intervalMs) {
        errors.push(`${path}.warningMs: must be shorter than intervalMs (${hazard.intervalMs})`);
    }
    if (hazard.kind === 'color_shift' && colorCount < 2) {
        errors.push(`${path}: color_shift needs a level with at least 2 colors`);
    }
}

/**
 * @param {unknown} data campaign.json contents
 * @param {{ bosses?: any[], powerUps?: any[], drops?: Record<string, any> }} [refs]
 * @returns {string[]}
 */
export function validateCampaign(data, refs = {}) {
    /** @type {string[]} */
    const errors = [];
    checkValue(data, { ...CAMPAIGN_SPEC, required: true }, 'campaign', errors);
    if (!isObject(data)) return errors;

    const arcs = arr(data.arcs);
    checkUniqueBy(arcs, 'id', 'campaign.arcs', errors);

    const powerUpIds = refs.powerUps ? new Set(refs.powerUps.filter(isObject).map(p => p.id)) : null;
    const bossById = refs.bosses ? new Map(refs.bosses.filter(isObject).map(b => [b.id, b])) : null;
    /** @type {Map<number, Record<string, any>>} */
    const levelById = new Map();

    let position = 0;
    arcs.forEach((arc, a) => {
        if (!isObject(arc)) return;
        arr(arc.levels).forEach((level, l) => {
            position += 1;
            if (!isObject(level)) return;
            const path = `campaign.arcs[${a}].levels[${l}]`;

            if (typeof level.id === 'number') {
                if (levelById.has(level.id)) errors.push(`${path}.id: duplicate level id ${level.id}`);
                levelById.set(level.id, level);
                // The HUD shows the id as the level number, so ids run 1..N across arcs in order.
                if (level.id !== position) {
                    errors.push(`${path}.id: expected ${position} (level ids run 1..N in campaign order), got ${level.id}`);
                }
            }

            const h = level.crystalHeight;
            if (isObject(h) && typeof h.min === 'number' && typeof h.max === 'number' && h.min > h.max) {
                errors.push(`${path}.crystalHeight: min (${h.min}) is greater than max (${h.max})`);
            }
            const obj = level.objective;
            if (isObject(obj) && obj.type === 'streak' && typeof obj.target === 'number' && !Number.isInteger(obj.target)) {
                errors.push(`${path}.objective.target: streak targets must be whole matches`);
            }

            const lanes = typeof level.lanes === 'number' ? level.lanes : MAX_LANES;
            const colors = typeof level.colorCount === 'number' ? level.colorCount : MAX_COLORS;
            arr(level.hazards).forEach((hz, k) => {
                if (isObject(hz)) validateHazard(hz, lanes, colors, `${path}.hazards[${k}]`, errors);
            });

            if (powerUpIds && Array.isArray(level.powerUpPool)) {
                level.powerUpPool.forEach((id, k) => {
                    if (!powerUpIds.has(id)) errors.push(`${path}.powerUpPool[${k}]: unknown power-up "${id}"`);
                });
                if (refs.drops) checkPoolReach(`${path}.powerUpPool`, level.powerUpPool, refs.powerUps, refs.drops, errors);
            }

            if (bossById && typeof level.bossId === 'string') {
                const boss = bossById.get(level.bossId);
                if (!boss) {
                    errors.push(`${path}.bossId: unknown boss "${level.bossId}"`);
                } else if (boss.triggerLevelId !== level.id) {
                    errors.push(`${path}.bossId: boss "${level.bossId}" has triggerLevelId ${boss.triggerLevelId}, expected ${level.id}`);
                }
            }
        });
    });

    if (bossById) {
        for (const [id, boss] of bossById) {
            const level = levelById.get(boss.triggerLevelId);
            if (!level) {
                errors.push(`bosses."${id}".triggerLevelId: no campaign level with id ${boss.triggerLevelId}`);
            } else if (level.bossId !== id) {
                errors.push(`bosses."${id}".triggerLevelId: level ${boss.triggerLevelId} does not declare bossId "${id}"`);
            }
        }
    }

    return errors;
}

/**
 * Validate every content file together, including cross-file references.
 * @param {{ campaign: unknown, powerUps: unknown, bosses: unknown }} bundle
 * @returns {string[]}
 */
export function validateContent({ campaign, powerUps, bosses }) {
    const powerUpErrors = validatePowerUps(powerUps);
    const powerUpList = isObject(powerUps) ? arr(powerUps.powerUps) : [];
    const powerUpIds = new Set(powerUpList.filter(isObject).map(p => p.id));
    const bossErrors = validateBosses(bosses, { powerUpIds });
    const campaignErrors = validateCampaign(campaign, {
        bosses: isObject(bosses) ? arr(bosses.bosses) : [],
        powerUps: powerUpList,
        drops: isObject(powerUps) && isObject(powerUps.drops) ? powerUps.drops : undefined,
    });
    return [...campaignErrors, ...powerUpErrors, ...bossErrors];
}

export class ContentValidationError extends Error {
    /** @param {string[]} errors */
    constructor(errors) {
        super(`Invalid game content (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n  - ${errors.join('\n  - ')}`);
        this.name = 'ContentValidationError';
        this.errors = errors;
    }
}

/**
 * @param {{ campaign: unknown, powerUps: unknown, bosses: unknown }} bundle
 */
export function assertValidContent(bundle) {
    const errors = validateContent(bundle);
    if (errors.length) throw new ContentValidationError(errors);
}
