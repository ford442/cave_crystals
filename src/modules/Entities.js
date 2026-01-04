import { COLORS, GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { wasmManager } from './WasmManager.js';

export class Crystal {
    constructor(lane, type, height, colorIdx) {
        this.lane = lane;
        this.type = type; // 'top' or 'bottom'
        this.height = height;
        this.colorIdx = colorIdx;
        this.flash = 0;
        this.shapeSeed = Math.random();
    }

    update(growthRate) {
        this.height += growthRate;
        if(this.flash > 0) this.flash -= 0.1;
    }
}

export class Spore {
    constructor(x, y, lane, colorIdx) {
        this.x = x;
        this.y = y;
        this.lane = lane;
        this.radius = 10;
        this.colorIdx = colorIdx;
        this.active = true;
    }

    update(crystals, height, createParticlesCallback, scoreCallback) {
        if (!this.active) return;

        this.radius += GAME_CONFIG.sporeExpandRate;

        const topCry = crystals.find(c => c.lane === this.lane && c.type === 'top');
        const botCry = crystals.find(c => c.lane === this.lane && c.type === 'bottom');

        if (!topCry || !botCry) return;

        // Use WASM for collision detection
        const collision = wasmManager.checkCollisions(this, topCry, botCry, height);

        let hitOccurred = false;

        if (collision.topHit) {
            hitOccurred = true;
            if (collision.topMatch) {
                SoundManager.match();
                topCry.height = wasmManager.calculateMatchHeight(topCry.height, GAME_CONFIG.matchShrink, 10);
                topCry.flash = 1;
                createParticlesCallback(this.x, topCry.height, COLORS[this.colorIdx].hex, 20);
                scoreCallback(10, true);
                topCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch();
                topCry.height = wasmManager.calculatePenaltyHeight(topCry.height, GAME_CONFIG.penaltyGrowth);
                createParticlesCallback(this.x, topCry.height, '#555', 5);
                scoreCallback(0, false);
            }
        }

        if (collision.bottomHit) {
            hitOccurred = true;
            if (collision.bottomMatch) {
                SoundManager.match();
                botCry.height = wasmManager.calculateMatchHeight(botCry.height, GAME_CONFIG.matchShrink, 10);
                botCry.flash = 1;
                createParticlesCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex, 20);
                scoreCallback(10, true);
                botCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch();
                botCry.height = wasmManager.calculatePenaltyHeight(botCry.height, GAME_CONFIG.penaltyGrowth);
                createParticlesCallback(this.x, height - botCry.height, '#555', 5);
                scoreCallback(0, false);
            }
        }

        if (hitOccurred) {
            this.active = false;
        }
    }
}

export class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 5 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1.0;
        this.maxLife = 1.0;
        this.color = color;
        this.size = Math.random() * 6 + 2;

        // Juice properties
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
        this.gravity = 0.15;
        this.friction = 0.96;
    }

    update() {
        // Apply physics
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Update rotation
        this.rotation += this.rotationSpeed;

        // Decay
        this.life -= 0.015;
    }
}
