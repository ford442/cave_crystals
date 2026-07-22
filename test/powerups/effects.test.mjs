import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    resolveColorMatch,
    resolveCollisionResult,
    getEffectiveGrowthRate,
    applyLaneShockwave,
    rollPowerUpDrop,
} from '../../src/modules/PowerUpEffects.js';
import { PowerUpManager } from '../../src/modules/PowerUpManager.js';
import { POWER_UP_TYPES } from '../../src/modules/PowerUpDefinitions.js';

/** @param {number} lane @param {number} height @param {number} [colorIdx] */
function makeCrystal(lane, height, colorIdx = 0) {
    return {
        lane,
        height,
        colorIdx,
        flash: 0,
        matchFlash: 0,
        velScaleY: 0,
        velScaleX: 0,
    };
}

describe('PowerUpEffects', () => {
    it('resolveColorMatch matches any color when rainbow is active', () => {
        assert.equal(resolveColorMatch(0, 3, { rainbow: true }), true);
        assert.equal(resolveColorMatch(0, 3, {}), false);
        assert.equal(resolveColorMatch(2, 2, {}), true);
    });

    it('resolveCollisionResult upgrades hits to matches for rainbow spores', () => {
        const raw = { topHit: true, topMatch: false, bottomHit: false, bottomMatch: false };
        const resolved = resolveCollisionResult(raw, { rainbow: true });
        assert.equal(resolved.topMatch, true);
        assert.equal(resolved.bottomMatch, false);
    });

    it('getEffectiveGrowthRate returns zero while frozen', () => {
        assert.equal(getEffectiveGrowthRate(0.5, true), 0);
        assert.equal(getEffectiveGrowthRate(0.5, false), 0.5);
    });

    it('applyLaneShockwave shrinks only crystals in the target lane', () => {
        const crystals = [
            makeCrystal(0, 100),
            makeCrystal(0, 80, 1),
            makeCrystal(1, 90, 2),
        ];
        const affected = applyLaneShockwave(crystals, 0, 50, 10);
        assert.equal(affected.length, 2);
        assert.equal(crystals[0].height, 50);
        assert.equal(crystals[1].height, 30);
        assert.equal(crystals[2].height, 90);
    });

    it('rollPowerUpDrop respects combo threshold and rng', () => {
        const catalog = [
            { id: 'rainbow', rarity: 0.1 },
            { id: 'freeze', rarity: 0.1 },
        ];
        assert.equal(rollPowerUpDrop(catalog, 2, () => 0), null);
        assert.equal(rollPowerUpDrop(catalog, 5, () => 0.05), 'rainbow');
        assert.equal(rollPowerUpDrop(catalog, 5, () => 0.15), 'freeze');
    });
});

describe('PowerUpManager', () => {
    it('grants held rainbow and consumes it on shot', () => {
        const manager = new PowerUpManager();
        manager.grant(POWER_UP_TYPES.RAINBOW);
        assert.equal(manager.getHeldCount(POWER_UP_TYPES.RAINBOW), 1);

        const mods = manager.consumeShotModifiers();
        assert.deepEqual(mods, { rainbow: true });
        assert.equal(manager.getHeldCount(POWER_UP_TYPES.RAINBOW), 0);
        assert.deepEqual(manager.consumeShotModifiers(), {});
    });

    it('starts freeze timer immediately on grant', () => {
        const manager = new PowerUpManager();
        manager.grant(POWER_UP_TYPES.FREEZE);
        assert.equal(manager.isGrowthFrozen(), true);
        manager.update(2500);
        assert.equal(manager.isGrowthFrozen(), true);
        manager.update(2600);
        assert.equal(manager.isGrowthFrozen(), false);
    });

    it('activates lane shockwave from held inventory', () => {
        const manager = new PowerUpManager();
        const crystals = [makeCrystal(2, 120), makeCrystal(3, 100)];
        manager.grant(POWER_UP_TYPES.LANE_SHOCKWAVE);

        const result = manager.activateHeld(POWER_UP_TYPES.LANE_SHOCKWAVE, 2, crystals);
        assert.ok(result);
        assert.equal(result?.lane, 2);
        assert.equal(result?.affected.length, 1);
        assert.equal(crystals[0].height, 40);
        assert.equal(crystals[1].height, 100);
        assert.equal(manager.getHeldCount(POWER_UP_TYPES.LANE_SHOCKWAVE), 0);
    });

    it('exposes HUD slots for held and timed power-ups', () => {
        const manager = new PowerUpManager();
        manager.grant(POWER_UP_TYPES.RAINBOW, 2);
        manager.grant(POWER_UP_TYPES.FREEZE);
        const slots = manager.getHudSlots();
        assert.equal(slots.length, 2);
        assert.ok(slots.some(s => s.typeId === POWER_UP_TYPES.RAINBOW && s.count === 2));
        assert.ok(slots.some(s => s.typeId === POWER_UP_TYPES.FREEZE && s.remainingMs != null));
    });
});
