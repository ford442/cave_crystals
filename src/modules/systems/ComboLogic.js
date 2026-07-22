// @ts-check
/** @import { GameState } from '../types.js' */

/** @param {GameState} state @param {number} dt @param {number} timeScale */
export function tickComboTimer(state, dt, timeScale) {
    if (state.comboTimer > 0) {
        state.comboTimer -= dt * timeScale;
        if (state.comboTimer <= 0) {
            state.combo = 0;
        }
    }
}

/**
 * @param {number} combo
 * @returns {number}
 */
export function computeMatchPitch(combo) {
    return 1.0 + (Math.min(combo, 10) * 0.1);
}

/**
 * @param {GameState} state
 * @param {{ motionScale?: number }} [options]
 * @returns {number} new combo value after increment
 */
export function applyMatchCombo(state, options = {}) {
    const m = options.motionScale ?? 1;
    state.combo++;
    state.comboTimer = 2000;

    if (state.combo > 2 && m >= 1) {
        state.targetTimeScale = 0.3;
        state.slowMoTimer = 400;
    }

    return state.combo;
}

/**
 * @param {GameState} state
 * @param {{ motionScale?: number }} [options]
 */
export function applyMismatchCombo(state, options = {}) {
    void options;
    state.combo = 0;
    state.comboTimer = 0;
}

/**
 * @param {number} combo
 * @param {number} motionScale
 * @returns {{ shake: number, zoom: number, impactFlash: number, sleepTimer: number }}
 */
export function computeMatchJuiceMagnitudes(combo, motionScale) {
    const m = motionScale;
    const zoomBoost = (Math.min(combo, 10) * 0.01) * m;
    return {
        shake: (15 + (combo * 2)) * m,
        zoom: 1.02 + zoomBoost,
        impactFlash: 0.6 * m,
        sleepTimer: m >= 1 ? 50 * m : 0,
    };
}

/**
 * @param {number} motionScale
 * @returns {{ shake: number, impactFlash: number, sleepTimer: number }}
 */
export function computeMismatchJuiceMagnitudes(motionScale) {
    const m = motionScale;
    return {
        shake: 25 * m,
        impactFlash: 0.3 * m,
        sleepTimer: m >= 1 ? 30 * m : 0,
    };
}
