/** @import { RenderQualityLevel, RenderQualityProfile, RenderQualityProfileMap } from '../types.js' */

import { GAME_CONFIG, RENDER_QUALITY_PROFILES } from '../RendererConstants.js';
import {
    createCanvas2DContext,
    GRAIN_BUFFER_CONTEXT,
    MAIN_CANVAS_CONTEXT,
    OFFSCREEN_FX_CONTEXT,
} from './canvasContext.js';

/** @typedef {'canvas2d' | 'webgl2'} DisplayMode */

/**
 * Shared canvas context, caches, and subsystem wiring for composed renderers.
 */
export class RendererHost {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {HTMLCanvasElement | null} [overlayCanvas]
     */
    constructor(canvas, overlayCanvas = null) {
        this.canvas = canvas;
        this.overlayCanvas = overlayCanvas;
        /** @type {CanvasRenderingContext2D | null} */
        this.overlayCtx = null;
        if (overlayCanvas) {
            const overlay = createCanvas2DContext(overlayCanvas, OFFSCREEN_FX_CONTEXT);
            this.overlayCtx = overlay.ctx;
            overlayCanvas.style.display = 'none';
        }

        this._sceneCanvas = document.createElement('canvas');
        const scene = createCanvas2DContext(this._sceneCanvas, MAIN_CANVAS_CONTEXT);
        /** @type {CanvasRenderingContext2D | null} */
        this._sceneCtx = scene.ctx;

        const main = createCanvas2DContext(canvas, MAIN_CANVAS_CONTEXT, { retryWithoutDesync: true });
        this.ctx = main.ctx;
        this._desynchronizedActive = main.desynchronizedActive;
        /** @type {DisplayMode} */
        this._displayMode = 'canvas2d';
        /** @type {WebGL2RenderingContext | null} */
        this.postFxGl = null;
        this.postFxGlReady = RendererHost.probeWebGL2();

        this.width = canvas.width;
        this.height = canvas.height;
        this.laneWidth = this.width / GAME_CONFIG.lanes;
        this._gradientCache = new Map();

        this.scanlineCanvas = document.createElement('canvas');
        this.scanlineCanvas.width = 1;
        this.scanlineCanvas.height = 4;
        const scanline = createCanvas2DContext(this.scanlineCanvas, OFFSCREEN_FX_CONTEXT);
        const sctx = scanline.ctx;
        if (sctx) {
            sctx.fillStyle = 'rgba(0, 0, 0, 1)';
            sctx.fillRect(0, 0, 1, 2);
        }
        this.scanlinePattern = this.ctx ? this.ctx.createPattern(this.scanlineCanvas, 'repeat') : null;

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
        this._grainCtx = createCanvas2DContext(this._grainCanvas, GRAIN_BUFFER_CONTEXT).ctx;
        this._grainPattern = null;

        this._bloomCanvas = document.createElement('canvas');
        this._bloomCanvas.width = Math.max(4, Math.floor(canvas.width / 4));
        this._bloomCanvas.height = Math.max(4, Math.floor(canvas.height / 4));
        this._bloomCtx = createCanvas2DContext(this._bloomCanvas, OFFSCREEN_FX_CONTEXT).ctx;
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

        this.motionScale = 1;
        /** @type {import('../types.js').PaletteColor[]} */
        this.activePalette = [];
        this.colorBlindMode = false;

        this._syncSceneCanvasSize();
    }

    /** @returns {boolean} */
    static probeWebGL2() {
        try {
            const probe = document.createElement('canvas');
            const gl = probe.getContext('webgl2', {
                alpha: false,
                antialias: false,
                depth: false,
            });
            return !!gl;
        } catch {
            return false;
        }
    }

    _syncSceneCanvasSize() {
        this._sceneCanvas.width = this.width;
        this._sceneCanvas.height = this.height;
    }

    ensureWebGLDisplay() {
        if (!this.postFxGlReady) return;
        if (this._displayMode === 'webgl2' && this.postFxGl) return;

        const gl = this.canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            depth: false,
            premultipliedAlpha: false,
        });
        if (!gl) {
            console.info('[PostFX] WebGL2 unavailable on display canvas; using Canvas2D post-processing.');
            this.postFxGlReady = false;
            this.ensureCanvas2DDisplay();
            return;
        }

        this.postFxGl = gl;
        this._displayMode = 'webgl2';
        this.ctx = this._sceneCtx;
        if (this.overlayCanvas) {
            this.overlayCanvas.style.display = 'block';
        }
    }

    ensureCanvas2DDisplay() {
        if (this._displayMode === 'canvas2d' && this.ctx && this.ctx.canvas === this.canvas) return;

        const main = createCanvas2DContext(this.canvas, MAIN_CANVAS_CONTEXT, { retryWithoutDesync: true });
        this.ctx = main.ctx;
        this._desynchronizedActive = main.desynchronizedActive;
        this.postFxGl = null;
        this._displayMode = 'canvas2d';
        if (this.overlayCanvas) {
            this.overlayCanvas.style.display = 'none';
            if (this.overlayCtx) {
                this.overlayCtx.clearRect(0, 0, this.width, this.height);
            }
        }
        if (this.ctx && !this.scanlinePattern) {
            this.scanlinePattern = this.ctx.createPattern(this.scanlineCanvas, 'repeat');
        }
    }

    /**
     * @param {number} w
     * @param {number} h
     */
    resize(w, h) {
        this.width = w;
        this.height = h;
        const wasWebGL = this._displayMode === 'webgl2';

        this._sceneCanvas.width = w;
        this._sceneCanvas.height = h;
        if (this.overlayCanvas) {
            this.overlayCanvas.width = w;
            this.overlayCanvas.height = h;
        }

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

        if (wasWebGL) {
            const gl = this.canvas.getContext('webgl2', {
                alpha: false,
                antialias: false,
                depth: false,
                premultipliedAlpha: false,
            });
            if (gl) {
                this.postFxGl = gl;
                this.ctx = this._sceneCtx;
            } else {
                this.postFxGlReady = false;
                this.ensureCanvas2DDisplay();
            }
        }
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
            b: parseInt(result[3], 16),
        } : null;
    }
}
