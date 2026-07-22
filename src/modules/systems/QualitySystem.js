// @ts-check
/** @import { QualityMode, RenderQualityLevel } from '../types.js' */

import { ADAPTIVE_FRAME_BUDGET, resolveParticleStride } from '../RendererConstants.js';

const ADAPTIVE_QUALITY = {
    autoLowFps: 50,
    autoMediumFps: 57,
    downgradeLowFps: 48,
    downgradeMediumFps: 57,
    upgradeFps: 59,
    fpsSmoothingFactor: 0.25,
    cooldownSlowMs: 2500,
    cooldownFastMs: 2000
};

export { ADAPTIVE_QUALITY };

export class QualitySystem {
    /**
     * @param {import('../Game.js').Game} game
     */
    constructor(game) {
        this.game = game;
        /** @type {number | undefined} */
        this._smoothedFps = undefined;
        /** @type {number | undefined} */
        this._qualityCooldownUntil = undefined;
        /** @type {number | undefined} */
        this._fpsLastTime = undefined;
        /** @type {number | undefined} */
        this._fpsFrames = undefined;
    }

    /** @returns {number} */
    getQualityScale() {
        const { renderQuality } = this.game.state;
        if (renderQuality === 'low') return 0.55;
        if (renderQuality === 'medium') return 0.8;
        return 1.0;
    }

    /**
     * @param {number} fps
     * @param {number} lowThreshold
     * @param {number} mediumThreshold
     * @returns {RenderQualityLevel}
     */
    resolveQualityForFps(fps, lowThreshold, mediumThreshold) {
        if (fps < lowThreshold) return 'low';
        if (fps < mediumThreshold) return 'medium';
        return 'high';
    }

    /** @param {QualityMode} [mode] */
    setQualityMode(mode = 'auto') {
        const state = this.game.state;
        const prevQuality = state.renderQuality;
        state.qualityMode = mode;
        if (mode === 'dev') {
            state.renderQuality = 'high';
            state.devPerfOverlay = true;
        } else if (mode === 'auto') {
            if (!this._smoothedFps) this._smoothedFps = 60;
            state.renderQuality = this.resolveQualityForFps(
                this._smoothedFps,
                ADAPTIVE_QUALITY.autoLowFps,
                ADAPTIVE_QUALITY.autoMediumFps
            );
        } else {
            state.renderQuality = mode;
        }
        if (prevQuality !== state.renderQuality) {
            this.resetAdaptiveOverrides();
        }
        this.updateFpsHud();
    }

    resetAdaptiveOverrides() {
        this.game.state.adaptiveOverrides.particleStrideBoost = 0;
        this.game.state.adaptiveOverrides.effectScale = 1.0;
    }

    /** @param {number} fps */
    updateAdaptiveQuality(fps) {
        const state = this.game.state;
        if (!this._smoothedFps) this._smoothedFps = fps;
        this._smoothedFps += (fps - this._smoothedFps) * ADAPTIVE_QUALITY.fpsSmoothingFactor;
        if (state.qualityMode !== 'auto') return;

        if (!this._qualityCooldownUntil) this._qualityCooldownUntil = 0;
        const now = performance.now();
        if (now < this._qualityCooldownUntil) return;

        if (this._smoothedFps < ADAPTIVE_QUALITY.downgradeLowFps && state.renderQuality !== 'low') {
            state.renderQuality = 'low';
            this._qualityCooldownUntil = now + ADAPTIVE_QUALITY.cooldownSlowMs;
        } else if (this._smoothedFps < ADAPTIVE_QUALITY.downgradeMediumFps && state.renderQuality === 'high') {
            state.renderQuality = 'medium';
            this._qualityCooldownUntil = now + ADAPTIVE_QUALITY.cooldownFastMs;
        } else if (this._smoothedFps > ADAPTIVE_QUALITY.upgradeFps && state.renderQuality !== 'high') {
            state.renderQuality = state.renderQuality === 'low' ? 'medium' : 'high';
            this._qualityCooldownUntil = now + ADAPTIVE_QUALITY.cooldownFastMs;
        }
    }

    /**
     * @param {number} dt
     * @param {number} [fps]
     */
    updatePerfMetrics(dt, fps) {
        const state = this.game.state;
        const metrics = state.perfMetrics;
        metrics.frameMs = dt;
        metrics.instantFps = dt > 0 ? 1000 / dt : 0;
        if (!metrics.smoothedFrameMs) metrics.smoothedFrameMs = dt;
        metrics.smoothedFrameMs += (dt - metrics.smoothedFrameMs) * 0.18;
        if (fps !== undefined) {
            metrics.fps = fps;
            metrics.smoothedFps = this._smoothedFps || fps;
        }
        metrics.particleCount = state.particles.length;
        const profile = this.game.renderer.getQualityProfile(state.renderQuality);
        metrics.particleLimit = profile.maxParticles;
        metrics.envParticleCount = state.envParticles.length;
        metrics.shockwaveCount = state.shockwaves.length;
        metrics.sporeCount = state.spores.length;
        metrics.energyRingCount = state.energyRings.length;
        metrics.particleStride = resolveParticleStride(
            profile,
            metrics.particleCount,
            state.adaptiveOverrides,
            metrics.smoothedFrameMs,
            metrics.instantFps > 0 ? 1000 / metrics.instantFps : metrics.smoothedFrameMs
        );

        if (state.devPerfOverlay) {
            let trails = 0;
            const particles = state.particles;
            for (let i = 0; i < particles.length; i++) {
                if (particles[i].isTrail) trails++;
            }
            metrics.trailCount = trails;
            this.updateFpsHud();
        }
    }

    updateFrameTimeAdaptive() {
        const budget = ADAPTIVE_FRAME_BUDGET;
        const overrides = this.game.state.adaptiveOverrides;
        const frameMs = this.game.state.perfMetrics.smoothedFrameMs;

        if (frameMs > budget.hardFrameMs) {
            overrides.particleStrideBoost = Math.min(
                budget.maxStrideBoost,
                overrides.particleStrideBoost + budget.strideStep
            );
            overrides.effectScale = Math.max(
                budget.minEffectScale,
                overrides.effectScale - budget.effectScaleStep
            );
        } else if (frameMs > budget.targetFrameMs) {
            overrides.particleStrideBoost = Math.min(
                budget.maxStrideBoost,
                overrides.particleStrideBoost + budget.strideStep * 0.5
            );
            overrides.effectScale = Math.max(
                budget.minEffectScale,
                overrides.effectScale - budget.effectScaleStep * 0.5
            );
        } else if (frameMs < budget.softFrameMs) {
            overrides.particleStrideBoost = Math.max(
                0,
                overrides.particleStrideBoost - budget.strideRecovery
            );
            overrides.effectScale = Math.min(1.0, overrides.effectScale + budget.effectScaleStep * 0.5);
        }
    }

    /**
     * @param {number} timestamp
     * @returns {number | undefined} fps when a second has elapsed
     */
    tickFpsCounter(timestamp) {
        if (!this._fpsLastTime) this._fpsLastTime = timestamp;
        if (!this._fpsFrames) this._fpsFrames = 0;
        this._fpsFrames++;
        if (timestamp - this._fpsLastTime >= 1000) {
            const fps = Math.round((this._fpsFrames * 1000) / (timestamp - this._fpsLastTime));
            this._fpsFrames = 0;
            this._fpsLastTime = timestamp;
            return fps;
        }
        return undefined;
    }

    updateFpsHud() {
        const { ui, state } = this.game;
        if (!ui.fps) return;
        const m = state.perfMetrics;
        const qualityLabel = state.renderQuality.toUpperCase()
            + (state.qualityMode === 'auto' ? ' AUTO' : state.qualityMode === 'dev' ? ' DEV' : '');
        if (state.devPerfOverlay) {
            ui.fps.textContent = `${Math.round(m.smoothedFps || m.fps || 0)} FPS · ${m.particleCount}/${m.particleLimit} · ${qualityLabel}`;
            ui.fps.classList.add('dev-active');
        } else if (m.fps) {
            ui.fps.textContent = `${m.fps} FPS · ${qualityLabel}`;
            ui.fps.classList.remove('dev-active');
        }
    }
}
