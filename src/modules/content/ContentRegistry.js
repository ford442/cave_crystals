// @ts-check
/**
 * Single loader for authored content. Importing this module validates every data file
 * and throws a ContentValidationError listing all problems, so bad content fails in
 * `npm run test:content` (and every other suite that imports gameplay code) rather than
 * mid-run. Everything exported is deep-frozen.
 */

/** @import { BossDefinition, CampaignArc, LevelDefinition, LevelRuntimeConfig, PowerUpDefinition } from '../types.js' */

import campaignData from '../../data/campaign.json' with { type: 'json' };
import powerUpData from '../../data/powerups.json' with { type: 'json' };
import bossData from '../../data/bosses.json' with { type: 'json' };
import { assertValidContent } from './validateContent.js';

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const v of Object.values(value)) deepFreeze(v);
    }
    return value;
}

/**
 * Build the indexed, frozen registry from raw content. Exposed for tests that want to
 * load fixture content; the game uses the default `CONTENT` instance.
 * @param {{ campaign: any, powerUps: any, bosses: any }} raw
 */
export function buildContentRegistry(raw) {
    assertValidContent(raw);
    const campaign = deepFreeze(structuredClone(raw.campaign));
    const powerUps = deepFreeze(structuredClone(raw.powerUps));
    const bosses = deepFreeze(structuredClone(raw.bosses));

    /** @type {readonly CampaignArc[]} */
    const arcs = campaign.arcs;
    /** @type {LevelDefinition[]} */
    const levels = [];
    /** @type {Map<number, string>} */
    const arcIdByLevelId = new Map();
    for (const arc of arcs) {
        for (const level of arc.levels) {
            levels.push(level);
            arcIdByLevelId.set(level.id, arc.id);
        }
    }

    /** @type {readonly PowerUpDefinition[]} */
    const powerUpList = powerUps.powerUps;
    /** @type {readonly BossDefinition[]} */
    const bossList = bosses.bosses;

    return Object.freeze({
        arcs,
        levels: Object.freeze(levels),
        arcIdByLevelId,
        /** @type {LevelRuntimeConfig} */
        endless: campaign.endless,
        powerUps: powerUpList,
        powerUpsById: new Map(powerUpList.map(p => [p.id, p])),
        /** @type {readonly string[]} */
        defaultPowerUpPool: powerUps.defaultPool,
        /** @type {{ minCombo: number, comboBonus: number }} */
        drops: powerUps.drops,
        bosses: bossList,
        bossesById: new Map(bossList.map(b => [b.id, b])),
    });
}

/** @typedef {ReturnType<typeof buildContentRegistry>} ContentRegistry */

export const CONTENT = buildContentRegistry({
    campaign: campaignData,
    powerUps: powerUpData,
    bosses: bossData,
});
