// @ts-check

import { COLORS } from '../Constants.js';
import { DEFAULT_PALETTE } from '../ColorPalettes.js';
import { Shockwave, FloatingText, EnergyRing } from '../Entities.js';
import { wasmManager } from '../WasmManager.js';

export class JuiceSystem {
    /**
     * @param {import('../Game.js').Game} game
     * @param {import('./QualitySystem.js').QualitySystem} quality
     */
    constructor(game, quality) {
        this.game = game;
        this.quality = quality;
    }

    /**
     * @param {number} dt
     * @param {number} [timeScale]
     */
    tickDecay(dt, timeScale = this.game.state.timeScale) {
        const state = this.game.state;

        if (state.slowMoTimer > 0) {
            state.slowMoTimer -= dt;
            state.timeScale += (state.targetTimeScale - state.timeScale) * 0.2;
        } else {
            state.timeScale += (1.0 - state.timeScale) * 0.2;
            if (Math.abs(1.0 - state.timeScale) < 0.01) state.timeScale = 1.0;
        }

        if (state.shake > 0 || Math.abs(state.shakeVel) > 0.01) {
            state.shakeVel += (-state.shake) * 0.15;
            state.shakeVel *= 0.82;
            state.shake += state.shakeVel;
            if (state.shake < 0.3 && Math.abs(state.shakeVel) < 0.1) {
                state.shake = 0;
                state.shakeVel = 0;
            }
        }

        if (state.kickY > 0) {
            state.kickY *= 0.8;
            if (state.kickY < 0.5) state.kickY = 0;
        }

        if (state.impactFlash > 0) {
            state.impactFlash -= 0.1;
            if (state.impactFlash < 0) state.impactFlash = 0;
        }

        if (state.zoom !== 1.0 || Math.abs(state.zoomVel) > 0.0001) {
            state.zoomVel += (1.0 - state.zoom) * 0.12;
            state.zoomVel *= 0.80;
            state.zoom += state.zoomVel;
            if (Math.abs(1.0 - state.zoom) < 0.001 && Math.abs(state.zoomVel) < 0.0005) {
                state.zoom = 1.0;
                state.zoomVel = 0;
            }
        }

        void timeScale;
    }

    /** Inactive-game simplified decay */
    tickInactiveDecay() {
        const state = this.game.state;
        if (state.shake > 0) {
            state.shake *= 0.9;
            if (state.shake < 0.5) state.shake = 0;
        }
        if (state.impactFlash > 0) {
            state.impactFlash -= 0.1;
            if (state.impactFlash < 0) state.impactFlash = 0;
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {string} color
     * @param {number} [combo]
     * @param {{ flash?: boolean }} [options]
     */
    addEnergyRing(x, y, color, combo = 1, options) {
        this.game.state.energyRings.push(new EnergyRing(x, y, color, combo, options));
    }

    createImpactDust(x, y, color) {
        this.createParticles(x, y, color, 3, -Math.PI / 2, 2.0, 'spark');
    }

    /** @param {import('../types.js').Crystal} crystal */
    createCrystalAura(crystal) {
        const { state, renderer, particlePool } = this.game;
        const profile = renderer.getQualityProfile(state.renderQuality);
        if (state.particles.length >= profile.maxParticles) return;

        const x = (crystal.lane * renderer.laneWidth) + (renderer.laneWidth / 2) + (crystal.shakeX || 0);
        const tipY = crystal.type === 'top' ? crystal.height : renderer.height - crystal.height;
        const spread = crystal.isCritical ? 28 : 14;
        const px = x + (Math.random() - 0.5) * spread;
        const py = tipY + (Math.random() - 0.5) * spread;

        const palette = state.colorPalette || DEFAULT_PALETTE;
        const color = palette[crystal.colorIdx].hex;
        state.particles.push(particlePool.acquire(px, py, color, null, null, 'aura'));

        if (crystal.isCritical && Math.random() < 0.4 && state.particles.length < profile.maxParticles) {
            const px2 = x + (Math.random() - 0.5) * spread * 1.5;
            const py2 = tipY + (Math.random() - 0.5) * spread * 1.5;
            state.particles.push(particlePool.acquire(px2, py2, color, null, null, 'aura'));
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {string} color
     * @param {number} combo
     */
    createMatchBurst(x, y, color, combo) {
        const { state, renderer, particlePool } = this.game;
        const profile = renderer.getQualityProfile(state.renderQuality);
        const qualityScale = this.quality.getQualityScale();
        const maxParticles = profile.maxParticles;

        this.addEnergyRing(x, y, color, combo);

        if (profile.crystalDetail !== 'low') {
            this.addEnergyRing(x, y, color, 1, { flash: true });
        }

        if (combo > 3) {
            this.addEnergyRing(x, y, '#ffffff', 1);
        }

        if (profile.crystalDetail !== 'low') {
            this.createImpactSparks(x, y, color, 3 + Math.min(combo, 6));
        }

        const dissolveCount = Math.floor((8 + combo * 2) * qualityScale);
        for (let i = 0; i < dissolveCount; i++) {
            if (state.particles.length >= maxParticles) break;
            const vx = wasmManager.getSpiralVx(i, dissolveCount, 3.5, 1.5);
            const vy = wasmManager.getSpiralVy(i, dissolveCount, 3.5, 1.5);
            state.particles.push(particlePool.acquire(x, y, color, vx, vy, 'aura'));
        }

        if (combo >= 5 && profile.crystalDetail === 'high') {
            for (let i = 0; i < COLORS.length; i++) {
                if (state.particles.length >= maxParticles) break;
                const angle = (i / COLORS.length) * Math.PI * 2;
                const speed = 6 + Math.random() * 3;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                state.particles.push(particlePool.acquire(x, y, COLORS[i].hex, vx, vy, 'aura'));
            }
        }
    }

    createImpactSparks(x, y, color, count = 4) {
        const { state, renderer, particlePool } = this.game;
        const profile = renderer.getQualityProfile(state.renderQuality);
        if (profile.crystalDetail === 'low') return;
        const maxParticles = profile.maxParticles;
        const scaled = Math.max(1, Math.floor(count * this.quality.getQualityScale()));
        for (let i = 0; i < scaled; i++) {
            if (state.particles.length >= maxParticles) break;
            const angle = (i / scaled) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const speed = 9 + Math.random() * 7;
            const p = particlePool.acquire(
                x, y, color,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                'spark'
            );
            p.maxLife = 0.32 + Math.random() * 0.12;
            p.life = p.maxLife;
            p.size = Math.random() * 2.2 + 1.2;
            state.particles.push(p);
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {string} color
     * @param {number} [count]
     * @param {number | null} [angle]
     * @param {number} [spread]
     * @param {import('../types.js').ParticleType} [type]
     */
    createParticles(x, y, color, count = 20, angle = null, spread = 1.5, type = 'spark') {
        const { state, renderer, particlePool } = this.game;
        const profile = renderer.getQualityProfile(state.renderQuality);
        const qualityScale = this.quality.getQualityScale();
        const scaledCount = Math.max(1, Math.floor(count * qualityScale));
        const speed = type === 'spark' && count < 5 ? 2.0 : 8.0;
        const maxParticles = profile.maxParticles;
        for (let i = 0; i < scaledCount; i++) {
            if (state.particles.length >= maxParticles) break;
            let vx, vy;
            if (angle !== null) {
                const fraction = i / scaledCount;
                const offset = (fraction - 0.5) * spread;
                const finalAngle = angle + offset + (Math.random() - 0.5) * 0.2;
                vx = Math.cos(finalAngle) * speed;
                vy = Math.sin(finalAngle) * speed;
            } else {
                const a = (i / scaledCount) * Math.PI * 2;
                vx = Math.cos(a) * speed;
                vy = Math.sin(a) * speed;
            }
            state.particles.push(particlePool.acquire(x, y, color, vx, vy, type));
        }
    }

    createDebris(x, y, color, count = 4, angle = null, spread = 1.0) {
        const { state, renderer, particlePool } = this.game;
        const scaledCount = Math.max(1, Math.floor(count * this.quality.getQualityScale()));
        const maxParticles = renderer.getQualityProfile(state.renderQuality).maxParticles;
        for (let i = 0; i < scaledCount; i++) {
            if (state.particles.length >= maxParticles) break;
            let vx, vy;
            const speed = Math.random() * 5 + 3;
            if (angle !== null) {
                const fraction = i / scaledCount;
                const offset = (fraction - 0.5) * spread;
                const finalAngle = angle + offset + (Math.random() - 0.5) * 0.2;
                vx = Math.cos(finalAngle) * speed;
                vy = Math.sin(finalAngle) * speed;
            } else {
                const rndAngle = Math.random() * Math.PI * 2;
                vx = Math.cos(rndAngle) * speed;
                vy = Math.sin(rndAngle) * speed;
            }
            state.particles.push(particlePool.acquire(x, y, color, vx, vy, 'debris'));
        }
    }

    createCrystalChunk(x, y, color, dirY = -1) {
        const p = this.game.particlePool.acquire(x, y, color, null, null, 'chunk');
        p.vx = (Math.random() - 0.5) * 4;
        p.vy = (Math.random() * 5 + 2) * dirY;
        this.game.state.particles.push(p);
    }

    createTrailParticle(x, y, color) {
        const { state, renderer, trailPool } = this.game;
        const count = state.particles.length;
        const profile = renderer.getQualityProfile(state.renderQuality);
        const maxP = profile.maxParticles;
        if (count >= maxP) return;
        if (count > maxP * 0.85 && Math.random() > 0.4) return;
        if (count > maxP * 0.7 && Math.random() > 0.65) return;
        const frameMs = state.perfMetrics?.smoothedFrameMs ?? 16.7;
        if (frameMs > 20 && Math.random() > 0.45) return;
        if (count > maxP * 0.55 && Math.random() > 0.5) return;
        const isEnergy = profile.crystalDetail === 'high' && Math.random() < 0.6;
        state.particles.push(trailPool.acquire(x, y, color, isEnergy));
    }

    createShockwave(x, y, color) {
        this.game.state.shockwaves.push(new Shockwave(x, y, color));
    }

    createFloatingText(x, y, text, color, scale = 1.5) {
        this.game.state.floatingTexts.push(new FloatingText(x, y, text, color, scale));
    }

    /** @param {string} hexColor */
    triggerResonance(hexColor) {
        const { state, renderer, particlePool } = this.game;
        const profile = renderer.getQualityProfile(state.renderQuality);
        state.crystals.forEach(c => {
            const cHex = COLORS[c.colorIdx].hex;
            if (cHex === hexColor) {
                c.velScaleY += 0.5;
                c.velScaleX -= 0.1;
                c.flash = 0.8;

                if (profile.crystalDetail !== 'low') {
                    const cx = (c.lane * renderer.laneWidth) + (renderer.laneWidth / 2);
                    const tipY = c.type === 'top' ? c.height : renderer.height - c.height;
                    for (let i = 0; i < 3; i++) {
                        if (state.particles.length >= profile.maxParticles) break;
                        state.particles.push(particlePool.acquire(
                            cx + (Math.random() - 0.5) * 24,
                            tipY + (Math.random() - 0.5) * 24,
                            hexColor, null, null, 'aura'
                        ));
                    }
                }
            }
        });
    }

    calculateShake() {
        const state = this.game.state;
        const kick = state.kickY || 0;

        if (state.shake > 0 || kick > 0.1) {
            const dx = (Math.random() - 0.5) * state.shake;
            const dy = (Math.random() - 0.5) * state.shake + kick;
            const angle = (Math.random() - 0.5) * (state.shake * 0.002);

            state.shakeOffset.x = dx;
            state.shakeOffset.y = dy;
            state.shakeOffset.angle = angle;
        } else {
            state.shakeOffset.x = 0;
            state.shakeOffset.y = 0;
            state.shakeOffset.angle = 0;
        }
    }

    shatterAllCrystals() {
        const { state, renderer, particlePool } = this.game;
        const m = state.motionScale ?? 1;
        if (m >= 1) {
            state.targetTimeScale = 0.1;
            state.slowMoTimer = 3000;
        }

        state.shake = 60 * m;
        state.impactFlash = 1.0 * m;
        state.impactFlashColor = '#fff';
        state.criticalIntensity = 0;

        state.crystals.forEach(c => {
            const x = (c.lane * renderer.laneWidth) + (renderer.laneWidth / 2);
            const h = c.height;
            let y;
            if (c.type === 'top') {
                y = h / 2;
            } else {
                y = renderer.height - (h / 2);
            }

            const color = COLORS[c.colorIdx].hex;
            const crystalName = COLORS[c.colorIdx].name;

            this.createParticles(x, y, color, 30, null, 1.5, 'shard');
            this.createDebris(x, y, color, 5, null, 1.0);
            this.createShockwave(x, y, color);
            this.addEnergyRing(x, y, color, 4);
            const profile = renderer.getQualityProfile(state.renderQuality);
            if (profile.crystalDetail !== 'low') {
                this.addEnergyRing(x, y, color, 1, { flash: true });
                this.createImpactSparks(x, y, color, 5);
            }
            if (crystalName === 'Amber') {
                const emberCount = profile.crystalDetail === 'high' ? 8 : 4;
                for (let j = 0; j < emberCount; j++) {
                    if (state.particles.length < profile.maxParticles) {
                        state.particles.push(particlePool.acquire(
                            x + (Math.random() - 0.5) * 20,
                            y + (Math.random() - 0.5) * 20,
                            '#FF6600', null, null, 'ember'
                        ));
                    }
                }
            }
        });

        state.crystals = [];
    }
}
