/** @import { GameState, Launcher, RenderQualityProfile } from '../../types.js' */
/** @import { RendererHost } from '../RendererHost.js' */

/**
 * @typedef {Object} PostFxUniforms
 * @property {[number, number]} resolution
 * @property {number} time
 * @property {number} criticalIntensity
 * @property {number} comboT
 * @property {number} comboPulse
 * @property {number} motionScale
 * @property {number} effectScale
 * @property {number} bloomStrength
 * @property {number} grainAmount
 * @property {boolean} grainHighQuality
 * @property {number} scanlineBase
 * @property {number} impactFlash
 * @property {{ r: number, g: number, b: number } | null} impactFlashColor
 * @property {number} chromaOffset
 * @property {number} bloomSynergy
 */

/**
 * Shared post-FX parameters for Canvas2D and WebGL2 backends.
 * @param {GameState} gameState
 * @param {RenderQualityProfile} profile
 * @param {Launcher | null | undefined} launcher
 * @param {RendererHost} host
 * @param {number} timestamp
 * @returns {PostFxUniforms}
 */
export function buildPostFxUniforms(gameState, profile, launcher, host, timestamp) {
    const motionScale = gameState.motionScale ?? 1;
    const effectScale = (gameState.adaptiveOverrides?.effectScale ?? 1) * motionScale;
    const time = timestamp / 1000;
    const combo = gameState.combo || 0;
    const comboT = combo > 2 ? Math.min(1, (combo - 2) / 8) : 0;
    const comboPulse = combo > 2 ? Math.min(1, (combo - 2) / 10) : 0;
    const launcherSpeed = launcher?.speed ?? 0;
    const warpMagnitude = (gameState.shake || 0) + launcherSpeed * 2.5;
    const impactFlash = gameState.impactFlash || 0;

    return {
        resolution: [host.width, host.height],
        time,
        criticalIntensity: gameState.criticalIntensity || 0,
        comboT,
        comboPulse,
        motionScale,
        effectScale,
        bloomStrength: (profile.bloomStrength ?? 0.85) * effectScale,
        grainAmount: (profile.grainAmount ?? 0) * effectScale,
        grainHighQuality: profile.grainHighQuality === true,
        scanlineBase: profile.scanlineBase ?? 0,
        impactFlash,
        impactFlashColor: host.hexToRgb(gameState.impactFlashColor || '#ffffff'),
        chromaOffset: (4 + warpMagnitude * 0.2) * motionScale,
        bloomSynergy: impactFlash > 0.1 ? impactFlash * 0.5 : 0,
    };
}
