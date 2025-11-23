import { COLORS, GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { Crystal, Spore, Particle } from './Entities.js';
import { Renderer } from './Renderer.js';
import { Background } from './Background.js';

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
            nextSporeColorIdx: 0,
            mouseLane: 3,
            growthMultiplier: 1
        };

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
        this.state.nextSporeColorIdx = Math.floor(Math.random() * COLORS.length);

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

    createParticles(x, y, color, count = 10) {
        for(let i=0; i<count; i++) {
            this.state.particles.push(new Particle(x, y, color));
        }
    }

    update(dt) {
        this.state.growthMultiplier = 1 + (this.state.score / 500);
        const currentGrowth = GAME_CONFIG.baseGrowthRate * this.state.growthMultiplier;

        let gameOver = false;

        this.state.crystals.forEach(c => {
            c.update(currentGrowth);
            const opposite = this.state.crystals.find(oc => oc.lane === c.lane && oc.type !== c.type);
            if (opposite) {
                if (c.height + opposite.height >= this.renderer.height) {
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
            s.update(this.state.crystals, this.renderer.height, this.createParticles.bind(this), (points) => {
                this.state.score += points;
            });
            if (!s.active) {
                this.state.spores.splice(i, 1);
                this.updateUI();
            }
        }

        // Update Particles
        for (let i = this.state.particles.length - 1; i >= 0; i--) {
            let p = this.state.particles[i];
            p.update();
            if (p.life <= 0) this.state.particles.splice(i, 1);
        }
    }

    updateUI() {
        this.ui.score.innerText = this.state.score;
        this.ui.level.innerText = Math.floor(this.state.score / 500) + 1;

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
