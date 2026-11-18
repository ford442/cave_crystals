import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import campaignData from '../../src/data/campaign.json' with { type: 'json' };
import powerUpData from '../../src/data/powerups.json' with { type: 'json' };
import bossData from '../../src/data/bosses.json' with { type: 'json' };
import {
    validateContent,
    validateCampaign,
    validatePowerUps,
    validateBosses,
    ContentValidationError,
} from '../../src/modules/content/validateContent.js';
import { buildContentRegistry, CONTENT } from '../../src/modules/content/ContentRegistry.js';

function freshBundle() {
    return structuredClone({ campaign: campaignData, powerUps: powerUpData, bosses: bossData });
}

/**
 * Apply `mutate` to a copy of the shipped content and assert validation reports `expected`.
 * @param {(b: ReturnType<typeof freshBundle>) => void} mutate
 * @param {RegExp} expected
 */
function expectError(mutate, expected) {
    const bundle = freshBundle();
    mutate(bundle);
    const errors = validateContent(bundle);
    assert.ok(
        errors.some(e => expected.test(e)),
        `expected an error matching ${expected}, got:\n  ${errors.join('\n  ') || '(no errors)'}`
    );
    return errors;
}

const level = (b, id) => b.campaign.arcs.flatMap(a => a.levels).find(l => l.id === id);
const powerUp = (b, id) => b.powerUps.powerUps.find(p => p.id === id);
const boss = (b, id) => b.bosses.bosses.find(x => x.id === id);

describe('shipped content', () => {
    it('validates with zero errors', () => {
        assert.deepEqual(validateContent(freshBundle()), []);
    });

    it('loads two arcs and ten sequential levels', () => {
        assert.equal(CONTENT.arcs.length, 2);
        assert.deepEqual(CONTENT.levels.map(l => l.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        assert.equal(CONTENT.arcIdByLevelId.get(5), 'awakening');
        assert.equal(CONTENT.arcIdByLevelId.get(6), 'fracture');
    });

    it('ends each arc with its boss', () => {
        for (const arc of CONTENT.arcs) {
            const finale = arc.levels[arc.levels.length - 1];
            assert.ok(finale.bossId, `${arc.id} finale should declare a boss`);
            assert.equal(CONTENT.bossesById.get(finale.bossId).triggerLevelId, finale.id);
        }
    });

    it('arc II uses every hazard kind and every power-up variant', () => {
        const arc2 = CONTENT.arcs[1].levels;
        const kinds = new Set(arc2.flatMap(l => (l.hazards || []).map(h => h.kind)));
        assert.deepEqual([...kinds].sort(), ['color_shift', 'overgrowth', 'tremor']);
        const pooled = new Set(arc2.flatMap(l => l.powerUpPool || []));
        for (const def of CONTENT.powerUps) assert.ok(pooled.has(def.id), `${def.id} should drop somewhere in arc II`);
    });

    it('keeps arc I on the original default pool so existing replays stay byte-identical', () => {
        assert.deepEqual([...CONTENT.defaultPowerUpPool], ['rainbow', 'freeze', 'lane_shockwave']);
        for (const l of CONTENT.arcs[0].levels) {
            assert.equal(l.powerUpPool, undefined);
            assert.equal(l.hazards, undefined);
        }
    });

    it('is deep-frozen', () => {
        assert.ok(Object.isFrozen(CONTENT.levels[0]));
        assert.ok(Object.isFrozen(CONTENT.levels[0].growth));
        assert.ok(Object.isFrozen(CONTENT.powerUps[0].effect));
        assert.throws(() => { CONTENT.levels[0].lanes = 99; }, TypeError);
    });
});

describe('loader fails fast', () => {
    it('buildContentRegistry throws ContentValidationError listing every problem', () => {
        const bundle = freshBundle();
        level(bundle, 1).lanes = 'five';
        powerUp(bundle, 'freeze').color = 'blue';
        boss(bundle, 'convergence').hp = 0;
        assert.throws(
            () => buildContentRegistry(bundle),
            (err) => {
                assert.ok(err instanceof ContentValidationError);
                assert.equal(err.errors.length, 3, err.message);
                assert.match(err.message, /3 problems/);
                assert.match(err.message, /levels\[0\]\.lanes/);
                assert.match(err.message, /powerUps\[1\]\.color/);
                assert.match(err.message, /bosses\[0\]\.hp/);
                return true;
            }
        );
    });

    it('rejects non-object roots', () => {
        assert.match(validateCampaign(null).join('\n'), /campaign: must not be null/);
        assert.match(validatePowerUps([]).join('\n'), /powerups: expected object, got array/);
        assert.match(validateBosses(undefined).join('\n'), /bosses: is required/);
    });
});

describe('campaign validation', () => {
    it('requires level fields', () => {
        expectError(b => { delete level(b, 3).objective; }, /levels\[2\]\.objective: is required/);
        expectError(b => { delete level(b, 1).growth.scoreDivisor; }, /growth\.scoreDivisor: is required/);
        expectError(b => { delete b.campaign.endless; }, /campaign\.endless: is required/);
    });

    it('rejects wrong types and out-of-range numbers', () => {
        expectError(b => { level(b, 2).lanes = '4'; }, /lanes: expected finite number, got string/);
        expectError(b => { level(b, 2).lanes = 40; }, /lanes: must be <= 12/);
        expectError(b => { level(b, 2).colorCount = 9; }, /colorCount: must be <= 5/);
        expectError(b => { level(b, 2).lanes = 4.5; }, /lanes: must be an integer/);
        expectError(b => { level(b, 2).growth.baseMultiplier = 0; }, /baseMultiplier: must be > 0/);
    });

    it('rejects unknown fields so typos cannot silently no-op', () => {
        expectError(b => { level(b, 5).bossID = 'convergence'; }, /levels\[4\]\.bossID: unknown field/);
        expectError(b => { b.campaign.arcs[0].colour = '#fff'; }, /arcs\[0\]\.colour: unknown field/);
    });

    it('rejects unknown objective types and fractional streaks', () => {
        expectError(b => { level(b, 1).objective.type = 'speedrun'; }, /"speedrun" is not one of score, survival, streak, clearance/);
        expectError(b => { level(b, 3).objective.target = 7.5; }, /streak targets must be whole matches/);
    });

    it('requires ids to run 1..N in campaign order', () => {
        expectError(b => { level(b, 7).id = 70; }, /expected 7 \(level ids run 1\.\.N/);
        expectError(b => { level(b, 2).id = 1; }, /duplicate level id 1/);
    });

    it('rejects inverted crystal height ranges', () => {
        expectError(b => { level(b, 4).crystalHeight = { min: 90, max: 50 }; }, /min \(90\) is greater than max \(50\)/);
    });

    it('rejects empty arcs and duplicate arc ids', () => {
        expectError(b => { b.campaign.arcs[1].levels = []; }, /arcs\[1\]\.levels: must have at least 1 item/);
        expectError(b => { b.campaign.arcs[1].id = 'awakening'; }, /duplicate id "awakening"/);
    });

    it('checks level ↔ boss links in both directions', () => {
        expectError(b => { level(b, 5).bossId = 'nope'; }, /levels\[4\]\.bossId: unknown boss "nope"/);
        expectError(b => { boss(b, 'convergence').triggerLevelId = 4; }, /boss "convergence" has triggerLevelId 4, expected 5/);
        expectError(b => { delete level(b, 10).bossId; }, /level 10 does not declare bossId "fractured_heart"/);
        expectError(b => { boss(b, 'fractured_heart').triggerLevelId = 42; }, /no campaign level with id 42/);
    });

    it('rejects unknown power-ups in a level pool', () => {
        expectError(b => { level(b, 6).powerUpPool.push('mega_laser'); }, /powerUpPool\[4\]: unknown power-up "mega_laser"/);
        expectError(b => { level(b, 6).powerUpPool = ['rainbow', 'rainbow']; }, /powerUpPool: items must be unique/);
    });
});

describe('hazard validation', () => {
    it('rejects unknown hazard kinds', () => {
        expectError(b => { level(b, 6).hazards.push({ kind: 'lava' }); }, /hazards\[1\]\.kind: "lava" is not one of overgrowth, tremor, color_shift/);
    });

    it('requires per-kind fields and rejects foreign ones', () => {
        expectError(b => { delete level(b, 7).hazards[0].growth; }, /hazards\[0\]\.growth: is required/);
        expectError(b => { level(b, 6).hazards[0].intervalMs = 5000; }, /hazards\[0\]\.intervalMs: unknown field/);
    });

    it('keeps lanes inside the level', () => {
        expectError(b => { level(b, 6).hazards[0].lanes = [0, 6]; }, /lane 6 is outside this level's 6 lanes/);
        expectError(b => { level(b, 8).hazards[0].laneCount = 7; }, /laneCount: 7 exceeds the 6 lane\(s\)/);
        expectError(b => {
            Object.assign(level(b, 7).hazards[0], { lanes: [1, 2], laneCount: 3 });
        }, /laneCount: 3 exceeds the 2 lane\(s\)/);
    });

    it('requires the warning to fit inside the interval', () => {
        expectError(b => { level(b, 7).hazards[0].warningMs = 7000; }, /warningMs: must be shorter than intervalMs \(7000\)/);
    });

    it('rejects color_shift on single-color levels', () => {
        expectError(b => {
            const l = level(b, 1);
            l.colorCount = 1;
            l.hazards = [{ kind: 'color_shift', intervalMs: 5000, warningMs: 500, laneCount: 1 }];
        }, /color_shift needs a level with at least 2 colors/);
    });
});

describe('power-up validation', () => {
    it('rejects duplicate ids, bad colors, and unknown default-pool entries', () => {
        expectError(b => { powerUp(b, 'freeze').id = 'rainbow'; }, /duplicate id "rainbow"/);
        expectError(b => { powerUp(b, 'freeze').color = 'cyan'; }, /expected hex color/);
        expectError(b => { b.powerUps.defaultPool.push('ghost'); }, /defaultPool\[3\]: unknown power-up "ghost"/);
    });

    it('requires an effect with a known kind', () => {
        expectError(b => { delete powerUp(b, 'rainbow').effect; }, /powerUps\[0\]\.effect: is required/);
        expectError(b => { powerUp(b, 'rainbow').effect.kind = 'laser'; }, /effect\.kind: "laser" is not one of/);
    });

    it('checks per-kind effect params', () => {
        expectError(b => { delete powerUp(b, 'lane_shockwave').effect.shrink; }, /effect\.shrink: is required/);
        expectError(b => { powerUp(b, 'prism_volley').effect.charges = 0; }, /effect\.charges: must be >= 1/);
        expectError(b => { powerUp(b, 'temporal_drift').effect.scale = 1.5; }, /effect\.scale: must be <= 0\.95/);
        expectError(b => { powerUp(b, 'fault_quake').effect.radius = 9; }, /effect\.radius: must be <= 3/);
        expectError(b => { powerUp(b, 'freeze').effect.charges = 2; }, /effect\.charges: unknown field/);
    });

    it('requires activation to match the effect kind', () => {
        expectError(b => { powerUp(b, 'rainbow').activation = 'on_activate'; }, /effect "rainbow_shot" requires activation "on_shoot", got "on_activate"/);
    });

    it('requires durations on timed effects only', () => {
        expectError(b => { powerUp(b, 'freeze').durationMs = null; }, /timed effect "growth_scale" needs a positive durationMs/);
        expectError(b => { powerUp(b, 'rainbow').durationMs = 3000; }, /effect "rainbow_shot" is not timed; use null/);
    });

    it('requires activateText on on_activate power-ups', () => {
        expectError(b => { delete powerUp(b, 'fault_quake').activateText; }, /activateText: on_activate power-ups need/);
    });

    it('rejects drop pools whose chances overflow at max combo', () => {
        expectError(b => { powerUp(b, 'rainbow').rarity = 0.8; }, /defaultPool: drop chances sum to 1\.\d+ at max combo/);
        expectError(b => { powerUp(b, 'prism_volley').rarity = 0.7; }, /levels\[2\]\.powerUpPool: drop chances sum to/);
    });
});

describe('boss validation', () => {
    it('requires phases and unique phase ids', () => {
        expectError(b => { boss(b, 'convergence').phases = []; }, /phases: must have at least 1 item/);
        expectError(b => {
            const phases = boss(b, 'fractured_heart').phases;
            phases[1].id = phases[0].id;
        }, /phases\[1\]\.id: duplicate id "split_edges"/);
    });

    it('rejects unknown reward power-ups and legacy reward fields', () => {
        expectError(b => { boss(b, 'convergence').rewards.powerUps = { ghost: 1 }; }, /rewards\.powerUps\.ghost: unknown power-up "ghost"/);
        expectError(b => { boss(b, 'convergence').rewards.rainbowCount = 2; }, /rewards\.rainbowCount: unknown field/);
        expectError(b => { boss(b, 'convergence').rewards.powerUps.rainbow = 0; }, /rewards\.powerUps\.rainbow: must be >= 1/);
    });

    it('bounds formation phases to what the WASM formation table supports', () => {
        expectError(b => { boss(b, 'convergence').phases[0].formationPhase = -1; }, /formationPhase: must be >= 0/);
        expectError(b => { boss(b, 'convergence').phases[0].formationPhase = 99; }, /formationPhase: must be <= 15/);
    });
});
