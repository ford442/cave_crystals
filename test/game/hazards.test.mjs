import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { HazardController } from '../../src/modules/HazardController.js';

/** Small seeded LCG so lane picks are reproducible. */
function seededRng(seed = 1) {
    let s = seed >>> 0;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function makeCrystals(lanes, height = 40, colorIdx = 0) {
    const out = [];
    for (let lane = 0; lane < lanes; lane++) {
        for (const type of ['top', 'bottom']) {
            out.push({ lane, type, height, colorIdx, flash: 0, velScaleX: 0, velScaleY: 0 });
        }
    }
    return out;
}

describe('HazardController', () => {
    it('reports no render state and unit growth without hazards', () => {
        const hz = new HazardController();
        hz.configure(undefined, { lanes: 5, colorCount: 3 });
        assert.equal(hz.hasHazards(), false);
        assert.equal(hz.getRenderState(), null);
        assert.equal(hz.getLaneGrowthMultiplier(2), 1);
        assert.deepEqual(hz.update(5000, 1, makeCrystals(5)), []);
    });

    it('overgrowth multiplies growth only on its lanes, and stacks', () => {
        const hz = new HazardController();
        hz.configure([
            { kind: 'overgrowth', lanes: [0, 3], growthMultiplier: 1.5 },
            { kind: 'overgrowth', lanes: [3], growthMultiplier: 2 },
        ], { lanes: 5, colorCount: 3 });
        assert.equal(hz.getLaneGrowthMultiplier(0), 1.5);
        assert.equal(hz.getLaneGrowthMultiplier(1), 1);
        assert.equal(hz.getLaneGrowthMultiplier(3), 3);
        assert.deepEqual(hz.getRenderState().overgrowth, [
            { lane: 0, multiplier: 1.5 },
            { lane: 3, multiplier: 3 },
        ]);
    });

    it('tremor warns, then jolts the warned lanes by `growth`', () => {
        const hz = new HazardController();
        hz.setRng(seededRng(7));
        hz.configure([{ kind: 'tremor', intervalMs: 4000, warningMs: 1000, growth: 30, laneCount: 2 }], { lanes: 6, colorCount: 4 });
        const crystals = makeCrystals(6);

        assert.deepEqual(hz.update(2900, 1, crystals), []);
        const warn = hz.update(200, 1, crystals);
        assert.equal(warn.length, 1);
        assert.equal(warn[0].type, 'warning');
        assert.equal(warn[0].lanes.length, 2);
        assert.notEqual(warn[0].lanes[0], warn[0].lanes[1]);

        const state = hz.getRenderState();
        assert.equal(state.warnings.length, 1);
        assert.ok(state.warnings[0].progress > 0 && state.warnings[0].progress < 1);
        assert.ok(crystals.every(c => c.height === 40), 'warning must not change heights');

        const fire = hz.update(1000, 1, crystals);
        assert.equal(fire[0].type, 'trigger');
        assert.deepEqual(fire[0].lanes, warn[0].lanes);
        for (const c of crystals) {
            assert.equal(c.height, warn[0].lanes.includes(c.lane) ? 70 : 40);
        }
        assert.equal(hz.getRenderState().warnings.length, 0);
    });

    it('tremor respects timeScale, explicit candidate lanes, and maxHeight', () => {
        const hz = new HazardController();
        hz.setRng(seededRng(3));
        hz.configure([{ kind: 'tremor', intervalMs: 2000, warningMs: 0, growth: 100, laneCount: 1, lanes: [4] }], { lanes: 5, colorCount: 3 });
        const crystals = makeCrystals(5, 50);
        assert.deepEqual(hz.update(2000, 0.5, crystals), [], 'half-speed time should not fire yet');
        const events = hz.update(2000, 0.5, crystals, { maxHeight: 120 });
        assert.deepEqual(events.map(e => e.type), ['warning', 'trigger']);
        assert.deepEqual(events[1].lanes, [4]);
        assert.ok(crystals.filter(c => c.lane === 4).every(c => c.height === 120));
    });

    it('color_shift always changes the lane color and keeps both crystals in sync', () => {
        const hz = new HazardController();
        hz.setRng(seededRng(11));
        hz.configure([{ kind: 'color_shift', intervalMs: 1000, warningMs: 0, laneCount: 3 }], { lanes: 5, colorCount: 4 });
        const crystals = makeCrystals(5, 40, 2);
        for (let round = 0; round < 20; round++) {
            const before = crystals.map(c => c.colorIdx);
            const [, trigger] = hz.update(1000, 1, crystals);
            assert.equal(trigger.lanes.length, 3);
            for (const lane of trigger.lanes) {
                const pair = crystals.filter(c => c.lane === lane);
                assert.equal(pair[0].colorIdx, pair[1].colorIdx);
                assert.notEqual(pair[0].colorIdx, before[crystals.indexOf(pair[0])]);
                assert.ok(pair[0].colorIdx >= 0 && pair[0].colorIdx < 4);
            }
        }
    });

    it('is deterministic for a given seed', () => {
        const run = () => {
            const hz = new HazardController();
            hz.setRng(seededRng(42));
            hz.configure([
                { kind: 'tremor', intervalMs: 1500, warningMs: 500, growth: 10, laneCount: 2 },
                { kind: 'color_shift', intervalMs: 2500, warningMs: 500, laneCount: 1 },
            ], { lanes: 7, colorCount: 5 });
            const crystals = makeCrystals(7);
            const log = [];
            for (let i = 0; i < 600; i++) log.push(...hz.update(16, 1, crystals));
            return { log, crystals };
        };
        assert.deepEqual(run(), run());
    });
});
