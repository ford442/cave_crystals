/** @import { RenderQualityLevel, RenderQualityProfile, RenderQualityProfileMap } from '../types.js' */

import { GAME_CONFIG, RENDER_QUALITY_PROFILES } from '../RendererConstants.js';

/**
 * Shared canvas context, caches, and subsystem wiring for composed renderers.
 */
export class RendererHost {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.laneWidth = this.width / GAME_CONFIG.lanes;
        this._gradientCache = new Map();

        this.scanlineCanvas = document.createElement('canvas');
        this.scanlineCanvas.width = 1;
        this.scanlineCanvas.height = 4;
        const sctx = this.scanlineCanvas.getContext('2d');
        sctx.fillStyle = 'rgba(0, 0, 0, 1)';
        sctx.fillRect(0, 0, 1, 2);
        this.scanlinePattern = this.ctx.createPattern(this.scanlineCanvas, 'repeat');

        this._glitchRects = [];
        this._glitchIntensity = -1;

        this._vignetteGradient = null;
        this._baseVignetteGradient = null;
        this._fogGradient = null;
        this._fogSweepGrad = null;
        /** @type {RenderQualityProfileMap} */
        this._qualityProfiles = RENDER_QUALITY_PROFILES;

        this._grainCanvas = document.createElement('canvas');
        this._grainCanvas.width = 256;
        this._grainCanvas.height = 256;
        this._grainCtx = this._grainCanvas.getContext('2d');
        this._grainPattern = null;

        this._bloomCanvas = document.createElement('canvas');
        this._bloomCanvas.width = Math.max(4, Math.floor(canvas.width / 4));
        this._bloomCanvas.height = Math.max(4, Math.floor(canvas.height / 4));
        this._bloomCtx = this._bloomCanvas.getContext('2d');
        this._bloomGradCache = new Map();
        this._shaftGradCache = new Map();
        this._shaftGradCacheH = 0;

        this._caveGeometry = null;
        this._caveGeometryW = 0;
        this._caveGeometryH = 0;

        this._distortionField = null;
        this._distortionLookupCount = 0;
        this._distortionFieldTrackLookups = false;
        this._darkenColorCache = null;
        this._lastGrainRefresh = 0;
        this._shaftDustMotes = null;
        this._colorGradeBaseGrad = null;
        this._colorGradeBaseGradH = 0;
        this._colorGradeComboGrad = null;
        this._colorGradeComboGradW = 0;

        /** @type {import('./CrystalRenderer.js').CrystalRenderer | null} */
        this.crystal = null;
        /** @type {import('./CaveRenderer.js').CaveRenderer | null} */
        this.cave = null;
        /** @type {import('./PostEffectsRenderer.js').PostEffectsRenderer | null} */
        this.post = null;
        /** @type {import('./HudEffectsRenderer.js').HudEffectsRenderer | null} */
        this.hud = null;
        /** @type {import('./ParticleRenderer.js').ParticleRenderer | null} */
        this.particles = null;
    }

    /**
     * @param {number} w
     * @param {number} h
     */
    resize(w, h) {
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
        this.laneWidth = w / GAME_CONFIG.lanes;
        this._vignetteGradient = null;
        this._baseVignetteGradient = null;
        this._fogGradient = null;
        this._fogSweepGrad = null;
        this._bloomCanvas.width = Math.max(4, Math.floor(w / 4));
        this._bloomCanvas.height = Math.max(4, Math.floor(h / 4));
        this._bloomGradCache.clear();
        this._shaftGradCache.clear();
        this._shaftGradCacheH = 0;
        this._caveGeometry = null;
    }

    /**
     * @param {RenderQualityLevel} [quality]
     * @returns {RenderQualityProfile}
     */
    getQualityProfile(quality = 'high') {
        return this._qualityProfiles[quality] || this._qualityProfiles.high;
    }

    /**
     * @param {string} hex
     * @returns {{ r: number, g: number, b: number } | null}
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }
}
