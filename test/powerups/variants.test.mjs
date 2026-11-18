import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PowerUpManager } from '../../src/modules/PowerUpManager.js';
import { POWER_UPS, POWER_UP_TYPES, DEFAULT_POWER_UP_POOL } from '../../src/modules/PowerUpDefinitions.js';
import { getEffectiveGrowthRate } from '../../src/modules/PowerUpEffects.js';

function makeCrystal(lane, height) {
    return { lane, height, colorIdx: 0, flash: 0, matchFlash: 0, velScaleY: 0, velScaleX: 0 };
}

describe('data-driven power-up catalog', () => {
    it('derives POWER_UP_TYPES aliases from the data', () => {
        assert.equal(POWER_UP_TYPES.RAINBOW, 'rainbow');
        assert.equal(POWER_UP_TYPES.FAULT_QUAKE, 'fault_quake');
        assert.equal(Object.keys(POWER_UP_TYPES).length, Object.keys(POWER_UPS).length);
    });

    it('prism volley grants three rainbow shots per pickup', () => {
        const pm = new PowerUpManager();
        pm.grant('prism_volley');
        assert.equal(pm.getHeldCount('prism_volley'), 3);
        assert.equal(pm.hasShotModifierHeld(), true);
        for (let i = 0; i < 3; i++) assert.deepEqual(pm.consumeShotModifiers(), { rainbow: true });
        assert.deepEqual(pm.consumeShotModifiers(), {});
        assert.equal(pm.hasShotModifierHeld(), false);
    });

    it('spends shot modifiers in catalog order', () => {
        const pm = new PowerUpManager();
        pm.grant('prism_volley');
        pm.grant('rainbow');
        pm.consumeShotModifiers();
        assert.equal(pm.getHeldCount('rainbow'), 0, 'rainbow comes first in the catalog');
        assert.equal(pm.getHeldCount('prism_volley'), 3);
    });

    it('temporal drift scales growth; freeze wins when both are active', () => {
        const pm = new PowerUpManager();
        assert.equal(pm.getGrowthScale(), 1);
        pm.grant('temporal_drift');
        assert.equal(pm.getGrowthScale(), 0.4);
        assert.equal(pm.isGrowthFrozen(), false);
        assert.ok(Math.abs(getEffectiveGrowthRate(1, pm.getGrowthScale()) - 0.4) < 1e-12);
        pm.grant('freeze');
        assert.equal(pm.getGrowthScale(), 0);
        assert.equal(pm.isGrowthFrozen(), true);
        pm.update(POWER_UPS.freeze.durationMs + 1);
        assert.equal(pm.getGrowthScale(), 0.4, 'drift outlasts freeze');
        pm.update(POWER_UPS.temporal_drift.durationMs);
        assert.equal(pm.getGrowthScale(), 1);
    });

    it('fault quake shrinks the target lane and both neighbours', () => {
        const pm = new PowerUpManager();
        const crystals = [0, 1, 2, 3, 4].map(l => makeCrystal(l, 100));
        pm.grant('fault_quake');
        assert.equal(pm.hasActivatableHeld(), true);
        const result = pm.activateHeld(2, crystals);
        assert.equal(result.typeId, 'fault_quake');
        assert.deepEqual(result.lanes, [1, 2, 3]);
        assert.deepEqual(crystals.map(c => c.height), [100, 45, 45, 45, 100]);
        assert.equal(pm.hasActivatableHeld(), false);
    });

    it('fault quake at the edge skips lanes that do not exist', () => {
        const pm = new PowerUpManager();
        const crystals = [0, 1, 2].map(l => makeCrystal(l, 100));
        pm.grant('fault_quake');
        assert.deepEqual(pm.activateHeld(0, crystals).lanes, [0, 1]);
    });

    it('activates the first held on-activate power-up in catalog order unless one is preferred', () => {
        const pm = new PowerUpManager();
        pm.grant('fault_quake');
        pm.grant('lane_shockwave');
        assert.equal(pm.getNextActivatableId(), 'lane_shockwave');
        assert.equal(pm.activateHeld(0, [], 'fault_quake').typeId, 'fault_quake');
        assert.equal(pm.activateHeld(0, []).typeId, 'lane_shockwave');
        assert.equal(pm.activateHeld(0, []), null);
    });

    it('rolls drops only from the active pool', () => {
        const pm = new PowerUpManager();
        assert.deepEqual([...pm.getPool()], [...DEFAULT_POWER_UP_POOL]);
        pm.setPool(['fault_quake']);
        pm.setRng(() => 0); // always inside the first entry's band
        assert.equal(pm.rollPickup(10), 'fault_quake');
        pm.setPool(null);
        assert.equal(pm.rollPickup(10), 'rainbow');
    });

    it('default-pool drops match the pre-migration hard-coded catalog roll for roll', () => {
        // Same order and rarities as the old JS catalog, so seeded runs (and replays) are unchanged.
        const legacy = [
            { id: 'rainbow', rarity: 0.09 },
            { id: 'freeze', rarity: 0.07 },
            { id: 'lane_shockwave', rarity: 0.06 },
        ];
        assert.deepEqual(DEFAULT_POWER_UP_POOL.map(id => ({ id, rarity: POWER_UPS[id].rarity })), legacy);
    });
});
