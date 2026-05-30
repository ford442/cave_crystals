import { COLORS, GAME_CONFIG } from './Constants.js';

const FILM_GRAIN_REFRESH_INTERVAL_MS = 90;
const EMERGENCY_PARTICLE_STRIDE_BOOST = 1;
// Maximum number of explosion particles sampled for bloom — caps cost during chaos
const MAX_BLOOM_PARTICLES = 40;
const RENDER_QUALITY_PROFILES = {
    high: {
        maxDust: 140, maxParticles: 1400, particleStride: 1, gridBase: 50,
        crystalDetail: 'high', postFX: true, lightShafts: true, fog: true, allowGridDistortion: true,
        bloom: true, bloomStrength: 0.85, grainAmount: 1.0, colorGrade: true, scanlineBase: 0.08
    },
    medium: {
        maxDust: 95, maxParticles: 800, particleStride: 1, gridBase: 65,
        crystalDetail: 'medium', postFX: true, lightShafts: true, fog: true, allowGridDistortion: false,
        bloom: false, bloomStrength: 0.0, grainAmount: 0.65, colorGrade: true, scanlineBase: 0.04
    },
    low: {
        maxDust: 55, maxParticles: 420, particleStride: 2, gridBase: 90,
        crystalDetail: 'low', postFX: false, lightShafts: false, fog: true, allowGridDistortion: false,
        bloom: false, bloomStrength: 0.0, grainAmount: 0.0, colorGrade: false, scanlineBase: 0.0
    }
};

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
        // Resize bloom buffer to match new resolution
        this._bloomCanvas.width = Math.max(4, Math.floor(w / 4));
        this._bloomCanvas.height = Math.max(4, Math.floor(h / 4));
        this._bloomGradCache.clear();
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

        if (profile.fog) {
            this.drawVolumetricFog(gameState, profile, timestamp);
        }

        this.drawHoloGrid(gameState, launcher, profile, timestamp);
        this.drawTargetingSystem(gameState, launcher, timestamp);

        // Draw Crystals (skip chromatic aberration on crystals during explosions)
        for (let i = 0; i < gameState.crystals.length; i++) {
            const c = gameState.crystals[i];
             // JUICE: Apply Shockwave Distortion
             // Calculate center of crystal
             const cX = (c.lane * this.laneWidth) + (this.laneWidth / 2);
             const cY = c.type === 'top' ? c.height / 2 : this.height - (c.height / 2);
             const distortion = this.calculateShockwaveDistortion(cX, cY, gameState);

             if (distortion.x !== 0 || distortion.y !== 0) {
                 this.ctx.save();
                 this.ctx.translate(distortion.x, distortion.y);
             }

             // Only apply chromatic aberration to launcher, not crystals
             this.drawComplexCrystal(c, null, particleCount, profile, timestamp, launcher, gameState.spores);
             if (distortion.x !== 0 || distortion.y !== 0) {
                 this.ctx.restore();
             }
        }

        // Draw Launcher with Chromatic Aberration (Motion Blur)
        if (launcher) {
            // JUICE: Apply Shockwave Distortion
            const distortion = this.calculateShockwaveDistortion(launcher.x, launcher.y, gameState);
            this.ctx.save();
            this.ctx.translate(distortion.x, distortion.y);

            if (isWarping) {
                this.ctx.globalCompositeOperation = 'screen';
                // Red Channel
                this.ctx.save();
                this.ctx.translate(-4 - (warpMagnitude * 0.2), 0);
                this.drawCursor(gameState, launcher, 'red');
                this.ctx.restore();

                // Blue Channel
                this.ctx.save();
                this.ctx.translate(4 + (warpMagnitude * 0.2), 0);
                this.drawCursor(gameState, launcher, 'blue');
                this.ctx.restore();

                this.ctx.globalCompositeOperation = 'source-over';
            }
            this.drawCursor(gameState, launcher);
            this.ctx.restore();
        }
        for (let i = 0; i < gameState.spores.length; i++) {
            this.drawSpore(gameState.spores[i], timestamp);
        }

        const particleLimit = Math.min(profile.maxParticles, particleCount);
        const stride = particleCount > profile.maxParticles ? profile.particleStride + EMERGENCY_PARTICLE_STRIDE_BOOST : profile.particleStride;
        for (let i = 0; i < particleLimit; i += stride) {
            const p = gameState.particles[i];
            if (p.isTrail) {
                const s = p.size;
                if (p.x + s < 0 || p.x - s > this.width || p.y + s < 0 || p.y - s > this.height) continue;
                this.drawTrailParticle(p);
            } else {
                const s = p.size * (p.life / p.maxLife);
                if (p.x + s < 0 || p.x - s > this.width || p.y + s < 0 || p.y - s > this.height) continue;
                this.drawParticle(p);
            }
        }

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

        // --- Cinematic Post-Processing Stack ---

        // 1. Bloom — bright elements bleed into fog and environment (high only)
        if (profile.bloom) {
            this.drawBloom(gameState, profile, timestamp);
        }

        // 2. Enhanced light shafts (reactive to crystals and explosions)
        if (profile.lightShafts) {
            this.drawLightShafts(gameState, launcher, timestamp);
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
    }

    drawVignette(intensity, timestamp) {
        if (!this.ctx) return;

        // Pulse alpha
        const pulse = 0.5 + 0.5 * Math.sin(timestamp / 200);
        const alpha = intensity * 0.6 * pulse; // Max 0.6 opacity

        // Cache gradient shape; modulate opacity via globalAlpha
        if (!this._vignetteGradient) {
            const radius = Math.max(this.width, this.height);
            this._vignetteGradient = this.ctx.createRadialGradient(
                this.width / 2, this.height / 2, this.height * 0.2,
                this.width / 2, this.height / 2, radius * 0.8
            );
            this._vignetteGradient.addColorStop(0, 'rgba(255, 0, 0, 0)');
            this._vignetteGradient.addColorStop(1, 'rgba(255, 0, 0, 1)');
        }

        const prevAlpha = this.ctx.globalAlpha;
        const prevFillStyle = this.ctx.fillStyle;
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = this._vignetteGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalAlpha = prevAlpha;

        // Add "Danger" text if intensity is very high
        if (intensity > 0.8 && pulse > 0.8) {
             const prevFont = this.ctx.font;
             const prevTextAlign = this.ctx.textAlign;
             const prevTextBaseline = this.ctx.textBaseline;
             this.ctx.font = 'bold 60px Righteous, monospace';
             this.ctx.fillStyle = `rgba(255, 0, 0, ${intensity})`;
             this.ctx.textAlign = 'center';
             this.ctx.textBaseline = 'middle';
             this.ctx.fillText("CRITICAL!", this.width / 2, this.height * 0.3);
             this.ctx.font = prevFont;
             this.ctx.textAlign = prevTextAlign;
             this.ctx.textBaseline = prevTextBaseline;
             this.ctx.fillStyle = prevFillStyle;
        } else {
            this.ctx.fillStyle = prevFillStyle;
        }
    }

    drawLighting(gameState, launcher, profile, timestamp) {
        this.ctx.globalCompositeOperation = 'lighter';

        const time = timestamp / 1000;

        // Helper to draw a light blob with cached gradients
        const drawLight = (x, y, color, radius, intensity = 1.0) => {
             const bucketRadius = Math.floor(radius / 25) * 25 + 25;
             const cacheKey = `${color}-${bucketRadius}`;
             let grad = this._gradientCache.get(cacheKey);
             if (!grad) {
                 grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, bucketRadius);
                 const rgb = this.hexToRgb(color) || {r:255, g:255, b:255};
                 grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1.0)`);
                 grad.addColorStop(0.3, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
                 grad.addColorStop(0.6, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
                 grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                 this._gradientCache.set(cacheKey, grad);
             }
             const prevAlpha = this.ctx.globalAlpha;
             this.ctx.globalAlpha = intensity;
             this.ctx.fillStyle = grad;
             this.ctx.beginPath();
             this.ctx.arc(x, y, radius, 0, Math.PI * 2);
             this.ctx.fill();
             this.ctx.globalAlpha = prevAlpha;
        };

        // 1. Crystal Lights — improved area light with height-based spread
        gameState.crystals.forEach(c => {
             const x = (c.lane * this.laneWidth) + (this.laneWidth / 2);
             const h = c.height * (c.scaleY || 1.0);
             let y;
             if (c.type === 'top') {
                 y = h - 20; // Near the tip
             } else {
                 y = this.height - h + 20;
             }

             // Calculate dynamic intensity
             // Base pulse using the new lightPhase
             const pulse = Math.sin((time * 3) + c.lightPhase) * 0.2 + 0.8;
             // Flash intensity
             const flashBonus = c.flash * 2.0;

             const radius = 150 + (flashBonus * 100) + (h * 0.3);
             const intensity = (0.3 + (flashBonus * 0.5)) * pulse;

             const col = COLORS[c.colorIdx].hex;
             drawLight(x, y, col, radius, intensity);

             // Secondary area light at crystal base for better vertical coverage
             if (profile.crystalDetail === 'high') {
                 const baseY = c.type === 'top' ? 10 : this.height - 10;
                 drawLight(x, baseY, col, radius * 0.5, intensity * 0.25);
             }

             // Rim/edge highlight — small bright edge light after main geometry
             if (profile.crystalDetail !== 'low' && launcher) {
                 const dx = launcher.x - x;
                 const dist = Math.abs(dx);
                 if (dist < 300) {
                     const rimFalloff = 1 - dist / 300;
                     const rimX = x + (dx > 0 ? -15 : 15);
                     drawLight(rimX, y, '#ffffff', 20, rimFalloff * 0.2 * pulse);
                 }
             }

             // Wall Reflections
             // If in first lane, reflect on left wall
             if (profile.crystalDetail !== 'low' && c.lane === 0) {
                 // Squeeze the light vertically against the wall
                 this.ctx.setTransform(0.3, 0, 0, 2.0, 0, y);
                 drawLight(0, 0, col, radius * 1.5, intensity * 0.5);
                 this.ctx.setTransform(1, 0, 0, 1, 0, 0);
             }
             // If in last lane, reflect on right wall
             if (profile.crystalDetail !== 'low' && c.lane === GAME_CONFIG.lanes - 1) {
                 this.ctx.setTransform(0.3, 0, 0, 2.0, this.width, y);
                 drawLight(0, 0, col, radius * 1.5, intensity * 0.5);
                 this.ctx.setTransform(1, 0, 0, 1, 0, 0);
             }
        });

        // 2. Spore Lights
        gameState.spores.forEach(s => {
             const col = COLORS[s.colorIdx].hex;
             // Pulsing fast
             const radius = s.radius * 4;
             drawLight(s.x, s.y, col, radius, 0.6);
        });

        // 3. Launcher Light
        if (launcher) {
            drawLight(launcher.x, launcher.y, '#00FFFF', 100 + launcher.recoil * 5, 0.4);
        }

        // 4. Soul Particles Light
        if (gameState.soulParticles) {
             gameState.soulParticles.forEach(sp => {
                 drawLight(sp.x, sp.y, sp.color, 40, 0.6);
             });
        }

        // 5. Particle Sparkles — capped hard to save perf
        // Skip entirely if there are too many particles (chaos mode)
        const particleCount = gameState.particles ? gameState.particles.length : 0;
        if (profile.crystalDetail !== 'low' && particleCount <= 50) {
            let litCount = 0;
            const maxLit = 15;
            for (let i = 0; i < particleCount && litCount < maxLit; i++) {
                const p = gameState.particles[i];
                if (p.size > 4) {
                    drawLight(p.x, p.y, p.color, p.size * 4, 0.3 * p.life);
                    litCount++;
                }
            }
        }

        this.ctx.globalCompositeOperation = 'source-over';
    }

    drawDust(particles, maxCount = 100) {
        if (!particles) return;
        const prevFillStyle = this.ctx.fillStyle;
        // Faint blue-ish white for dust
        this.ctx.fillStyle = 'rgb(200, 220, 255)';
        const count = Math.min(particles.length, maxCount);
        for (let i = 0; i < count; i++) {
            const p = particles[i];
             // Use pre-calculated renderAlpha which includes pulse
             this.ctx.globalAlpha = p.renderAlpha || 0.1;
             this.ctx.beginPath();
             this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
             this.ctx.fill();
        }
        this.ctx.globalAlpha = 1.0;
        this.ctx.fillStyle = prevFillStyle;
    }

    drawImpactFlash(intensity, color = '#fff') {
        const prevComposite = this.ctx.globalCompositeOperation;
        const prevAlpha = this.ctx.globalAlpha;
        const prevFillStyle = this.ctx.fillStyle;
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = intensity;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalCompositeOperation = prevComposite;
        this.ctx.globalAlpha = prevAlpha;
        this.ctx.fillStyle = prevFillStyle;
    }

    drawVolumetricFog(gameState, profile, timestamp) {
        if (!this._fogGradient) {
            this._fogGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
            this._fogGradient.addColorStop(0, 'rgba(70, 95, 130, 0.22)');
            this._fogGradient.addColorStop(0.5, 'rgba(30, 60, 95, 0.08)');
            this._fogGradient.addColorStop(1, 'rgba(5, 15, 28, 0.32)');
        }

        const prevAlpha = this.ctx.globalAlpha;
        const prevComposite = this.ctx.globalCompositeOperation;
        const prevFillStyle = this.ctx.fillStyle;
        this.ctx.fillStyle = this._fogGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        const pulse = 0.04 + Math.sin(timestamp / 1600) * 0.02;
        this.ctx.globalAlpha = Math.max(0.02, pulse);
        this.ctx.globalCompositeOperation = 'screen';
        const sweeps = profile.crystalDetail === 'high' ? 3 : 1;
        for (let i = 0; i < sweeps; i++) {
            const x = ((timestamp * 0.01) + (i * this.width * 0.35)) % (this.width + 240) - 120;
            const grad = this.ctx.createLinearGradient(x, 0, x + 160, this.height);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.5, 'rgba(170,220,255,0.32)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(x - 120, 0, 240, this.height);
        }
        this.ctx.globalAlpha = prevAlpha;
        this.ctx.globalCompositeOperation = prevComposite;
        this.ctx.fillStyle = prevFillStyle;
    }

    drawLightShafts(gameState, launcher, timestamp = 0) {
        const time = timestamp / 1000;
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';

        // --- Collect shaft sources ---
        const sources = [];

        // Primary source: launcher target lane
        const lane = launcher ? launcher.targetLane : Math.floor(GAME_CONFIG.lanes / 2);
        const centerX = (lane * this.laneWidth) + (this.laneWidth / 2);
        sources.push({ x: centerX, intensity: 0.13, r: 180, g: 255, b: 255 });

        // Crystal sources: brightest / tallest crystals add secondary shafts
        for (let i = 0; i < gameState.crystals.length && sources.length < 5; i++) {
            const c = gameState.crystals[i];
            if (c.flash < 0.05 && c.height < 90) continue;
            const cx = (c.lane * this.laneWidth) + (this.laneWidth / 2);
            const col = COLORS[c.colorIdx];
            const rgb = this.hexToRgb(col.hex) || { r: 180, g: 255, b: 255 };
            const intensity = 0.055 + c.flash * 0.10;
            sources.push({ x: cx, intensity, r: rgb.r, g: rgb.g, b: rgb.b });
        }

        // Explosion sources: active shockwaves near the top half add brief bright shafts
        if (gameState.shockwaves) {
            for (let i = 0; i < gameState.shockwaves.length && sources.length < 7; i++) {
                const sw = gameState.shockwaves[i];
                if (sw.life <= 0.25 || sw.y > this.height * 0.55) continue;
                sources.push({ x: sw.x, intensity: sw.life * 0.14, r: 255, g: 230, b: 180 });
            }
        }

        // --- Draw shafts for each source ---
        for (let si = 0; si < sources.length; si++) {
            const { x, intensity, r, g, b } = sources[si];

            for (let i = -1; i <= 1; i++) {
                // Animate shaft direction and width with per-shaft noise
                const angleNoise = Math.sin(time * 0.65 + i * 1.3 + si) * 0.025;
                const widthMod = 1 + Math.sin(time * 1.05 + i * 0.85 + si * 0.7) * 0.14;
                const opacityPulse = intensity * (0.8 + Math.sin(time * 2.2 + i * 2.0 + si) * 0.2);

                const sx = x + (i * this.laneWidth * 0.8);
                const topW = 45 * widthMod;
                const botW = 175 * widthMod;
                const shaftH = this.height * 0.68;
                const angOff = angleNoise * shaftH * 0.35;

                const shaft = this.ctx.createLinearGradient(sx, 0, sx, shaftH);
                shaft.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.45)`);
                shaft.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.18)`);
                shaft.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

                this.ctx.globalAlpha = opacityPulse;
                this.ctx.fillStyle = shaft;
                this.ctx.beginPath();
                this.ctx.moveTo(sx - topW, 0);
                this.ctx.lineTo(sx + topW, 0);
                this.ctx.lineTo(sx + botW + angOff, shaftH);
                this.ctx.lineTo(sx - botW + angOff, shaftH);
                this.ctx.closePath();
                this.ctx.fill();

                // Dust motes in the beam: overlay grain texture inside the primary shaft only.
                // Limiting to si===0 avoids redundant fills for secondary crystal/explosion shafts.
                if (this._grainPattern && si === 0) {
                    this.ctx.globalAlpha = opacityPulse * 0.08;
                    this.ctx.fillStyle = this._grainPattern;
                    this.ctx.fill();
                }
            }
        }

        this.ctx.globalAlpha = 1.0;
        this.ctx.restore();
    }

    drawFilmGrain(timestamp, grainAmount = 1.0) {
        if (grainAmount <= 0) return;
        if (!this._lastGrainRefresh || timestamp - this._lastGrainRefresh > FILM_GRAIN_REFRESH_INTERVAL_MS) {
            const size = 256;
            const img = this._grainCtx.createImageData(size, size);
            for (let i = 0; i < img.data.length; i += 4) {
                // Multi-octave noise: coarse grain + fine grain for realistic film texture
                const coarse = Math.random() * 28;
                const fine = Math.random() * 14;
                const v = Math.floor(coarse * 0.65 + fine * 0.35);
                img.data[i] = v;
                img.data[i + 1] = v;
                img.data[i + 2] = v;
                img.data[i + 3] = Math.floor(16 + Math.random() * 10);
            }
            this._grainCtx.putImageData(img, 0, 0);
            this._grainPattern = this.ctx.createPattern(this._grainCanvas, 'repeat');
            this._lastGrainRefresh = timestamp;
        }
        if (!this._grainPattern) return;
        const prevComposite = this.ctx.globalCompositeOperation;
        const prevAlpha = this.ctx.globalAlpha;
        const prevFillStyle = this.ctx.fillStyle;
        this.ctx.fillStyle = this._grainPattern;
        // First pass: overlay for mid-tone grain texture
        this.ctx.globalCompositeOperation = 'overlay';
        this.ctx.globalAlpha = 0.11 * grainAmount;
        this.ctx.fillRect(0, 0, this.width, this.height);
        // Second pass: screen for bright grain "sparkle"
        this.ctx.globalCompositeOperation = 'screen';
        this.ctx.globalAlpha = 0.04 * grainAmount;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalCompositeOperation = prevComposite;
        this.ctx.globalAlpha = prevAlpha;
        this.ctx.fillStyle = prevFillStyle;
    }

    // --- New Cinematic Post-Processing Methods ---

    drawBloom(gameState, profile, timestamp) {
        const bw = this._bloomCanvas.width;
        const bh = this._bloomCanvas.height;
        const sx = bw / this.width;
        const sy = bh / this.height;
        const bctx = this._bloomCtx;
        const strength = profile.bloomStrength || 0.85;

        // Clear bloom buffer each frame
        bctx.clearRect(0, 0, bw, bh);
        bctx.globalCompositeOperation = 'lighter';

        // Helper: draw a soft radial glow blob on the bloom canvas.
        // Cache key uses coarse color buckets (64-unit) and radius buckets (16-unit)
        // to maximise hit rate across similar-coloured crystals.
        const drawBlob = (bx, by, radius, r, g, b, alpha) => {
            const cacheKey = `${Math.floor(r/64)*64}-${Math.floor(g/64)*64}-${Math.floor(b/64)*64}-${Math.floor(radius/16)*16}`;
            let grad = this._bloomGradCache.get(cacheKey);
            if (!grad) {
                grad = bctx.createRadialGradient(0, 0, 0, 0, 0, 1);
                grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
                grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.35)`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                this._bloomGradCache.set(cacheKey, grad);
            }
            bctx.save();
            bctx.globalAlpha = alpha;
            bctx.translate(bx, by);
            bctx.scale(radius, radius);
            bctx.fillStyle = grad;
            bctx.beginPath();
            bctx.arc(0, 0, 1, 0, Math.PI * 2);
            bctx.fill();
            bctx.restore();
        };

        // Crystal bloom sources — size based on height and flash
        for (let i = 0; i < gameState.crystals.length; i++) {
            const c = gameState.crystals[i];
            const cx = ((c.lane * this.laneWidth) + (this.laneWidth / 2)) * sx;
            const h = c.height * (c.scaleY || 1.0);
            const cy = c.type === 'top' ? (h - 20) * sy : (this.height - h + 20) * sy;
            const flashBonus = c.flash * 2.0;
            const radius = (140 + flashBonus * 110 + h * 0.32) * sx * 1.8;
            const alpha = Math.min(1, (0.28 + flashBonus * 0.7) * strength);
            const col = COLORS[c.colorIdx];
            const rgb = this.hexToRgb(col.hex) || { r: 255, g: 255, b: 255 };
            drawBlob(cx, cy, radius, rgb.r, rgb.g, rgb.b, alpha);
        }

        // Spore bloom sources
        for (let i = 0; i < gameState.spores.length; i++) {
            const s = gameState.spores[i];
            const cx = s.x * sx;
            const cy = s.y * sy;
            const radius = s.radius * sx * 7;
            const col = COLORS[s.colorIdx];
            const rgb = this.hexToRgb(col.hex) || { r: 255, g: 255, b: 255 };
            drawBlob(cx, cy, radius, rgb.r, rgb.g, rgb.b, 0.75 * strength);
        }

        // Explosion bloom from high-life, large particles
        if (gameState.particles) {
            const limit = Math.min(gameState.particles.length, MAX_BLOOM_PARTICLES);
            for (let i = 0; i < limit; i++) {
                const p = gameState.particles[i];
                if (p.size <= 3) continue;
                const alpha = (p.life / p.maxLife) * 0.35 * strength;
                if (alpha <= 0) continue;
                const radius = p.size * sx * 3.5;
                bctx.globalAlpha = alpha;
                bctx.fillStyle = p.color;
                bctx.beginPath();
                bctx.arc(p.x * sx, p.y * sy, radius, 0, Math.PI * 2);
                bctx.fill();
            }
            bctx.globalAlpha = 1.0;
        }

        // Impact flash bloom — fill entire bloom canvas when flash is strong
        if (gameState.impactFlash > 0.15) {
            bctx.globalAlpha = gameState.impactFlash * 0.4 * strength;
            bctx.fillStyle = gameState.impactFlashColor || '#ffffff';
            bctx.fillRect(0, 0, bw, bh);
            bctx.globalAlpha = 1.0;
        }

        bctx.globalCompositeOperation = 'source-over';

        // Composite bloom onto main canvas at full resolution using 'lighter'.
        // Natural bilinear upscale (1/4 → full) creates the soft bleed effect.
        // Two passes at different weights to separate wide soft bleed from core brightness.
        const ctx = this.ctx;
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = strength * 0.42;
        ctx.drawImage(this._bloomCanvas, 0, 0, this.width, this.height);
        // Second pass at lower weight adds extra core brightness without blowing out edges
        ctx.globalAlpha = strength * 0.18;
        ctx.drawImage(this._bloomCanvas, 0, 0, this.width, this.height);
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = prevOp;
    }

    drawColorGrade(gameState, timestamp) {
        const time = timestamp / 1000;
        const prevOp = this.ctx.globalCompositeOperation;
        const prevAlpha = this.ctx.globalAlpha;
        const prevFill = this.ctx.fillStyle;

        // Base atmospheric grade: subtle cool-blue tint reinforces cave feel
        this.ctx.globalCompositeOperation = 'multiply';
        this.ctx.globalAlpha = 0.045;
        if (!this._colorGradeBaseGrad || this._colorGradeBaseGradH !== this.height) {
            this._colorGradeBaseGrad = this.ctx.createLinearGradient(0, 0, 0, this.height);
            this._colorGradeBaseGrad.addColorStop(0, 'rgba(150, 190, 255, 1)');
            this._colorGradeBaseGrad.addColorStop(1, 'rgba(70, 110, 200, 1)');
            this._colorGradeBaseGradH = this.height;
        }
        this.ctx.fillStyle = this._colorGradeBaseGrad;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Danger grade: warm orange-red tint, grows with criticalIntensity
        const danger = gameState.criticalIntensity || 0;
        if (danger > 0) {
            this.ctx.globalCompositeOperation = 'overlay';
            this.ctx.globalAlpha = danger * 0.10;
            this.ctx.fillStyle = 'rgba(255, 55, 0, 1)';
            this.ctx.fillRect(0, 0, this.width, this.height);
            // Lift blacks slightly for "blown-out" look at high danger
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.globalAlpha = danger * 0.04;
            this.ctx.fillStyle = 'rgba(80, 10, 0, 1)';
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        // Combo grade: warm golden shimmer at high combo
        const combo = gameState.combo || 0;
        if (combo > 2) {
            const comboT = Math.min(1, (combo - 2) / 8);
            const shimmer = 0.5 + 0.5 * Math.sin(time * 3.5);
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.globalAlpha = comboT * 0.055 * shimmer;
            if (!this._colorGradeComboGrad || this._colorGradeComboGradW !== this.width) {
                this._colorGradeComboGrad = this.ctx.createLinearGradient(0, 0, this.width, this.height);
                this._colorGradeComboGrad.addColorStop(0, 'rgba(255, 210, 60, 1)');
                this._colorGradeComboGrad.addColorStop(1, 'rgba(255, 130, 30, 1)');
                this._colorGradeComboGradW = this.width;
            }
            this.ctx.fillStyle = this._colorGradeComboGrad;
            this.ctx.fillRect(0, 0, this.width, this.height);
        }

        this.ctx.globalCompositeOperation = prevOp;
        this.ctx.globalAlpha = prevAlpha;
        this.ctx.fillStyle = prevFill;
    }

    _drawBaseVignette() {
        // Subtle permanent dark vignette for cinematic framing
        if (!this._baseVignetteGradient) {
            const radius = Math.max(this.width, this.height);
            this._baseVignetteGradient = this.ctx.createRadialGradient(
                this.width / 2, this.height / 2, this.height * 0.28,
                this.width / 2, this.height / 2, radius * 0.92
            );
            this._baseVignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            this._baseVignetteGradient.addColorStop(1, 'rgba(0, 0, 10, 0.58)');
        }
        const prevAlpha = this.ctx.globalAlpha;
        const prevFill = this.ctx.fillStyle;
        this.ctx.globalAlpha = 1.0;
        this.ctx.fillStyle = this._baseVignetteGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalAlpha = prevAlpha;
        this.ctx.fillStyle = prevFill;
    }

    drawFilmPass(gameState, timestamp, profile) {
        const grainAmount = profile.grainAmount || 0;

        // 1. Permanent base vignette for cinematic framing
        this._drawBaseVignette();

        // 2. Critical danger vignette (pulsing red)
        if (gameState.criticalIntensity > 0.01) {
            this.drawVignette(gameState.criticalIntensity, timestamp);
        }

        // 3. Scanlines — subtly always present; more pronounced during critical.
        // Base intensity is set per quality profile (scanlineBase) for independent tuning.
        const scanlineBase = profile.scanlineBase || 0;
        const scanlineIntensity = Math.min(1.0, scanlineBase + (gameState.criticalIntensity || 0) * 0.28);
        this.drawScanlines(scanlineIntensity);

        // 4. Glitch — only during high danger
        if ((gameState.criticalIntensity || 0) > 0.2) {
            this.drawGlitch(gameState.criticalIntensity);
        }

        // 5. Multi-octave film grain
        if (grainAmount > 0) {
            this.drawFilmGrain(timestamp, grainAmount);
        }
    }

    drawHoloGrid(gameState, launcher, profile, timestamp) {
        // JUICE: Dynamic Holographic Grid
        const particleCount = gameState.particles ? gameState.particles.length : 0;
        const gridSize = particleCount > 30 ? profile.gridBase + 20 : profile.gridBase; // Coarser grid during chaos
        const time = timestamp;
        const pulse = Math.sin(time / 1000) * 0.5 + 0.5; // Slow heartbeat pulse

        // Setup base grid style
        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';

        // Active Lane Glow
        const activeLane = launcher ? launcher.targetLane : -1;
        const activeX = (activeLane * this.laneWidth) + (this.laneWidth / 2);

        // Skip expensive distortion when there are too many particles (chaos mode)
        // or when no shockwaves are active
        const hasActiveShockwaves = profile.allowGridDistortion && particleCount <= 40 && gameState.shockwaves && gameState.shockwaves.some(sw => sw.life > 0);

        // Precompute breathe constants
        const cx = this.width / 2;
        const cy = this.height / 2;
        const breatheScale = 0.01 * pulse;
        const prevLineWidth = this.ctx.lineWidth;
        const prevStrokeStyle = this.ctx.strokeStyle;
        const prevShadowBlur = this.ctx.shadowBlur;
        const prevShadowColor = this.ctx.shadowColor;

        // Horizontal Lines
        for (let y = 0; y <= this.height; y += gridSize) {
             this.ctx.beginPath();
             let start = true;
             for (let x = 0; x <= this.width; x += gridSize) {
                 let distX = 0, distY = 0;
                 if (hasActiveShockwaves) {
                     const dist = this.calculateShockwaveDistortion(x, y, gameState);
                     distX = dist.x;
                     distY = dist.y;
                 }

                 const breatheX = (x - cx) * breatheScale;
                 const breatheY = (y - cy) * breatheScale;

                 const finalX = x + distX + breatheX;
                 const finalY = y + distY + breatheY;

                 if (start) {
                     this.ctx.moveTo(finalX, finalY);
                     start = false;
                 } else {
                     this.ctx.lineTo(finalX, finalY);
                 }
             }
             this.ctx.stroke();
        }

        // Vertical Lines
        for (let x = 0; x <= this.width; x += gridSize) {
             const distToActive = Math.abs(x - activeX);
             let isNearActive = false;
             if (activeLane >= 0 && distToActive < this.laneWidth / 2) {
                 isNearActive = true;
             }

             if (isNearActive) {
                 this.ctx.strokeStyle = `rgba(0, 255, 255, ${0.1 + (pulse * 0.1)})`; // Cyan glow
                 this.ctx.lineWidth = 2;
                 this.ctx.shadowColor = 'cyan';
                 this.ctx.shadowBlur = 5;
             } else {
                 this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                 this.ctx.lineWidth = 1;
                 this.ctx.shadowBlur = 0;
             }

             this.ctx.beginPath();
             let start = true;
             for (let y = 0; y <= this.height; y += gridSize) {
                 let distX = 0, distY = 0;
                 if (hasActiveShockwaves) {
                     const dist = this.calculateShockwaveDistortion(x, y, gameState);
                     distX = dist.x;
                     distY = dist.y;
                 }

                 const breatheX = (x - cx) * breatheScale;
                 const breatheY = (y - cy) * breatheScale;

                 const finalX = x + distX + breatheX;
                 const finalY = y + distY + breatheY;

                 if (start) {
                     this.ctx.moveTo(finalX, finalY);
                     start = false;
                 } else {
                     this.ctx.lineTo(finalX, finalY);
                 }
             }
             this.ctx.stroke();
        }

        this.ctx.lineWidth = prevLineWidth;
        this.ctx.strokeStyle = prevStrokeStyle;
        this.ctx.shadowBlur = prevShadowBlur;
        this.ctx.shadowColor = prevShadowColor;
    }

    drawTargetingSystem(gameState, launcher, timestamp) {
        if (!gameState.active || !launcher) return;

        const targetLane = launcher.targetLane;
        const targetLaneX = (targetLane * this.laneWidth) + (this.laneWidth / 2);

        // Find target crystals (inline to avoid array allocation)
        const targets = [];
        for (let i = 0; i < gameState.crystals.length; i++) {
            if (gameState.crystals[i].lane === targetLane) {
                targets.push(gameState.crystals[i]);
            }
        }
        const nextColorIdx = gameState.nextSporeColorIdx;
        const time = timestamp;

        // Draw Laser Sight
        // Determine "Lock Status" based on if any crystal matches
        const hasMatch = targets.some(c => c.colorIdx === nextColorIdx);

        const prevLineWidth = this.ctx.lineWidth;
        const prevStrokeStyle = this.ctx.strokeStyle;
        const prevShadowBlur = this.ctx.shadowBlur;
        const prevShadowColor = this.ctx.shadowColor;
        const prevGlobalAlpha = this.ctx.globalAlpha;
        const beamX = targetLaneX;

        if (hasMatch) {
            // MATCH: High Energy Beam
            const col = COLORS[nextColorIdx].hex;
            this.ctx.strokeStyle = col;
            this.ctx.lineWidth = 3;
            this.ctx.shadowColor = col;
            this.ctx.shadowBlur = 15;
            this.ctx.setLineDash([20, 10]);
            this.ctx.lineDashOffset = -(time / 10); // Fast flow
        } else {
            // NO MATCH: Searching/Scanning Beam
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.lineWidth = 1;
            this.ctx.shadowBlur = 0;
            this.ctx.setLineDash([5, 15]);
            this.ctx.lineDashOffset = -(time / 50); // Slow flow
        }

        this.ctx.beginPath();
        this.ctx.moveTo(beamX, 0);
        this.ctx.lineTo(beamX, this.height);
        this.ctx.stroke();

        this.ctx.setLineDash([]);

        // Draw Reticles on Targets
        targets.forEach(c => {
            const isMatch = c.colorIdx === nextColorIdx;

            // Calculate Crystal Tip Position
            const cX = beamX; // Assumes crystal is centered in lane
            // Adding shake
            const shakeX = c.shakeX || 0;
            const shakeY = c.shakeY || 0;

            let tipY;
             if (c.type === 'top') {
                 tipY = c.height + shakeY;
             } else {
                 tipY = this.height - c.height + shakeY;
             }

             this.ctx.setTransform(1, 0, 0, 1, cX + shakeX, tipY);

             // Reticle Animation
             if (isMatch) {
                 const spin = time / 100;
                 const scale = 1.0 + Math.sin(time / 50) * 0.2;
                 this.ctx.rotate(spin);
                 this.ctx.scale(scale, scale);

                 this.ctx.strokeStyle = COLORS[c.colorIdx].hex;
                 this.ctx.lineWidth = 3;
                 this.ctx.shadowColor = COLORS[c.colorIdx].hex;
                 this.ctx.shadowBlur = 10;

                 // Draw Bracket
                 this.ctx.beginPath();
                 this.ctx.arc(0, 0, 30, 0, Math.PI * 2); // Full ring for match
                 this.ctx.stroke();

                 // Inner crosshair
                 this.ctx.beginPath();
                 this.ctx.moveTo(-10, 0); this.ctx.lineTo(10, 0);
                 this.ctx.moveTo(0, -10); this.ctx.lineTo(0, 10);
                 this.ctx.stroke();

             } else {
                 // No match - Warning/Scanning
                 const spin = time / 1000; // Slow spin
                 this.ctx.rotate(spin);

                 this.ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)'; // Reddish warning
                 this.ctx.lineWidth = 2;

                 // Draw Broken Bracket
                 this.ctx.beginPath();
                 this.ctx.arc(0, 0, 30, 0, Math.PI * 0.5);
                 this.ctx.stroke();
                 this.ctx.beginPath();
                 this.ctx.arc(0, 0, 30, Math.PI, Math.PI * 1.5);
                 this.ctx.stroke();
             }

             this.ctx.setTransform(1, 0, 0, 1, 0, 0);

             // Connecting Line from Launcher to Target Tip
             this.ctx.beginPath();
             this.ctx.moveTo(launcher.x, launcher.y); // Start at actual launcher pos
             this.ctx.lineTo(cX + shakeX, tipY);

             if (isMatch) {
                 this.ctx.strokeStyle = COLORS[c.colorIdx].hex;
                 this.ctx.globalAlpha = 0.6;
                 this.ctx.lineWidth = 2;
             } else {
                 this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                 this.ctx.lineWidth = 1;
             }
             this.ctx.stroke();
        });

        this.ctx.lineWidth = prevLineWidth;
        this.ctx.strokeStyle = prevStrokeStyle;
        this.ctx.shadowBlur = prevShadowBlur;
        this.ctx.shadowColor = prevShadowColor;
        this.ctx.globalAlpha = prevGlobalAlpha;
    }

    drawCursor(gameState, launcher, colorOverride = null) {
        if(!gameState.active || !launcher) return;

        // Draw Actual Launcher Entity (Visual Position)
        this.ctx.save();
        this.ctx.translate(launcher.x, launcher.y);
        this.ctx.rotate(launcher.tilt);

        // JUICE: Velocity-based Squash & Stretch
        // Stretch in X (direction of movement), Squash in Y
        // launcher.scaleX/Y handles the firing recoil squash
        const speedSquash = Math.min(0.3, (launcher.speed || 0) * 0.02);
        const sx = launcher.scaleX + speedSquash;
        const sy = launcher.scaleY - (speedSquash * 0.5);
        this.ctx.scale(sx, sy);

        this.ctx.translate(0, launcher.recoil);

        // Setup Colors
        let mainColor = '#fff';
        let wingColor = '#0ff';
        let glowColor = '#0ff';
        let shadowBlur = 15;

        if (colorOverride === 'red') {
            mainColor = 'rgba(255, 0, 0, 0.7)';
            wingColor = 'rgba(255, 0, 0, 0.7)';
            glowColor = 'red';
            shadowBlur = 10;
        } else if (colorOverride === 'blue') {
            mainColor = 'rgba(0, 255, 255, 0.7)';
            wingColor = 'rgba(0, 255, 255, 0.7)';
            glowColor = 'cyan';
            shadowBlur = 10;
        }

        // Draw Juicy Launcher Shape (Triangle/Arrow)
        this.ctx.fillStyle = mainColor;
        this.ctx.shadowBlur = shadowBlur;
        this.ctx.shadowColor = glowColor;

        this.ctx.beginPath();
        // Central hub
        this.ctx.arc(0, 0, 10, 0, Math.PI*2);
        this.ctx.fill();

        // Wings/Pointers
        this.ctx.beginPath();
        this.ctx.moveTo(0, -15);
        this.ctx.lineTo(8, 5);
        this.ctx.lineTo(0, 0);
        this.ctx.lineTo(-8, 5);
        this.ctx.closePath();
        this.ctx.fillStyle = wingColor;
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.moveTo(0, 15);
        this.ctx.lineTo(8, -5);
        this.ctx.lineTo(0, 0);
        this.ctx.lineTo(-8, -5);
        this.ctx.closePath();
        this.ctx.fillStyle = wingColor;
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
        this.ctx.restore();
    }

    drawSpore(s, timestamp) {
        const col = COLORS[s.colorIdx];
        const time = timestamp;

        // Elastic spawn scale
        let scale = 1.0;
        if (s.spawnTime) {
            const age = (time - s.spawnTime) / 500; // 0.5s duration
            if (age < 1.0) {
                // Elastic ease out
                const c4 = (2 * Math.PI) / 3;
                scale = age === 0 ? 0 : age === 1 ? 1 : Math.pow(2, -10 * age) * Math.sin((age * 10 - 0.75) * c4) + 1;
            }
        }

        const baseRadius = s.radius * scale;

        this.ctx.save();
        this.ctx.translate(s.x, s.y);

        // JUICE: Plasma Core - Rotating Star
        const spin = time / 200;
        this.ctx.rotate(spin);

        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = col.hex;
        this.ctx.fillStyle = '#fff';

        // Draw Core (4-pointed Star shape)
        const coreSize = baseRadius * 0.8;
        const innerSize = coreSize * 0.3;
        const spikes = 4;

        this.ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const r = (i % 2 === 0) ? coreSize : innerSize;
            const a = (i * Math.PI) / spikes;
            this.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        this.ctx.closePath();
        this.ctx.fill();

        // Outer Glow/Halo
        // Rotate opposite for halo
        this.ctx.rotate(-spin * 2);
        // Cache spore halo gradient by color
        const sporeGradKey = `spore-${col.hex}`;
        let sporeGrad = this._gradientCache.get(sporeGradKey);
        if (!sporeGrad) {
            sporeGrad = this.ctx.createRadialGradient(0, 0, 0.5, 0, 0, 1.8);
            sporeGrad.addColorStop(0, '#fff');
            sporeGrad.addColorStop(0.2, col.hex);
            sporeGrad.addColorStop(1, 'transparent');
            this._gradientCache.set(sporeGradKey, sporeGrad);
        }
        this.ctx.fillStyle = sporeGrad;
        this.ctx.beginPath();
        this.ctx.arc(0, 0, baseRadius * 2.0, 0, Math.PI * 2);
        this.ctx.fill();

        // JUICE: Lightning Arcs
        // Use pre-generated arcs from spore (no Math.random in draw loop)
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = '#fff';

        for (let i = 0; i < s.lightningArcs.length; i++) {
            const arc = s.lightningArcs[i];
            const len = baseRadius * arc.lenRatio;

            this.ctx.save();
            this.ctx.rotate(arc.angle);
            this.ctx.beginPath();
            this.ctx.moveTo(0, 0);

            // Jagged line using pre-generated offsets
            let r = baseRadius * 0.5;
            const step = len / 4;
            for (let j = 0; j < arc.jaggedOffsets.length && r < len; j++) {
                r += step;
                const offset = arc.jaggedOffsets[j] * (baseRadius * 0.8);
                this.ctx.lineTo(r, offset);
            }
            this.ctx.stroke();
            this.ctx.restore();
        }

        this.ctx.restore();
        this.ctx.shadowBlur = 0;
    }

    drawShockwave(sw) {
        const prevAlpha = this.ctx.globalAlpha;
        const prevComposite = this.ctx.globalCompositeOperation;
        const prevLineWidth = this.ctx.lineWidth;
        const prevStrokeStyle = this.ctx.strokeStyle;
        this.ctx.globalAlpha = Math.max(0, sw.life);

        // JUICE: Fancy Shockwave with composite effect
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.lineWidth = sw.width;
        this.ctx.strokeStyle = sw.color;

        // Outer ring
        this.ctx.beginPath();
        this.ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        this.ctx.stroke();

        // Inner Echo ring (Juice!)
        if (sw.life > 0.5) {
             this.ctx.lineWidth = sw.width * 0.5;
             this.ctx.globalAlpha = Math.max(0, sw.life * 0.5);
             this.ctx.beginPath();
             this.ctx.arc(sw.x, sw.y, sw.radius * 0.7, 0, Math.PI * 2);
             this.ctx.stroke();
        }

        this.ctx.globalAlpha = prevAlpha;
        this.ctx.globalCompositeOperation = prevComposite;
        this.ctx.lineWidth = prevLineWidth;
        this.ctx.strokeStyle = prevStrokeStyle;
    }

    drawEnergyRing(ring) {
        const prevAlpha = this.ctx.globalAlpha;
        const prevComposite = this.ctx.globalCompositeOperation;
        const prevLineWidth = this.ctx.lineWidth;
        const prevStrokeStyle = this.ctx.strokeStyle;
        const prevShadowBlur = this.ctx.shadowBlur;
        const prevShadowColor = this.ctx.shadowColor;

        const alpha = Math.max(0, ring.life);
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.shadowColor = ring.color;
        this.ctx.shadowBlur = 12;

        // Outer ring
        this.ctx.globalAlpha = alpha * 0.85;
        this.ctx.lineWidth = ring.width;
        this.ctx.strokeStyle = ring.color;
        this.ctx.beginPath();
        this.ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        this.ctx.stroke();

        // Inner echo for combos > 1
        if (ring.comboLevel > 1 && ring.life > 0.25) {
            this.ctx.globalAlpha = alpha * 0.35;
            this.ctx.lineWidth = ring.width * 0.5;
            this.ctx.beginPath();
            this.ctx.arc(ring.x, ring.y, ring.radius * 0.55, 0, Math.PI * 2);
            this.ctx.stroke();
        }

        this.ctx.globalAlpha = prevAlpha;
        this.ctx.globalCompositeOperation = prevComposite;
        this.ctx.lineWidth = prevLineWidth;
        this.ctx.strokeStyle = prevStrokeStyle;
        this.ctx.shadowBlur = prevShadowBlur;
        this.ctx.shadowColor = prevShadowColor;
    }

    drawParticle(p) {
        // Fast path for aura particles: soft additive glow circles
        if (p.type === 'aura') {
            const alpha = (p.life / p.maxLife) * 0.55;
            this.ctx.globalCompositeOperation = 'lighter';
            // Outer soft glow
            this.ctx.globalAlpha = alpha * 0.3;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
            this.ctx.fill();
            // Bright core
            this.ctx.globalAlpha = alpha;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.globalAlpha = 1.0;
            return;
        }

        // Fast path for ember particles: bright tiny spark with white core
        if (p.type === 'ember') {
            const alpha = p.life / p.maxLife;
            this.ctx.globalAlpha = alpha;
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#ffff88';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.globalAlpha = 1.0;
            return;
        }

        const alpha = p.life / p.maxLife; // Normalize alpha
        this.ctx.globalAlpha = alpha;

        // 3D Rotation Simulation
        const scaleX = Math.cos(p.angleX);
        const scaleY = Math.cos(p.angleY);
        const c = Math.cos(p.rotation);
        const s = Math.sin(p.rotation);
        this.ctx.setTransform(c * scaleX, s * scaleX, -s * scaleY, c * scaleY, p.x, p.y);

        this.ctx.fillStyle = p.color;

        // Glint effect if facing camera
        if (Math.abs(scaleX) > 0.9 && Math.abs(scaleY) > 0.9) {
            this.ctx.fillStyle = '#fff';
        }

        if ((p.type === 'debris' || p.type === 'shard' || p.type === 'chunk') && p.polyPoints) {
            this.ctx.beginPath();
            const shrink = alpha;

            if (p.polyPoints.length > 0) {
                this.ctx.moveTo(p.polyPoints[0].x * shrink, p.polyPoints[0].y * shrink);
                for(let i=1; i<p.polyPoints.length; i++) {
                    this.ctx.lineTo(p.polyPoints[i].x * shrink, p.polyPoints[i].y * shrink);
                }
            }
            this.ctx.closePath();

            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = p.type === 'chunk' ? 2 : 1;
            this.ctx.stroke();
            this.ctx.fill();

        } else {
            this.ctx.beginPath();
            const sz = p.size * alpha;
            this.ctx.moveTo(0, -sz);
            this.ctx.lineTo(sz * 0.6, 0);
            this.ctx.lineTo(0, sz);
            this.ctx.lineTo(-sz * 0.6, 0);
            this.ctx.closePath();
            this.ctx.fill();
        }

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.globalAlpha = 1.0;
    }

    drawTrailParticle(p) {
        this.ctx.globalAlpha = p.life;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;
    }

    drawSoulParticle(sp) {
        // Outer glow halo using additive blending
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.globalAlpha = (sp.life || 1.0) * 0.25;
        this.ctx.fillStyle = sp.color;
        this.ctx.beginPath();
        this.ctx.arc(sp.x, sp.y, sp.size * 3, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalCompositeOperation = 'source-over';

        this.ctx.setTransform(1, 0, 0, 1, sp.x, sp.y);

        this.ctx.fillStyle = sp.color;
        this.ctx.globalAlpha = sp.life || 1.0;

        // Glowing Orb
        this.ctx.beginPath();
        this.ctx.arc(0, 0, sp.size, 0, Math.PI * 2);
        this.ctx.fill();

        // Inner white core
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, sp.size * 0.4, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.globalAlpha = 1.0;
    }

    drawFloatingText(ft) {
        this.ctx.setTransform(1, 0, 0, 1, ft.x, ft.y);
        this.ctx.scale(ft.scale, ft.scale);

        // Outline
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';
        this.ctx.globalAlpha = ft.life;

        // Text style
        this.ctx.font = 'bold 24px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Draw stroke and fill
        this.ctx.strokeText(ft.text, 0, 0);
        this.ctx.fillStyle = ft.color;
        this.ctx.fillText(ft.text, 0, 0);

        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.globalAlpha = 1.0;
    }

    drawComplexCrystal(c, colorOverride = null, particleCount = 0, profile = this._qualityProfiles.high, timestamp = performance.now(), launcher = null, spores = []) {
        // JUICE: Apply stress shake to position
        const shakeX = c.shakeX || 0;
        const shakeY = c.shakeY || 0;
        const xCenter = (c.lane * this.laneWidth) + (this.laneWidth / 2) + shakeX;

        // Apply elastic scale (Juice!)
        const width = this.laneWidth * 0.8 * (c.scaleX || 1.0);
        const heightScale = c.scaleY || 1.0;

        const col = COLORS[c.colorIdx];
        const seed = c.shapeSeed;

        let fillColor = col.hex;
        let strokeColor = 'rgba(255,255,255,0.8)';

        if (colorOverride === 'red') {
            fillColor = 'rgba(255, 0, 0, 0.7)';
            strokeColor = 'rgba(255, 0, 0, 0.7)';
        } else if (colorOverride === 'blue') {
            fillColor = 'rgba(0, 255, 255, 0.7)';
            strokeColor = 'rgba(0, 255, 255, 0.7)';
        }

        // Perf: use solid fill instead of gradients when particle chaos is high
        const useSolidFill = particleCount > 40 || profile.crystalDetail === 'low';

        // Compute lighting context: direction and intensity from nearby bright objects
        const crystalCenterY = c.type === 'top' ? (c.height * heightScale) / 2 : this.height - (c.height * heightScale) / 2;
        let lightDirX = 0;
        let lightDirY = 0;
        let lightIntensity = 0;

        if (!colorOverride && launcher) {
            const dx = launcher.x - xCenter;
            const dy = launcher.y - crystalCenterY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const falloff = Math.max(0, 1 - dist / 500);
            lightDirX += (dx / dist) * falloff;
            lightDirY += (dy / dist) * falloff;
            lightIntensity += falloff * 0.6;
        }

        if (!colorOverride && spores && spores.length > 0) {
            for (let i = 0; i < Math.min(spores.length, 5); i++) {
                const s = spores[i];
                const dx = s.x - xCenter;
                const dy = s.y - crystalCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const falloff = Math.max(0, 1 - dist / 350);
                if (falloff > 0) {
                    lightDirX += (dx / dist) * falloff * 0.4;
                    lightDirY += (dy / dist) * falloff * 0.4;
                    lightIntensity += falloff * 0.3;
                }
            }
        }

        lightIntensity = Math.min(lightIntensity, 1.0);
        const lightMag = Math.sqrt(lightDirX * lightDirX + lightDirY * lightDirY) || 1;
        const normLightX = lightDirX / lightMag;
        const normLightY = lightDirY / lightMag;

        // JUICE: Critical Danger Glow
        if (c.isCritical && !colorOverride) {
            const pulse = Math.sin(timestamp / 100) * 0.5 + 0.5;
            if (profile.crystalDetail === 'low') {
                // Skip shadowBlur on low - use fill color tinting only
                this.ctx.shadowBlur = 0;
            } else if (profile.crystalDetail === 'medium') {
                this.ctx.shadowBlur = 10 + (pulse * 15);
                this.ctx.shadowColor = 'red';
            } else {
                this.ctx.shadowBlur = 20 + (pulse * 30);
                this.ctx.shadowColor = 'red';
            }
            // Tint fill slightly red
            strokeColor = `rgba(255, 50, 50, ${0.8 + pulse * 0.2})`;
            // Aggressive visual override
            fillColor = `rgba(255, ${Math.floor(pulse * 50)}, ${Math.floor(pulse * 50)}, 0.9)`;
        } else if (c.flash > 0 && !colorOverride) {
            if (profile.crystalDetail === 'low') {
                this.ctx.shadowBlur = 0;
            } else {
                // Enhanced glow effect for flash
                this.ctx.shadowBlur = (profile.crystalDetail === 'medium' ? 25 : 50) * c.flash;
                this.ctx.shadowColor = 'white';
            }
            this.ctx.fillStyle = '#fff';
            this.ctx.strokeStyle = '#fff';
        } else if (!colorOverride) {
            if (profile.crystalDetail === 'low') {
                this.ctx.shadowBlur = 0;
            } else if (profile.crystalDetail === 'medium') {
                this.ctx.shadowBlur = 18;
            } else {
                this.ctx.shadowBlur = 35;
            }
            this.ctx.shadowColor = col.glow;
            this.ctx.strokeStyle = strokeColor;
        } else {
             this.ctx.strokeStyle = strokeColor;
        }

        const baseLineWidth = 2;
        this.ctx.lineWidth = baseLineWidth;
        this.ctx.lineJoin = 'miter';

        const time = timestamp / 1000;

        const drawShard = (offsetX, hScale, wScale, tilt, facetStyle = 'standard') => {
            // Apply height scale to the crystal height
            const h = c.height * hScale * heightScale;
            const w = width * wScale;
            const halfW = w / 2;
            const baseY = ((c.type === 'top') ? 0 : this.height) + shakeY;
            const tipY = ((c.type === 'top') ? h : this.height - h) + shakeY;
            const cx = xCenter + offsetX;

            // Compute per-facet normal (simplified 2D: direction from base center to tip)
            const facetNormX = (tilt / 20); // normalized tilt contribution
            const facetNormY = c.type === 'top' ? 1 : -1;
            // Dot product with light direction for specular
            const specularDot = Math.max(0, facetNormX * normLightX + facetNormY * normLightY * 0.5);
            const specularStrength = specularDot * lightIntensity;

            if (!colorOverride) {
                if (useSolidFill) {
                    // Perf: skip expensive gradient creation under load
                    this.ctx.fillStyle = c.flash > 0 ? '#fff' : col.hex;
                } else {
                    // Enhanced gradient with more depth and light response
                    const grad = this.ctx.createLinearGradient(cx - halfW, baseY, cx + halfW, tipY);
                    if (c.flash > 0) {
                         grad.addColorStop(0, '#fff');
                         grad.addColorStop(0.5, '#fff');
                         grad.addColorStop(1, '#fff');
                    } else {
                         // Light-responsive gradient: brighter on lit side
                         const litBoost = Math.floor(specularStrength * 40);
                         const baseR = parseInt(col.hex.slice(1,3), 16);
                         const baseG = parseInt(col.hex.slice(3,5), 16);
                         const baseB = parseInt(col.hex.slice(5,7), 16);
                         const litColor = `rgb(${Math.min(255, baseR + litBoost)}, ${Math.min(255, baseG + litBoost)}, ${Math.min(255, baseB + litBoost)})`;
                         grad.addColorStop(0, litColor);
                         grad.addColorStop(0.4, col.hex);
                         grad.addColorStop(0.7, this.darkenColor(col.hex, 0.3));
                         grad.addColorStop(1, 'rgba(0,0,0,0.25)');
                    }
                    this.ctx.fillStyle = grad;
                }
            } else {
                this.ctx.fillStyle = fillColor;
            }

            const useMultifacet = facetStyle === 'multifacet' && profile.crystalDetail === 'high';

            // Draw main crystal shape with more facets
            this.ctx.beginPath();

            if (useMultifacet) {
                // Create a more complex, multi-faceted shape
                const segments = 5;
                const angleVariation = tilt / segments;
                
                if (c.type === 'top') {
                    this.ctx.moveTo(cx - halfW, baseY);
                    for (let i = 1; i < segments; i++) {
                        const progress = i / segments;
                        const yPos = baseY + (tipY - baseY) * progress;
                        const xOffset = Math.sin(progress * Math.PI) * angleVariation;
                        this.ctx.lineTo(cx + xOffset + tilt * progress, yPos);
                    }
                    this.ctx.lineTo(cx + tilt, tipY);
                    for (let i = segments - 1; i > 0; i--) {
                        const progress = i / segments;
                        const yPos = baseY + (tipY - baseY) * progress;
                        const xOffset = -Math.sin(progress * Math.PI) * angleVariation;
                        this.ctx.lineTo(cx + xOffset + tilt * progress, yPos);
                    }
                    this.ctx.lineTo(cx + halfW, baseY);
                } else {
                    this.ctx.moveTo(cx - halfW, baseY);
                    for (let i = 1; i < segments; i++) {
                        const progress = i / segments;
                        const yPos = baseY - (baseY - tipY) * progress;
                        const xOffset = Math.sin(progress * Math.PI) * angleVariation;
                        this.ctx.lineTo(cx + xOffset + tilt * progress, yPos);
                    }
                    this.ctx.lineTo(cx + tilt, tipY);
                    for (let i = segments - 1; i > 0; i--) {
                        const progress = i / segments;
                        const yPos = baseY - (baseY - tipY) * progress;
                        const xOffset = -Math.sin(progress * Math.PI) * angleVariation;
                        this.ctx.lineTo(cx + xOffset + tilt * progress, yPos);
                    }
                    this.ctx.lineTo(cx + halfW, baseY);
                }
            } else {
                // Standard triangular shape
                if (c.type === 'top') {
                    this.ctx.moveTo(cx - halfW, baseY);
                    this.ctx.lineTo(cx + tilt, tipY);
                    this.ctx.lineTo(cx + halfW, baseY);
                } else {
                    this.ctx.moveTo(cx - halfW, baseY);
                    this.ctx.lineTo(cx + tilt, tipY);
                    this.ctx.lineTo(cx + halfW, baseY);
                }
            }

            this.ctx.fill();
            this.ctx.stroke();

            // Enhanced internal facets with multiple layers
            if (!colorOverride && c.flash < 0.5 && profile.crystalDetail !== 'low') {
                // Primary highlight facet - modulated by light direction
                const highlightAlpha = 0.2 + specularStrength * 0.25;
                this.ctx.fillStyle = `rgba(255,255,255,${highlightAlpha.toFixed(2)})`;
                this.ctx.beginPath();
                this.ctx.moveTo(cx - halfW*0.6, baseY);
                if (c.type === 'top') {
                    this.ctx.lineTo(cx + tilt*0.3, tipY * 0.6);
                } else {
                    this.ctx.lineTo(cx + tilt*0.3, this.height - ((this.height-tipY)*0.6));
                }
                this.ctx.lineTo(cx + halfW*0.2, baseY);
                this.ctx.fill();

                // Secondary highlight for crystalline effect
                this.ctx.fillStyle = `rgba(255,255,255,${(0.1 + specularStrength * 0.15).toFixed(2)})`;
                this.ctx.beginPath();
                this.ctx.moveTo(cx + halfW*0.2, baseY);
                if (c.type === 'top') {
                    this.ctx.lineTo(cx + tilt*0.7, tipY * 0.75);
                } else {
                    this.ctx.lineTo(cx + tilt*0.7, this.height - ((this.height-tipY)*0.75));
                }
                this.ctx.lineTo(cx + halfW*0.6, baseY);
                this.ctx.fill();

                // Internal crystalline structure lines
                this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                const midY = c.type === 'top' ? tipY * 0.5 : this.height - ((this.height-tipY)*0.5);
                this.ctx.moveTo(cx - halfW*0.3, baseY);
                this.ctx.lineTo(cx + tilt*0.5, midY);
                this.ctx.lineTo(cx + halfW*0.3, baseY);
                this.ctx.stroke();
                this.ctx.lineWidth = baseLineWidth;
            }

            // Rim lighting (medium+high) — edge glow from nearby light sources
            if (!colorOverride && c.flash < 0.5 && profile.crystalDetail !== 'low' && lightIntensity > 0.1) {
                const rimSide = normLightX > 0 ? -1 : 1; // Rim appears opposite to light
                const rimAlpha = (lightIntensity * 0.35).toFixed(2);
                this.ctx.strokeStyle = `rgba(255,255,255,${rimAlpha})`;
                this.ctx.lineWidth = 1.5;
                this.ctx.beginPath();
                if (c.type === 'top') {
                    this.ctx.moveTo(cx + rimSide * halfW, baseY);
                    this.ctx.lineTo(cx + tilt + rimSide * halfW * 0.1, tipY);
                } else {
                    this.ctx.moveTo(cx + rimSide * halfW, baseY);
                    this.ctx.lineTo(cx + tilt + rimSide * halfW * 0.1, tipY);
                }
                this.ctx.stroke();
                this.ctx.lineWidth = baseLineWidth;
            }

            // Dynamic specular catch-light (high only)
            if (!colorOverride && profile.crystalDetail === 'high' && !useSolidFill && lightIntensity > 0.15) {
                const catchLightY = c.type === 'top'
                    ? baseY + (tipY - baseY) * (0.3 + normLightY * 0.2)
                    : baseY - (baseY - tipY) * (0.3 - normLightY * 0.2);
                const catchLightX = cx + normLightX * halfW * 0.3;
                const catchSize = halfW * 0.15 * (1 + specularStrength);
                const catchAlpha = (specularStrength * 0.6).toFixed(2);
                const catchGrad = this.ctx.createRadialGradient(catchLightX, catchLightY, 0, catchLightX, catchLightY, catchSize);
                catchGrad.addColorStop(0, `rgba(255,255,255,${catchAlpha})`);
                catchGrad.addColorStop(1, 'rgba(255,255,255,0)');
                this.ctx.fillStyle = catchGrad;
                this.ctx.beginPath();
                this.ctx.arc(catchLightX, catchLightY, catchSize, 0, Math.PI * 2);
                this.ctx.fill();
            }

            // High-detail sheen with time-varying caustics
            if (!colorOverride && profile.crystalDetail === 'high' && !useSolidFill) {
                // Caustic/refraction pattern that shifts with time and breathing
                const causticOffset = Math.sin(time * 1.5 + c.lightPhase) * 0.15;
                const sheenStop1 = 0.3 + causticOffset;
                const sheenStop2 = 0.55 + causticOffset * 0.5;
                const sheen = this.ctx.createLinearGradient(cx - halfW, baseY, cx + halfW, tipY);
                sheen.addColorStop(0, 'rgba(255,255,255,0)');
                sheen.addColorStop(Math.max(0.05, sheenStop1), 'rgba(180,255,255,0.2)');
                sheen.addColorStop(Math.min(0.95, sheenStop2), 'rgba(255,160,255,0.18)');
                sheen.addColorStop(1, 'rgba(255,255,255,0)');
                this.ctx.fillStyle = sheen;
                this.ctx.beginPath();
                this.ctx.moveTo(cx - halfW * 0.25, baseY);
                this.ctx.lineTo(cx + tilt * 0.65, c.type === 'top' ? (baseY + (tipY - baseY) * 0.72) : (baseY - (baseY - tipY) * 0.72));
                this.ctx.lineTo(cx + halfW * 0.25, baseY);
                this.ctx.closePath();
                this.ctx.fill();
            }

            // Internal cracks for taller crystals (high only, seeded)
            if (!colorOverride && profile.crystalDetail === 'high' && c.height > 80 && !useSolidFill) {
                const crackCount = Math.min(4, Math.floor((c.height - 80) / 40) + 1);
                const crackSeed = c.crackSeed || seed;
                this.ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                this.ctx.lineWidth = 0.5;
                for (let ci = 0; ci < crackCount; ci++) {
                    const t = ((crackSeed * 7 + ci * 0.31) % 1);
                    const crackStartY = c.type === 'top'
                        ? baseY + (tipY - baseY) * (0.2 + t * 0.5)
                        : baseY - (baseY - tipY) * (0.2 + t * 0.5);
                    const crackEndY = c.type === 'top'
                        ? crackStartY + (tipY - baseY) * 0.25
                        : crackStartY - (baseY - tipY) * 0.25;
                    const crackX = cx + (t - 0.5) * halfW * 0.8;
                    const crackMidX = crackX + ((crackSeed * 3 + ci) % 1 - 0.5) * halfW * 0.3;
                    this.ctx.beginPath();
                    this.ctx.moveTo(crackX, crackStartY);
                    this.ctx.lineTo(crackMidX, (crackStartY + crackEndY) / 2);
                    this.ctx.lineTo(crackX + (crackMidX - crackX) * 0.5, crackEndY);
                    this.ctx.stroke();
                }
                this.ctx.lineWidth = baseLineWidth;
            }

            // Critical state: danger cracks with pulsing internal "lava" lines
            if (c.isCritical && !colorOverride && profile.crystalDetail !== 'low') {
                const dangerPulse = Math.sin(timestamp / 80) * 0.5 + 0.5;
                const dangerAlpha = (0.3 + dangerPulse * 0.5).toFixed(2);
                this.ctx.strokeStyle = `rgba(255, ${Math.floor(30 + dangerPulse * 50)}, 0, ${dangerAlpha})`;
                this.ctx.lineWidth = 1.5;
                const crackSeed = c.crackSeed || seed;
                // Draw 2-3 animated danger cracks
                for (let ci = 0; ci < 3; ci++) {
                    const t = ((crackSeed * 5 + ci * 0.37) % 1);
                    const startProgress = 0.15 + t * 0.3;
                    const endProgress = startProgress + 0.3 + dangerPulse * 0.1;
                    const crackStartY = c.type === 'top'
                        ? baseY + (tipY - baseY) * startProgress
                        : baseY - (baseY - tipY) * startProgress;
                    const crackEndY = c.type === 'top'
                        ? baseY + (tipY - baseY) * Math.min(0.9, endProgress)
                        : baseY - (baseY - tipY) * Math.min(0.9, endProgress);
                    const crackX = cx + (t - 0.5) * halfW * 0.6;
                    this.ctx.beginPath();
                    this.ctx.moveTo(crackX, crackStartY);
                    this.ctx.lineTo(crackX + Math.sin(timestamp / 200 + ci) * halfW * 0.15, (crackStartY + crackEndY) / 2);
                    this.ctx.lineTo(crackX, crackEndY);
                    this.ctx.stroke();
                }
                this.ctx.lineWidth = baseLineWidth;
            }

            // Match flash: energized cleansed sheen
            if (!colorOverride && c.matchFlash > 0 && profile.crystalDetail !== 'low') {
                const mAlpha = (c.matchFlash * 0.4).toFixed(2);
                const mGrad = this.ctx.createLinearGradient(cx - halfW, tipY, cx + halfW, baseY);
                mGrad.addColorStop(0, `rgba(255,255,255,${mAlpha})`);
                mGrad.addColorStop(0.5, `rgba(200,255,240,${(c.matchFlash * 0.25).toFixed(2)})`);
                mGrad.addColorStop(1, 'rgba(255,255,255,0)');
                this.ctx.fillStyle = mGrad;
                this.ctx.beginPath();
                if (c.type === 'top') {
                    this.ctx.moveTo(cx - halfW, baseY);
                    this.ctx.lineTo(cx + tilt, tipY);
                    this.ctx.lineTo(cx + halfW, baseY);
                } else {
                    this.ctx.moveTo(cx - halfW, baseY);
                    this.ctx.lineTo(cx + tilt, tipY);
                    this.ctx.lineTo(cx + halfW, baseY);
                }
                this.ctx.closePath();
                this.ctx.fill();
            }
        };

        // More strategic and varied shard arrangement based on seed
        const shardConfigs = [
            // Configuration 1: Symmetric cluster
            { condition: seed < 0.2, shards: [
                { offsetX: -width * 0.4, hScale: 0.65, wScale: 0.35, tilt: -8, facetStyle: 'standard' },
                { offsetX: width * 0.4, hScale: 0.65, wScale: 0.35, tilt: 8, facetStyle: 'standard' },
                { offsetX: 0, hScale: 1.0, wScale: 0.65, tilt: 0, facetStyle: 'multifacet' }
            ]},
            // Configuration 2: Asymmetric left-heavy
            { condition: seed >= 0.2 && seed < 0.4, shards: [
                { offsetX: -width * 0.45, hScale: 0.75, wScale: 0.4, tilt: -12, facetStyle: 'multifacet' },
                { offsetX: -width * 0.15, hScale: 0.55, wScale: 0.3, tilt: -5, facetStyle: 'standard' },
                { offsetX: width * 0.25, hScale: 0.5, wScale: 0.3, tilt: 6, facetStyle: 'standard' },
                { offsetX: 0, hScale: 1.0, wScale: 0.6, tilt: -3, facetStyle: 'multifacet' }
            ]},
            // Configuration 3: Asymmetric right-heavy
            { condition: seed >= 0.4 && seed < 0.6, shards: [
                { offsetX: -width * 0.25, hScale: 0.5, wScale: 0.3, tilt: -6, facetStyle: 'standard' },
                { offsetX: width * 0.15, hScale: 0.55, wScale: 0.3, tilt: 5, facetStyle: 'standard' },
                { offsetX: width * 0.45, hScale: 0.75, wScale: 0.4, tilt: 12, facetStyle: 'multifacet' },
                { offsetX: 0, hScale: 1.0, wScale: 0.6, tilt: 3, facetStyle: 'multifacet' }
            ]},
            // Configuration 4: Triple spire
            { condition: seed >= 0.6 && seed < 0.8, shards: [
                { offsetX: -width * 0.35, hScale: 0.8, wScale: 0.38, tilt: -7, facetStyle: 'multifacet' },
                { offsetX: 0, hScale: 1.0, wScale: 0.55, tilt: 0, facetStyle: 'multifacet' },
                { offsetX: width * 0.35, hScale: 0.8, wScale: 0.38, tilt: 7, facetStyle: 'multifacet' }
            ]},
            // Configuration 5: Dense cluster
            { condition: seed >= 0.8, shards: [
                { offsetX: -width * 0.4, hScale: 0.6, wScale: 0.35, tilt: -10, facetStyle: 'standard' },
                { offsetX: -width * 0.15, hScale: 0.7, wScale: 0.3, tilt: -4, facetStyle: 'standard' },
                { offsetX: width * 0.15, hScale: 0.7, wScale: 0.3, tilt: 4, facetStyle: 'standard' },
                { offsetX: width * 0.4, hScale: 0.6, wScale: 0.35, tilt: 10, facetStyle: 'standard' },
                { offsetX: 0, hScale: 1.0, wScale: 0.6, tilt: 0, facetStyle: 'multifacet' }
            ]}
        ];

        // Use cached shard config index from crystal
        const config = shardConfigs[c.shardConfigIndex || 0] || shardConfigs[0];
        config.shards.forEach(shard => {
            drawShard(shard.offsetX, shard.hScale, shard.wScale, shard.tilt, shard.facetStyle);
        });

        // Post-geometry: layered soft glow (replaces some shadowBlur dependency)
        if (!colorOverride && profile.crystalDetail !== 'low' && !useSolidFill && c.flash < 0.3) {
            const glowCenterY = c.type === 'top' ? (c.height * heightScale * 0.4) : (this.height - c.height * heightScale * 0.4);
            const glowRadius = width * 0.6;
            const rgb = this.hexToRgb(col.hex) || {r:255, g:255, b:255};
            const prevOp = this.ctx.globalCompositeOperation;
            this.ctx.globalCompositeOperation = 'lighter';
            const glowGrad = this.ctx.createRadialGradient(xCenter, glowCenterY, 0, xCenter, glowCenterY, glowRadius);
            glowGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`);
            glowGrad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)`);
            glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
            this.ctx.fillStyle = glowGrad;
            this.ctx.beginPath();
            this.ctx.arc(xCenter, glowCenterY, glowRadius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalCompositeOperation = prevOp;
        }

        this.ctx.shadowBlur = 0;
    }

    darkenColor(hex, amount) {
        // Helper to darken a hex color — cached to avoid regex per call
        const cacheKey = `${hex}-${amount}`;
        let cached = this._darkenColorCache && this._darkenColorCache.get(cacheKey);
        if (cached) return cached;
        const rgb = this.hexToRgb(hex);
        if (!rgb) return hex;
        const r = Math.max(0, Math.floor(rgb.r * (1 - amount)));
        const g = Math.max(0, Math.floor(rgb.g * (1 - amount)));
        const b = Math.max(0, Math.floor(rgb.b * (1 - amount)));
        const result = `rgb(${r},${g},${b})`;
        if (!this._darkenColorCache) this._darkenColorCache = new Map();
        this._darkenColorCache.set(cacheKey, result);
        return result;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    drawScanlines(intensity) {
        if (!this.ctx) return;
        const prevComposite = this.ctx.globalCompositeOperation;
        const prevAlpha = this.ctx.globalAlpha;
        const prevFillStyle = this.ctx.fillStyle;
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.globalAlpha = intensity * 0.3;
        this.ctx.fillStyle = this.scanlinePattern;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalCompositeOperation = prevComposite;
        this.ctx.globalAlpha = prevAlpha;
        this.ctx.fillStyle = prevFillStyle;
    }

    drawGlitch(intensity) {
        if (!this.ctx) return;
        const numGlitches = Math.floor(intensity * 10);

        // Regenerate rects only when intensity changes significantly or count changes
        if (Math.abs(intensity - this._glitchIntensity) > 0.05 || this._glitchRects.length !== numGlitches) {
            this._glitchIntensity = intensity;
            this._glitchRects = [];
            for (let i = 0; i < numGlitches; i++) {
                this._glitchRects.push({
                    x: Math.random() * this.width,
                    y: Math.random() * this.height,
                    w: Math.random() * 200 + 50,
                    h: Math.random() * 30 + 5,
                    color: Math.random() > 0.5 ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 0, 255, 0.5)',
                    vx: (Math.random() - 0.5) * 4,
                    vy: (Math.random() - 0.5) * 4
                });
            }
        }

        this.ctx.save();
        this.ctx.globalCompositeOperation = 'exclusion';

        for (let i = 0; i < this._glitchRects.length; i++) {
            const r = this._glitchRects[i];
            // Animate with pre-set drift (no Math.random in hot path)
            r.x += r.vx;
            r.y += r.vy;
            if (r.x < -r.w) r.x += this.width + r.w;
            if (r.x > this.width) r.x -= this.width + r.w;
            if (r.y < -r.h) r.y += this.height + r.h;
            if (r.y > this.height) r.y -= this.height + r.h;

            this.ctx.fillStyle = r.color;
            this.ctx.fillRect(r.x, r.y, r.w, r.h);
        }
        this.ctx.restore();
    }

    calculateShockwaveDistortion(x, y, gameState) {
        if (!gameState.shockwaves || gameState.shockwaves.length === 0) return { x: 0, y: 0 };

        let dx = 0;
        let dy = 0;
        const bandWidth = 50;

        for (let i = 0; i < gameState.shockwaves.length; i++) {
            const sw = gameState.shockwaves[i];
            if (sw.life <= 0) continue;

            const distX = x - sw.x;
            const distY = y - sw.y;
            const distSq = distX * distX + distY * distY;
            const outer = sw.radius + bandWidth;

            // Fast reject: if outside outer band, skip sqrt entirely
            if (distSq > outer * outer) continue;

            // Fast reject: if inside inner band (hole), skip
            if (sw.radius > bandWidth) {
                const inner = sw.radius - bandWidth;
                if (distSq < inner * inner) continue;
            }

            const dist = Math.sqrt(distSq);
            const delta = dist - sw.radius;
            const t = delta / bandWidth;
            const strength = Math.cos(t * Math.PI / 2);
            const force = 15.0 * strength * sw.life;

            if (dist > 0) {
                dx += (distX / dist) * force;
                dy += (distY / dist) * force;
            }
        }

        return { x: dx, y: dy };
    }
}
