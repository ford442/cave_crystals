import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ProgressionManager } from '../../src/modules/ProgressionManager.js';
import { LEVELS, ARCS, getArcForLevelId, getLevelIndexForBoss } from '../../src/modules/LevelDefinitions.js';
import { BossController } from '../../src/modules/BossController.js';

describe('campaign progression across arcs', () => {
    it('plays arc I then arc II as one campaign', () => {
        const p = new ProgressionManager();
        const seen = [p.getActiveConfig().id];
        while (p.advanceLevel()) seen.push(p.getActiveConfig().id);
        assert.deepEqual(seen, LEVELS.map(l => l.id));
        assert.equal(p.campaignComplete, true);
        assert.equal(getArcForLevelId(5).id, ARCS[0].id);
        assert.equal(getArcForLevelId(6).id, ARCS[1].id);
        assert.equal(getArcForLevelId(999), null);
    });

    it('finds the level that hosts each boss', () => {
        assert.equal(getLevelIndexForBoss('convergence'), 4);
        assert.equal(getLevelIndexForBoss('fractured_heart'), 9);
        assert.equal(getLevelIndexForBoss('nobody'), -1);
    });

    it('reports arc II objectives through the same progress API', () => {
        const p = new ProgressionManager();
        p.levelIndex = LEVELS.findIndex(l => l.id === 7); // survival
        p.beginLevel(0);
        p.tick(25_000, 1);
        const progress = p.getObjectiveProgress(0, 0, []);
        assert.equal(progress.levelName, 'Tremor Gallery');
        assert.equal(progress.target, 50);
        assert.equal(progress.current, 25);
        assert.equal(p.checkObjectiveComplete(0, 0, []), false);
        p.tick(25_000, 1);
        assert.equal(p.checkObjectiveComplete(0, 0, []), true);
    });

    it('runs The Fractured Heart through all five phases', () => {
        const boss = new BossController();
        assert.equal(boss.startForLevel(10, { seed: 9, lanes: 7 }), true);
        assert.equal(boss.definition.id, 'fractured_heart');
        boss.timerMs = boss.definition.introMs + 1;
        boss.update(16, 1);
        const seenPhases = [];
        for (let i = 0; i < boss.definition.phases.length; i++) {
            const phase = boss.definition.phases[boss.phaseIndex];
            seenPhases.push(phase.id);
            boss.timerMs = phase.telegraphMs + 1; boss.update(16, 1);
            boss.timerMs = phase.surgeMs + 1; boss.update(16, 1);
            assert.equal(boss.state, 'vulnerable');
            assert.ok(boss.vulnerableMask > 0);
            boss.timerMs = phase.vulnerableMs + 1; boss.update(16, 1);
        }
        assert.deepEqual(seenPhases, boss.definition.phases.map(p => p.id));
        assert.equal(boss.hp, boss.maxHp);
    });
});
