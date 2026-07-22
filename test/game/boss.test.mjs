import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BossController } from '../../src/modules/BossController.js';
import { getBossById } from '../../src/modules/BossDefinitions.js';

describe('BossController', () => {
    it('loads The Convergence definition', () => {
        const def = getBossById('convergence');
        assert.ok(def);
        assert.equal(def.name, 'The Convergence');
        assert.ok(def.phases.length >= 1);
    });

    it('runs intro → vulnerable → defeat', () => {
        const boss = new BossController();
        assert.equal(boss.start('convergence', { seed: 42, lanes: 7 }), true);
        assert.equal(boss.state, 'intro');
        assert.ok(boss.targetHeights);
        assert.equal(boss.targetHeights.length, 7);

        boss.timerMs = (boss.definition.introMs || 2800) + 1;
        boss.update(16, 1);
        assert.equal(boss.state, 'phase');
        assert.equal(boss.phaseStep, 'telegraph');

        const phase = boss.definition.phases[0];
        boss.timerMs = phase.telegraphMs + 1;
        const surged = boss.update(16, 1);
        assert.equal(boss.phaseStep, 'surge');
        assert.equal(surged.justSurged, true);

        boss.timerMs = phase.surgeMs + 1;
        const vuln = boss.update(16, 1);
        assert.equal(boss.state, 'vulnerable');
        assert.equal(vuln.justEnteredVulnerable, true);
        assert.ok(boss.vulnerableMask > 0);

        // Damage only on vulnerable lanes
        let dealt = 0;
        for (let lane = 0; lane < 7; lane++) {
            dealt += boss.onMatch(lane, true);
        }
        assert.ok(dealt > 0);
        assert.ok(boss.hp < boss.maxHp);

        // Finish the boss
        boss.vulnerableMask = 0xffffffff;
        while (boss.hp > 0) {
            boss.onMatch(0, true);
        }
        assert.equal(boss.state, 'defeat');

        boss.timerMs = (boss.definition.defeatMs || 2200) + 1;
        const done = boss.update(16, 1);
        assert.equal(done.justDefeated, true);
        assert.equal(boss.state, 'idle');
    });
});
