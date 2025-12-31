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
                scoreCallback(10);
                topCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch();
                topCry.height = wasmManager.calculatePenaltyHeight(topCry.height, GAME_CONFIG.penaltyGrowth);
                createParticlesCallback(this.x, topCry.height, '#555', 5);
            }
        }

        if (collision.bottomHit) {
            hitOccurred = true;
            if (collision.bottomMatch) {
                SoundManager.match();
                botCry.height = wasmManager.calculateMatchHeight(botCry.height, GAME_CONFIG.matchShrink, 10);
                botCry.flash = 1;
                createParticlesCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex, 20);
                scoreCallback(10);
                botCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch();
                botCry.height = wasmManager.calculatePenaltyHeight(botCry.height, GAME_CONFIG.penaltyGrowth);
                createParticlesCallback(this.x, height - botCry.height, '#555', 5);
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
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;
        this.life = 1.0;
        this.color = color;
        this.size = Math.random() * 4 + 1;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.02;
    }
}
