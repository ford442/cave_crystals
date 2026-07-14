/** @import { GameState, Launcher, RenderQualityLevel, RenderQualityProfile } from './types.js' */

import { resolveParticleStride } from './RendererConstants.js';
import { RendererHost } from './renderers/RendererHost.js';
import { CrystalRenderer } from './renderers/CrystalRenderer.js';
import { CaveRenderer } from './renderers/CaveRenderer.js';
import { PostEffectsRenderer } from './renderers/PostEffectsRenderer.js';
import { HudEffectsRenderer } from './renderers/HudEffectsRenderer.js';
import { ParticleRenderer } from './renderers/ParticleRenderer.js';

export class Renderer {
    /**
     * @param {HTMLCanvasElement} canvas
     */
    constructor(canvas) {
        this.host = new RendererHost(canvas);
        this.host.crystal = new CrystalRenderer(this.host);
        this.host.cave = new CaveRenderer(this.host);
        this.host.post = new PostEffectsRenderer(this.host);
        this.host.hud = new HudEffectsRenderer(this.host);
        this.host.particles = new ParticleRenderer(this.host);

        /** @type {CrystalRenderer} */
        this.crystal = this.host.crystal;
        /** @type {CaveRenderer} */
        this.cave = this.host.cave;
        /** @type {PostEffectsRenderer} */
        this.post = this.host.post;
        /** @type {HudEffectsRenderer} */
        this.hud = this.host.hud;
        /** @type {ParticleRenderer} */
        this.particles = this.host.particles;
    }

    /** @returns {HTMLCanvasElement} */
    get canvas() { return this.host.canvas; }

    /** @returns {CanvasRenderingContext2D | null} */
    get ctx() { return this.host.ctx; }

    /** @returns {number} */
    get width() { return this.host.width; }

    /** @returns {number} */
    get height() { return this.host.height; }

    /** @returns {number} */
    get laneWidth() { return this.host.laneWidth; }

    /** Back-compat for GameRuntime drip spawn positions. */
    get _caveGeometry() { return this.host._caveGeometry; }

    /**
     * @param {number} w
     * @param {number} h
     */
    resize(w, h) {
        this.host.resize(w, h);
    }

    clear() {
        // No-op: clear is combined with the dark overlay in draw()
    }

    /**
     * @param {RenderQualityLevel} [quality]
     * @returns {RenderQualityProfile}
     */
    getQualityProfile(quality = 'high') {
        return this.host.getQualityProfile(quality);
    }

    /**
     * @param {GameState} gameState
     * @param {Launcher} launcher
     * @param {number} [timestamp]
     */
    draw(gameState, launcher, timestamp = performance.now()) {
        const { host, crystal, cave, post, hud, particles } = this;
        if (!host.ctx) return;
        const profile = host.getQualityProfile(gameState.renderQuality);

        host.ctx.fillStyle = 'rgba(0, 0, 10, 1.0)';
        host.ctx.fillRect(0, 0, host.width, host.height);

        cave.drawCaveLayers(gameState, timestamp);
        post.drawLighting(gameState, launcher, profile, timestamp);

        if (gameState.impactFlash > 0.3) {
            host.ctx.fillStyle = gameState.impactFlashColor || '#000';
            host.ctx.globalAlpha = gameState.impactFlash * 0.2;
            host.ctx.fillRect(0, 0, host.width, host.height);
            host.ctx.globalAlpha = 1.0;
        }

        host.ctx.save();

        const launcherSpeed = launcher ? launcher.speed : 0;
        const warpMagnitude = gameState.shake + (launcherSpeed * 2.5);
        const particleCount = gameState.particles ? gameState.particles.length : 0;
        const isWarping = warpMagnitude > 3.0;

        crystal.prepareShockwaveDistortionField(gameState, profile, particleCount, launcher);

        if (gameState.zoom && gameState.zoom > 1.0) {
            const zx = gameState.zoomFocus ? gameState.zoomFocus.x : host.width / 2;
            const zy = gameState.zoomFocus ? gameState.zoomFocus.y : host.height / 2;
            host.ctx.translate(zx, zy);
            host.ctx.scale(gameState.zoom, gameState.zoom);
            host.ctx.translate(-zx, -zy);
        }

        if (gameState.shakeOffset) {
            const cx = host.width / 2;
            const cy = host.height / 2;
            host.ctx.translate(cx, cy);
            host.ctx.rotate(gameState.shakeOffset.angle || 0);
            host.ctx.translate(-cx, -cy);
            host.ctx.translate(gameState.shakeOffset.x || 0, gameState.shakeOffset.y || 0);
        } else if (gameState.shake > 0) {
            const dx = (Math.random() - 0.5) * gameState.shake;
            const dy = (Math.random() - 0.5) * gameState.shake;
            host.ctx.translate(dx, dy);
        }

        if (gameState.dustParticles) {
            post.drawDust(gameState.dustParticles, profile.maxDust);
        }

        if (gameState.envParticles && gameState.envParticles.length > 0) {
            cave.drawEnvironmentalParticles(gameState.envParticles, gameState, timestamp);
        }

        if (profile.fog) {
            post.drawVolumetricFog(gameState, profile, timestamp);
        }

        cave.drawCaveWallOverlays(gameState, timestamp);
        hud.drawHoloGrid(gameState, launcher, profile, timestamp);
        hud.drawTargetingSystem(gameState, launcher, timestamp);

        for (let i = 0; i < gameState.crystals.length; i++) {
            const c = gameState.crystals[i];
            const distortion = crystal.getCrystalDistortion(i);
            crystal.drawComplexCrystal(
                c, null, particleCount, profile, timestamp, launcher, gameState.spores,
                distortion.x, distortion.y
            );
        }

        if (launcher) {
            const distortion = crystal.getLauncherDistortion();
            const hasDist = distortion.x !== 0 || distortion.y !== 0;
            if (hasDist || isWarping) {
                host.ctx.save();
                if (hasDist) host.ctx.translate(distortion.x, distortion.y);

                if (isWarping) {
                    host.ctx.globalCompositeOperation = 'screen';
                    host.ctx.save();
                    host.ctx.translate(-4 - (warpMagnitude * 0.2), 0);
                    hud.drawCursor(gameState, launcher, 'red');
                    host.ctx.restore();

                    host.ctx.save();
                    host.ctx.translate(4 + (warpMagnitude * 0.2), 0);
                    hud.drawCursor(gameState, launcher, 'blue');
                    host.ctx.restore();

                    host.ctx.globalCompositeOperation = 'source-over';
                }
                hud.drawCursor(gameState, launcher);
                host.ctx.restore();
            } else {
                hud.drawCursor(gameState, launcher);
            }
        }

        for (let i = 0; i < gameState.spores.length; i++) {
            hud.drawSpore(gameState.spores[i], timestamp);
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
        particles.drawParticlesBatched(gameState.particles, particleLimit, stride, gameState);

        if (gameState.shockwaves) {
            for (let i = 0; i < gameState.shockwaves.length; i++) {
                const sw = gameState.shockwaves[i];
                if (sw.x + sw.radius < 0 || sw.x - sw.radius > host.width || sw.y + sw.radius < 0 || sw.y - sw.radius > host.height) continue;
                particles.drawShockwave(sw);
            }
        }

        if (gameState.energyRings) {
            for (let i = 0; i < gameState.energyRings.length; i++) {
                const ring = gameState.energyRings[i];
                if (ring.x + ring.radius < 0 || ring.x - ring.radius > host.width || ring.y + ring.radius < 0 || ring.y - ring.radius > host.height) continue;
                particles.drawEnergyRing(ring);
            }
        }

        if (gameState.floatingTexts) {
            for (let i = 0; i < gameState.floatingTexts.length; i++) {
                const ft = gameState.floatingTexts[i];
                if (ft.y + 40 < 0 || ft.y - 40 > host.height) continue;
                particles.drawFloatingText(ft);
            }
        }

        if (gameState.soulParticles) {
            for (let i = 0; i < gameState.soulParticles.length; i++) {
                const sp = gameState.soulParticles[i];
                if (sp.x + sp.size < 0 || sp.x - sp.size > host.width || sp.y + sp.size < 0 || sp.y - sp.size > host.height) continue;
                particles.drawSoulParticle(sp);
            }
        }

        host.ctx.restore();

        if (gameState.devPerfOverlay && gameState.perfMetrics) {
            gameState.perfMetrics.distortionLookupCount = host._distortionLookupCount || 0;
        }

        if (profile.bloom) {
            post.drawBloom(gameState, profile, timestamp);
        }

        if (profile.lightShafts) {
            post.drawLightShafts(gameState, launcher, timestamp, profile);
        }

        if (profile.colorGrade) {
            post.drawColorGrade(gameState, timestamp);
        }

        if (profile.postFX) {
            post.drawFilmPass(gameState, timestamp, profile);
        } else if (gameState.criticalIntensity > 0.01) {
            post.drawVignette(gameState.criticalIntensity, timestamp);
        }

        if (gameState.impactFlash > 0) {
            post.drawImpactFlash(gameState.impactFlash, gameState.impactFlashColor);
        }

        if (gameState.devPerfOverlay) {
            hud.drawDevMetricsOverlay(gameState, profile);
        }
    }
}
