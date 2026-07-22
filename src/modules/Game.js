// @ts-check
/** @import { GameState, QualityMode } from './types.js' */

import { GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { DEFAULT_PALETTE } from './ColorPalettes.js';
import { SettingsManager } from './SettingsManager.js';
import { SaveManager } from './SaveManager.js';
import { InputManager } from './InputManager.js';
import { Crystal, Spore, Particle, TrailParticle,
         Launcher, DustParticle, ParticlePool } from './Entities.js';
import { Renderer } from './Renderer.js';
import { Background } from './Background.js';
import { wasmManager } from './WasmManager.js';
import { particleWorkerBridge } from './ParticleWorkerBridge.js';
import { registerSystems } from './systems/registerSystems.js';
import { ProgressionManager } from './ProgressionManager.js';
import { PowerUpManager } from './PowerUpManager.js';
import { POWER_UPS, POWER_UP_TYPES } from './PowerUpDefinitions.js';
import { TutorialManager } from './TutorialManager.js';
import { BossController } from './BossController.js';
import * as gameplayRng from './GameplayRng.js';
import { ReplayRecorder } from './ReplayRecorder.js';
import { ReplayPlayer } from './ReplayPlayer.js';
import { parseReplayFile } from './replayFormat.js';

/**
 * Core game controller composed from explicit subsystems in ./systems/.
 *
 * @property {ReturnType<typeof registerSystems>} systems
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
 * @property {import('./InputManager.js').InputManager} input
 * @property {SettingsManager} settings
 * @property {SaveManager} save
 * @property {number} [_sessionBestCombo]
 */
export class Game {
    constructor() {
        this.background = new Background();
        this.progression = new ProgressionManager();
        this.powerUps = new PowerUpManager();
        this.boss = new BossController();
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
            objectiveLabel: document.getElementById('objectiveLabel'),
            objectiveProgress: document.getElementById('objectiveProgress'),
            objectiveBar: document.getElementById('objectiveBar'),
            levelName: document.getElementById('levelName'),
            gameOverTitle: document.getElementById('gameOverTitle'),
            powerUpHud: document.getElementById('powerUpHud'),
            powerUpActivateBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById('powerUpActivateBtn')),
            pause: document.getElementById('pauseScreen'),
            resumeBtn: /** @type {HTMLButtonElement | null} */ (document.getElementById('resumeBtn')),
            highScoreVal: document.getElementById('highScoreVal'),
            bestComboVal: document.getElementById('bestComboVal'),
            accuracyVal: document.getElementById('accuracyVal'),
        };

        this.save = new SaveManager();
        this.settings = new SettingsManager(this.save);
        this.tutorial = new TutorialManager(this, this.save);
        SoundManager.onPersist((audio) => {
            this.save.updateSettings({ audio });
            this.save.save();
            this.settings.syncAllUI();
        });
        this.input = new InputManager();
        /** @type {number} */
        this._suppressMouseUntil = 0;

        /** @type {import('./types.js').GameState} */
        this.state = {
            active: false,
            paused: false,
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
                particleUpdateMs: 0,
                particleIntegratorPath: 'idle',
                particleWorkerMs: 0,
                particleWorkerBacklog: 0,
            },
            adaptiveOverrides: {
                particleStrideBoost: 0,
                effectScale: 1.0
            },
            laneMap: new Map(), // key: lane, value: { top: crystal, bottom: crystal }
            energyRings: [],
            envParticles: [],
            motionScale: 1.0,
            reducedMotion: false,
            colorBlindMode: false,
            colorPalette: DEFAULT_PALETTE,
            gameClockMs: 0,
            boss: null,
        };

        this.replay = {
            recorder: new ReplayRecorder(),
            player: new ReplayPlayer(),
        };

        this._sessionBestCombo = 0;
        /** @type {number} */
        this._lastShotAt = 0;

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

        this.systems = registerSystems(this);

        // Initialize WASM and particle worker asynchronously
        wasmManager.init().then(() => {
            console.log('WASM module initialization complete');
        }).catch(err => {
            console.warn('WASM initialization failed, using JavaScript fallback:', err);
        });

        particleWorkerBridge.init().then((ok) => {
            if (ok) {
                console.log('Particle worker initialization complete');
            }
        }).catch(() => {
            console.warn('Particle worker unavailable, using main-thread integration');
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
        this._lastScoreScale = undefined;

        if (typeof window !== 'undefined' && window.__DEV_PERF__) {
            this.state.devPerfOverlay = true;
        }

        this.settings.load();
        SoundManager.init(this.settings.get().audio);
        this.bindEvents();
        this.settings.bindUI({
            startRoot: document.getElementById('startScreen'),
            pauseRoot: document.getElementById('pauseScreen'),
        }, this);
        this.settings.apply(this);
        this.resize();
        requestAnimationFrame(this._boundLoop);
    }

    /**
     * @param {number} value
     * @returns {number}
     */
    _motion(value) {
        return value * (this.state.motionScale ?? 1);
    }

    /**
     * @param {boolean} [force]
     * @returns {boolean}
     */
    toggleDevPerfOverlay(force) {
        this.state.devPerfOverlay = typeof force === 'boolean' ? force : !this.state.devPerfOverlay;
        this.systems.quality.updateFpsHud();
        return this.state.devPerfOverlay;
    }

    bindEvents() {
        this.ui.startBtn.addEventListener('click', () => this.startGame());
        this.ui.restartBtn.addEventListener('click', () => this.resetGame());
        if (this.ui.resumeBtn) {
            this.ui.resumeBtn.addEventListener('click', () => this.resumeGame());
        }
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mousedown', (e) => this.handleInput(e));
        this.canvas.addEventListener('touchstart', (e) => this.handleTouch(e), { passive: false });
        window.addEventListener('keydown', (e) => {
            if (this.state.active && !this.state.paused) {
                const gameKeys = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'Enter'];
                if (gameKeys.includes(e.code)) {
                    e.preventDefault();
                }
            }
            if (e.code === 'Escape' && !e.repeat) {
                this.togglePause();
            }
            if (e.code === 'KeyP' && !e.repeat) {
                this.toggleDevPerfOverlay();
            }
            if (e.code === 'KeyE' && !e.repeat && this.state.active) {
                this.activateHeldPowerUp();
            }
            const devMode = import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev');
            if (devMode && e.code === 'KeyR' && e.ctrlKey && e.shiftKey && !e.repeat) {
                e.preventDefault();
                if (this.replay.recorder.isRecording()) {
                    this.replay.recorder.download('session.ccreplay', {
                        finalScore: this.state.score,
                        tolerance: 0,
                    });
                }
            }
        });
        if (this.ui.powerUpActivateBtn) {
            this.ui.powerUpActivateBtn.addEventListener('click', () => this.activateHeldPowerUp());
        }
    }

    resize() {
        this.renderer.resize(window.innerWidth, window.innerHeight);
        this.launcher.laneWidth = this.renderer.laneWidth;
        this.launcher.rendererHeight = this.renderer.height;
        this.launcher.y = this.renderer.height / 2;
        this.tutorial.updateLayout();
    }

    startGame() {
        if (typeof window !== 'undefined' && window.__pendingReplay__) {
            const replay = parseReplayFile(window.__pendingReplay__);
            window.__pendingReplay__ = undefined;
            this.replay.player.load(replay);
            this.replay.player.start(this);
            return;
        }
        this._beginSession(this._buildReplayConfigFromSettings(), this._createRunSeed(), {
            skipTutorial: false,
            record: true,
        });
    }

    /**
     * @param {import('./replayFormat.js').ReplayConfig} config
     * @param {number} seed
     */
    startGameFromReplay(config, seed) {
        this._beginSession(config, seed, {
            skipTutorial: true,
            record: false,
        });
    }

    /** @returns {import('./replayFormat.js').ReplayConfig} */
    _buildReplayConfigFromSettings() {
        const settings = this.settings.get();
        return {
            gameMode: /** @type {import('./types.js').GameMode} */ (settings.gameMode),
            graphics: settings.graphics,
            levelIndex: this.progression.levelIndex,
        };
    }

    /** @returns {number} */
    _createRunSeed() {
        return Math.floor(Math.random() * 0xffffffff);
    }

    /**
     * @param {import('./replayFormat.js').ReplayConfig} config
     * @param {number} seed
     * @param {{ skipTutorial: boolean, record: boolean }} options
     */
    _beginSession(config, seed, options) {
        this.save.updateSettings({
            gameMode: config.gameMode,
            graphics: config.graphics,
        });
        SoundManager.applySettings(this.settings.get().audio);
        SoundManager.startSession();
        this.systems.quality.setQualityMode(config.graphics);

        gameplayRng.setGameplaySeed(seed);
        wasmManager.setGameplaySeed(seed);
        this.progression.setRng(gameplayRng.next);
        this.powerUps.setRng(gameplayRng.next);
        this.systems.collision.setGameplayContext(
            this.progression.getSpawnConfig().colorCount,
            gameplayRng.next
        );

        this.save.recordGameStart();
        this._sessionBestCombo = 0;
        this.progression.reset();
        this.progression.setMode(config.gameMode);
        if (config.levelIndex > 0) {
            this.progression.levelIndex = Math.min(config.levelIndex, 4);
        }
        this.powerUps.reset();
        this.boss.reset();
        this.state.boss = null;
        this._lastShotAt = 0;

        this.state.active = true;
        this.state.paused = false;
        this.state.gameClockMs = 0;
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
        this.state.impactFlash = 0;

        // Spawn Atmospheric Dust
        const dustCount = this.renderer.getQualityProfile(this.state.renderQuality).maxDust;
        for (let i = 0; i < dustCount; i++) {
            const x = Math.random() * this.renderer.width;
            const y = Math.random() * this.renderer.height;
            this.state.dustParticles.push(new DustParticle(x, y));
        }

        this.settings.apply(this);

        this.ui.start.classList.add('hidden');
        this.ui.gameOver.classList.add('hidden');
        if (this.ui.pause) {
            this.ui.pause.classList.add('hidden');
        }
        SoundManager.setMusicDuck(1);
        if (this.ui.gameOverTitle) {
            this.ui.gameOverTitle.textContent = 'GAME OVER';
        }

        this.beginCurrentLevel();

        if (options.record) {
            this.replay.recorder.onStart(seed, config);
        } else {
            this.replay.recorder.stop();
        }

        if (!options.skipTutorial && this.tutorial.shouldRun()) {
            this.tutorial.start();
        }
    }

    beginCurrentLevel() {
        this.progression.beginLevel(this.state.score);
        this.applyLevelConfig();
        this.systems.collision.setGameplayContext(
            this.progression.getSpawnConfig().colorCount,
            gameplayRng.next
        );
        this.state.nextSporeColorIdx = this.progression.pickRandomColorIndex();
        this.state.crystals = [];
        this.state.spores = [];
        this.updateLaneMap();
        this.updateUI();
        this.updatePowerUpHud();
        this.initCrystals();
        this._maybeStartBoss();
    }

    /**
     * Start a boss encounter when the active level declares a bossId.
     * @param {string} [forceBossId]
     */
    _maybeStartBoss(forceBossId) {
        this.boss.reset();
        this.state.boss = null;
        const cfg = this.progression.getActiveConfig();
        const bossId = forceBossId
            || /** @type {import('./types.js').LevelDefinition} */ (cfg).bossId;
        if (!bossId || this.progression.isEndless()) return;

        const seed = (gameplayRng.next() * 0xffffffff) >>> 0;
        const lanes = this.progression.getSpawnConfig().lanes;
        if (!this.boss.start(bossId, { seed, lanes })) return;

        this.boss.applyFormationToCrystals(
            this.state.crystals,
            this.progression.getSpawnConfig().colorCount
        );
        this.state.boss = this.boss.getHudState();
        SoundManager.bossSting();
        const name = this.boss.definition?.name || 'BOSS';
        this.createFloatingText(
            this.renderer.width / 2,
            this.renderer.height * 0.28,
            name.toUpperCase(),
            this.boss.definition?.colors?.primary || '#FF4466',
            2.6
        );
        this.createShockwave(
            this.renderer.width / 2,
            this.renderer.height / 2,
            this.boss.definition?.colors?.telegraph || '#FF8800'
        );
    }

    /**
     * Test/debug hook: force-start a boss mid-session (used by verify_boss_encounter.py).
     * @param {string} [bossId]
     */
    forceStartBoss(bossId = 'convergence') {
        if (!this.state.active) {
            this.startGame();
        }
        // Jump campaign to the boss level when possible
        const defLevel = /** @type {import('./types.js').LevelDefinition | undefined} */ (
            this.progression.getActiveConfig()
        );
        if (!this.progression.isEndless() && defLevel && !defLevel.bossId) {
            // Find level index with matching boss
            this.progression.levelIndex = 4; // Level 5 — The Convergence
            this.beginCurrentLevel();
            if (this.boss.isBusy()) return true;
        }
        this._maybeStartBoss(bossId);
        return this.boss.isBusy();
    }

    handleBossDefeat() {
        const def = this.boss.definition;
        const rewards = def?.rewards || {};
        const color = def?.colors?.secondary || '#FFD700';

        SoundManager.bossDefeat();
        this.state.score += rewards.scoreBonus || 0;
        const rainbows = rewards.rainbowCount || 0;
        for (let i = 0; i < rainbows; i++) {
            this.grantPowerUp(POWER_UP_TYPES.RAINBOW);
        }

        this.state.shake = Math.max(this.state.shake, 35 * this.state.motionScale);
        this.state.impactFlash = 0.9 * this.state.motionScale;
        this.state.impactFlashColor = color;
        this.state.targetTimeScale = 0.08;
        this.state.slowMoTimer = 1600;
        this.createShockwave(this.renderer.width / 2, this.renderer.height / 2, color);
        this.createShockwave(this.renderer.width / 2, this.renderer.height / 2, def?.colors?.primary || '#FF4466');
        this.createFloatingText(
            this.renderer.width / 2,
            this.renderer.height / 2,
            'BOSS DEFEATED!',
            color,
            3.2
        );

        this.state.boss = null;
        this.boss.reset();
        this.handleLevelComplete();
    }

    applyLevelConfig() {
        const spawn = this.progression.getSpawnConfig();
        GAME_CONFIG.lanes = spawn.lanes;
        this.resize();
        this.state.level = this.progression.isEndless()
            ? 1
            : /** @type {import('./types.js').LevelDefinition} */ (this.progression.getActiveConfig()).id;
    }

    initCrystals() {
        const spawn = this.progression.getSpawnConfig();
        for (let i = 0; i < spawn.lanes; i++) {
            const delay = i * 100;
            const height = spawn.heightMin + gameplayRng.nextRange(0, spawn.heightMax - spawn.heightMin);
            const colorIdx = gameplayRng.nextInt(spawn.colorCount);
            this.state.crystals.push(new Crystal(i, 'top', height, colorIdx, delay));
            this.state.crystals.push(new Crystal(i, 'bottom', height, colorIdx, delay));
        }
        this.updateLaneMap();
    }

    resetGame() {
        this.startGame();
    }

    togglePause() {
        if (!this.state.active) return;
        if (this.ui.gameOver && !this.ui.gameOver.classList.contains('hidden')) return;

        this.state.paused = !this.state.paused;
        if (this.state.paused) {
            if (this.ui.pause) this.ui.pause.classList.remove('hidden');
            SoundManager.setMusicDuck(0.7);
        } else {
            this.resumeGame();
        }
    }

    resumeGame() {
        if (!this.state.active) return;
        this.state.paused = false;
        if (this.ui.pause) this.ui.pause.classList.add('hidden');
        SoundManager.setMusicDuck(1);
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

    /**
     * @param {number} lane
     * @param {{ fromReplay?: boolean }} [options]
     */
    setTargetLane(lane, options = {}) {
        if (this.replay.player.isActive() && !options.fromReplay) return;
        const clamped = Math.min(Math.max(0, lane), GAME_CONFIG.lanes - 1);
        if (clamped === this.launcher.targetLane) return;
        this.launcher.setTargetLane(clamped);
        if (!options.fromReplay) {
            this.replay.recorder.onAim(this, clamped);
        }
    }

    handleMouseMove(e) {
        if (!this.state.active || this.replay.player.isActive()) return;
        const lane = Math.floor(e.clientX / this.renderer.laneWidth);
        this.setTargetLane(lane);
    }

    handleInput(e) {
        if (!this.state.active || this.replay.player.isActive()) return;
        if (performance.now() < this._suppressMouseUntil) {
            e.preventDefault();
            return;
        }
        this.shootSpore();
    }

    handleTouch(e) {
        if (!this.state.active || this.replay.player.isActive()) return;
        const touch = e.changedTouches[0] || e.touches[0];
        if (!touch) return;

        e.preventDefault();
        this._suppressMouseUntil = performance.now() + 500;

        const touchX = touch.clientX;
        const lane = Math.floor(touchX / this.renderer.laneWidth);
        this.setTargetLane(lane);
        this.shootSpore();
    }

    /**
     * @param {{ fromReplay?: boolean }} [options]
     */
    shootSpore(options = {}) {
        if (!this.state.active || this.state.paused) return;
        if (this.replay.player.isActive() && !options.fromReplay) return;

        const fireMul = this.boss.getFireRateMultiplier();
        if (fireMul < 1 && !options.fromReplay) {
            const now = this.state.gameClockMs || 0;
            const minInterval = 220 / fireMul;
            if (now - this._lastShotAt < minInterval) return;
            this._lastShotAt = now;
        }

        this.save.recordShot();
        SoundManager.shoot();
        this.launcher.fire();

        const colorIdx = this.state.nextSporeColorIdx;
        const modifiers = this.powerUps.consumeShotModifiers();
        const m = this.state.motionScale;

        const lane = this.launcher.targetLane;
        const x = this.launcher.x;
        const y = this.launcher.y;

        this.state.kickY = 15 * m;
        this.state.shake = Math.max(this.state.shake, 5 * m);

        // Visual fluff: Muzzle flash particles
        const flashColor = modifiers.rainbow ? '#ffffff' : '#fff';
        this.createParticles(x, y, flashColor, modifiers.rainbow ? 18 : 10);

        this.state.spores.push(new Spore(x, y, lane, colorIdx, modifiers));
        if (modifiers.rainbow) {
            SoundManager.powerUpActivate();
            this.createFloatingText(x, y - 20, 'RAINBOW!', '#ffffff', 1.4);
        }

        if (!options.fromReplay) {
            this.replay.recorder.onFire(this);
        }

        this.state.nextSporeColorIdx = this.progression.pickRandomColorIndex();
        this.updateUI();
    }

    /** @param {string} typeId */
    grantPowerUp(typeId) {
        const def = POWER_UPS[typeId];
        if (!def || !this.powerUps.grant(typeId)) return;

        SoundManager.powerUpPickup();
        const cx = this.renderer.width / 2;
        const cy = this.renderer.height * 0.35;
        this.createFloatingText(cx, cy, def.name.toUpperCase(), def.color, 1.6);
        this.createParticles(cx, cy, def.color, 24);
        this.createShockwave(cx, cy, def.color);
        this.systems.juice.addEnergyRing(cx, cy, def.color, 2);
        this.updatePowerUpHud();
    }

    /**
     * @param {{ fromReplay?: boolean }} [options]
     */
    activateHeldPowerUp(options = {}) {
        if (!this.state.active) return;
        if (this.replay.player.isActive() && !options.fromReplay) return;
        const lane = this.launcher.targetLane;
        const result = this.powerUps.activateHeld(lane, this.state.crystals, POWER_UP_TYPES.LANE_SHOCKWAVE);
        if (!result) return;

        const def = POWER_UPS[result.typeId];
        const laneX = (lane * this.renderer.laneWidth) + (this.renderer.laneWidth / 2);
        const laneY = this.renderer.height / 2;

        SoundManager.powerUpActivate();
        this.createShockwave(laneX, laneY, def.color);
        this.systems.juice.addEnergyRing(laneX, laneY, def.color, 3);
        this.createParticles(laneX, laneY, def.color, 30);
        this.createFloatingText(laneX, laneY - 40, 'SHOCKWAVE!', def.color, 2.0);
        const m = this.state.motionScale;
        this.state.shake = Math.max(this.state.shake, 20 * m);
        this.state.impactFlash = 0.4 * m;
        this.state.impactFlashColor = def.color;
        if (!options.fromReplay) {
            this.replay.recorder.onPowerUp(this);
        }
        this.updatePowerUpHud();
    }

    updatePowerUpHud() {
        if (!this.ui.powerUpHud) return;
        const slots = this.powerUps.getHudSlots();
        this.ui.powerUpHud.innerHTML = slots.map(slot => {
            const timerHtml = slot.remainingMs != null && slot.durationMs
                ? `<div class="powerup-timer"><div class="powerup-timer-fill" style="width:${Math.round((slot.remainingMs / slot.durationMs) * 100)}%"></div></div>`
                : '';
            const countHtml = slot.count > 1 ? `<span class="powerup-count">x${slot.count}</span>` : '';
            return `<div class="powerup-slot" data-type="${slot.typeId}" style="--powerup-color:${slot.color}">
                <span class="powerup-icon">${slot.icon}</span>
                <span class="powerup-label">${slot.label}</span>
                ${countHtml}
                ${timerHtml}
            </div>`;
        }).join('');

        if (this.ui.powerUpActivateBtn) {
            const showActivate = this.powerUps.getHeldCount(POWER_UP_TYPES.LANE_SHOCKWAVE) > 0;
            this.ui.powerUpActivateBtn.classList.toggle('hidden', !showActivate);
        }
    }

    createImpactDust(x, y, color) {
        return this.systems.juice.createImpactDust(x, y, color);
    }

    /** @param {import('./types.js').Crystal} crystal */
    createCrystalAura(crystal) {
        return this.systems.juice.createCrystalAura(crystal);
    }

    createMatchBurst(x, y, color, combo) {
        return this.systems.juice.createMatchBurst(x, y, color, combo);
    }

    createImpactSparks(x, y, color, count = 4) {
        return this.systems.juice.createImpactSparks(x, y, color, count);
    }

    createParticles(x, y, color, count = 20, angle = null, spread = 1.5, type = 'spark') {
        return this.systems.juice.createParticles(x, y, color, count, angle, spread, type);
    }

    createDebris(x, y, color, count = 4, angle = null, spread = 1.0) {
        return this.systems.juice.createDebris(x, y, color, count, angle, spread);
    }

    createCrystalChunk(x, y, color, dirY = -1) {
        return this.systems.juice.createCrystalChunk(x, y, color, dirY);
    }

    createTrailParticle(x, y, color) {
        return this.systems.juice.createTrailParticle(x, y, color);
    }

    createShockwave(x, y, color) {
        return this.systems.juice.createShockwave(x, y, color);
    }

    createFloatingText(x, y, text, color, scale = 1.5) {
        return this.systems.juice.createFloatingText(x, y, text, color, scale);
    }

    /** @param {string} hexColor */
    triggerResonance(hexColor) {
        return this.systems.juice.triggerResonance(hexColor);
    }

    calculateShake() {
        return this.systems.juice.calculateShake();
    }

    triggerLevelUp() {
        SoundManager.levelUp();
        const m = this.state.motionScale;

        if (m >= 1) {
            this.state.targetTimeScale = 0.05;
            this.state.slowMoTimer = 2000;
        }

        this.state.shake = 30 * m;
        this.state.impactFlash = 0.8 * m;
        this.state.impactFlashColor = '#FFD700';

        const label = this.progression.isEndless() ? 'LEVEL UP!' : 'LEVEL COMPLETE!';
        this.createFloatingText(this.renderer.width / 2, this.renderer.height / 2, label, '#FFD700', 3.0);

        // Shockwave
        this.createShockwave(this.renderer.width / 2, this.renderer.height / 2, '#FFD700');

        // Particles (Confetti)
        for (let i = 0; i < 50; i++) {
            const x = this.renderer.width / 2;
            const y = this.renderer.height / 2;
            const colorCount = this.progression.getSpawnConfig().colorCount;
            const palette = this.state.colorPalette || DEFAULT_PALETTE;
            const color = palette[Math.floor(Math.random() * colorCount)].hex;
            this.state.particles.push(this.particlePool.acquire(x, y, color));
        }

        // Juice: All crystals jump
        this.state.crystals.forEach(c => {
             c.velScaleY += 0.5;
        });
    }

    handleLevelComplete() {
        if (this.progression.transitioning) return;
        this.progression.startTransition(2500);
        this.triggerLevelUp();

        setTimeout(() => {
            if (this.progression.hasNextLevel()) {
                this.progression.advanceLevel();
                this.progression.transitioning = false;
                this.beginCurrentLevel();
                return;
            }

            this.progression.campaignComplete = true;
            this.progression.transitioning = false;
            this.state.active = false;
            SoundManager.stopSession();
            this.save.recordGameEnd({
                score: this.state.score,
                combo: this._sessionBestCombo || 0,
            });
            this.showGameOverStats();
            if (this.ui.gameOverTitle) {
                this.ui.gameOverTitle.textContent = 'CAMPAIGN COMPLETE!';
            }
            this.ui.finalScore.innerText = String(this.state.score);
            this.ui.gameOver.classList.remove('hidden');
        }, 2500);
    }

    showGameOverStats() {
        this.settings.updateGameOverStats();
    }

    /** @param {number} dt */
    update(dt) {
        return this.systems.loop.update(dt);
    }

    /** @param {number} dt @param {number} [timeScale] */
    updateSharedVisuals(dt, timeScale) {
        return this.systems.loop.updateSharedVisuals(dt, timeScale);
    }

    updateUI() {
        return this.systems.loop.updateUI();
    }

    /** @type {import('./types.js').SporeScoreCallback} */
    _onSporeScore(points, isMatch, x, y, color) {
        if (isMatch) {
            const lane = Math.min(
                Math.max(0, Math.floor(x / Math.max(1, this.renderer.laneWidth))),
                GAME_CONFIG.lanes - 1
            );
            this.replay.recorder.onMilestone(this, {
                kind: 'match',
                lane,
                score: this.state.score,
            });
            if (this.boss.isActive()) {
                const dmg = this.boss.onMatch(lane, true);
                if (dmg > 0) {
                    this.createFloatingText(x, y - 30, 'HIT!', this.boss.definition?.colors?.vulnerable || '#44FFAA', 1.8);
                    this.state.shake = Math.max(this.state.shake, 12 * this.state.motionScale);
                }
            }
        }
        return this.systems.combo.handleSporeScore(points, isMatch, x, y, color);
    }

    getQualityScale() {
        return this.systems.quality.getQualityScale();
    }

    /**
     * @param {number} fps
     * @param {number} lowThreshold
     * @param {number} mediumThreshold
     * @returns {import('./types.js').RenderQualityLevel}
     */
    resolveQualityForFps(fps, lowThreshold, mediumThreshold) {
        return this.systems.quality.resolveQualityForFps(fps, lowThreshold, mediumThreshold);
    }

    /** @param {QualityMode} [mode] */
    setQualityMode(mode) {
        return this.systems.quality.setQualityMode(mode);
    }

    resetAdaptiveOverrides() {
        return this.systems.quality.resetAdaptiveOverrides();
    }

    /** @param {number} fps */
    updateAdaptiveQuality(fps) {
        return this.systems.quality.updateAdaptiveQuality(fps);
    }

    /** @param {number} dt @param {number} [fps] */
    updatePerfMetrics(dt, fps) {
        return this.systems.quality.updatePerfMetrics(dt, fps);
    }

    updateFrameTimeAdaptive() {
        return this.systems.quality.updateFrameTimeAdaptive();
    }

    /** @param {number} timestamp */
    loop(timestamp) {
        return this.systems.loop.loop(timestamp);
    }

    shatterAllCrystals() {
        return this.systems.juice.shatterAllCrystals();
    }

    /** @param {number} dt */
    updateVisuals(dt) {
        return this.systems.loop.updateVisuals(dt);
    }
}
