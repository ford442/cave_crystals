// @ts-check

import { SoundManager } from '../Audio.js';
import { SoulParticle } from '../Entities.js';
import * as gameplayRng from '../GameplayRng.js';
import {
    applyMatchCombo,
    applyMismatchCombo,
    computeMatchJuiceMagnitudes,
    computeMatchPitch,
    computeMismatchJuiceMagnitudes,
} from './ComboLogic.js';

export class ComboSystem {
    /**
     * @param {import('../Game.js').Game} game
     * @param {import('./JuiceSystem.js').JuiceSystem} juice
     */
    constructor(game, juice) {
        this.game = game;
        this.juice = juice;
    }

    /**
     * @param {number} points
     * @param {boolean} isMatch
     * @param {number} x
     * @param {number} y
     * @param {string} color
     */
    handleSporeScore(points, isMatch, x, y, color) {
        const game = this.game;
        const state = game.state;
        const m = state.motionScale ?? 1;

        if (isMatch) {
            game.save.recordMatch(state.combo + 1);
            const dropType = game.powerUps.rollPickup(state.combo + 1);
            if (dropType) {
                game.grantPowerUp(dropType);
            }
        }

        game.progression.onMatchResult(isMatch, state.combo + (isMatch ? 1 : 0));

        if (isMatch) {
            const soulCount = 3 + Math.floor(gameplayRng.next() * 2);
            const tx = 60;
            const ty = 60;

            this.juice.triggerResonance(color);

            for (let k = 0; k < soulCount; k++) {
                let val = Math.floor(points / soulCount);
                if (k === 0) val += points % soulCount;
                state.soulParticles.push(new SoulParticle(x, y, color, tx, ty, val));
            }

            const combo = applyMatchCombo(state, { motionScale: m });
            game._sessionBestCombo = Math.max(game._sessionBestCombo || 0, combo);

            SoundManager.match(computeMatchPitch(combo));

            const magnitudes = computeMatchJuiceMagnitudes(combo, m);
            state.shake = magnitudes.shake;
            state.zoom = magnitudes.zoom;
            state.zoomFocus = { x: x || game.renderer.width / 2, y: y || game.renderer.height / 2 };
            state.impactFlash = magnitudes.impactFlash;
            state.impactFlashColor = color || '#fff';
            state.sleepTimer = state.reducedMotion ? 0 : magnitudes.sleepTimer;

            if (x !== undefined && y !== undefined) {
                this.juice.createFloatingText(x, y, `+${points}`, '#fff');
                this.juice.createMatchBurst(x, y, color, combo);

                if (combo > 1) {
                    const comboColors = ['#fff', '#FFFF00', '#FFA500', '#FF4500', '#FF00FF'];
                    const colIdx = Math.min(combo - 1, comboColors.length - 1);
                    const scale = 1.5 + (combo * 0.2);
                    this.juice.createFloatingText(x, y - 30, `COMBO x${combo}!`, comboColors[colIdx], scale);
                }
            }
        } else if (points === 0) {
            game.save.recordMismatch();
            applyMismatchCombo(state);
            SoundManager.mismatch();

            const magnitudes = computeMismatchJuiceMagnitudes(m);
            state.shake = magnitudes.shake;
            state.impactFlash = magnitudes.impactFlash;
            state.impactFlashColor = '#f00';
            state.sleepTimer = state.reducedMotion ? 0 : magnitudes.sleepTimer;
            if (x !== undefined && y !== undefined) {
                this.juice.createFloatingText(x, y, 'MISS', '#f00');
                this.juice.createImpactSparks(x, y, '#888', 2);
            }
        }

        if (isMatch) {
            game.tutorial?.onMatch();
        } else if (points === 0) {
            game.tutorial?.onMismatch();
        }
    }
}
