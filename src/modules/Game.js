/** @import { GameState, QualityMode } from './types.js' */

import { COLORS, GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { Crystal, Spore, Particle, TrailParticle, Shockwave,
         FloatingText, Launcher, DustParticle, ParticlePool, EnergyRing } from './Entities.js';
import { Renderer } from './Renderer.js';
import { Background } from './Background.js';
import { wasmManager } from './WasmManager.js';
import { installGameRuntime } from './GameRuntime.js';

/**
 * Core game controller. Frame loop methods are mixed in from GameRuntime.js.
 *
 * @property {number} [_smoothedFps]
 * @property {number} [_qualityCooldownUntil]
 * @property {number} [_fpsLastTime]
 * @property {number} [_fpsFrames]
 * @property {number} [_lastScoreScale]
 * @property {() => void} [_boundLoop]
 * @property {import('./types.js').CreateParticlesCallback} [_boundCreateParticles]
 * @property {() => void} [_boundCreateShockwave]
 * @property {import('./types.js').CreateTrailCallback} [_boundCreateTrailParticle]
 * @property {import('./types.js').CreateDebrisCallback} [_boundCreateDebris]
 * @property {import('./types.js').CreateChunkCallback} [_boundCreateCrystalChunk]
 * @property {import('./types.js').ImpactDustCallback} [_boundCreateImpactDust]
 * @property {() => void} [_boundUpdateUI]
 * @property {import('./types.js').SporeScoreCallback} [_boundOnSporeScore]
 * @property {import('./Entities.js').Particle[]} [_ambientBatch]
 * @property {import('./Entities.js').TrailParticle[]} [_trailUpdateBatch]
 */
export class Game {
    constructor() {
        this.background = new Background();
        this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('gameCanvas'));
        this.renderer = new Renderer(this.canvas);
        this.launcher = new Launcher(this.renderer.laneWidth, this.renderer.height);

        /** @type {import('./types.js').GameUiElements} */
        this.ui = {
            start: document.getElementById('startScreen'),
            gameOver: document.getElementById('gameOverScreen'),
            score: document.getElementById('scoreVal'),
            finalScore: document.getElementById('finalScore'),
            level: document.getElementById('levelVal'),
            preview: document.getElementById('nextSporePreview'),
            startBtn: document.getElementById('startBtn'),
            restartBtn: document.getElementById('restartBtn'),
            fps: document.getElementById('fpsCounter'),
            qualitySelect: /** @type {HTMLSelectElement | null} */ (document.getElementById('qualitySelect'))
        };

        /** @type {import('./types.js').GameState} */
        this.state = {
            active: false,
            score: 0,
            level: 1,
            lastTime: 0,
            crystals: [],
            spores: [],
            particles: [],
            shockwaves: [],
            floatingTexts: [],
            soulParticles: [],
            dustParticles: [],
            nextSporeColorIdx: 0,
            growthMultiplier: 1,
            shake: 0,
            shakeVel: 0, // Spring velocity for natural shake settle
            displayScore: 0,
            impactFlash: 0,
            impactFlashColor: '#fff',
            sleepTimer: 0, // For hit stop / impact freeze
            kickY: 0, // Recoil kick
            shakeOffset: { x: 0, y: 0, angle: 0 },
            combo: 0,
            comboTimer: 0,
            zoom: 1.0,
            zoomVel: 0, // Spring velocity for natural zoom settle
            zoomFocus: { x: 0, y: 0 },
            criticalIntensity: 0,
            heartbeatTimer: 0,
            timeScale: 1.0,
            targetTimeScale: 1.0,
            slowMoTimer: 0,
            qualityMode: 'auto',
            renderQuality: 'high',
            devPerfOverlay: false,
            perfMetrics: {
                fps: 0,
                smoothedFps: 60,
                frameMs: 0,
                smoothedFrameMs: 16.7,
                particleCount: 0,
                particleLimit: 0,
                particleStride: 1,
                envParticleCount: 0,
                shockwaveCount: 0,
                distortionPrecomputeMs: 0,
                distortionGridCells: 0,
                distortionLookupCount: 0,
                instantFps: 60,
                trailCount: 0,
                energyRingCount: 0,
                sporeCount: 0,
                particleDrawMs: 0,
                particleUpdateMs: 0
            },
            adaptiveOverrides: {
                particleStrideBoost: 0,
                effectScale: 1.0
            },
            laneMap: new Map(), // key: lane, value: { top: crystal, bottom: crystal }
            energyRings: [],
            envParticles: []
        };

        // Object pools for high-frequency particles (reduces GC pressure)
        this.particlePool = new ParticlePool(
            () => new Particle(0, 0, '#fff'),
            (obj, ...args) => obj.reset(...args),
            400
        );
        this.trailPool = new ParticlePool(
            () => new TrailParticle(0, 0, '#fff'),
            (obj, ...args) => obj.reset(...args),
            300
        );

        // Initialize WASM asynchronously
        wasmManager.init().then(() => {
            console.log('WASM module initialization complete');
        }).catch(err => {
            console.warn('WASM initialization failed, using JavaScript fallback:', err);
        });

        // Cache bound callbacks to eliminate per-frame function allocations
        this._boundLoop = this.loop.bind(this);
        this._boundCreateParticles = this.createParticles.bind(this);
        this._boundCreateShockwave = this.createShockwave.bind(this);
        this._boundCreateTrailParticle = this.createTrailParticle.bind(this);
        this._boundCreateDebris = this.createDebris.bind(this);
        this._boundCreateCrystalChunk = this.createCrystalChunk.bind(this);
        this._boundCreateImpactDust = this.createImpactDust.bind(this);
        this._boundUpdateUI = this.updateUI.bind(this);
        this._boundOnSporeScore = this._onSporeScore.bind(this);

        this._ambientBatch = new Array(512);
        this._trailUpdateBatch = new Array(512);

        /** @type {number | undefined} */
        this._smoothedFps = undefined;
        /** @type {number | undefined} */
        this._qualityCooldownUntil = undefined;
        /** @type {number | undefined} */
        this._fpsLastTime = undefined;
        /** @type {number | undefined} */
        this._fpsFrames = undefined;
        /** @type {number | undefined} */
        this._lastScoreScale = undefined;

        if (typeof window !== 'undefined' && window.__DEV_PERF__) {
            this.state.devPerfOverlay = true;
        }

        this.bindEvents();
        this.resize();
        requestAnimationFrame(this._boundLoop);
    }

    /**
     * @param {boolean} [force]
     * @returns {boolean}
     */
    toggleDevPerfOverlay(force) {
        this.state.devPerfOverlay = typeof force === 'boolean' ? force : !this.state.devPerfOverlay;
        this._updateFpsHud();
        return this.state.devPerfOverlay;
    }

    _updateFpsHud() {
        if (!this.ui.fps) return;
        const m = this.state.perfMetrics;
        const qualityLabel = this.state.renderQuality.toUpperCase()
            + (this.state.qualityMode === 'auto' ? ' AUTO' : this.state.qualityMode === 'dev' ? ' DEV' : '');
        if (this.state.devPerfOverlay) {
            this.ui.fps.textContent = `${Math.round(m.smoothedFps || m.fps || 0)} FPS · ${m.particleCount}/${m.particleLimit} · ${qualityLabel}`;
            this.ui.fps.classList.add('dev-active');
        } else if (m.fps) {
            this.ui.fps.textContent = `${m.fps} FPS · ${qualityLabel}`;
            this.ui.fps.classList.remove('dev-active');
        }
    }

    bindEvents() {
        this.ui.startBtn.addEventListener('click', () => this.startGame());
        this.ui.restartBtn.addEventListener('click', () => this.resetGame());
        if (this.ui.qualitySelect) {
            this.ui.qualitySelect.addEventListener('change', () => this.setQualityMode(/** @type {QualityMode} */ (this.ui.qualitySelect.value)));
        }
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mousedown', (e) => this.handleInput(e));
        window.addEventListener('touchstart', (e) => this.handleTouch(e));
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyP' && !e.repeat) {
                this.toggleDevPerfOverlay();
            }
        });
    }

    resize() {
        this.renderer.resize(window.innerWidth, window.innerHeight);
        this.launcher.laneWidth = this.renderer.laneWidth;
        this.launcher.rendererHeight = this.renderer.height;
        this.launcher.y = this.renderer.height / 2;
    }

    startGame() {
        SoundManager.init();
        this.setQualityMode(/** @type {QualityMode} */ (this.ui.qualitySelect ? this.ui.qualitySelect.value : this.state.qualityMode));
        this.state.active = true;
        this.state.score = 0;
        this.state.level = 1;
        this.state.growthMultiplier = 1;
        this.state.combo = 0;
        this.state.comboTimer = 0;
        this.state.zoom = 1.0;
        this.state.zoomFocus = { x: this.renderer.width / 2, y: this.renderer.height / 2 };
        this.state.criticalIntensity = 0;
        this.state.heartbeatTimer = 0;
        this.state.timeScale = 1.0;
        this.state.targetTimeScale = 1.0;
        this.state.slowMoTimer = 0;
        this.state.crystals = [];
        this.state.spores = [];
        this.state.particles = [];
        this.state.shockwaves = [];
        this.state.floatingTexts = [];
        this.state.soulParticles = [];
        this.state.dustParticles = [];
        this.state.energyRings = [];
        this.state.envParticles = [];
        this.state.nextSporeColorIdx = Math.floor(Math.random() * COLORS.length);
        this.state.impactFlash = 0;

        // Spawn Atmospheric Dust
        const dustCount = this.renderer.getQualityProfile(this.state.renderQuality).maxDust;
        for (let i = 0; i < dustCount; i++) {
            const x = Math.random() * this.renderer.width;
            const y = Math.random() * this.renderer.height;
            this.state.dustParticles.push(new DustParticle(x, y));
        }

        this.ui.start.classList.add('hidden');
        this.ui.gameOver.classList.add('hidden');

        this.updateUI();
        this.initCrystals();
    }

    resetGame() {
        this.startGame();
    }

    initCrystals() {
        for (let i = 0; i < GAME_CONFIG.lanes; i++) {
            // JUICE: Staggered spawn delay for wave effect
            const delay = i * 100;
            this.state.crystals.push(new Crystal(i, 'top', 20 + Math.random() * 60, Math.floor(Math.random() * COLORS.length), delay));
            this.state.crystals.push(new Crystal(i, 'bottom', 20 + Math.random() * 60, Math.floor(Math.random() * COLORS.length), delay));
        }
        this.updateLaneMap();
    }

    updateLaneMap() {
        this.state.laneMap.clear();
        this.state.crystals.forEach(c => {
            if (!this.state.laneMap.has(c.lane)) {
                this.state.laneMap.set(c.lane, { top: null, bottom: null });
            }
            this.state.laneMap.get(c.lane)[c.type] = c;
        });
    }

    handleMouseMove(e) {
        if (!this.state.active) return;
        const lane = Math.floor(e.clientX / this.renderer.laneWidth);
        const targetLane = Math.min(Math.max(0, lane), GAME_CONFIG.lanes - 1);
        this.launcher.setTargetLane(targetLane);
    }

    handleInput(e) {
        if (!this.state.active) return;
        this.shootSpore();
    }

    handleTouch(e) {
        if (!this.state.active) return;
        const touchX = e.touches[0].clientX;
        const lane = Math.floor(touchX / this.renderer.laneWidth);
        const targetLane = Math.min(Math.max(0, lane), GAME_CONFIG.lanes - 1);
        this.launcher.setTargetLane(targetLane);
        this.shootSpore();
    }

    shootSpore() {
        SoundManager.shoot();
        this.launcher.fire();

        const colorIdx = this.state.nextSporeColorIdx;

        // Use launcher's current logical lane for the spore
        const lane = this.launcher.targetLane;

        // Spawn spore at launcher's current visual position (juicy!)
        const x = this.launcher.x;
        const y = this.launcher.y;

        // JUICE: Recoil Screen Kick
        this.state.kickY = 15; // Kick screen down
        this.state.shake = Math.max(this.state.shake, 5); // Add slight random shake too

        // Visual fluff: Muzzle flash particles
        this.createParticles(x, y, '#fff', 10);

        this.state.spores.push(new Spore(x, y, lane, colorIdx));

        this.state.nextSporeColorIdx = Math.floor(Math.random() * COLORS.length);
        this.updateUI();
    }

    createImpactDust(x, y, color) {
        // Tiny short lived particles
        this.createParticles(x, y, color, 3, -Math.PI/2, 2.0, 'spark');
    }

    /** @param {import('./types.js').Crystal} crystal */
    createCrystalAura(crystal) {
        const profile = this.renderer.getQualityProfile(this.state.renderQuality);
        if (this.state.particles.length >= profile.maxParticles) return;

        const x = (crystal.lane * this.renderer.laneWidth) + (this.renderer.laneWidth / 2) + (crystal.shakeX || 0);
        const tipY = crystal.type === 'top' ? crystal.height : this.renderer.height - crystal.height;
        const spread = crystal.isCritical ? 28 : 14;
        const px = x + (Math.random() - 0.5) * spread;
        const py = tipY + (Math.random() - 0.5) * spread;

        const color = COLORS[crystal.colorIdx].hex;
        this.state.particles.push(this.particlePool.acquire(px, py, color, null, null, 'aura'));

        if (crystal.isCritical && Math.random() < 0.4 && this.state.particles.length < profile.maxParticles) {
            const px2 = x + (Math.random() - 0.5) * spread * 1.5;
            const py2 = tipY + (Math.random() - 0.5) * spread * 1.5;
            this.state.particles.push(this.particlePool.acquire(px2, py2, color, null, null, 'aura'));
        }
    }

    /**
     * @param {number} x
     * @param {number} y
     * @param {string} color
     * @param {number} combo
     */
    createMatchBurst(x, y, color, combo) {
        const profile = this.renderer.getQualityProfile(this.state.renderQuality);
        const qualityScale = this.getQualityScale();
        const maxParticles = profile.maxParticles;

        // Energy ring (always) - scales with combo
        this.state.energyRings.push(new EnergyRing(x, y, color, combo));

        // JUICE: Fast flash ring for instant impact pop (medium+)
        if (profile.crystalDetail !== 'low') {
            this.state.energyRings.push(new EnergyRing(x, y, color, 1, { flash: true }));
        }

        // Second white ring on high combo
        if (combo > 3) {
            this.state.energyRings.push(new EnergyRing(x, y, '#ffffff', 1));
        }

        // JUICE: Color-matched spark burst — cheap, short-lived, reads on screenshots
        if (profile.crystalDetail !== 'low') {
            this.createImpactSparks(x, y, color, 3 + Math.min(combo, 6));
        }

        // Dissolving sparkle particles in a spiral pattern
        const dissolveCount = Math.floor((8 + combo * 2) * qualityScale);
        for (let i = 0; i < dissolveCount; i++) {
            if (this.state.particles.length >= maxParticles) break;
            const vx = wasmManager.getSpiralVx(i, dissolveCount, 3.5, 1.5);
            const vy = wasmManager.getSpiralVy(i, dissolveCount, 3.5, 1.5);
            this.state.particles.push(this.particlePool.acquire(x, y, color, vx, vy, 'aura'));
        }

        // Rainbow starburst on high combo (>= 5), high-quality only
        if (combo >= 5 && profile.crystalDetail === 'high') {
            for (let i = 0; i < COLORS.length; i++) {
                if (this.state.particles.length >= maxParticles) break;
                const angle = (i / COLORS.length) * Math.PI * 2;
                const speed = 6 + Math.random() * 3;
                const vx = Math.cos(angle) * speed;
                const vy = Math.sin(angle) * speed;
                this.state.particles.push(this.particlePool.acquire(x, y, COLORS[i].hex, vx, vy, 'aura'));
            }
        }
    }

    createImpactSparks(x, y, color, count = 4) {
        const profile = this.renderer.getQualityProfile(this.state.renderQuality);
        if (profile.crystalDetail === 'low') return;
        const maxParticles = profile.maxParticles;
        const scaled = Math.max(1, Math.floor(count * this.getQualityScale()));
        for (let i = 0; i < scaled; i++) {
            if (this.state.particles.length >= maxParticles) break;
            const angle = (i / scaled) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
            const speed = 9 + Math.random() * 7;
            const p = this.particlePool.acquire(
                x, y, color,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                'spark'
            );
            p.maxLife = 0.32 + Math.random() * 0.12;
            p.life = p.maxLife;
            p.size = Math.random() * 2.2 + 1.2;
            this.state.particles.push(p);
        }
    }

    createParticles(x, y, color, count = 20, angle = null, spread = 1.5, type = 'spark') {
        const profile = this.renderer.getQualityProfile(this.state.renderQuality);
        const qualityScale = this.getQualityScale();
        const scaledCount = Math.max(1, Math.floor(count * qualityScale));
        const speed = type === 'spark' && count < 5 ? 2.0 : 8.0; // Slower for dust
        const maxParticles = profile.maxParticles;
        for(let i=0; i<scaledCount; i++) {
            if (this.state.particles.length >= maxParticles) break;
            // Inline JS math to avoid WASM wrapper overhead
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

            this.state.particles.push(this.particlePool.acquire(x, y, color, vx, vy, type));
        }
    }

    createDebris(x, y, color, count = 4, angle = null, spread = 1.0) {
        const scaledCount = Math.max(1, Math.floor(count * this.getQualityScale()));
        const maxParticles = this.renderer.getQualityProfile(this.state.renderQuality).maxParticles;
        for(let i=0; i<scaledCount; i++) {
             if (this.state.particles.length >= maxParticles) break;
             let vx, vy;
             const speed = Math.random() * 5 + 3;

             if (angle !== null) {
                 const fraction = i / scaledCount;
                 const offset = (fraction - 0.5) * spread;
                 const finalAngle = angle + offset + (Math.random() - 0.5) * 0.2;
                 vx = Math.cos(finalAngle) * speed;
                 vy = Math.sin(finalAngle) * speed;
             } else {
                 // Debris flies out randomly if no angle
                 const rndAngle = Math.random() * Math.PI * 2;
                 vx = Math.cos(rndAngle) * speed;
                 vy = Math.sin(rndAngle) * speed;
             }

             this.state.particles.push(this.particlePool.acquire(x, y, color, vx, vy, 'debris'));
        }
    }

    createCrystalChunk(x, y, color, dirY = -1) {
        // JUICE: Spawn a large chunk that falls and shatters on impact
        const p = this.particlePool.acquire(x, y, color, null, null, 'chunk');
        // Initial velocity popping off (up and out or down and out)
        p.vx = (Math.random() - 0.5) * 4;
        p.vy = (Math.random() * 5 + 2) * dirY;
        this.state.particles.push(p);
    }

    createTrailParticle(x, y, color) {
        const count = this.state.particles.length;
        const profile = this.renderer.getQualityProfile(this.state.renderQuality);
        const maxP = profile.maxParticles;
        if (count >= maxP) return;
        if (count > maxP * 0.85 && Math.random() > 0.4) return;
        if (count > maxP * 0.7 && Math.random() > 0.65) return;
        const frameMs = this.state.perfMetrics?.smoothedFrameMs ?? 16.7;
        if (frameMs > 20 && Math.random() > 0.45) return;
        if (count > maxP * 0.55 && Math.random() > 0.5) return;
        // JUICE: Energy wisps on high — same pool, richer draw, no extra spawns
        const isEnergy = profile.crystalDetail === 'high' && Math.random() < 0.6;
        this.state.particles.push(this.trailPool.acquire(x, y, color, isEnergy));
    }

    createShockwave(x, y, color) {
        this.state.shockwaves.push(new Shockwave(x, y, color));
    }

    createFloatingText(x, y, text, color, scale = 1.5) {
        this.state.floatingTexts.push(new FloatingText(x, y, text, color, scale));
    }

    /** @param {string} hexColor */
    triggerResonance(hexColor) {
        const profile = this.renderer.getQualityProfile(this.state.renderQuality);
        this.state.crystals.forEach(c => {
             const cHex = COLORS[c.colorIdx].hex;
             if (cHex === hexColor) {
                 // Resonance Pulse
                 c.velScaleY += 0.5; // Jump up
                 c.velScaleX -= 0.1; // Squash in slightly
                 c.flash = 0.8;

                 // Resonance echo aura particles
                 if (profile.crystalDetail !== 'low') {
                     const cx = (c.lane * this.renderer.laneWidth) + (this.renderer.laneWidth / 2);
                     const tipY = c.type === 'top' ? c.height : this.renderer.height - c.height;
                     for (let i = 0; i < 3; i++) {
                         if (this.state.particles.length >= profile.maxParticles) break;
                         this.state.particles.push(this.particlePool.acquire(
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
        // JUICE: Apply Recoil Kick
        const kick = this.state.kickY || 0;

        if (this.state.shake > 0 || kick > 0.1) {
            const dx = (Math.random() - 0.5) * this.state.shake;
            const dy = (Math.random() - 0.5) * this.state.shake + kick; // Add kick to vertical shake
            const angle = (Math.random() - 0.5) * (this.state.shake * 0.002); // Subtle rotation

            this.state.shakeOffset.x = dx;
            this.state.shakeOffset.y = dy;
            this.state.shakeOffset.angle = angle;
        } else {
            this.state.shakeOffset.x = 0;
            this.state.shakeOffset.y = 0;
            this.state.shakeOffset.angle = 0;
        }
    }

    triggerLevelUp() {
        SoundManager.levelUp();

        // Time Dilation (Slow Motion)
        this.state.targetTimeScale = 0.05;
        this.state.slowMoTimer = 2000;

        // Massive Shake
        this.state.shake = 30;

        // Screen Flash (Gold)
        this.state.impactFlash = 0.8;
        this.state.impactFlashColor = '#FFD700';

        // Floating Text
        this.createFloatingText(this.renderer.width / 2, this.renderer.height / 2, "LEVEL UP!", "#FFD700", 3.0);

        // Shockwave
        this.createShockwave(this.renderer.width / 2, this.renderer.height / 2, '#FFD700');

        // Particles (Confetti)
        for (let i = 0; i < 50; i++) {
            const x = this.renderer.width / 2;
            const y = this.renderer.height / 2;
            const color = COLORS[Math.floor(Math.random() * COLORS.length)].hex;
            // Use existing particle system
            this.state.particles.push(this.particlePool.acquire(x, y, color));
        }

        // Juice: All crystals jump
        this.state.crystals.forEach(c => {
             c.velScaleY += 0.5;
        });
    }

    /** @param {number} dt Installed by GameRuntime.js */
    update(dt) {}

    /** @param {number} dt @param {number} [timeScale] Installed by GameRuntime.js */
    updateSharedVisuals(dt, timeScale) {}

    /** Installed by GameRuntime.js */
    updateUI() {}

    /**
     * @param {number} points
     * @param {boolean} isMatch
     * @param {number} x
     * @param {number} y
     * @param {string} color
     * Installed by GameRuntime.js
     */
    _onSporeScore(points, isMatch, x, y, color) {}

    /** @returns {number} Installed by GameRuntime.js */
    getQualityScale() { return 1; }

    /**
     * @param {number} fps
     * @param {number} lowThreshold
     * @param {number} mediumThreshold
     * @returns {import('./types.js').RenderQualityLevel}
     * Installed by GameRuntime.js
     */
    resolveQualityForFps(fps, lowThreshold, mediumThreshold) { return 'high'; }

    /** @param {QualityMode} [mode] Installed by GameRuntime.js */
    setQualityMode(mode) {}

    /** Installed by GameRuntime.js */
    resetAdaptiveOverrides() {}

    /** @param {number} fps Installed by GameRuntime.js */
    updateAdaptiveQuality(fps) {}

    /** @param {number} dt @param {number} [fps] Installed by GameRuntime.js */
    updatePerfMetrics(dt, fps) {}

    /** Installed by GameRuntime.js */
    updateFrameTimeAdaptive() {}

    /** @param {number} timestamp Installed by GameRuntime.js */
    loop(timestamp) {}

    /** Installed by GameRuntime.js */
    shatterAllCrystals() {}

    /** @param {number} dt Installed by GameRuntime.js */
    updateVisuals(dt) {}
}

installGameRuntime(Game);
