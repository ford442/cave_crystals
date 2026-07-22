import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GAME_CONFIG } from '../../src/modules/Constants.js';
import {
    evaluateLanePressure,
    evaluateCrystalPressure,
    resolveSporeCrystalCollision,
} from '../../src/modules/systems/CollisionSystem.js';

/** @param {number} lane @param {'top' | 'bottom'} type @param {number} height @param {number} [colorIdx] */
function makeCrystal(lane, type, height, colorIdx = 0) {
    return {
        lane,
        type,
        height,
        colorIdx,
        flash: 0,
        matchFlash: 0,
        velScaleY: 0,
        velScaleX: 0,
    };
}

/** @param {number} lane @param {number} colorIdx @param {number} y */
function makeSpore(lane, colorIdx, y) {
    return {
        x: 100,
        y,
        lane,
        radius: 20,
        colorIdx,
        active: true,
        modifiers: {},
    };
}

const mockWasm = {
    checkCollisions(spore, topCrystal, bottomCrystal, canvasHeight) {
        const topHit = spore.y - spore.radius <= topCrystal.height;
        const bottomHit = spore.y + spore.radius >= canvasHeight - bottomCrystal.height;
        const topMatch = topHit && spore.colorIdx === topCrystal.colorIdx;
        const bottomMatch = bottomHit && spore.colorIdx === bottomCrystal.colorIdx;
        return { topHit, topMatch, bottomHit, bottomMatch };
    },
    calculateMatchHeight(currentHeight, shrinkAmount, minHeight) {
        return Math.max(minHeight, currentHeight - shrinkAmount);
    },
    calculatePenaltyHeight(currentHeight, growthAmount) {
        return currentHeight + growthAmount;
    },
    checkCrystalGameOver(height1, height2, maxHeight) {
        return height1 + height2 >= maxHeight;
    },
};

describe('CollisionSystem', () => {
    it('evaluateLanePressure detects critical intensity near danger threshold', () => {
        const canvasHeight = 800;
        const dangerThreshold = canvasHeight * 0.75;
        const below = evaluateLanePressure(dangerThreshold - 50, 50, canvasHeight);
        assert.equal(below.isCritical, false);
        assert.equal(below.intensity, 0);

        const above = evaluateLanePressure(dangerThreshold, 50, canvasHeight);
        assert.equal(above.isCritical, true);
        assert.ok(above.intensity > 0);
        assert.equal(above.gameOver, false);
    });

    it('evaluateLanePressure flags game over when crystals touch', () => {
        const canvasHeight = 800;
        const result = evaluateLanePressure(500, 300, canvasHeight);
        assert.equal(result.gameOver, true);
    });

    it('evaluateCrystalPressure returns safe defaults without opposite crystal', () => {
        const crystal = makeCrystal(0, 'top', 200);
        const result = evaluateCrystalPressure(crystal, null, 800);
        assert.deepEqual(result, { isCritical: false, intensity: 0, gameOver: false });
    });

    it('resolveSporeCrystalCollision shrinks crystal on color match', () => {
        const top = makeCrystal(0, 'top', 120, 1);
        const bottom = makeCrystal(0, 'bottom', 120, 2);
        const spore = makeSpore(0, 1, 110);
        const scores = [];

        const result = resolveSporeCrystalCollision(
            spore,
            top,
            bottom,
            800,
            {
                createParticles: () => {},
                score: (points, isMatch, x, y, color) => {
                    scores.push({ points, isMatch, x, y, color });
                },
            },
            mockWasm
        );

        assert.equal(result.hitOccurred, true);
        assert.equal(top.height, mockWasm.calculateMatchHeight(120, GAME_CONFIG.matchShrink, 10));
        assert.equal(scores.length, 1);
        assert.equal(scores[0].isMatch, true);
    });

    it('resolveSporeCrystalCollision grows crystal on mismatch', () => {
        const top = makeCrystal(0, 'top', 120, 1);
        const bottom = makeCrystal(0, 'bottom', 120, 2);
        const spore = makeSpore(0, 3, 110);
        const scores = [];

        resolveSporeCrystalCollision(
            spore,
            top,
            bottom,
            800,
            {
                createParticles: () => {},
                score: (points, isMatch) => scores.push({ points, isMatch }),
            },
            mockWasm
        );

        assert.equal(top.height, mockWasm.calculatePenaltyHeight(120, GAME_CONFIG.penaltyGrowth));
        assert.deepEqual(scores[0], { points: 0, isMatch: false });
    });

    it('resolveSporeCrystalCollision upgrades hits to matches for rainbow spores', () => {
        const top = makeCrystal(0, 'top', 120, 1);
        const bottom = makeCrystal(0, 'bottom', 120, 2);
        const spore = makeSpore(0, 3, 110);
        spore.modifiers = { rainbow: true };
        const scores = [];

        resolveSporeCrystalCollision(
            spore,
            top,
            bottom,
            800,
            {
                createParticles: () => {},
                score: (points, isMatch) => scores.push({ points, isMatch }),
            },
            mockWasm
        );

        assert.equal(scores[0].isMatch, true);
        assert.equal(top.height, mockWasm.calculateMatchHeight(120, GAME_CONFIG.matchShrink, 10));
    });
});
