import { COLORS, GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { Crystal, Spore, Particle, Shockwave, FloatingText } from './Entities.js';
import { Renderer } from './Renderer.js';
import { Background } from './Background.js';
import { wasmManager } from './WasmManager.js';

export class Game {
    constructor() {
        this.background = new Background();
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas);

        this.ui = {
            start: document.getElementById('startScreen'),
            gameOver: document.getElementById('gameOverScreen'),
            score: document.getElementById('scoreVal'),
            finalScore: document.getElementById('finalScore'),
            level: document.getElementById('levelVal'),
            preview: document.getElementById('nextSporePreview'),
            startBtn: document.getElementById('startBtn'),
            restartBtn: document.getElementById('restartBtn')
        };

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
            nextSporeColorIdx: 0,
            mouseLane: 3,
            growthMultiplier: 1,
            shake: 0,
            displayScore: 0,
            impactFlash: 0
        };

        // Initialize WASM asynchronously
        wasmManager.init().then(() => {
            console.log('WASM module initialization complete');
        }).catch(err => {
            console.warn('WASM initialization failed, using JavaScript fallback:', err);
        });

        this.bindEvents();
        this.resize();
        requestAnimationFrame(this.loop.bind(this));
    }

    bindEvents() {
        this.ui.startBtn.addEventListener('click', () => this.startGame());
        this.ui.restartBtn.addEventListener('click', () => this.resetGame());
        window.addEventListener('resize', () => this.resize());
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mousedown', (e) => this.handleInput(e));
        window.addEventListener('touchstart', (e) => this.handleTouch(e));
    }

    resize() {
        this.renderer.resize(window.innerWidth, window.innerHeight);
    }

    startGame() {
        SoundManager.init();
        this.state.active = true;
        this.state.score = 0;
        this.state.level = 1;
        this.state.growthMultiplier = 1;
        this.state.crystals = [];
        this.state.spores = [];
        this.state.particles = [];
        this.state.shockwaves = [];
        this.state.floatingTexts = [];
        this.state.nextSporeColorIdx = Math.floor(Math.random() * COLORS.length);
        this.state.impactFlash = 0;

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
            this.state.crystals.push(new Crystal(i, 'top', 20 + Math.random() * 60, Math.floor(Math.random() * COLORS.length)));
            this.state.crystals.push(new Crystal(i, 'bottom', 20 + Math.random() * 60, Math.floor(Math.random() * COLORS.length)));
        }
    }

    handleMouseMove(e) {
        if (!this.state.active) return;
        const lane = Math.floor(e.clientX / this.renderer.laneWidth);
        this.state.mouseLane = Math.min(Math.max(0, lane), GAME_CONFIG.lanes - 1);
    }

    handleInput(e) {
        if (!this.state.active) return;
        this.shootSpore();
    }

    handleTouch(e) {
        if (!this.state.active) return;
        const touchX = e.touches[0].clientX;
        const lane = Math.floor(touchX / this.renderer.laneWidth);
        this.state.mouseLane = Math.min(Math.max(0, lane), GAME_CONFIG.lanes - 1);
        this.shootSpore();
    }

    shootSpore() {
        SoundManager.shoot();

        const colorIdx = this.state.nextSporeColorIdx;

        const x = (this.state.mouseLane * this.renderer.laneWidth) + (this.renderer.laneWidth / 2);
        const y = this.renderer.height / 2;

        this.state.spores.push(new Spore(x, y, this.state.mouseLane, colorIdx));

        this.state.nextSporeColorIdx = Math.floor(Math.random() * COLORS.length);
        this.updateUI();
    }

    createParticles(x, y, color, count = 20) {
        const speed = 8.0;
        for(let i=0; i<count; i++) {
            // Use WASM for juicy explosion pattern
            const vx = wasmManager.getShatterVx(i, count, speed);
            const vy = wasmManager.getShatterVy(i, count, speed);

            this.state.particles.push(new Particle(x, y, color, vx, vy));
        }
    }

    createShockwave(x, y, color) {
        this.state.shockwaves.push(new Shockwave(x, y, color));
    }

    createFloatingText(x, y, text, color) {
        this.state.floatingTexts.push(new FloatingText(x, y, text, color));
    }

    update(dt) {
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

        // Score lerp
        this.state.displayScore += (this.state.score - this.state.displayScore) * 0.1;
        if (Math.abs(this.state.score - this.state.displayScore) < 0.5) {
            this.state.displayScore = this.state.score;
        }

        this.state.growthMultiplier = wasmManager.calculateGrowthMultiplier(this.state.score);
        const currentGrowth = wasmManager.calculateCrystalGrowth(GAME_CONFIG.baseGrowthRate, this.state.growthMultiplier);

        let gameOver = false;

        this.state.crystals.forEach(c => {
            c.update(currentGrowth);
            const opposite = this.state.crystals.find(oc => oc.lane === c.lane && oc.type !== c.type);
            if (opposite) {
                if (wasmManager.checkCrystalGameOver(c.height, opposite.height, this.renderer.height)) {
                    gameOver = true;
                }
            }
        });

        if (gameOver) {
            this.state.active = false;
            SoundManager.gameOver();
            this.ui.finalScore.innerText = this.state.score;
            this.ui.gameOver.classList.remove('hidden');
            return;
        }

        // Update Spores
        for (let i = this.state.spores.length - 1; i >= 0; i--) {
            let s = this.state.spores[i];
            s.update(this.state.crystals, this.renderer.height, this.createParticles.bind(this), (points, isMatch, x, y) => {
                this.state.score += points;
                if (isMatch) {
                    this.state.shake = 10;
                    this.state.impactFlash = 0.5; // Flash screen on match
                    if (x !== undefined && y !== undefined) {
                        this.createFloatingText(x, y, `+${points}`, '#fff');
                    }
                } else if (points === 0) {
                    // Mismatch
                    this.state.shake = 20;
                    this.state.impactFlash = 0.2; // Small flash on error
                    if (x !== undefined && y !== undefined) {
                        // "MISS" text? Or just sound. Maybe a red "!" or "X"
                        // Or just "0"
                        // Let's do nothing for now as 0 is boring, but if we want feedback:
                        this.createFloatingText(x, y, "MISS", '#f00');
                    }
                }
            }, this.createShockwave.bind(this));
            if (!s.active) {
                this.state.spores.splice(i, 1);
                this.updateUI();
            }
        }

        // Update Particles
        for (let i = this.state.particles.length - 1; i >= 0; i--) {
            let p = this.state.particles[i];
            p.update(this.renderer.height);
            if (p.life <= 0) this.state.particles.splice(i, 1);
        }

        // Update Shockwaves
        for (let i = this.state.shockwaves.length - 1; i >= 0; i--) {
            let sw = this.state.shockwaves[i];
            sw.update();
            if (sw.life <= 0) this.state.shockwaves.splice(i, 1);
        }

        // Update Floating Texts
        for (let i = this.state.floatingTexts.length - 1; i >= 0; i--) {
            let ft = this.state.floatingTexts[i];
            ft.update();
            if (ft.life <= 0) this.state.floatingTexts.splice(i, 1);
        }
    }

    updateUI() {
        this.ui.score.innerText = Math.floor(this.state.displayScore);
        this.ui.level.innerText = Math.floor(this.state.score / 500) + 1;

        // Scale pulse effect on score if recently changed
        const scale = 1.0 + (this.state.shake * 0.01);
        this.ui.score.style.transform = `scale(${scale})`;

        const nextCol = COLORS[this.state.nextSporeColorIdx];
        this.ui.preview.style.backgroundColor = nextCol.hex;
        this.ui.preview.style.boxShadow = `0 0 20px ${nextCol.hex}`;
    }

    loop(timestamp) {
        if (!this.state.lastTime) this.state.lastTime = timestamp;
        const dt = timestamp - this.state.lastTime;

        if (this.state.active) {
            this.update(dt);
        }
        this.renderer.draw(this.state);

        this.state.lastTime = timestamp;
        requestAnimationFrame(this.loop.bind(this));
    }
}
