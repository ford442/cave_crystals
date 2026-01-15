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
        this.lightPhase = Math.random() * Math.PI * 2; // Randomize start phase for pulsing light

        // Elastic Juice properties
        this.scaleX = 1.0;
        this.scaleY = 1.0;
        this.velScaleX = 0;
        this.velScaleY = 0;
    }

    update(growthRate) {
        this.height += growthRate;
        if(this.flash > 0) this.flash -= 0.1;

        // Spring physics for scale
        // Target is 1.0
        const k = 0.2; // Spring constant
        const d = 0.85; // Damping

        const fx = (1.0 - this.scaleX) * k;
        this.velScaleX += fx;
        this.velScaleX *= d;
        this.scaleX += this.velScaleX;

        const fy = (1.0 - this.scaleY) * k;
        this.velScaleY += fy;
        this.velScaleY *= d;
        this.scaleY += this.velScaleY;
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
        this.spawnTime = Date.now(); // For elastic animation
        this.maxRadius = 10; // Will be set by expansion, but starts small visually
    }

    update(crystals, height, createParticlesCallback, scoreCallback, createShockwaveCallback, createTrailCallback) {
        if (!this.active) return;

        // Visual Juice: Emit trail particles
        if (createTrailCallback && Math.random() > 0.3) {
             createTrailCallback(this.x, this.y, COLORS[this.colorIdx].hex);
        }

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
                // JUICE: Squash on impact
                topCry.velScaleY -= 0.3; // Compress vertical
                topCry.velScaleX += 0.2; // Expand horizontal

                // Create particles at impact point
                createParticlesCallback(this.x, topCry.height, COLORS[this.colorIdx].hex, 40);
                if (createShockwaveCallback) createShockwaveCallback(this.x, topCry.height, COLORS[this.colorIdx].hex);
                scoreCallback(10, true, this.x, topCry.height, COLORS[this.colorIdx].hex); // Added coordinates for floating text
                topCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch();
                topCry.height = wasmManager.calculatePenaltyHeight(topCry.height, GAME_CONFIG.penaltyGrowth);

                // JUICE: Wobble on mismatch
                topCry.velScaleY += 0.1;
                topCry.velScaleX -= 0.1;

                createParticlesCallback(this.x, topCry.height, '#555', 10);
                scoreCallback(0, false, this.x, topCry.height, '#555'); // Added coordinates
            }
        }

        if (collision.bottomHit) {
            hitOccurred = true;
            if (collision.bottomMatch) {
                SoundManager.match();
                botCry.height = wasmManager.calculateMatchHeight(botCry.height, GAME_CONFIG.matchShrink, 10);
                botCry.flash = 1;
                // JUICE: Squash on impact
                botCry.velScaleY -= 0.3;
                botCry.velScaleX += 0.2;

                // Create particles at impact point
                createParticlesCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex, 40);
                if (createShockwaveCallback) createShockwaveCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex);
                scoreCallback(10, true, this.x, height - botCry.height, COLORS[this.colorIdx].hex); // Added coordinates
                botCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch();
                botCry.height = wasmManager.calculatePenaltyHeight(botCry.height, GAME_CONFIG.penaltyGrowth);

                // JUICE: Wobble on mismatch
                botCry.velScaleY += 0.1;
                botCry.velScaleX -= 0.1;

                createParticlesCallback(this.x, height - botCry.height, '#555', 10);
                scoreCallback(0, false, this.x, height - botCry.height, '#555'); // Added coordinates
            }
        }

        if (hitOccurred) {
            this.active = false;
        }
    }
}

export class Particle {
    constructor(x, y, color, vx = null, vy = null) {
        this.x = x;
        this.y = y;

        if (vx !== null && vy !== null) {
            this.vx = vx;
            this.vy = vy;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        }

        this.life = 1.0;
        this.maxLife = 1.0;
        this.color = color;
        this.size = Math.random() * 6 + 2;

        // Juice properties
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;

        // 3D Rotation Juice
        this.angleX = Math.random() * Math.PI * 2;
        this.angleY = Math.random() * Math.PI * 2;
        this.velAngleX = (Math.random() - 0.5) * 0.2;
        this.velAngleY = (Math.random() - 0.5) * 0.2;

        this.gravity = 0.4;
        this.friction = 0.98;
        this.floorBounce = true;
    }

    update(rendererHeight = 800) {
        // Apply physics
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.vx *= this.friction;
        this.vy *= this.friction;

        // Floor Bounce
        if (this.floorBounce && this.y > rendererHeight) {
            this.y = rendererHeight;
            // Use WASM for bounce calc if we wanted, but calling JS -> WASM for simple float math is overkill
            // so we stick to the JS logic calling the WASM helper if available, or direct logic.
            // Using the exposed method for prompt compliance:
            this.vy = wasmManager.getBounceVy(this.vy, 0.6);

            // Randomize X slightly on bounce
            this.vx += (Math.random() - 0.5) * 2;

            // Spin faster on bounce
            this.velAngleX += (Math.random() - 0.5) * 0.5;
        }

        // Update rotation
        this.rotation += this.rotationSpeed;
        this.angleX += this.velAngleX;
        this.angleY += this.velAngleY;

        // Decay
        this.life -= 0.015;
    }
}

export class TrailParticle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.life = 1.0;
        this.maxLife = 1.0;
        this.size = Math.random() * 4 + 2;
        this.rotation = Math.random() * Math.PI * 2;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.life -= 0.05; // Fade fast
        this.size *= 0.9; // Shrink
    }
}

export class Shockwave {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.radius = 10;
        this.maxRadius = 150;
        this.life = 1.0;
        this.width = 10;
    }

    update() {
        this.radius += 10; // Expand fast
        this.life -= 0.05; // Fade out
        this.width = Math.max(0, this.width - 0.5);
    }
}

export class FloatingText {
    constructor(x, y, text, color, targetScale = 1.5) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 1.0;
        this.vy = -2; // Move upwards
        this.scale = 0.5;
        this.targetScale = targetScale;
    }

    update() {
        this.y += this.vy;
        this.life -= 0.02;

        // Pop in effect
        if (this.scale < this.targetScale) {
            this.scale += (this.targetScale - this.scale) * 0.2;
        }

        // Slow down upward movement
        this.vy *= 0.95;
    }
}

export class Launcher {
    constructor(laneWidth, height) {
        this.laneWidth = laneWidth;
        this.rendererHeight = height;

        // Logical state
        this.targetLane = 3; // Start at middle

        // Visual state
        this.x = (this.targetLane * laneWidth) + (laneWidth / 2);
        this.y = height / 2;
        this.tilt = 0;
        this.recoil = 0;
        this.scaleX = 1.0;
        this.scaleY = 1.0;
        this.speed = 0;

        // Constants
        this.lerpFactor = 0.2;
        this.tiltFactor = 0.5;
        this.recoilRecovery = 0.1;
        this.squashRecovery = 0.1;
    }

    setTargetLane(lane) {
        this.targetLane = lane;
    }

    fire() {
        this.recoil = 15; // Kick back
        this.scaleX = 1.3; // Stretch horizontal
        this.scaleY = 0.7; // Squash vertical
    }

    update(createTrailCallback) {
        // Lerp position
        const targetX = (this.targetLane * this.laneWidth) + (this.laneWidth / 2);
        const dx = targetX - this.x;

        const moveStep = dx * this.lerpFactor;
        this.x += moveStep;
        this.speed = Math.abs(moveStep);

        // JUICE: Speed Trail
        if (this.speed > 2.0 && createTrailCallback) {
             // Spawn trail particles behind the launcher
             // Add some randomization for a "jet wash" look
             const offset = (Math.random() - 0.5) * 15;
             createTrailCallback(this.x + offset, this.y + 15, 'rgba(0, 255, 255, 0.5)');
        }

        // Calculate tilt based on movement velocity (dx)
        // Bank into the turn
        const targetTilt = dx * 0.08; // Increased tilt sensitivity

        // Smoothly interpolate tilt
        this.tilt += (targetTilt - this.tilt) * 0.15; // Slightly smoother lerp

        // Recover recoil
        if (this.recoil > 0) {
            this.recoil -= (this.recoil * 0.2) + 0.1;
            if (this.recoil < 0) this.recoil = 0;
        }

        // Recover squash/stretch
        this.scaleX += (1.0 - this.scaleX) * this.squashRecovery;
        this.scaleY += (1.0 - this.scaleY) * this.squashRecovery;
    }
}
