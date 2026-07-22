// @ts-check
/** @import { CollisionResult, Crystal, Spore } from '../types.js' */

import { COLORS, GAME_CONFIG } from '../Constants.js';
import { resolveCollisionResult } from '../PowerUpEffects.js';
import { wasmManager } from '../WasmManager.js';

/**
 * @typedef {Object} SporeScoreEvent
 * @property {number} points
 * @property {boolean} isMatch
 * @property {number} x
 * @property {number} y
 * @property {string} color
 */

/**
 * @typedef {Object} SporeCollisionCallbacks
 * @property {import('../types.js').CreateParticlesCallback} createParticles
 * @property {import('../types.js').SporeScoreCallback} score
 * @property {import('../types.js').CreateShockwaveCallback} [createShockwave]
 * @property {import('../types.js').CreateDebrisCallback} [createDebris]
 * @property {import('../types.js').CreateChunkCallback} [createChunk]
 */

/**
 * @typedef {Object} SporeCollisionResult
 * @property {boolean} hitOccurred
 */

/**
 * @param {number} topHeight
 * @param {number} bottomHeight
 * @param {number} canvasHeight
 * @returns {{ isCritical: boolean, intensity: number, gameOver: boolean }}
 */
export function evaluateLanePressure(topHeight, bottomHeight, canvasHeight) {
    const totalHeight = topHeight + bottomHeight;
    const dangerThreshold = canvasHeight * 0.75;
    const gameOver = wasmManager.checkCrystalGameOver(topHeight, bottomHeight, canvasHeight);

    if (totalHeight <= dangerThreshold) {
        return { isCritical: false, intensity: 0, gameOver };
    }

    const over = totalHeight - dangerThreshold;
    const range = canvasHeight * 0.25;
    const intensity = Math.min(1.0, over / range);
    return { isCritical: true, intensity, gameOver };
}

/**
 * @param {Crystal} crystal
 * @param {Crystal | null | undefined} opposite
 * @param {number} canvasHeight
 * @returns {{ isCritical: boolean, intensity: number, gameOver: boolean }}
 */
export function evaluateCrystalPressure(crystal, opposite, canvasHeight) {
    if (!opposite) {
        return { isCritical: false, intensity: 0, gameOver: false };
    }
    return evaluateLanePressure(crystal.height, opposite.height, canvasHeight);
}

/**
 * @param {typeof wasmManager} wasm
 * @param {Crystal} crystal
 * @param {boolean} isMatch
 * @param {number} colorCount
 * @param {() => number} rng
 */
function applyCrystalHit(wasm, crystal, isMatch, colorCount, rng) {
    if (isMatch) {
        crystal.height = wasm.calculateMatchHeight(crystal.height, GAME_CONFIG.matchShrink, 10);
        crystal.flash = 1;
        crystal.matchFlash = 1.0;
        crystal.velScaleY -= 0.3;
        crystal.velScaleX += 0.2;
        crystal.colorIdx = Math.floor(rng() * colorCount);
    } else {
        crystal.height = wasm.calculatePenaltyHeight(crystal.height, GAME_CONFIG.penaltyGrowth);
        crystal.velScaleY += 0.1;
        crystal.velScaleX -= 0.1;
    }
}

/**
 * @param {Spore} spore
 * @param {Crystal} topCry
 * @param {Crystal} botCry
 * @param {number} canvasHeight
 * @param {SporeCollisionCallbacks} callbacks
 * @param {typeof wasmManager} [wasm]
 * @param {{ colorCount?: number, rng?: () => number }} [gameplay]
 * @returns {SporeCollisionResult}
 */
export function resolveSporeCrystalCollision(
    spore,
    topCry,
    botCry,
    canvasHeight,
    callbacks,
    wasm = wasmManager,
    gameplay = {}
) {
    const colorCount = gameplay.colorCount ?? COLORS.length;
    const rng = gameplay.rng ?? Math.random;
    const rawCollision = wasm.checkCollisions(spore, topCry, botCry, canvasHeight);
    const collision = resolveCollisionResult(rawCollision, spore.modifiers);

    let hitOccurred = false;

    if (collision.topHit) {
        hitOccurred = true;
        const impactColor = spore.modifiers.rainbow
            ? COLORS[topCry.colorIdx].hex
            : COLORS[spore.colorIdx].hex;
        if (collision.topMatch) {
            applyCrystalHit(wasm, topCry, true, colorCount, rng);
            callbacks.createParticles(spore.x, topCry.height, impactColor, 40, Math.PI / 2, 1.2, 'shard');
            if (callbacks.createDebris) callbacks.createDebris(spore.x, topCry.height, impactColor, 4, Math.PI / 2);
            if (callbacks.createChunk) callbacks.createChunk(spore.x, topCry.height, impactColor, 1);
            if (callbacks.createShockwave) callbacks.createShockwave(spore.x, topCry.height, impactColor);
            callbacks.score(10, true, spore.x, topCry.height, impactColor);
        } else {
            applyCrystalHit(wasm, topCry, false, colorCount, rng);
            callbacks.createParticles(spore.x, topCry.height, '#777', 15, Math.PI / 2, 2.0);
            callbacks.score(0, false, spore.x, topCry.height, '#555');
        }
    }

    if (collision.bottomHit) {
        hitOccurred = true;
        const impactColor = spore.modifiers.rainbow
            ? COLORS[botCry.colorIdx].hex
            : COLORS[spore.colorIdx].hex;
        if (collision.bottomMatch) {
            applyCrystalHit(wasm, botCry, true, colorCount, rng);
            callbacks.createParticles(spore.x, canvasHeight - botCry.height, impactColor, 40, -Math.PI / 2, 1.2, 'shard');
            if (callbacks.createDebris) callbacks.createDebris(spore.x, canvasHeight - botCry.height, impactColor, 4, -Math.PI / 2);
            if (callbacks.createChunk) callbacks.createChunk(spore.x, canvasHeight - botCry.height, impactColor, -1);
            if (callbacks.createShockwave) callbacks.createShockwave(spore.x, canvasHeight - botCry.height, impactColor);
            callbacks.score(10, true, spore.x, canvasHeight - botCry.height, impactColor);
        } else {
            applyCrystalHit(wasm, botCry, false, colorCount, rng);
            callbacks.createParticles(spore.x, canvasHeight - botCry.height, '#777', 15, -Math.PI / 2, 2.0);
            callbacks.score(0, false, spore.x, canvasHeight - botCry.height, '#555');
        }
    }

    return { hitOccurred };
}

export class CollisionSystem {
    constructor() {
        /** @type {number} */
        this._colorCount = COLORS.length;
        /** @type {() => number} */
        this._rng = Math.random;
    }

    /**
     * @param {number} colorCount
     * @param {() => number} rng
     */
    setGameplayContext(colorCount, rng) {
        this._colorCount = colorCount;
        this._rng = rng;
    }

    /**
     * @param {Spore} spore
     * @param {Crystal | null} topCry
     * @param {Crystal | null} botCry
     * @param {number} canvasHeight
     * @param {SporeCollisionCallbacks} callbacks
     * @returns {boolean} whether a hit occurred
     */
    resolveSporeHit(spore, topCry, botCry, canvasHeight, callbacks) {
        if (!topCry || !botCry) return false;
        const result = resolveSporeCrystalCollision(
            spore,
            topCry,
            botCry,
            canvasHeight,
            callbacks,
            wasmManager,
            { colorCount: this._colorCount, rng: this._rng }
        );
        return result.hitOccurred;
    }
}
