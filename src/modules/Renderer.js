import { COLORS, GAME_CONFIG } from './Constants.js';

const FILM_GRAIN_REFRESH_INTERVAL_MS = 90;
const RENDER_QUALITY_PROFILES = {
    high: { maxDust: 140, maxParticles: 1400, particleStride: 1, gridBase: 50, crystalDetail: 'high', postFX: true, lightShafts: true, fog: true, allowGridDistortion: true },
    medium: { maxDust: 95, maxParticles: 800, particleStride: 1, gridBase: 65, crystalDetail: 'medium', postFX: true, lightShafts: true, fog: true, allowGridDistortion: false },
    low: { maxDust: 55, maxParticles: 420, particleStride: 2, gridBase: 90, crystalDetail: 'low', postFX: false, lightShafts: false, fog: true, allowGridDistortion: false }
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

        // Cache for vignette gradient (invalidated on resize)
        this._vignetteGradient = null;
        this._fogGradient = null;
        this._qualityProfiles = RENDER_QUALITY_PROFILES;
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
        this.laneWidth = w / GAME_CONFIG.lanes;
        this._vignetteGradient = null; // invalidate cached gradient
        this._fogGradient = null;
    }

    clear() {
        // No-op: clear is combined with the dark overlay in draw()
    }

    getQualityProfile(quality = 'high') {
        return this._qualityProfiles[quality] || this._qualityProfiles.high;
    }

    draw(gameState, launcher) {
        if (!this.ctx) return;
        const profile = this.getQualityProfile(gameState.renderQuality);

        // JUICE: Dynamic Lighting System
        // 1. Clear + darken in one fill
        this.ctx.fillStyle = 'rgba(0, 0, 10, 1.0)';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // 2. Render Additive Lighting Pass
        this.ctx.save();
        this.drawLighting(gameState, launcher, profile);
        this.ctx.restore();

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
            this.drawVolumetricFog(gameState, profile);
        }

        this.drawHoloGrid(gameState, launcher, profile);
        this.drawTargetingSystem(gameState, launcher);

        // Draw Crystals (skip chromatic aberration on crystals during explosions)
        for (let i = 0; i < gameState.crystals.length; i++) {
            const c = gameState.crystals[i];
             // JUICE: Apply Shockwave Distortion
             // Calculate center of crystal
             const cX = (c.lane * this.laneWidth) + (this.laneWidth / 2);
             const cY = c.type === 'top' ? c.height / 2 : this.height - (c.height / 2);
             const distortion = this.calculateShockwaveDistortion(cX, cY, gameState);

             this.ctx.save();
             this.ctx.translate(distortion.x, distortion.y);

             // Only apply chromatic aberration to launcher, not crystals
             this.drawComplexCrystal(c, null, particleCount, profile);
             this.ctx.restore();
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
            this.drawSpore(gameState.spores[i]);
        }

        const particleLimit = Math.min(profile.maxParticles, particleCount);
        const stride = particleCount > profile.maxParticles ? profile.particleStride + 1 : profile.particleStride;
        for (let i = 0; i < particleLimit; i += stride) {
            const p = gameState.particles[i];
            if (p.isTrail) {
               this.drawTrailParticle(p);
            } else {
               this.drawParticle(p);
            }
        }

        if (gameState.shockwaves) {
            for (let i = 0; i < gameState.shockwaves.length; i++) {
               this.drawShockwave(gameState.shockwaves[i]);
            }
        }

        if (gameState.floatingTexts) {
            for (let i = 0; i < gameState.floatingTexts.length; i++) {
               this.drawFloatingText(gameState.floatingTexts[i]);
            }
        }

        if (gameState.soulParticles) {
            for (let i = 0; i < gameState.soulParticles.length; i++) {
               this.drawSoulParticle(gameState.soulParticles[i]);
            }
        }

        this.ctx.restore();

        // JUICE: Holographic Glitch & Scanlines
        if (profile.postFX && gameState.criticalIntensity > 0.01) {
             this.drawScanlines(gameState.criticalIntensity);
             if (gameState.criticalIntensity > 0.2) {
                 this.drawGlitch(gameState.criticalIntensity);
             }
        }

        // JUICE: Red Alert Vignette
        if (gameState.criticalIntensity > 0.01) {
            this.drawVignette(gameState.criticalIntensity);
        }

        // Draw Impact Flash (independent of shake translation)
        if (gameState.impactFlash > 0) {
            this.drawImpactFlash(gameState.impactFlash, gameState.impactFlashColor);
        }

        if (profile.lightShafts) {
            this.drawLightShafts(gameState, launcher);
        }
        if (profile.postFX) {
            this.drawFilmGrain();
        }
    }

    drawVignette(intensity) {
        if (!this.ctx) return;
        this.ctx.save();

        // Pulse alpha
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
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

        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = this._vignetteGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalAlpha = 1.0;

        // Add "Danger" text if intensity is very high
        if (intensity > 0.8 && pulse > 0.8) {
             this.ctx.font = 'bold 60px Righteous, monospace';
             this.ctx.fillStyle = `rgba(255, 0, 0, ${intensity})`;
             this.ctx.textAlign = 'center';
             this.ctx.textBaseline = 'middle';
             this.ctx.fillText("CRITICAL!", this.width / 2, this.height * 0.3);
        }

        this.ctx.restore();
    }

    drawLighting(gameState, launcher, profile) {
        this.ctx.globalCompositeOperation = 'lighter';

        const time = Date.now() / 1000;

        // Helper to draw a light blob with cached gradients
        const drawLight = (x, y, color, radius, intensity = 1.0) => {
             const bucketRadius = Math.floor(radius / 25) * 25 + 25;
             const cacheKey = `${color}-${bucketRadius}`;
             let grad = this._gradientCache.get(cacheKey);
             if (!grad) {
                 grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, bucketRadius);
                 const rgb = this.hexToRgb(color) || {r:255, g:255, b:255};
                 grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1.0)`);
                 grad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
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

        // 1. Crystal Lights
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

             const radius = 150 + (flashBonus * 100);
             const intensity = (0.3 + (flashBonus * 0.5)) * pulse;

             const col = COLORS[c.colorIdx].hex;
             drawLight(x, y, col, radius, intensity);

             // Wall Reflections
             // If in first lane, reflect on left wall
             if (profile.crystalDetail !== 'low' && c.lane === 0) {
                 // Squeeze the light vertically against the wall
                 this.ctx.save();
                 this.ctx.translate(0, y);
                 this.ctx.scale(0.3, 2.0); // Make it a vertical strip
                 drawLight(0, 0, col, radius * 1.5, intensity * 0.5);
                 this.ctx.restore();
             }
             // If in last lane, reflect on right wall
             if (profile.crystalDetail !== 'low' && c.lane === GAME_CONFIG.lanes - 1) {
                 this.ctx.save();
                 this.ctx.translate(this.width, y);
                 this.ctx.scale(0.3, 2.0);
                 drawLight(0, 0, col, radius * 1.5, intensity * 0.5);
                 this.ctx.restore();
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
        this.ctx.save();
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
        this.ctx.restore();
    }

    drawImpactFlash(intensity, color = '#fff') {
        this.ctx.save();
        // Use 'lighter' or just alpha blend
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = intensity;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();
    }

    drawVolumetricFog(gameState, profile) {
        if (!this._fogGradient) {
            this._fogGradient = this.ctx.createLinearGradient(0, 0, 0, this.height);
            this._fogGradient.addColorStop(0, 'rgba(70, 95, 130, 0.22)');
            this._fogGradient.addColorStop(0.5, 'rgba(30, 60, 95, 0.08)');
            this._fogGradient.addColorStop(1, 'rgba(5, 15, 28, 0.32)');
        }

        this.ctx.save();
        this.ctx.fillStyle = this._fogGradient;
        this.ctx.fillRect(0, 0, this.width, this.height);

        const pulse = 0.04 + Math.sin(Date.now() / 1600) * 0.02;
        this.ctx.globalAlpha = Math.max(0.02, pulse);
        this.ctx.globalCompositeOperation = 'screen';
        const sweeps = profile.crystalDetail === 'high' ? 3 : 1;
        for (let i = 0; i < sweeps; i++) {
            const x = ((Date.now() * 0.01) + (i * this.width * 0.35)) % (this.width + 240) - 120;
            const grad = this.ctx.createLinearGradient(x, 0, x + 160, this.height);
            grad.addColorStop(0, 'rgba(255,255,255,0)');
            grad.addColorStop(0.5, 'rgba(170,220,255,0.32)');
            grad.addColorStop(1, 'rgba(255,255,255,0)');
            this.ctx.fillStyle = grad;
            this.ctx.fillRect(x - 120, 0, 240, this.height);
        }
        this.ctx.restore();
    }

    drawLightShafts(gameState, launcher) {
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'screen';
        this.ctx.globalAlpha = 0.16;
        const lane = launcher ? launcher.targetLane : Math.floor(GAME_CONFIG.lanes / 2);
        const centerX = (lane * this.laneWidth) + (this.laneWidth / 2);
        for (let i = -1; i <= 1; i++) {
            const x = centerX + (i * this.laneWidth * 0.8);
            const shaft = this.ctx.createLinearGradient(x, 0, x, this.height * 0.65);
            shaft.addColorStop(0, 'rgba(180, 255, 255, 0.5)');
            shaft.addColorStop(1, 'rgba(180, 255, 255, 0)');
            this.ctx.fillStyle = shaft;
            this.ctx.beginPath();
            this.ctx.moveTo(x - 50, 0);
            this.ctx.lineTo(x + 50, 0);
            this.ctx.lineTo(x + 180, this.height * 0.65);
            this.ctx.lineTo(x - 180, this.height * 0.65);
            this.ctx.closePath();
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    drawFilmGrain() {
        const now = Date.now();
        if (!this._grainCanvas) {
            this._grainCanvas = document.createElement('canvas');
            this._grainCanvas.width = 128;
            this._grainCanvas.height = 128;
            this._grainCtx = this._grainCanvas.getContext('2d');
        }
        if (!this._lastGrainRefresh || now - this._lastGrainRefresh > FILM_GRAIN_REFRESH_INTERVAL_MS) {
            const img = this._grainCtx.createImageData(128, 128);
            for (let i = 0; i < img.data.length; i += 4) {
                const v = Math.floor(Math.random() * 30);
                img.data[i] = v;
                img.data[i + 1] = v;
                img.data[i + 2] = v;
                img.data[i + 3] = 20;
            }
            this._grainCtx.putImageData(img, 0, 0);
            this._grainPattern = this.ctx.createPattern(this._grainCanvas, 'repeat');
            this._lastGrainRefresh = now;
        }
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'overlay';
        this.ctx.globalAlpha = 0.12;
        this.ctx.fillStyle = this._grainPattern;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();
    }

    drawHoloGrid(gameState, launcher, profile) {
        // JUICE: Dynamic Holographic Grid
        const particleCount = gameState.particles ? gameState.particles.length : 0;
        const gridSize = particleCount > 30 ? profile.gridBase + 20 : profile.gridBase; // Coarser grid during chaos
        const time = Date.now();
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

        this.ctx.save();

        // Precompute breathe constants
        const cx = this.width / 2;
        const cy = this.height / 2;
        const breatheScale = 0.01 * pulse;

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

        this.ctx.restore();
    }

    drawTargetingSystem(gameState, launcher) {
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
        const time = Date.now();

        // Draw Laser Sight
        // Determine "Lock Status" based on if any crystal matches
        const hasMatch = targets.some(c => c.colorIdx === nextColorIdx);

        this.ctx.save();

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

             this.ctx.save();
             this.ctx.translate(cX + shakeX, tipY);

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

             this.ctx.restore();

             // Connecting Line from Launcher to Target Tip
             // Only draw if active match or maybe always?
             // Let's draw it faint if no match, strong if match
             this.ctx.save();
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
             this.ctx.restore();
        });

        this.ctx.restore();
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

    drawSpore(s) {
        const col = COLORS[s.colorIdx];
        const time = Date.now();

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
        this.ctx.save();
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

        this.ctx.restore();
    }

    drawParticle(p) {
        const alpha = p.life / p.maxLife; // Normalize alpha
        this.ctx.globalAlpha = alpha;

        this.ctx.save();
        this.ctx.translate(p.x, p.y);

        // 3D Rotation Simulation
        // Rotate in 2D
        this.ctx.rotate(p.rotation);
        // Scale to simulate 3D rotation
        const scaleX = Math.cos(p.angleX);
        const scaleY = Math.cos(p.angleY);
        this.ctx.scale(scaleX, scaleY);

        // Draw shard shape instead of circle
        this.ctx.fillStyle = p.color;
        this.ctx.shadowBlur = 10 * alpha;
        this.ctx.shadowColor = p.color;

        // Glint effect if facing camera
        if (Math.abs(scaleX) > 0.9 && Math.abs(scaleY) > 0.9) {
            this.ctx.fillStyle = '#fff';
            this.ctx.shadowBlur = 20 * alpha;
        }

        if ((p.type === 'debris' || p.type === 'shard' || p.type === 'chunk') && p.polyPoints) {
            this.ctx.beginPath();
            const s = p.size * alpha; // Scale size, not points directly to keep shape relative
            // Actually points were calculated with initial size.
            // But we want to shrink them over time.
            const shrink = alpha;

            // Note: polyPoints are relative to (0,0)
            if (p.polyPoints.length > 0) {
                this.ctx.moveTo(p.polyPoints[0].x * shrink, p.polyPoints[0].y * shrink);
                for(let i=1; i<p.polyPoints.length; i++) {
                    this.ctx.lineTo(p.polyPoints[i].x * shrink, p.polyPoints[i].y * shrink);
                }
            }
            this.ctx.closePath();

            // Add a stroke to make it look like a rock/crystal chunk
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = p.type === 'chunk' ? 2 : 1;
            this.ctx.stroke();
            this.ctx.fill();

        } else {
            this.ctx.beginPath();
            const s = p.size * alpha; // Scale down with life
            // Make it a diamond/shard shape
            this.ctx.moveTo(0, -s);
            this.ctx.lineTo(s * 0.6, 0);
            this.ctx.lineTo(0, s);
            this.ctx.lineTo(-s * 0.6, 0);
            this.ctx.closePath();
            this.ctx.fill();
        }

        this.ctx.restore();

        this.ctx.shadowBlur = 0;
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
        this.ctx.save();
        this.ctx.translate(sp.x, sp.y);

        this.ctx.fillStyle = sp.color;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = sp.color;

        // Glowing Orb
        this.ctx.beginPath();
        this.ctx.arc(0, 0, sp.size, 0, Math.PI * 2);
        this.ctx.fill();

        // Inner white core
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, sp.size * 0.4, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawFloatingText(ft) {
        this.ctx.save();
        this.ctx.translate(ft.x, ft.y);
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

        this.ctx.restore();
    }

    drawComplexCrystal(c, colorOverride = null, particleCount = 0, profile = this._qualityProfiles.high) {
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

        // JUICE: Critical Danger Glow
        if (c.isCritical && !colorOverride) {
            const pulse = Math.sin(Date.now() / 100) * 0.5 + 0.5;
            this.ctx.shadowBlur = 20 + (pulse * 30);
            this.ctx.shadowColor = 'red';
            // Tint fill slightly red
            strokeColor = `rgba(255, 50, 50, ${0.8 + pulse * 0.2})`;
            // Aggressive visual override
            fillColor = `rgba(255, ${Math.floor(pulse * 50)}, ${Math.floor(pulse * 50)}, 0.9)`;
        } else if (c.flash > 0 && !colorOverride) {
            // Enhanced glow effect for flash
            this.ctx.shadowBlur = 50 * c.flash;
            this.ctx.shadowColor = 'white';
            this.ctx.fillStyle = '#fff';
            this.ctx.strokeStyle = '#fff';
        } else if (!colorOverride) {
            this.ctx.shadowBlur = 35;
            this.ctx.shadowColor = col.glow;
            this.ctx.strokeStyle = strokeColor;
        } else {
             this.ctx.strokeStyle = strokeColor;
        }

        const baseLineWidth = 2;
        this.ctx.lineWidth = baseLineWidth;
        this.ctx.lineJoin = 'miter';

        const drawShard = (offsetX, hScale, wScale, tilt, facetStyle = 'standard') => {
            // Apply height scale to the crystal height
            const h = c.height * hScale * heightScale;
            const w = width * wScale;
            const halfW = w / 2;
            const baseY = ((c.type === 'top') ? 0 : this.height) + shakeY;
            const tipY = ((c.type === 'top') ? h : this.height - h) + shakeY;
            const cx = xCenter + offsetX;

            if (!colorOverride) {
                if (useSolidFill) {
                    // Perf: skip expensive gradient creation under load
                    this.ctx.fillStyle = c.flash > 0 ? '#fff' : col.hex;
                } else {
                    // Enhanced gradient with more depth
                    const grad = this.ctx.createLinearGradient(cx - halfW, baseY, cx + halfW, tipY);
                    if (c.flash > 0) {
                         grad.addColorStop(0, '#fff');
                         grad.addColorStop(0.5, '#fff');
                         grad.addColorStop(1, '#fff');
                    } else {
                         // More vibrant color gradient
                         grad.addColorStop(0, col.hex);
                         grad.addColorStop(0.4, col.hex);
                         grad.addColorStop(0.7, this.darkenColor(col.hex, 0.3));
                         grad.addColorStop(1, 'rgba(0,0,0,0.2)');
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
                // Primary highlight facet
                this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
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
                this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
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

            if (!colorOverride && profile.crystalDetail === 'high' && !useSolidFill) {
                const sheen = this.ctx.createLinearGradient(cx - halfW, baseY, cx + halfW, tipY);
                sheen.addColorStop(0, 'rgba(255,255,255,0)');
                sheen.addColorStop(0.35, 'rgba(180,255,255,0.18)');
                sheen.addColorStop(0.6, 'rgba(255,160,255,0.16)');
                sheen.addColorStop(1, 'rgba(255,255,255,0)');
                this.ctx.fillStyle = sheen;
                this.ctx.beginPath();
                this.ctx.moveTo(cx - halfW * 0.25, baseY);
                this.ctx.lineTo(cx + tilt * 0.65, c.type === 'top' ? (baseY + (tipY - baseY) * 0.72) : (baseY - (baseY - tipY) * 0.72));
                this.ctx.lineTo(cx + halfW * 0.25, baseY);
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
        this.ctx.save();
        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.globalAlpha = intensity * 0.3;
        this.ctx.fillStyle = this.scanlinePattern;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.globalAlpha = 1.0;
        this.ctx.restore();
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
