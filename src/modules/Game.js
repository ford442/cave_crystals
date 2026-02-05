import { COLORS, GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { Crystal, Spore, Particle, TrailParticle, Shockwave, FloatingText, Launcher, SoulParticle, DustParticle } from './Entities.js';
import { Renderer } from './Renderer.js';
import { Background } from './Background.js';
import { wasmManager } from './WasmManager.js';

export class Game {
    constructor() {
        this.background = new Background();
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas);
        this.launcher = new Launcher(this.renderer.laneWidth, this.renderer.height);

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
            soulParticles: [],
            dustParticles: [],
            nextSporeColorIdx: 0,
            growthMultiplier: 1,
            shake: 0,
            displayScore: 0,
            impactFlash: 0,
            impactFlashColor: '#fff',
            sleepTimer: 0, // For hit stop / impact freeze
            kickY: 0, // Recoil kick
            shakeOffset: { x: 0, y: 0, angle: 0 },
            combo: 0,
            comboTimer: 0,
            zoom: 1.0,
            zoomFocus: { x: 0, y: 0 },
            criticalIntensity: 0,
            heartbeatTimer: 0,
            timeScale: 1.0,
            targetTimeScale: 1.0,
            slowMoTimer: 0
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
        this.launcher.laneWidth = this.renderer.laneWidth;
        this.launcher.rendererHeight = this.renderer.height;
        this.launcher.y = this.renderer.height / 2;
    }

    startGame() {
        SoundManager.init();
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
        this.state.nextSporeColorIdx = Math.floor(Math.random() * COLORS.length);
        this.state.impactFlash = 0;

        // Spawn Atmospheric Dust
        for (let i = 0; i < 100; i++) {
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

    createParticles(x, y, color, count = 20, angle = null, spread = 1.5, type = 'spark') {
        const speed = type === 'spark' && count < 5 ? 2.0 : 8.0; // Slower for dust
        for(let i=0; i<count; i++) {
            // Use WASM for juicy explosion pattern
            let vx, vy;
            if (angle !== null) {
                vx = wasmManager.getDirectionalVx(i, count, speed, angle, spread);
                vy = wasmManager.getDirectionalVy(i, count, speed, angle, spread);
            } else {
                vx = wasmManager.getShatterVx(i, count, speed);
                vy = wasmManager.getShatterVy(i, count, speed);
            }

            this.state.particles.push(new Particle(x, y, color, vx, vy, type));
        }
    }

    createDebris(x, y, color, count = 4) {
        for(let i=0; i<count; i++) {
             // Debris flies out randomly but generally away from center if we knew it
             // Here we just explode them
             const angle = Math.random() * Math.PI * 2;
             const speed = Math.random() * 5 + 3;
             const vx = Math.cos(angle) * speed;
             const vy = Math.sin(angle) * speed;

             this.state.particles.push(new Particle(x, y, color, vx, vy, 'debris'));
        }
    }

    createCrystalChunk(x, y, color) {
        // JUICE: Spawn a large chunk that falls and shatters on impact
        const p = new Particle(x, y, color, null, null, 'chunk');
        // Initial velocity popping off (up and out)
        p.vx = (Math.random() - 0.5) * 4;
        p.vy = -Math.random() * 5 - 2; // Pop UP
        this.state.particles.push(p);
    }

    createTrailParticle(x, y, color) {
        this.state.particles.push(new TrailParticle(x, y, color));
    }

    createShockwave(x, y, color) {
        this.state.shockwaves.push(new Shockwave(x, y, color));
    }

    createFloatingText(x, y, text, color, scale = 1.5) {
        this.state.floatingTexts.push(new FloatingText(x, y, text, color, scale));
    }

    triggerResonance(hexColor) {
        this.state.crystals.forEach(c => {
             const cHex = COLORS[c.colorIdx].hex;
             if (cHex === hexColor) {
                 // Resonance Pulse
                 c.velScaleY += 0.5; // Jump up
                 c.velScaleX -= 0.1; // Squash in slightly
                 c.flash = 0.8;
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

            this.state.shakeOffset = { x: dx, y: dy, angle: angle };

            // Apply to background
            if (this.background && this.background.image) {
                this.background.image.style.transform = `translate(${dx}px, ${dy}px) rotate(${angle}rad) scale(1.02)`;
            }
        } else {
            this.state.shakeOffset = { x: 0, y: 0, angle: 0 };
            if (this.background && this.background.image) {
                this.background.image.style.transform = 'translate(0, 0) rotate(0) scale(1)';
            }
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
            this.state.particles.push(new Particle(x, y, color));
        }

        // Juice: All crystals jump
        this.state.crystals.forEach(c => {
             c.velScaleY += 0.5;
        });
    }

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

        // Shake decay (affected by timeScale?) - No, shake is visual and should probably remain snappy or maybe decay slower?
        // Let's keep shake decay independent of timeScale for visceral feel
        if (this.state.shake > 0) {
            this.state.shake *= 0.9;
            if (this.state.shake < 0.5) this.state.shake = 0;
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

        // Zoom decay
        if (this.state.zoom > 1.0) {
            this.state.zoom += (1.0 - this.state.zoom) * 0.1;
            if (this.state.zoom < 1.001) this.state.zoom = 1.0;
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

            const opposite = this.state.crystals.find(oc => oc.lane === c.lane && oc.type !== c.type);
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
                         this.state.particles.push(new Particle(x, tipY, 'rgba(100, 100, 100, 0.5)', vx, vy));
                    }
                }

                if (wasmManager.checkCrystalGameOver(c.height, opposite.height, this.renderer.height)) {
                    gameOver = true;
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

        // Update Spores
        for (let i = this.state.spores.length - 1; i >= 0; i--) {
            let s = this.state.spores[i];
            s.update(this.state.crystals, this.renderer.height, this.createParticles.bind(this), (points, isMatch, x, y, color) => {

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
                    }
                }
            }, this.createShockwave.bind(this), this.createTrailParticle.bind(this), this.createDebris.bind(this), this.createCrystalChunk.bind(this), timeScale);
            if (!s.active) {
                this.state.spores.splice(i, 1);
                this.updateUI();
            }
        }

        // Pass trail callback for juice
        this.launcher.update(this.createTrailParticle.bind(this), timeScale);

        // Shared visual updates (including Soul Particles and Score Lerp)
        this.updateSharedVisuals(dt, timeScale);
    }

    updateSharedVisuals(dt, timeScale = 1.0) {
        // Update Particles
        for (let i = this.state.particles.length - 1; i >= 0; i--) {
            let p = this.state.particles[i];

            // Pass width and callback for wall bouncing juice
            p.update(
                this.renderer.width,
                this.renderer.height,
                this.createImpactDust.bind(this),
                timeScale
            );

            // JUICE: Chunk Shatter Logic
            if (p.type === 'chunk' && (p.hitFloor || p.hitWall)) {
                // Shatter into smaller shards
                // If wall hit, shatter inward
                let angle = -Math.PI / 2; // Up (floor hit)
                if (p.hitWall) {
                    angle = p.x < 100 ? 0 : Math.PI; // Inward
                }

                this.createParticles(p.x, p.y, p.color, 15, angle, 2.0, 'shard');
                p.life = 0; // Destroy chunk
            }

            if (p.life <= 0) this.state.particles.splice(i, 1);
        }

        // Update Shockwaves
        for (let i = this.state.shockwaves.length - 1; i >= 0; i--) {
            let sw = this.state.shockwaves[i];
            sw.update(timeScale);
            if (sw.life <= 0) this.state.shockwaves.splice(i, 1);
        }

        // Update Soul Particles
        for (let i = this.state.soulParticles.length - 1; i >= 0; i--) {
            let sp = this.state.soulParticles[i];
            const arrived = sp.update(this.createTrailParticle.bind(this), timeScale);

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
                this.state.soulParticles.splice(i, 1);
            }
        }

        // Update Floating Texts
        for (let i = this.state.floatingTexts.length - 1; i >= 0; i--) {
            let ft = this.state.floatingTexts[i];
            ft.update(timeScale);
            if (ft.life <= 0) this.state.floatingTexts.splice(i, 1);
        }

        // Update Atmospheric Dust
        this.state.dustParticles.forEach(p => {
            p.update(this.renderer.width, this.renderer.height, this.state.shockwaves, timeScale);
        });

        // Score lerp and UI update
        const oldDisplay = this.state.displayScore;
        this.state.displayScore += (this.state.score - this.state.displayScore) * 0.1;
        if (Math.abs(this.state.score - this.state.displayScore) < 0.5) {
            this.state.displayScore = this.state.score;
        }

        // Only update DOM if score changed significantly (counting up effect)
        if (Math.floor(oldDisplay) !== Math.floor(this.state.displayScore)) {
             this.ui.score.innerText = Math.floor(this.state.displayScore);
             // Pulse effect on every tick of increase
             const scale = 1.0 + (this.state.shake * 0.01) + 0.1;
             this.ui.score.style.transform = `scale(${scale})`;
        } else {
             // Passive pulse from shake
             const scale = 1.0 + (this.state.shake * 0.01);
             this.ui.score.style.transform = `scale(${scale})`;
        }
    }

    updateUI() {
        this.ui.score.innerText = Math.floor(this.state.displayScore);
        this.ui.level.innerText = Math.floor(this.state.score / 500) + 1;

        const nextCol = COLORS[this.state.nextSporeColorIdx];
        this.ui.preview.style.backgroundColor = nextCol.hex;
        this.ui.preview.style.boxShadow = `0 0 20px ${nextCol.hex}`;
    }

    loop(timestamp) {
        if (!this.state.lastTime) this.state.lastTime = timestamp;
        let dt = timestamp - this.state.lastTime;
        this.state.lastTime = timestamp;

        // Cap dt to prevent huge jumps if tab was inactive
        if (dt > 100) dt = 100;

        // Impact Sleep (Hit Stop)
        if (this.state.sleepTimer > 0) {
            this.state.sleepTimer -= dt;
            // Still draw (frozen frame), maybe with continued shake
            this.calculateShake();
            this.renderer.draw(this.state, this.launcher);
            requestAnimationFrame(this.loop.bind(this));
            return;
        }

        if (this.state.active) {
            this.update(dt);
        } else {
            // Even if game over, update visuals (particles, shockwaves)
            this.updateVisuals(dt);
        }
        this.calculateShake();
        this.renderer.draw(this.state, this.launcher);

        requestAnimationFrame(this.loop.bind(this));
    }

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

            // Spawn many particles
            // Use crystal color
            const color = COLORS[c.colorIdx].hex;
            this.createParticles(x, y, color, 30, null, 1.5, 'shard'); // 30 shards per crystal
            this.createShockwave(x, y, color);
        });

        // Remove all crystals to simulate total destruction
        this.state.crystals = [];
    }

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
}
