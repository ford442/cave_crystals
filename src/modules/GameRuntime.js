import { COLORS, GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { EnergyRing, SoulParticle } from './Entities.js';
import { wasmManager } from './WasmManager.js';
import { ADAPTIVE_FRAME_BUDGET, resolveParticleStride } from './RendererConstants.js';

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

export function installGameRuntime(Game) {
    Object.assign(Game.prototype, {
        update(dt) {
            // Time Dilation Logic
            if (this.state.slowMoTimer > 0) {
                this.state.slowMoTimer -= dt;
                this.state.timeScale += (this.state.targetTimeScale - this.state.timeScale) * 0.2;
            } else {
                this.state.timeScale += (1.0 - this.state.timeScale) * 0.2;
                if (Math.abs(1.0 - this.state.timeScale) < 0.01) this.state.timeScale = 1.0;
            }
            const timeScale = this.state.timeScale;
        
            // Spring-based shake decay — natural overshoot and settle
            // k=0.15 (stiffness), damping=0.82 (allows slight ring-out)
            if (this.state.shake > 0 || Math.abs(this.state.shakeVel) > 0.01) {
                this.state.shakeVel += (-this.state.shake) * 0.15;
                this.state.shakeVel *= 0.82;
                this.state.shake += this.state.shakeVel;
                if (this.state.shake < 0.3 && Math.abs(this.state.shakeVel) < 0.1) {
                    this.state.shake = 0;
                    this.state.shakeVel = 0;
                }
            }
        
            // Recoil Kick decay
            if (this.state.kickY > 0) {
                this.state.kickY *= 0.8; // Fast elastic return
                if (this.state.kickY < 0.5) this.state.kickY = 0;
            }
        
            // Impact Flash decay
            if (this.state.impactFlash > 0) {
                this.state.impactFlash -= 0.1;
                if (this.state.impactFlash < 0) this.state.impactFlash = 0;
            }
        
            // Combo Timer decay (Game time)
            if (this.state.comboTimer > 0) {
                this.state.comboTimer -= dt * timeScale;
                if (this.state.comboTimer <= 0) {
                    this.state.combo = 0;
                }
            }
        
            // Spring-based zoom decay — natural settle with slight overshoot
            // k=0.12 (softer than shake), damping=0.80 (allows gentle ring-out)
            if (this.state.zoom !== 1.0 || Math.abs(this.state.zoomVel) > 0.0001) {
                this.state.zoomVel += (1.0 - this.state.zoom) * 0.12;
                this.state.zoomVel *= 0.80;
                this.state.zoom += this.state.zoomVel;
                if (Math.abs(1.0 - this.state.zoom) < 0.001 && Math.abs(this.state.zoomVel) < 0.0005) {
                    this.state.zoom = 1.0;
                    this.state.zoomVel = 0;
                }
            }
        
            this.state.growthMultiplier = wasmManager.calculateGrowthMultiplier(this.state.score);
            const currentGrowth = wasmManager.calculateCrystalGrowth(GAME_CONFIG.baseGrowthRate, this.state.growthMultiplier) * timeScale;
        
            let gameOver = false;
            let maxCritical = 0;
        
            this.state.crystals.forEach(c => {
                c.update(currentGrowth, timeScale);
        
                // JUICE: Critical Mass System
                // Reset shake
                c.shakeX = 0;
                c.shakeY = 0;
                c.isCritical = false;
        
                const laneCrystals = this.state.laneMap.get(c.lane);
                const opposite = laneCrystals ? laneCrystals[c.type === 'top' ? 'bottom' : 'top'] : null;
                if (opposite) {
                    const totalHeight = c.height + opposite.height;
                    const dangerThreshold = this.renderer.height * 0.75;
        
                    if (totalHeight > dangerThreshold) {
                        c.isCritical = true;
                        // Stress shake!
                        c.shakeX = (Math.random() - 0.5) * 4;
                        c.shakeY = (Math.random() - 0.5) * 4;
        
                        // Calculate intensity (0.0 to 1.0)
                        const over = totalHeight - dangerThreshold;
                        const range = this.renderer.height * 0.25;
                        const intensity = Math.min(1.0, over / range);
                        if (intensity > maxCritical) maxCritical = intensity;
        
                        // Emit smoke particles occasionally
                        if (Math.random() < 0.1 * timeScale) {
                             const x = (c.lane * this.renderer.laneWidth) + (this.renderer.laneWidth / 2) + c.shakeX;
                             const tipY = c.type === 'top' ? c.height : this.renderer.height - c.height;
        
                             // Use WASM for smoke velocity
                             const vx = wasmManager.getSmokeVx(Math.random());
                             const vy = wasmManager.getSmokeVy(Math.random());
        
                             // Dark gray smoke
                             this.state.particles.push(this.particlePool.acquire(x, tipY, 'rgba(100, 100, 100, 0.5)', vx, vy));
                        }
                    }
        
                    if (wasmManager.checkCrystalGameOver(c.height, opposite.height, this.renderer.height)) {
                        gameOver = true;
                    }
                }
        
                // Ambient crystal aura emission (gated by quality and spawn state)
                if (c.hasSpawned && this.renderer.getQualityProfile(this.state.renderQuality).crystalDetail !== 'low') {
                    const emitProb = c.isCritical ? 0.25 : 0.06;
                    if (Math.random() < emitProb * timeScale) {
                        this.createCrystalAura(c);
                    }
                }
            });
        
            // JUICE: Update Critical Intensity & Heartbeat
            this.state.criticalIntensity += (maxCritical - this.state.criticalIntensity) * 0.1;
        
            if (this.state.criticalIntensity > 0.1) {
                 this.state.heartbeatTimer -= dt;
                 if (this.state.heartbeatTimer <= 0) {
                     SoundManager.heartbeat();
                     // Faster beat as intensity increases (1000ms down to 300ms)
                     this.state.heartbeatTimer = 1000 - (this.state.criticalIntensity * 700);
                 }
            }
        
            if (gameOver) {
                this.state.active = false;
                this.shatterAllCrystals();
                SoundManager.gameOver();
        
                // Delay showing UI slightly to let the explosion be seen
                setTimeout(() => {
                    this.ui.finalScore.innerText = this.state.score;
                    this.ui.gameOver.classList.remove('hidden');
                }, 1000);
                return;
            }
        
            let uiNeedsUpdate = false;
            // Update Spores
            for (let i = this.state.spores.length - 1; i >= 0; i--) {
                let s = this.state.spores[i];
                const laneCrystals = this.state.laneMap.get(s.lane);
                s.update(
                    laneCrystals ? laneCrystals.top : null,
                    laneCrystals ? laneCrystals.bottom : null,
                    this.renderer.height,
                    this._boundCreateParticles,
                    this._boundOnSporeScore,
                    this._boundCreateShockwave,
                    this._boundCreateTrailParticle,
                    this._boundCreateDebris,
                    this._boundCreateCrystalChunk,
                    timeScale
                );
                if (!s.active) {
                    this.state.spores[i] = this.state.spores[this.state.spores.length - 1];
                    this.state.spores.pop();
                    uiNeedsUpdate = true;
                }
            }
            if (uiNeedsUpdate) this._boundUpdateUI();
        
            // Pass trail callback for juice
            this.launcher.update(this._boundCreateTrailParticle, timeScale);
        
            // Shared visual updates (including Soul Particles and Score Lerp)
            this.updateSharedVisuals(dt, timeScale);
        }
        ,
        updateSharedVisuals(dt, timeScale = 1.0) {
            const trackMs = this.state.devPerfOverlay;
            const updateT0 = trackMs ? performance.now() : 0;
            const particles = this.state.particles;
            const rw = this.renderer.width;
            const rh = this.renderer.height;
            const onBounce = this._boundCreateImpactDust;
            const ambientBatch = this._ambientBatch;
            const trailBatch = this._trailUpdateBatch;
            let ambientCount = 0;
            let trailCount = 0;

            const removeParticleAt = (i) => {
                const p = particles[i];
                if (p.isTrail) {
                    this.trailPool.release(p);
                } else {
                    this.particlePool.release(p);
                }
                particles[i] = particles[particles.length - 1];
                particles.pop();
            };

            // Update Particles — ambient + trail types batched for WASM/JS fast paths
            for (let i = particles.length - 1; i >= 0; i--) {
                const p = particles[i];

                if (p.type === 'aura' || p.type === 'ember') {
                    if (ambientCount < ambientBatch.length) ambientBatch[ambientCount++] = p;
                    continue;
                }

                if (p.isTrail) {
                    if (trailCount < trailBatch.length) trailBatch[trailCount++] = p;
                    continue;
                }

                p.update(rw, rh, onBounce, timeScale);

                // JUICE: Chunk Shatter Logic
                if (p.type === 'chunk' && (p.hitFloor || p.hitWall)) {
                    let angle = -Math.PI / 2;
                    if (p.hitWall) {
                        angle = p.x < 100 ? 0 : Math.PI;
                    }
                    this.createParticles(p.x, p.y, p.color, 15, angle, 2.0, 'shard');
                    p.life = 0;
                }

                if (p.life <= 0) {
                    removeParticleAt(i);
                }
            }

            if (trailCount > 0) {
                const usedWasm = wasmManager.batchIntegrateTrailParticles(
                    trailBatch, trailCount, timeScale, rw, rh
                );
                if (!usedWasm) {
                    for (let j = 0; j < trailCount; j++) {
                        trailBatch[j].update(timeScale, rw, rh);
                    }
                }
                for (let i = particles.length - 1; i >= 0; i--) {
                    if (particles[i].isTrail && particles[i].life <= 0) {
                        removeParticleAt(i);
                    }
                }
            }

            if (ambientCount > 0) {
                const usedWasm = wasmManager.batchIntegrateAmbientParticles(
                    ambientBatch, ambientCount, timeScale, rw, rh
                );
                if (!usedWasm) {
                    for (let j = 0; j < ambientCount; j++) {
                        ambientBatch[j].updateAmbient(rw, rh, timeScale);
                    }
                }
                for (let i = particles.length - 1; i >= 0; i--) {
                    const p = particles[i];
                    if ((p.type === 'aura' || p.type === 'ember') && p.life <= 0) {
                        removeParticleAt(i);
                    }
                }
            }
        
            // Update Shockwaves
            for (let i = this.state.shockwaves.length - 1; i >= 0; i--) {
                let sw = this.state.shockwaves[i];
                sw.update(timeScale);
                if (sw.life <= 0) {
                    this.state.shockwaves[i] = this.state.shockwaves[this.state.shockwaves.length - 1];
                    this.state.shockwaves.pop();
                }
            }
        
            // Update Energy Rings
            for (let i = this.state.energyRings.length - 1; i >= 0; i--) {
                this.state.energyRings[i].update(timeScale);
                if (this.state.energyRings[i].life <= 0) {
                    this.state.energyRings[i] = this.state.energyRings[this.state.energyRings.length - 1];
                    this.state.energyRings.pop();
                }
            }
        
            // Update Soul Particles
            for (let i = this.state.soulParticles.length - 1; i >= 0; i--) {
                let sp = this.state.soulParticles[i];
                const arrived = sp.update(this._boundCreateTrailParticle, timeScale);
        
                if (arrived) {
                    if (sp.scoreValue > 0) {
                        this.state.score += sp.scoreValue;
        
                        // Level Up Check
                        const newLevel = Math.floor(this.state.score / 500) + 1;
                        if (newLevel > this.state.level) {
                            this.state.level = newLevel;
                            this.triggerLevelUp();
                        }
                    }
                    this.state.soulParticles[i] = this.state.soulParticles[this.state.soulParticles.length - 1];
                    this.state.soulParticles.pop();
                }
            }
        
            // Update Floating Texts
            for (let i = this.state.floatingTexts.length - 1; i >= 0; i--) {
                let ft = this.state.floatingTexts[i];
                ft.update(timeScale);
                if (ft.life <= 0) {
                    this.state.floatingTexts[i] = this.state.floatingTexts[this.state.floatingTexts.length - 1];
                    this.state.floatingTexts.pop();
                }
            }
        
            // Update Atmospheric Dust
            this.state.dustParticles.forEach(p => {
                p.update(this.renderer.width, this.renderer.height, timeScale);
            });

            if (trackMs && this.state.perfMetrics) {
                this.state.perfMetrics.particleUpdateMs = performance.now() - updateT0;
            }
        
            // Update Environmental Particles (cave drips, motes, rock dust)
            const profile = this.renderer.getQualityProfile(this.state.renderQuality);
            const maxEnv = profile.maxEnvParticles || 0;
            if (maxEnv > 0) {
                const rw = this.renderer.width;
                const rh = this.renderer.height;
                const criticalIntensity = this.state.criticalIntensity || 0;
        
                // Move and decay existing env particles
                for (let i = this.state.envParticles.length - 1; i >= 0; i--) {
                    const ep = this.state.envParticles[i];
        
                    // Apply shockwave radial push
                    for (const sw of this.state.shockwaves) {
                        if (sw.life <= 0) continue;
                        const dx = ep.x - sw.x;
                        const dy = ep.y - sw.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        const influence = sw.radius * 1.5;
                        if (dist < influence && dist > 0) {
                            const push = (1 - dist / influence) * sw.life * 2.5;
                            ep.vx += (dx / dist) * push;
                            ep.vy += (dy / dist) * push;
                        }
                    }
        
                    ep.x += ep.vx * timeScale;
                    ep.y += ep.vy * timeScale;
                    ep.life -= (ep.decayRate || 0.0005) * dt * timeScale;
        
                    // Gentle gravity for drips
                    if (ep.type === 'drip') ep.vy = Math.min(ep.vy + 0.04 * timeScale, 4);
                    // Slight drift for motes
                    if (ep.type === 'mote') ep.vx += (Math.random() - 0.5) * 0.04 * timeScale;
                    // Clamp mote velocity
                    if (ep.type === 'mote') {
                        ep.vx = Math.max(-0.6, Math.min(0.6, ep.vx));
                        ep.vy = Math.max(-1.2, Math.min(0.2, ep.vy));
                    }
        
                    if (ep.life <= 0 || ep.y > rh + 10 || ep.y < -10) {
                        this.state.envParticles[i] = this.state.envParticles[this.state.envParticles.length - 1];
                        this.state.envParticles.pop();
                    }
                }
        
                // Spawn new drips from stalactite tips
                const dripRate = 0.008 + criticalIntensity * 0.018;
                if (Math.random() < dripRate && this.state.envParticles.length < maxEnv) {
                    const geo = this.renderer._caveGeometry;
                    if (geo && geo.dripSpawnPositions && geo.dripSpawnPositions.length > 0) {
                        const sp = geo.dripSpawnPositions[Math.floor(Math.random() * geo.dripSpawnPositions.length)];
                        const isGlowing = Math.random() < 0.15;
                        const colorIdx = Math.floor(Math.random() * COLORS.length);
                        this.state.envParticles.push({
                            type: 'drip',
                            x: sp.x + (Math.random() - 0.5) * 6,
                            y: sp.y,
                            vx: (Math.random() - 0.5) * 0.3,
                            vy: 0.5 + Math.random() * 1.5,
                            size: 1 + Math.random() * 1.5,
                            life: 1.0,
                            decayRate: 0.0004 + Math.random() * 0.0003,
                            glowing: isGlowing,
                            color: isGlowing ? COLORS[colorIdx].hex : null,
                        });
                    }
                }
        
                // Spawn ambient motes
                if (Math.random() < 0.004 && this.state.envParticles.length < maxEnv) {
                    const colorIdx = Math.floor(Math.random() * COLORS.length);
                    this.state.envParticles.push({
                        type: 'mote',
                        x: Math.random() * rw * 0.25 + (Math.random() < 0.5 ? 0 : rw * 0.75),
                        y: rh * 0.2 + Math.random() * rh * 0.7,
                        vx: (Math.random() - 0.5) * 0.4,
                        vy: -(0.2 + Math.random() * 0.5),
                        size: 0.8 + Math.random() * 1.4,
                        life: 1.0,
                        decayRate: 0.0003 + Math.random() * 0.0002,
                        color: COLORS[colorIdx].hex,
                    });
                }
        
                // Rock dust cascade after fresh shockwaves
                for (const sw of this.state.shockwaves) {
                    if (sw.life > 0.88 && this.state.envParticles.length < maxEnv) {
                        const count = 2 + Math.floor(Math.random() * 3);
                        for (let k = 0; k < count; k++) {
                            if (this.state.envParticles.length >= maxEnv) break;
                            this.state.envParticles.push({
                                type: 'rockdust',
                                x: sw.x + (Math.random() - 0.5) * sw.radius,
                                y: (Math.random() < 0.6 ? 0 : rh) + (Math.random() - 0.5) * 20,
                                vx: (Math.random() - 0.5) * 2.5,
                                vy: 0.8 + Math.random() * 2.5,
                                size: 1 + Math.random() * 2,
                                life: 1.0,
                                decayRate: 0.0015 + Math.random() * 0.001,
                            });
                        }
                    }
                }
            }
        
            // Score lerp and UI update
            const oldDisplay = this.state.displayScore;
            this.state.displayScore += (this.state.score - this.state.displayScore) * 0.1;
            if (Math.abs(this.state.score - this.state.displayScore) < 0.5) {
                this.state.displayScore = this.state.score;
            }
        
            // Only update DOM if score changed significantly (counting up effect)
            if (Math.floor(oldDisplay) !== Math.floor(this.state.displayScore)) {
                 this.ui.score.innerText = Math.floor(this.state.displayScore);
            }
            // Cache score transform to avoid style recalc every frame
            const newScale = 1.0 + (this.state.shake * 0.01) + (Math.floor(oldDisplay) !== Math.floor(this.state.displayScore) ? 0.1 : 0);
            if (this._lastScoreScale !== newScale) {
                this.ui.score.style.transform = `scale(${newScale})`;
                this._lastScoreScale = newScale;
            }
        }
        ,
        updateUI() {
            this.ui.score.innerText = Math.floor(this.state.displayScore);
            this.ui.level.innerText = Math.floor(this.state.score / 500) + 1;
        
            const nextCol = COLORS[this.state.nextSporeColorIdx];
            this.ui.preview.style.backgroundColor = nextCol.hex;
            this.ui.preview.style.boxShadow = `0 0 20px ${nextCol.hex}`;
        }
        ,
        _onSporeScore(points, isMatch, x, y, color) {
            if (isMatch) {
                // Spawn Soul Particles for Collection Juice
                const soulCount = 3 + Math.floor(Math.random() * 2);
                // Target top-left score area
                const tx = 60;
                const ty = 60;
        
                // JUICE: Sympathetic Resonance
                this.triggerResonance(color);
        
                for(let k=0; k<soulCount; k++) {
                    let val = Math.floor(points / soulCount);
                    if (k === 0) val += points % soulCount;
                    this.state.soulParticles.push(new SoulParticle(x, y, color, tx, ty, val));
                }
        
                // JUICE: Combo Logic
                this.state.combo++;
                this.state.comboTimer = 2000; // 2 seconds to keep combo
        
                // Time Dilation on High Combo
                if (this.state.combo > 2) {
                    this.state.targetTimeScale = 0.3;
                    this.state.slowMoTimer = 400; // Short burst of slow-mo
                }
        
                // Pitch Shift
                const pitch = 1.0 + (Math.min(this.state.combo, 10) * 0.1);
                SoundManager.match(pitch);
        
                // Screen Shake
                this.state.shake = 15 + (this.state.combo * 2);
        
                // Impact Zoom
                this.state.zoom = 1.02 + (Math.min(this.state.combo, 10) * 0.01);
                this.state.zoomFocus = { x: x || this.renderer.width/2, y: y || this.renderer.height/2 };
        
                this.state.impactFlash = 0.6; // stronger flash
                this.state.impactFlashColor = color || '#fff'; // Use match color
                this.state.sleepTimer = 50; // 50ms Hit Stop
        
                if (x !== undefined && y !== undefined) {
                    this.createFloatingText(x, y, `+${points}`, '#fff');
        
                    // Multi-phase match burst VFX
                    this.createMatchBurst(x, y, color, this.state.combo);
        
                    // JUICE: Combo Text
                    if (this.state.combo > 1) {
                        const comboColors = ['#fff', '#FFFF00', '#FFA500', '#FF4500', '#FF00FF'];
                        const colIdx = Math.min(this.state.combo - 1, comboColors.length - 1);
                        const scale = 1.5 + (this.state.combo * 0.2);
                        this.createFloatingText(x, y - 30, `COMBO x${this.state.combo}!`, comboColors[colIdx], scale);
                    }
                }
            } else if (points === 0) {
                // Mismatch - Break Combo
                this.state.combo = 0;
                this.state.comboTimer = 0;
                SoundManager.mismatch();
        
                this.state.shake = 25;
                this.state.impactFlash = 0.3; // Small flash on error
                this.state.impactFlashColor = '#f00'; // Red flash on miss
                this.state.sleepTimer = 30; // Small hit stop for errors too
                if (x !== undefined && y !== undefined) {
                    this.createFloatingText(x, y, "MISS", '#f00');
                    this.createImpactSparks(x, y, '#888', 2);
                }
            }
        }
        ,
        getQualityScale() {
            if (this.state.renderQuality === 'low') return 0.55;
            if (this.state.renderQuality === 'medium') return 0.8;
            return 1.0;
        }
        ,
        resolveQualityForFps(fps, lowThreshold, mediumThreshold) {
            if (fps < lowThreshold) return 'low';
            if (fps < mediumThreshold) return 'medium';
            return 'high';
        }
        ,
        setQualityMode(mode = 'auto') {
            const prevQuality = this.state.renderQuality;
            this.state.qualityMode = mode;
            if (mode === 'dev') {
                this.state.renderQuality = 'high';
                this.state.devPerfOverlay = true;
            } else if (mode === 'auto') {
                if (!this._smoothedFps) this._smoothedFps = 60;
                this.state.renderQuality = this.resolveQualityForFps(
                    this._smoothedFps,
                    ADAPTIVE_QUALITY.autoLowFps,
                    ADAPTIVE_QUALITY.autoMediumFps
                );
            } else {
                this.state.renderQuality = mode;
            }
            if (prevQuality !== this.state.renderQuality) {
                this.resetAdaptiveOverrides();
            }
            this._updateFpsHud();
        }
        ,
        resetAdaptiveOverrides() {
            this.state.adaptiveOverrides.particleStrideBoost = 0;
            this.state.adaptiveOverrides.effectScale = 1.0;
        }
        ,
        updateAdaptiveQuality(fps) {
            if (!this._smoothedFps) this._smoothedFps = fps;
            this._smoothedFps += (fps - this._smoothedFps) * ADAPTIVE_QUALITY.fpsSmoothingFactor;
            if (this.state.qualityMode !== 'auto') return;

            if (!this._qualityCooldownUntil) this._qualityCooldownUntil = 0;
            const now = performance.now();
            if (now < this._qualityCooldownUntil) return;

            if (this._smoothedFps < ADAPTIVE_QUALITY.downgradeLowFps && this.state.renderQuality !== 'low') {
                this.state.renderQuality = 'low';
                this._qualityCooldownUntil = now + ADAPTIVE_QUALITY.cooldownSlowMs;
            } else if (this._smoothedFps < ADAPTIVE_QUALITY.downgradeMediumFps && this.state.renderQuality === 'high') {
                this.state.renderQuality = 'medium';
                this._qualityCooldownUntil = now + ADAPTIVE_QUALITY.cooldownFastMs;
            } else if (this._smoothedFps > ADAPTIVE_QUALITY.upgradeFps && this.state.renderQuality !== 'high') {
                this.state.renderQuality = this.state.renderQuality === 'low' ? 'medium' : 'high';
                this._qualityCooldownUntil = now + ADAPTIVE_QUALITY.cooldownFastMs;
            }
        }
        ,
        updatePerfMetrics(dt, fps) {
            const metrics = this.state.perfMetrics;
            metrics.frameMs = dt;
            metrics.instantFps = dt > 0 ? 1000 / dt : 0;
            if (!metrics.smoothedFrameMs) metrics.smoothedFrameMs = dt;
            metrics.smoothedFrameMs += (dt - metrics.smoothedFrameMs) * 0.18;
            if (fps !== undefined) {
                metrics.fps = fps;
                metrics.smoothedFps = this._smoothedFps || fps;
            }
            metrics.particleCount = this.state.particles.length;
            const profile = this.renderer.getQualityProfile(this.state.renderQuality);
            metrics.particleLimit = profile.maxParticles;
            metrics.envParticleCount = this.state.envParticles.length;
            metrics.shockwaveCount = this.state.shockwaves.length;
            metrics.sporeCount = this.state.spores.length;
            metrics.energyRingCount = this.state.energyRings.length;
            metrics.particleStride = resolveParticleStride(
                profile,
                metrics.particleCount,
                this.state.adaptiveOverrides,
                metrics.smoothedFrameMs,
                metrics.instantFps > 0 ? 1000 / metrics.instantFps : metrics.smoothedFrameMs
            );

            // JUICE: Dev-only extended metrics — zero extra work when overlay is off
            if (this.state.devPerfOverlay) {
                let trails = 0;
                const particles = this.state.particles;
                for (let i = 0; i < particles.length; i++) {
                    if (particles[i].isTrail) trails++;
                }
                metrics.trailCount = trails;
                this._updateFpsHud();
            }
        }
        ,
        updateFrameTimeAdaptive() {
            const budget = ADAPTIVE_FRAME_BUDGET;
            const overrides = this.state.adaptiveOverrides;
            const frameMs = this.state.perfMetrics.smoothedFrameMs;

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
        ,
        loop(timestamp) {
            if (!this.state.lastTime) this.state.lastTime = timestamp;
            let dt = timestamp - this.state.lastTime;
            this.state.lastTime = timestamp;
        
            // Cap dt to prevent huge jumps if tab was inactive
            if (dt > 100) dt = 100;

            this.updatePerfMetrics(dt);
            this.updateFrameTimeAdaptive();

            // FPS Counter
            if (!this._fpsLastTime) this._fpsLastTime = timestamp;
            if (!this._fpsFrames) this._fpsFrames = 0;
            this._fpsFrames++;
            if (timestamp - this._fpsLastTime >= 1000) {
                const fps = Math.round((this._fpsFrames * 1000) / (timestamp - this._fpsLastTime));
                this.updateAdaptiveQuality(fps);
                this.updatePerfMetrics(dt, fps);
                if (this.ui.fps) {
                    this._updateFpsHud();
                }
                this._fpsFrames = 0;
                this._fpsLastTime = timestamp;
            }
        
            // Impact Sleep (Hit Stop)
            if (this.state.sleepTimer > 0) {
                this.state.sleepTimer -= dt;
                // Still draw (frozen frame), maybe with continued shake
                this.calculateShake();
                this.renderer.draw(this.state, this.launcher, timestamp);
                requestAnimationFrame(this._boundLoop);
                return;
            }
        
            if (this.state.active) {
                this.update(dt);
            } else {
                // Even if game over, update visuals (particles, shockwaves)
                this.updateVisuals(dt);
            }
            this.calculateShake();
            this.renderer.draw(this.state, this.launcher, timestamp);
        
            requestAnimationFrame(this._boundLoop);
        }
        ,
        shatterAllCrystals() {
            // JUICE: Massive explosion of all crystals
            this.state.targetTimeScale = 0.1;
            this.state.slowMoTimer = 3000;
        
            this.state.shake = 60; // Huge shake
            this.state.impactFlash = 1.0; // Full white flash
            this.state.impactFlashColor = '#fff';
            this.state.criticalIntensity = 0; // Stop red alert
        
            this.state.crystals.forEach(c => {
                // Calculate center of crystal for explosion origin
                const x = (c.lane * this.renderer.laneWidth) + (this.renderer.laneWidth / 2);
                const h = c.height;
                let y;
                if (c.type === 'top') {
                    y = h / 2;
                } else {
                    y = this.renderer.height - (h / 2);
                }
        
                const color = COLORS[c.colorIdx].hex;
                const crystalName = COLORS[c.colorIdx].name;
        
                // Layer 1: Main shard burst
                this.createParticles(x, y, color, 30, null, 1.5, 'shard');
                // Layer 2: Heavy debris tumbling outward
                this.createDebris(x, y, color, 5, null, 1.0);
                // Layer 3: Shockwave ring
                this.createShockwave(x, y, color);
                // Layer 4: Energy ring for extra pop
                this.state.energyRings.push(new EnergyRing(x, y, color, 4));
                const profile = this.renderer.getQualityProfile(this.state.renderQuality);
                if (profile.crystalDetail !== 'low') {
                    this.state.energyRings.push(new EnergyRing(x, y, color, 1, { flash: true }));
                    this.createImpactSparks(x, y, color, 5);
                }
                // Layer 5: Amber-specific ember trails
                if (crystalName === 'Amber') {
                    const emberCount = profile.crystalDetail === 'high' ? 8 : 4;
                    for (let j = 0; j < emberCount; j++) {
                        if (this.state.particles.length < profile.maxParticles) {
                            this.state.particles.push(this.particlePool.acquire(
                                x + (Math.random() - 0.5) * 20,
                                y + (Math.random() - 0.5) * 20,
                                '#FF6600', null, null, 'ember'
                            ));
                        }
                    }
                }
            });
        
            // Remove all crystals to simulate total destruction
            this.state.crystals = [];
        }
        ,
        updateVisuals(dt) {
            // Shake decay
            if (this.state.shake > 0) {
                this.state.shake *= 0.9;
                if (this.state.shake < 0.5) this.state.shake = 0;
            }
        
            // Impact Flash decay
            if (this.state.impactFlash > 0) {
                this.state.impactFlash -= 0.1;
                if (this.state.impactFlash < 0) this.state.impactFlash = 0;
            }
        
            this.updateSharedVisuals(dt);
        }
    });
}
