// @ts-check

import { COLORS, GAME_CONFIG } from '../Constants.js';
import { DEFAULT_PALETTE, applyPreviewShape } from '../ColorPalettes.js';
import { SoundManager } from '../Audio.js';
import { wasmManager } from '../WasmManager.js';
import { particleWorkerBridge } from '../ParticleWorkerBridge.js';
import { ENDLESS_CONFIG } from '../LevelDefinitions.js';
import { getEffectiveGrowthRate } from '../PowerUpEffects.js';
import { tickComboTimer } from './ComboLogic.js';
import { evaluateCrystalPressure } from './CollisionSystem.js';

export class GameLoop {
    /**
     * @param {import('../Game.js').Game} game
     * @param {{ quality: import('./QualitySystem.js').QualitySystem, juice: import('./JuiceSystem.js').JuiceSystem, collision: import('./CollisionSystem.js').CollisionSystem, combo: import('./ComboSystem.js').ComboSystem }} systems
     */
    constructor(game, systems) {
        this.game = game;
        this.quality = systems.quality;
        this.juice = systems.juice;
        this.collision = systems.collision;
        this.combo = systems.combo;
    }

    /** @param {number} dt */
    update(dt) {
        const game = this.game;
        if (game.state.paused) {
            return;
        }

        if (game.state.active && !game.replay.player.isActive()) {
            game.state.gameClockMs += dt;
        }

        const input = game.replay.player.isActive()
            ? game.replay.player.poll(game, dt)
            : game.input.poll(game.settings.get().input, dt);
        if (input.laneDelta) {
            const nextLane = Math.min(
                Math.max(0, game.launcher.targetLane + input.laneDelta),
                GAME_CONFIG.lanes - 1
            );
            game.setTargetLane(nextLane);
        }
        if (input.fire && !input.laneDelta) {
            game.shootSpore();
            game.input.consumeFire();
        }

        this.juice.tickDecay(dt);
        const timeScale = game.state.timeScale;

        tickComboTimer(game.state, dt, timeScale);

        game.state.growthMultiplier = game.progression.getGrowthMultiplier(game.state.score);
        const baseGrowth = wasmManager.calculateCrystalGrowth(
            GAME_CONFIG.baseGrowthRate,
            game.state.growthMultiplier
        );
        const currentGrowth = getEffectiveGrowthRate(
            baseGrowth * timeScale,
            game.powerUps.isGrowthFrozen()
        );

        game.progression.tick(dt, timeScale);
        game.powerUps.update(dt);

        const bossActive = game.boss.isBusy();
        if (bossActive) {
            const bossResult = game.boss.update(dt, timeScale);
            if (bossResult.justSurged) {
                SoundManager.bossSting();
                game.createShockwave(
                    game.renderer.width / 2,
                    game.renderer.height / 2,
                    game.boss.definition?.colors?.telegraph || '#FF8800'
                );
                game.state.shake = Math.max(game.state.shake, 22 * game.state.motionScale);
                game.state.impactFlash = Math.max(game.state.impactFlash, 0.35 * game.state.motionScale);
                game.state.impactFlashColor = game.boss.definition?.colors?.primary || '#FF4466';
            }
            if (bossResult.justEnteredVulnerable) {
                game.createFloatingText(
                    game.renderer.width / 2,
                    game.renderer.height * 0.22,
                    'VULNERABLE!',
                    game.boss.definition?.colors?.vulnerable || '#44FFAA',
                    2.0
                );
            }
            game.state.boss = game.boss.getHudState();
            if (bossResult.justDefeated) {
                game.handleBossDefeat();
                return;
            }
        } else {
            game.state.boss = null;
        }

        if (!bossActive && !game.progression.transitioning && !game.progression.isEndless()) {
            if (game.progression.checkObjectiveComplete(
                game.state.score,
                game.state.combo,
                game.state.crystals
            )) {
                game.handleLevelComplete();
                return;
            }
        }

        let gameOver = false;
        let maxCritical = 0;

        if (bossActive) {
            game.boss.applyGrowth(
                game.state.crystals,
                dt,
                timeScale,
                game.renderer.height,
                game.progression.getSpawnConfig().colorCount
            );
            // Still run spring/flash animation with zero baseline growth
            game.state.crystals.forEach(c => {
                c.update(0, timeScale);
                c.shakeX = 0;
                c.shakeY = 0;
                c.isCritical = false;

                const laneCrystals = game.state.laneMap.get(c.lane);
                const opposite = laneCrystals ? laneCrystals[c.type === 'top' ? 'bottom' : 'top'] : null;
                if (opposite) {
                    const pressure = evaluateCrystalPressure(c, opposite, game.renderer.height);
                    if (pressure.isCritical) {
                        c.isCritical = true;
                        c.shakeX = (Math.random() - 0.5) * 4;
                        c.shakeY = (Math.random() - 0.5) * 4;
                        if (pressure.intensity > maxCritical) maxCritical = pressure.intensity;
                    }
                    if (pressure.gameOver) {
                        gameOver = true;
                    }
                }
            });
        } else {
            game.state.crystals.forEach(c => {
                c.update(currentGrowth, timeScale);

                c.shakeX = 0;
                c.shakeY = 0;
                c.isCritical = false;

                const laneCrystals = game.state.laneMap.get(c.lane);
                const opposite = laneCrystals ? laneCrystals[c.type === 'top' ? 'bottom' : 'top'] : null;
                if (opposite) {
                    const pressure = evaluateCrystalPressure(c, opposite, game.renderer.height);
                    if (pressure.isCritical) {
                        c.isCritical = true;
                        c.shakeX = (Math.random() - 0.5) * 4;
                        c.shakeY = (Math.random() - 0.5) * 4;
                        if (pressure.intensity > maxCritical) maxCritical = pressure.intensity;

                        if (Math.random() < 0.1 * timeScale) {
                            const x = (c.lane * game.renderer.laneWidth) + (game.renderer.laneWidth / 2) + c.shakeX;
                            const tipY = c.type === 'top' ? c.height : game.renderer.height - c.height;
                            const vx = wasmManager.getSmokeVx(Math.random());
                            const vy = wasmManager.getSmokeVy(Math.random());
                            game.state.particles.push(game.particlePool.acquire(x, tipY, 'rgba(100, 100, 100, 0.5)', vx, vy));
                        }
                    }
                    if (pressure.gameOver) {
                        gameOver = true;
                    }
                }

                if (c.hasSpawned && game.renderer.getQualityProfile(game.state.renderQuality).crystalDetail !== 'low') {
                    const emitProb = c.isCritical ? 0.25 : 0.06;
                    if (Math.random() < emitProb * timeScale) {
                        this.juice.createCrystalAura(c);
                    }
                }
            });
        }

        game.state.criticalIntensity += (maxCritical - game.state.criticalIntensity) * 0.1;

        if (game.state.criticalIntensity > 0.1) {
            game.state.heartbeatTimer -= dt;
            if (game.state.heartbeatTimer <= 0) {
                SoundManager.heartbeat();
                game.state.heartbeatTimer = 1000 - (game.state.criticalIntensity * 700);
            }
        }

        if (gameOver) {
            game.state.active = false;
            this.juice.shatterAllCrystals();
            SoundManager.gameOver();
            SoundManager.stopSession();
            game.save.recordGameEnd({
                score: game.state.score,
                combo: game._sessionBestCombo || 0,
            });

            setTimeout(() => {
                if (game.ui.gameOverTitle) {
                    game.ui.gameOverTitle.textContent = 'GAME OVER';
                }
                game.showGameOverStats();
                game.ui.gameOver.classList.remove('hidden');
            }, 1000);
            return;
        }

        let uiNeedsUpdate = false;
        for (let i = game.state.spores.length - 1; i >= 0; i--) {
            const s = game.state.spores[i];
            const laneCrystals = game.state.laneMap.get(s.lane);
            s.update(
                laneCrystals ? laneCrystals.top : null,
                laneCrystals ? laneCrystals.bottom : null,
                game.renderer.height,
                game._boundCreateParticles,
                game._boundOnSporeScore,
                game._boundCreateShockwave,
                game._boundCreateTrailParticle,
                game._boundCreateDebris,
                game._boundCreateCrystalChunk,
                timeScale,
                this.collision
            );
            if (!s.active) {
                game.state.spores[i] = game.state.spores[game.state.spores.length - 1];
                game.state.spores.pop();
                uiNeedsUpdate = true;
            }
        }
        if (uiNeedsUpdate) game._boundUpdateUI();

        game.launcher.update(game._boundCreateTrailParticle, timeScale);
        this.updateSharedVisuals(dt, timeScale);
    }

    /**
     * @param {number} dt
     * @param {number} [timeScale]
     */
    updateSharedVisuals(dt, timeScale = 1.0) {
        const game = this.game;
        const trackMs = game.state.devPerfOverlay;
        const updateT0 = trackMs ? performance.now() : 0;
        const particles = game.state.particles;
        const rw = game.renderer.width;
        const rh = game.renderer.height;
        const onBounce = game._boundCreateImpactDust;
        const ambientBatch = game._ambientBatch;
        const trailBatch = game._trailUpdateBatch;
        let ambientCount = 0;
        let trailCount = 0;

        const removeParticleAt = (i) => {
            const p = particles[i];
            if (p.isTrail) {
                game.trailPool.release(p);
            } else {
                game.particlePool.release(p);
            }
            particles[i] = particles[particles.length - 1];
            particles.pop();
        };

        for (let i = particles.length - 1; i >= 0; i--) {
            const raw = particles[i];

            if (raw.isTrail) {
                if (trailCount < trailBatch.length) trailBatch[trailCount++] = raw;
                continue;
            }

            const p = /** @type {import('../Entities.js').Particle} */ (raw);

            if (p.type === 'aura' || p.type === 'ember') {
                if (ambientCount < ambientBatch.length) ambientBatch[ambientCount++] = p;
                continue;
            }

            p.update(rw, rh, onBounce, timeScale);

            if (p.type === 'chunk' && (p.hitFloor || p.hitWall)) {
                let angle = -Math.PI / 2;
                if (p.hitWall) {
                    angle = p.x < 100 ? 0 : Math.PI;
                }
                this.juice.createParticles(p.x, p.y, p.color, 15, angle, 2.0, 'shard');
                p.life = 0;
            }

            if (p.life <= 0) {
                removeParticleAt(i);
            }
        }

        const integration = particleWorkerBridge.scheduleVisualIntegration({
            trailBatch,
            trailCount,
            dustParticles: game.state.dustParticles,
            ambientBatch,
            ambientCount,
            timeScale,
            rw,
            rh,
            renderQuality: game.state.renderQuality,
            wasmManager,
        });

        if (!integration.usedWorker || integration.appliedResult) {
            for (let i = particles.length - 1; i >= 0; i--) {
                if (particles[i].isTrail && particles[i].life <= 0) {
                    removeParticleAt(i);
                }
            }
        }

        if (!integration.usedWorker || integration.appliedResult) {
            for (let i = particles.length - 1; i >= 0; i--) {
                const raw = particles[i];
                if (raw.isTrail) continue;
                const part = /** @type {import('../Entities.js').Particle} */ (raw);
                if ((part.type === 'aura' || part.type === 'ember') && part.life <= 0) {
                    removeParticleAt(i);
                }
            }
        }

        for (let i = game.state.shockwaves.length - 1; i >= 0; i--) {
            const sw = game.state.shockwaves[i];
            sw.update(timeScale);
            if (sw.life <= 0) {
                game.state.shockwaves[i] = game.state.shockwaves[game.state.shockwaves.length - 1];
                game.state.shockwaves.pop();
            }
        }

        for (let i = game.state.energyRings.length - 1; i >= 0; i--) {
            game.state.energyRings[i].update(timeScale);
            if (game.state.energyRings[i].life <= 0) {
                game.state.energyRings[i] = game.state.energyRings[game.state.energyRings.length - 1];
                game.state.energyRings.pop();
            }
        }

        for (let i = game.state.soulParticles.length - 1; i >= 0; i--) {
            const sp = game.state.soulParticles[i];
            const arrived = sp.update(game._boundCreateTrailParticle, timeScale);

            if (arrived) {
                if (sp.scoreValue > 0) {
                    game.state.score += sp.scoreValue;

                    if (game.progression.isEndless()) {
                        const newLevel = Math.floor(game.state.score / ENDLESS_CONFIG.growth.scoreDivisor) + 1;
                        if (newLevel > game.state.level) {
                            game.state.level = newLevel;
                            game.triggerLevelUp();
                        }
                    }
                }
                game.state.soulParticles[i] = game.state.soulParticles[game.state.soulParticles.length - 1];
                game.state.soulParticles.pop();
            }
        }

        for (let i = game.state.floatingTexts.length - 1; i >= 0; i--) {
            const ft = game.state.floatingTexts[i];
            ft.update(timeScale);
            if (ft.life <= 0) {
                game.state.floatingTexts[i] = game.state.floatingTexts[game.state.floatingTexts.length - 1];
                game.state.floatingTexts.pop();
            }
        }

        if (trackMs && game.state.perfMetrics) {
            game.state.perfMetrics.particleUpdateMs = performance.now() - updateT0;
            const workerStatus = particleWorkerBridge.getStatus();
            game.state.perfMetrics.particleIntegratorPath = workerStatus.path;
            game.state.perfMetrics.particleWorkerMs = workerStatus.workerMs;
            game.state.perfMetrics.particleWorkerBacklog = workerStatus.backlog;
        }

        const profile = game.renderer.getQualityProfile(game.state.renderQuality);
        const maxEnv = profile.maxEnvParticles || 0;
        if (maxEnv > 0) {
            const criticalIntensity = game.state.criticalIntensity || 0;

            for (let i = game.state.envParticles.length - 1; i >= 0; i--) {
                const ep = game.state.envParticles[i];

                for (const sw of game.state.shockwaves) {
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

                if (ep.type === 'drip') ep.vy = Math.min(ep.vy + 0.04 * timeScale, 4);
                if (ep.type === 'mote') ep.vx += (Math.random() - 0.5) * 0.04 * timeScale;
                if (ep.type === 'mote') {
                    ep.vx = Math.max(-0.6, Math.min(0.6, ep.vx));
                    ep.vy = Math.max(-1.2, Math.min(0.2, ep.vy));
                }

                if (ep.life <= 0 || ep.y > rh + 10 || ep.y < -10) {
                    game.state.envParticles[i] = game.state.envParticles[game.state.envParticles.length - 1];
                    game.state.envParticles.pop();
                }
            }

            const dripRate = 0.008 + criticalIntensity * 0.018;
            if (Math.random() < dripRate && game.state.envParticles.length < maxEnv) {
                const geo = game.renderer._caveGeometry;
                if (geo && geo.dripSpawnPositions && geo.dripSpawnPositions.length > 0) {
                    const sp = geo.dripSpawnPositions[Math.floor(Math.random() * geo.dripSpawnPositions.length)];
                    const isGlowing = Math.random() < 0.15;
                    const colorIdx = Math.floor(Math.random() * COLORS.length);
                    game.state.envParticles.push({
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

            if (Math.random() < 0.004 && game.state.envParticles.length < maxEnv) {
                const colorIdx = Math.floor(Math.random() * COLORS.length);
                game.state.envParticles.push({
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

            for (const sw of game.state.shockwaves) {
                if (sw.life > 0.88 && game.state.envParticles.length < maxEnv) {
                    const count = 2 + Math.floor(Math.random() * 3);
                    for (let k = 0; k < count; k++) {
                        if (game.state.envParticles.length >= maxEnv) break;
                        game.state.envParticles.push({
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

        const oldDisplay = game.state.displayScore;
        game.state.displayScore += (game.state.score - game.state.displayScore) * 0.1;
        if (Math.abs(game.state.score - game.state.displayScore) < 0.5) {
            game.state.displayScore = game.state.score;
        }

        if (Math.floor(oldDisplay) !== Math.floor(game.state.displayScore)) {
            game.ui.score.innerText = String(Math.floor(game.state.displayScore));
        }
        const newScale = 1.0 + (game.state.shake * 0.01) + (Math.floor(oldDisplay) !== Math.floor(game.state.displayScore) ? 0.1 : 0);
        if (game._lastScoreScale !== newScale) {
            game.ui.score.style.transform = `scale(${newScale})`;
            game._lastScoreScale = newScale;
        }

        if (game.state.active) {
            this._updateObjectiveHud();
            game.updatePowerUpHud();
        }

        game.tutorial?.update(dt);
    }

    _updateObjectiveHud() {
        const game = this.game;
        if (game.boss.isBusy() && game.state.boss) {
            const boss = game.state.boss;
            if (game.ui.levelName) {
                game.ui.levelName.textContent = boss.name ? `— ${boss.name}` : '';
            }
            if (game.ui.objectiveLabel) {
                const nextLabel = `Boss HP (${boss.hp}/${boss.maxHp})`;
                if (game.ui.objectiveLabel.textContent !== nextLabel) {
                    game.ui.objectiveLabel.textContent = nextLabel;
                }
            }
            if (game.ui.objectiveProgress) {
                const pct = boss.maxHp > 0 ? boss.hp / boss.maxHp : 0;
                const width = `${Math.round(pct * 100)}%`;
                if (game.ui.objectiveProgress.style.width !== width) {
                    game.ui.objectiveProgress.style.width = width;
                }
            }
            return;
        }

        const progress = game.progression.getObjectiveProgress(
            game.state.score,
            game.state.combo,
            game.state.crystals
        );
        if (game.ui.levelName) {
            game.ui.levelName.textContent = progress.levelName ? `— ${progress.levelName}` : '';
        }
        if (game.ui.objectiveLabel) {
            const current = Math.min(progress.current, progress.target);
            const detail = progress.target > 0
                ? ` (${Math.floor(current)}/${Math.floor(progress.target)})`
                : '';
            const nextLabel = `${progress.label}${detail}`;
            if (game.ui.objectiveLabel.textContent !== nextLabel) {
                game.ui.objectiveLabel.textContent = nextLabel;
            }
        }
        if (game.ui.objectiveProgress) {
            const width = `${Math.round(progress.percent * 100)}%`;
            if (game.ui.objectiveProgress.style.width !== width) {
                game.ui.objectiveProgress.style.width = width;
            }
        }
    }

    updateUI() {
        const game = this.game;
        game.ui.score.innerText = String(Math.floor(game.state.displayScore));
        game.ui.level.innerText = game.progression.getDisplayLevelText();
        this._updateObjectiveHud();
        game.updatePowerUpHud();

        const palette = game.state.colorPalette || DEFAULT_PALETTE;
        const nextCol = palette[game.state.nextSporeColorIdx];
        const hasRainbow = game.powerUps.getHeldCount('rainbow') > 0;
        if (hasRainbow) {
            game.ui.preview.style.clipPath = '';
            game.ui.preview.style.background = 'linear-gradient(135deg, #ff0055, #00ff66, #00ccff, #cc00ff, #ffaa00)';
            game.ui.preview.style.boxShadow = '0 0 24px #ffffff';
            game.ui.preview.textContent = '★';
        } else {
            applyPreviewShape(game.ui.preview, nextCol.shape, nextCol.hex);
            game.ui.preview.style.boxShadow = `0 0 20px ${nextCol.hex}`;
            game.ui.preview.textContent = nextCol.glyph || nextCol.shortLabel || '';
        }
        game.ui.preview.classList.toggle('rainbow-ready', hasRainbow);
    }

    /** @param {number} dt */
    updateVisuals(dt) {
        this.juice.tickInactiveDecay();
        this.updateSharedVisuals(dt);
    }

    /** @param {number} timestamp */
    loop(timestamp) {
        const game = this.game;
        if (!game.state.lastTime) game.state.lastTime = timestamp;
        let dt = timestamp - game.state.lastTime;
        game.state.lastTime = timestamp;

        if (dt > 100) dt = 100;

        this.quality.updatePerfMetrics(dt);
        this.quality.updateFrameTimeAdaptive();

        const fps = this.quality.tickFpsCounter(timestamp);
        if (fps !== undefined) {
            this.quality.updateAdaptiveQuality(fps);
            this.quality.updatePerfMetrics(dt, fps);
            if (game.ui.fps) {
                this.quality.updateFpsHud();
            }
        }

        if (game.state.sleepTimer > 0) {
            game.state.sleepTimer -= dt;
            this.juice.calculateShake();
            game.renderer.draw(game.state, game.launcher, timestamp);
            requestAnimationFrame(game._boundLoop);
            return;
        }

        if (game.state.active) {
            if (!game.state.paused) {
                this.update(dt);
            }
            SoundManager.updateSession({
                active: !game.state.paused,
                criticalIntensity: game.state.criticalIntensity,
                combo: game.state.combo,
                level: game.state.level,
            });
        } else {
            this.updateVisuals(dt);
        }
        this.juice.calculateShake();
        game.renderer.draw(game.state, game.launcher, timestamp);

        requestAnimationFrame(game._boundLoop);
    }
}
