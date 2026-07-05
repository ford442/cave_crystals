import { GAME_CONFIG, RENDER_QUALITY_PROFILES, resolveParticleStride } from './RendererConstants.js';
import { installRendererPostEffects } from './RendererPostEffects.js';
import { installRendererInterfaceEffects } from './RendererInterfaceEffects.js';
import { installRendererCrystal } from './RendererCrystal.js';
import { installRendererCave } from './RendererCave.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.laneWidth = this.width / GAME_CONFIG.lanes;
        this._gradientCache = new Map();

        // Offscreen canvas for scanlines pattern (Fix 7)
        this.scanlineCanvas = document.createElement('canvas');
        this.scanlineCanvas.width = 1;
        this.scanlineCanvas.height = 4;
        const sctx = this.scanlineCanvas.getContext('2d');
        sctx.fillStyle = 'rgba(0, 0, 0, 1)';
        sctx.fillRect(0, 0, 1, 2); // 2px line, 2px gap

        // Cache scanline pattern once
        this.scanlinePattern = this.ctx.createPattern(this.scanlineCanvas, 'repeat');

        // Cache for glitch rects (regenerated only when intensity changes)
        this._glitchRects = [];
        this._glitchIntensity = -1;

        // Cache for vignette gradients (invalidated on resize)
        this._vignetteGradient = null;
        this._baseVignetteGradient = null;
        this._fogGradient = null;
        this._fogSweepGrad = null;
        this._qualityProfiles = RENDER_QUALITY_PROFILES;

        // Film grain: upgraded to 256×256 for higher-quality multi-octave noise
        this._grainCanvas = document.createElement('canvas');
        this._grainCanvas.width = 256;
        this._grainCanvas.height = 256;
        this._grainCtx = this._grainCanvas.getContext('2d');
        this._grainPattern = null;

        // Bloom offscreen buffer at 1/4 resolution
        this._bloomCanvas = document.createElement('canvas');
        this._bloomCanvas.width = Math.max(4, Math.floor(canvas.width / 4));
        this._bloomCanvas.height = Math.max(4, Math.floor(canvas.height / 4));
        this._bloomCtx = this._bloomCanvas.getContext('2d');
        this._bloomGradCache = new Map();
        this._shaftGradCache = new Map();
        this._shaftGradCacheH = 0;

        // Cave environment geometry (seeded, regenerated on resize)
        this._caveGeometry = null;
        this._caveGeometryW = 0;
        this._caveGeometryH = 0;

        // Per-frame shockwave distortion field (precomputed once per draw)
        this._distortionField = null;
        this._distortionLookupCount = 0;
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
        this.laneWidth = w / GAME_CONFIG.lanes;
        this._vignetteGradient = null; // invalidate cached gradients
        this._baseVignetteGradient = null;
        this._fogGradient = null;
        this._fogSweepGrad = null;
        // Resize bloom buffer to match new resolution
        this._bloomCanvas.width = Math.max(4, Math.floor(w / 4));
        this._bloomCanvas.height = Math.max(4, Math.floor(h / 4));
        this._bloomGradCache.clear();
        this._shaftGradCache.clear();
        this._shaftGradCacheH = 0;
        // Invalidate cave geometry so it regenerates at new resolution
        this._caveGeometry = null;
    }

    clear() {
        // No-op: clear is combined with the dark overlay in draw()
    }

    getQualityProfile(quality = 'high') {
        return this._qualityProfiles[quality] || this._qualityProfiles.high;
    }

    draw(gameState, launcher, timestamp = performance.now()) {
        if (!this.ctx) return;
        const profile = this.getQualityProfile(gameState.renderQuality);

        // JUICE: Dynamic Lighting System
        // 1. Clear + darken in one fill
        this.ctx.fillStyle = 'rgba(0, 0, 10, 1.0)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Cave background layers (parallax, drawn before lighting so crystal lights illuminate cave walls)
        this.drawCaveLayers(gameState, timestamp);

        // 2. Render Additive Lighting Pass
        this.drawLighting(gameState, launcher, profile, timestamp);

        // Background Color Override based on Flash
        if (gameState.impactFlash > 0.3) {
             // Subtle background tinting during strong flashes
             this.ctx.fillStyle = gameState.impactFlashColor || '#000';
             this.ctx.globalAlpha = gameState.impactFlash * 0.2;
             this.ctx.fillRect(0, 0, this.width, this.height);
             this.ctx.globalAlpha = 1.0;
        }

        this.ctx.save();

        // Calculate Chromatic Aberration Magnitude based on Shake AND Player Velocity
        // "Warp Drive" Effect: Moving fast distorts reality
        const launcherSpeed = launcher ? launcher.speed : 0;
        // JUICE: Increased warp sensitivity to speed for more impact
        const warpMagnitude = gameState.shake + (launcherSpeed * 2.5);

        const particleCount = gameState.particles ? gameState.particles.length : 0;
        const isWarping = warpMagnitude > 3.0;

        // Precompute shockwave distortion once per frame (crystals, launcher, grid)
        this.prepareShockwaveDistortionField(gameState, profile, particleCount, launcher);

        // JUICE: Impact Zoom
        if (gameState.zoom && gameState.zoom > 1.0) {
            const zx = gameState.zoomFocus ? gameState.zoomFocus.x : this.width / 2;
            const zy = gameState.zoomFocus ? gameState.zoomFocus.y : this.height / 2;
            this.ctx.translate(zx, zy);
            this.ctx.scale(gameState.zoom, gameState.zoom);
            this.ctx.translate(-zx, -zy);
        }

        // Apply centralized shake offset (calculated in Game.js for sync with background)
        if (gameState.shakeOffset) {
             // Rotate around center
             const cx = this.width / 2;
             const cy = this.height / 2;

             this.ctx.translate(cx, cy);
             this.ctx.rotate(gameState.shakeOffset.angle || 0);
             this.ctx.translate(-cx, -cy);

             this.ctx.translate(gameState.shakeOffset.x || 0, gameState.shakeOffset.y || 0);
        } else if (gameState.shake > 0) {
            const dx = (Math.random() - 0.5) * gameState.shake;
            const dy = (Math.random() - 0.5) * gameState.shake;
            this.ctx.translate(dx, dy);
        }

        if (gameState.dustParticles) {
            this.drawDust(gameState.dustParticles, profile.maxDust);
        }

        // Environmental drip/mote particles (before fog, to feel embedded in atmosphere)
        if (gameState.envParticles && gameState.envParticles.length > 0) {
            this.drawEnvironmentalParticles(gameState.envParticles, gameState, timestamp);
        }

        if (profile.fog) {
            this.drawVolumetricFog(gameState, profile, timestamp);
        }

        // Cave wall overlays drawn after fog so stalactites emerge from mist
        this.drawCaveWallOverlays(gameState, timestamp);

        this.drawHoloGrid(gameState, launcher, profile, timestamp);
        this.drawTargetingSystem(gameState, launcher, timestamp);

        // Draw Crystals (skip chromatic aberration on crystals during explosions)
        for (let i = 0; i < gameState.crystals.length; i++) {
            const c = gameState.crystals[i];
            const distortion = this.getCrystalDistortion(i);
            this.drawComplexCrystal(
                c, null, particleCount, profile, timestamp, launcher, gameState.spores,
                distortion.x, distortion.y
            );
        }

        // Draw Launcher with Chromatic Aberration (Motion Blur)
        if (launcher) {
            const distortion = this.getLauncherDistortion();
            const hasDist = distortion.x !== 0 || distortion.y !== 0;
            if (hasDist || isWarping) {
                this.ctx.save();
                if (hasDist) this.ctx.translate(distortion.x, distortion.y);

                if (isWarping) {
                    this.ctx.globalCompositeOperation = 'screen';
                    this.ctx.save();
                    this.ctx.translate(-4 - (warpMagnitude * 0.2), 0);
                    this.drawCursor(gameState, launcher, 'red');
                    this.ctx.restore();

                    this.ctx.save();
                    this.ctx.translate(4 + (warpMagnitude * 0.2), 0);
                    this.drawCursor(gameState, launcher, 'blue');
                    this.ctx.restore();

                    this.ctx.globalCompositeOperation = 'source-over';
                }
                this.drawCursor(gameState, launcher);
                this.ctx.restore();
            } else {
                this.drawCursor(gameState, launcher);
            }
        }
        for (let i = 0; i < gameState.spores.length; i++) {
            this.drawSpore(gameState.spores[i], timestamp);
        }

        const particleLimit = Math.min(profile.maxParticles, particleCount);
        const frameMs = gameState.perfMetrics ? gameState.perfMetrics.smoothedFrameMs : 16.7;
        const instantFrameMs = gameState.perfMetrics?.instantFps > 0
            ? 1000 / gameState.perfMetrics.instantFps
            : frameMs;
        const stride = resolveParticleStride(profile, particleCount, gameState.adaptiveOverrides, frameMs, instantFrameMs);
        if (gameState.perfMetrics) {
            gameState.perfMetrics.particleStride = stride;
        }
        this.drawParticlesBatched(gameState.particles, particleLimit, stride, gameState);

        if (gameState.shockwaves) {
            for (let i = 0; i < gameState.shockwaves.length; i++) {
               const sw = gameState.shockwaves[i];
               if (sw.x + sw.radius < 0 || sw.x - sw.radius > this.width || sw.y + sw.radius < 0 || sw.y - sw.radius > this.height) continue;
               this.drawShockwave(sw);
            }
        }

        if (gameState.energyRings) {
            for (let i = 0; i < gameState.energyRings.length; i++) {
               const ring = gameState.energyRings[i];
               if (ring.x + ring.radius < 0 || ring.x - ring.radius > this.width || ring.y + ring.radius < 0 || ring.y - ring.radius > this.height) continue;
               this.drawEnergyRing(ring);
            }
        }

        if (gameState.floatingTexts) {
            for (let i = 0; i < gameState.floatingTexts.length; i++) {
               const ft = gameState.floatingTexts[i];
               if (ft.y + 40 < 0 || ft.y - 40 > this.height) continue;
               this.drawFloatingText(ft);
            }
        }

        if (gameState.soulParticles) {
            for (let i = 0; i < gameState.soulParticles.length; i++) {
               const sp = gameState.soulParticles[i];
               if (sp.x + sp.size < 0 || sp.x - sp.size > this.width || sp.y + sp.size < 0 || sp.y - sp.size > this.height) continue;
               this.drawSoulParticle(sp);
            }
        }

        this.ctx.restore();

        if (gameState.devPerfOverlay && gameState.perfMetrics) {
            gameState.perfMetrics.distortionLookupCount = this._distortionLookupCount || 0;
        }

        // --- Cinematic Post-Processing Stack ---

        // 1. Bloom — bright elements bleed into fog and environment (high only)
        if (profile.bloom) {
            this.drawBloom(gameState, profile, timestamp);
        }

        // 2. Enhanced light shafts (reactive to crystals and explosions)
        if (profile.lightShafts) {
            this.drawLightShafts(gameState, launcher, timestamp, profile);
        }

        // 3. Dynamic color grading — contrast/saturation shift by danger and combo
        if (profile.colorGrade) {
            this.drawColorGrade(gameState, timestamp);
        }

        // 4. Unified film pass — grain, vignette, scanlines, glitch
        if (profile.postFX) {
            this.drawFilmPass(gameState, timestamp, profile);
        } else if (gameState.criticalIntensity > 0.01) {
            // Always show danger vignette, even on low quality
            this.drawVignette(gameState.criticalIntensity, timestamp);
        }

        // 5. Impact flash (always active when triggered, on top of everything)
        if (gameState.impactFlash > 0) {
            this.drawImpactFlash(gameState.impactFlash, gameState.impactFlashColor);
        }

        // JUICE: Dev-only perf overlay (toggle P or window.__DEV_PERF__)
        if (gameState.devPerfOverlay) {
            this.drawDevMetricsOverlay(gameState, profile);
        }
    }

}

installRendererPostEffects(Renderer);
installRendererInterfaceEffects(Renderer);
installRendererCrystal(Renderer);
installRendererCave(Renderer);
