import { COLORS, GAME_CONFIG, FILM_GRAIN_REFRESH_INTERVAL_MS, FILM_GRAIN_HIGH_REFRESH_INTERVAL_MS, MAX_BLOOM_PARTICLES } from './RendererConstants.js';

export function installRendererPostEffects(Renderer) {
    Object.assign(Renderer.prototype, {
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
        ,
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
        ,
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
        ,
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
        ,
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
        
            const danger = gameState.criticalIntensity || 0;
            const combo = gameState.combo || 0;
            const comboT = combo > 2 ? Math.min(1, (combo - 2) / 10) : 0;
            const pulse = 0.04 + Math.sin(timestamp / 1600) * 0.02 + comboT * 0.012;
            this.ctx.globalAlpha = Math.max(0.02, pulse);
            this.ctx.globalCompositeOperation = 'screen';
        
            if (!this._fogSweepGrad) {
                this._fogSweepGrad = this.ctx.createLinearGradient(-120, 0, 120, this.height);
                this._fogSweepGrad.addColorStop(0, 'rgba(255,255,255,0)');
                this._fogSweepGrad.addColorStop(0.5, 'rgba(170,220,255,0.32)');
                this._fogSweepGrad.addColorStop(1, 'rgba(255,255,255,0)');
            }
        
            const sweeps = profile.crystalDetail === 'high' ? 3 : 1;
            for (let i = 0; i < sweeps; i++) {
                const x = ((timestamp * 0.01) + (i * this.width * 0.35)) % (this.width + 240) - 120;
                this.ctx.save();
                this.ctx.translate(x, 0);
                this.ctx.fillStyle = this._fogSweepGrad;
                this.ctx.fillRect(-120, 0, 240, this.height);
                this.ctx.restore();
            }
        
            // Danger warmth bleeds into fog; combo adds faint golden lift that reads with bloom
            if (danger > 0.05) {
                this.ctx.globalCompositeOperation = 'overlay';
                this.ctx.globalAlpha = danger * 0.06;
                this.ctx.fillStyle = 'rgba(255, 40, 10, 1)';
                this.ctx.fillRect(0, 0, this.width, this.height);
            }
            if (comboT > 0) {
                const shimmer = 0.5 + 0.5 * Math.sin(timestamp / 900);
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.globalAlpha = comboT * 0.028 * shimmer;
                this.ctx.fillStyle = 'rgba(255, 200, 80, 1)';
                this.ctx.fillRect(0, 0, this.width, this.height);
            }
        
            this.ctx.globalAlpha = prevAlpha;
            this.ctx.globalCompositeOperation = prevComposite;
            this.ctx.fillStyle = prevFillStyle;
        }
        ,
        _getShaftColorGradient(r, g, b, shaftH) {
            if (this._shaftGradCacheH !== shaftH) {
                this._shaftGradCache.clear();
                this._shaftGradCacheH = shaftH;
            }
            const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
            let grad = this._shaftGradCache.get(key);
            if (!grad) {
                grad = this.ctx.createLinearGradient(0, 0, 0, shaftH);
                grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.45)`);
                grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.18)`);
                grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
                this._shaftGradCache.set(key, grad);
            }
            return grad;
        }
        ,
        _ensureShaftDustMotes() {
            if (this._shaftDustMotes) return;
            this._shaftDustMotes = [];
            for (let i = 0; i < 14; i++) {
                this._shaftDustMotes.push({
                    nx: 0.12 + (i * 0.063) % 0.76,
                    ny: (i * 0.11 + 0.05) % 0.88,
                    phase: i * 1.73,
                    size: 0.55 + (i % 4) * 0.32,
                    drift: 0.25 + (i % 5) * 0.12
                });
            }
        }
        ,
        _drawShaftDustMotes(sx, topW, botW, shaftH, angOff, time, opacity, r, g, b) {
            this._ensureShaftDustMotes();
            const prevFill = this.ctx.fillStyle;
            for (const m of this._shaftDustMotes) {
                const ny = (m.ny + Math.sin(time * m.drift + m.phase) * 0.018) % 1;
                const y = ny * shaftH;
                const widthAtY = topW + (botW - topW) * ny;
                const nx = m.nx + Math.sin(time * (m.drift * 1.4) + m.phase * 1.3) * 0.035;
                const x = sx + (nx - 0.5) * 2 * widthAtY + angOff * ny;
                const twinkle = 0.35 + 0.65 * Math.sin(time * 2.8 + m.phase);
                this.ctx.globalAlpha = opacity * 0.22 * twinkle;
                this.ctx.fillStyle = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 20)}, 1)`;
                this.ctx.beginPath();
                this.ctx.arc(x, y, m.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
            this.ctx.fillStyle = prevFill;
        }
        ,
        drawLightShafts(gameState, launcher, timestamp = 0, profile = {}) {
            const time = timestamp / 1000;
            const danger = gameState.criticalIntensity || 0;
            const combo = gameState.combo || 0;
            const comboBoost = combo > 2 ? Math.min(1, (combo - 2) / 10) * 0.18 : 0;
            const dangerWidth = 1 + danger * 0.22;
            const dangerOpacity = 1 + danger * 0.35;
            const shaftDust = profile.shaftDust === true;
        
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'screen';
        
            const sources = [];
            const lane = launcher ? launcher.targetLane : Math.floor(GAME_CONFIG.lanes / 2);
            const centerX = (lane * this.laneWidth) + (this.laneWidth / 2);
            sources.push({ x: centerX, intensity: 0.13 + comboBoost, r: 180, g: 255, b: 255 });
        
            for (let i = 0; i < gameState.crystals.length && sources.length < 5; i++) {
                const c = gameState.crystals[i];
                if (c.flash < 0.05 && c.height < 90) continue;
                const cx = (c.lane * this.laneWidth) + (this.laneWidth / 2);
                const col = COLORS[c.colorIdx];
                const rgb = this.hexToRgb(col.hex) || { r: 180, g: 255, b: 255 };
                const intensity = 0.055 + c.flash * 0.10;
                sources.push({ x: cx, intensity, r: rgb.r, g: rgb.g, b: rgb.b });
            }
        
            if (gameState.shockwaves) {
                for (let i = 0; i < gameState.shockwaves.length && sources.length < 7; i++) {
                    const sw = gameState.shockwaves[i];
                    if (sw.life <= 0.25 || sw.y > this.height * 0.55) continue;
                    sources.push({ x: sw.x, intensity: sw.life * 0.14, r: 255, g: 230, b: 180 });
                }
            }
        
            const shaftH = this.height * 0.68;
        
            for (let si = 0; si < sources.length; si++) {
                const { x, intensity, r, g, b } = sources[si];
                const isPrimary = si === 0;
                const critMod = isPrimary ? dangerWidth : 1;
                const critAlpha = isPrimary ? dangerOpacity : 1;
        
                for (let i = -1; i <= 1; i++) {
                    const angleNoise = Math.sin(time * 0.65 + i * 1.3 + si) * 0.025;
                    const widthMod = (1 + Math.sin(time * 1.05 + i * 0.85 + si * 0.7) * 0.14) * critMod;
                    const opacityPulse = intensity * critAlpha * (0.8 + Math.sin(time * 2.2 + i * 2.0 + si) * 0.2);
        
                    const sx = x + (i * this.laneWidth * 0.8);
                    const topW = 45 * widthMod;
                    const botW = 175 * widthMod;
                    const angOff = angleNoise * shaftH * 0.35;
        
                    this.ctx.save();
                    this.ctx.beginPath();
                    this.ctx.moveTo(sx - topW, 0);
                    this.ctx.lineTo(sx + topW, 0);
                    this.ctx.lineTo(sx + botW + angOff, shaftH);
                    this.ctx.lineTo(sx - botW + angOff, shaftH);
                    this.ctx.closePath();
                    this.ctx.clip();
        
                    this.ctx.globalAlpha = opacityPulse;
                    this.ctx.fillStyle = this._getShaftColorGradient(r, g, b, shaftH);
                    this.ctx.fillRect(sx - botW - 20, 0, (botW + topW) * 2 + 40, shaftH);
        
                    if (this._grainPattern && isPrimary) {
                        this.ctx.globalAlpha = opacityPulse * (0.08 + danger * 0.04);
                        this.ctx.fillStyle = this._grainPattern;
                        this.ctx.fillRect(sx - botW - 20, 0, (botW + topW) * 2 + 40, shaftH);
                    }
        
                    if (shaftDust && isPrimary && i === 0) {
                        this._drawShaftDustMotes(sx, topW, botW, shaftH, angOff, time, opacityPulse, r, g, b);
                    }
        
                    this.ctx.restore();
                }
            }
        
            this.ctx.globalAlpha = 1.0;
            this.ctx.restore();
        }
        ,
        drawFilmGrain(timestamp, grainAmount = 1.0, options = {}) {
            if (grainAmount <= 0) return;
            const highQuality = options.highQuality === true;
            const comboPulse = options.comboPulse || 0;
            const refreshMs = highQuality ? FILM_GRAIN_HIGH_REFRESH_INTERVAL_MS : FILM_GRAIN_REFRESH_INTERVAL_MS;
            const comboAlphaBoost = 1 + comboPulse * 0.18 * (0.6 + 0.4 * Math.sin(timestamp / 220));
        
            if (!this._lastGrainRefresh || timestamp - this._lastGrainRefresh > refreshMs) {
                const size = 256;
                const img = this._grainCtx.createImageData(size, size);
                for (let i = 0; i < img.data.length; i += 4) {
                    const coarse = Math.random() * 28;
                    const fine = Math.random() * 14;
                    const micro = highQuality ? Math.random() * 8 : 0;
                    const v = Math.floor(coarse * (highQuality ? 0.52 : 0.65) + fine * (highQuality ? 0.32 : 0.35) + micro * 0.16);
                    img.data[i] = v;
                    img.data[i + 1] = v;
                    img.data[i + 2] = v;
                    const alphaBase = highQuality ? 18 : 16;
                    const alphaRange = highQuality ? 14 : 10;
                    img.data[i + 3] = Math.floor(alphaBase + Math.random() * alphaRange);
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
            this.ctx.globalCompositeOperation = 'overlay';
            this.ctx.globalAlpha = 0.11 * grainAmount * comboAlphaBoost * (highQuality ? 1.08 : 1.0);
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.globalCompositeOperation = 'screen';
            this.ctx.globalAlpha = (highQuality ? 0.052 : 0.04) * grainAmount * comboAlphaBoost;
            this.ctx.fillRect(0, 0, this.width, this.height);
            if (highQuality) {
                this.ctx.globalCompositeOperation = 'soft-light';
                this.ctx.globalAlpha = 0.028 * grainAmount * comboAlphaBoost;
                this.ctx.fillRect(0, 0, this.width, this.height);
            }
            this.ctx.globalCompositeOperation = prevComposite;
            this.ctx.globalAlpha = prevAlpha;
            this.ctx.fillStyle = prevFillStyle;
        }
        
        // --- New Cinematic Post-Processing Methods ---
        ,
        drawBloom(gameState, profile, timestamp) {
            const bw = this._bloomCanvas.width;
            const bh = this._bloomCanvas.height;
            const sx = bw / this.width;
            const sy = bh / this.height;
            const bctx = this._bloomCtx;
            const effectScale = gameState.adaptiveOverrides?.effectScale ?? 1.0;
            const strength = (profile.bloomStrength || 0.85) * effectScale;
        
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
        ,
        drawColorGrade(gameState, timestamp) {
            const time = timestamp / 1000;
            const prevOp = this.ctx.globalCompositeOperation;
            const prevAlpha = this.ctx.globalAlpha;
            const prevFill = this.ctx.fillStyle;
            const danger = gameState.criticalIntensity || 0;
            const combo = gameState.combo || 0;
            const comboT = combo > 2 ? Math.min(1, (combo - 2) / 8) : 0;
            const bloomSynergy = gameState.impactFlash > 0.1 ? gameState.impactFlash * 0.5 : 0;
        
            this.ctx.globalCompositeOperation = 'multiply';
            this.ctx.globalAlpha = 0.045 + comboT * 0.012;
            if (!this._colorGradeBaseGrad || this._colorGradeBaseGradH !== this.height) {
                this._colorGradeBaseGrad = this.ctx.createLinearGradient(0, 0, 0, this.height);
                this._colorGradeBaseGrad.addColorStop(0, 'rgba(150, 190, 255, 1)');
                this._colorGradeBaseGrad.addColorStop(1, 'rgba(70, 110, 200, 1)');
                this._colorGradeBaseGradH = this.height;
            }
            this.ctx.fillStyle = this._colorGradeBaseGrad;
            this.ctx.fillRect(0, 0, this.width, this.height);
        
            if (danger > 0) {
                this.ctx.globalCompositeOperation = 'overlay';
                this.ctx.globalAlpha = danger * 0.12;
                this.ctx.fillStyle = 'rgba(255, 55, 0, 1)';
                this.ctx.fillRect(0, 0, this.width, this.height);
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.globalAlpha = danger * 0.05;
                this.ctx.fillStyle = 'rgba(80, 10, 0, 1)';
                this.ctx.fillRect(0, 0, this.width, this.height);
                if (danger > 0.25) {
                    const bleedPulse = 0.7 + 0.3 * Math.sin(time * 3.2);
                    this.ctx.globalCompositeOperation = 'soft-light';
                    this.ctx.globalAlpha = (danger - 0.25) * 0.08 * bleedPulse;
                    this.ctx.fillStyle = 'rgba(255, 90, 30, 1)';
                    this.ctx.fillRect(0, 0, this.width, this.height);
                }
            }
        
            if (comboT > 0) {
                const shimmer = 0.5 + 0.5 * Math.sin(time * 3.5);
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.globalAlpha = comboT * 0.068 * shimmer;
                if (!this._colorGradeComboGrad || this._colorGradeComboGradW !== this.width) {
                    this._colorGradeComboGrad = this.ctx.createLinearGradient(0, 0, this.width, this.height);
                    this._colorGradeComboGrad.addColorStop(0, 'rgba(255, 210, 60, 1)');
                    this._colorGradeComboGrad.addColorStop(0.5, 'rgba(255, 175, 50, 1)');
                    this._colorGradeComboGrad.addColorStop(1, 'rgba(255, 130, 30, 1)');
                    this._colorGradeComboGradW = this.width;
                }
                this.ctx.fillStyle = this._colorGradeComboGrad;
                this.ctx.fillRect(0, 0, this.width, this.height);
                this.ctx.globalCompositeOperation = 'color-dodge';
                this.ctx.globalAlpha = comboT * 0.022 * (0.5 + 0.5 * Math.sin(time * 5.5));
                this.ctx.fillStyle = 'rgba(255, 240, 180, 1)';
                this.ctx.fillRect(0, 0, this.width, this.height);
            }
        
            if (bloomSynergy > 0) {
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.globalAlpha = bloomSynergy * 0.12;
                this.ctx.fillStyle = gameState.impactFlashColor || '#ffffff';
                this.ctx.fillRect(0, 0, this.width, this.height);
            }
        
            this.ctx.globalCompositeOperation = prevOp;
            this.ctx.globalAlpha = prevAlpha;
            this.ctx.fillStyle = prevFill;
        }
        ,
        _drawBaseVignette(comboPulse = 0) {
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
            this.ctx.globalAlpha = 1.0 - comboPulse * 0.04;
            this.ctx.fillStyle = this._baseVignetteGradient;
            this.ctx.fillRect(0, 0, this.width, this.height);
            if (comboPulse > 0.1) {
                this.ctx.globalCompositeOperation = 'screen';
                this.ctx.globalAlpha = comboPulse * 0.035;
                this.ctx.fillStyle = 'rgba(255, 200, 120, 1)';
                this.ctx.fillRect(0, 0, this.width, this.height);
                this.ctx.globalCompositeOperation = 'source-over';
            }
            this.ctx.globalAlpha = prevAlpha;
            this.ctx.fillStyle = prevFill;
        }
        ,
        drawFilmPass(gameState, timestamp, profile) {
            const effectScale = gameState.adaptiveOverrides?.effectScale ?? 1.0;
            const grainAmount = (profile.grainAmount || 0) * effectScale;
            const combo = gameState.combo || 0;
            const comboPulse = combo > 2 ? Math.min(1, (combo - 2) / 10) : 0;
        
            this._drawBaseVignette(profile.grainHighQuality ? comboPulse : 0);
        
            if (gameState.criticalIntensity > 0.01) {
                this.drawVignette(gameState.criticalIntensity, timestamp);
            }
        
            const scanlineBase = profile.scanlineBase || 0;
            const scanlineIntensity = Math.min(1.0, scanlineBase + (gameState.criticalIntensity || 0) * 0.28);
            this.drawScanlines(scanlineIntensity);
        
            if ((gameState.criticalIntensity || 0) > 0.2) {
                this.drawGlitch(gameState.criticalIntensity);
            }
        
            if (grainAmount > 0) {
                this.drawFilmGrain(timestamp, grainAmount, {
                    highQuality: profile.grainHighQuality === true,
                    comboPulse
                });
            }
        }
        
    });
}
