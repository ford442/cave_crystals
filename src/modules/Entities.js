import { COLORS, GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { wasmManager } from './WasmManager.js';
import { easeOutBack, springStep } from './easing.js';

export class Crystal {
    constructor(lane, type, height, colorIdx, spawnDelay = 0) {
        this.lane = lane;
        this.type = type; // 'top' or 'bottom'
        this.height = height;
        this.colorIdx = colorIdx;
        this.flash = 0;
        this.shapeSeed = Math.random();
        this.lightPhase = Math.random() * Math.PI * 2; // Randomize start phase for pulsing light
        this.spawnDelay = spawnDelay;
        this.spawnTimer = spawnDelay; // Frame counter for spawn delay
        this.hasSpawned = spawnDelay <= 0;

        // Elastic Juice properties
        this.scaleX = 1.0;
        this.scaleY = 0.0; // Start hidden for spawn animation
        this.velScaleX = 0;
        this.velScaleY = 0;
        this.age = 0; // Animation age

        // Critical State Juice
        this.isCritical = false;
        this.shakeX = 0;
        this.shakeY = 0;

        // Advanced visual state
        this.matchFlash = 0; // Energized sheen after match (fades over time)
        this.crackSeed = Math.random(); // Seeded internal crack pattern

        // Spring-animated display height — grows smoothly toward logical height
        this.displayHeight = height;
        this.displayHeightVel = 0;

        // Per-shard phase offsets for organic "living gem" feel
        this.shardPhaseOffsets = [
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2,
            Math.random() * Math.PI * 2
        ];

        // Micro-jitter state for critical feel
        this.jitterX = 0;
        this.jitterY = 0;

        // Cache shard config index to avoid per-frame lookup in renderer
        this.shardConfigIndex = this._getShardConfigIndex();
    }

    _getShardConfigIndex() {
        const seed = this.shapeSeed;
        if (seed < 0.2) return 0;
        if (seed < 0.4) return 1;
        if (seed < 0.6) return 2;
        if (seed < 0.8) return 3;
        return 4;
    }

    update(growthRate, timeScale = 1.0) {
        this.height += growthRate;
        this.age += timeScale;

        if(this.flash > 0) this.flash -= 0.1 * timeScale;
        if(this.matchFlash > 0) this.matchFlash -= 0.02 * timeScale;

        // Handle spawn delay
        if (!this.hasSpawned) {
            this.spawnTimer -= 16.67 * timeScale; // Approximate frame time
            if (this.spawnTimer <= 0) {
                this.hasSpawned = true;
            } else {
                this.scaleY = 0.0;
                this.displayHeight = this.height;
                return;
            }
        }

        // Spring-animate displayHeight toward logical height for "push upward" feel
        const dhResult = springStep(this.displayHeight, this.displayHeightVel, this.height, 0.12, 0.82, timeScale);
        this.displayHeight = dhResult.pos;
        this.displayHeightVel = dhResult.vel;

        // Determine Target Scales for Organic Feel
        let targetScaleX = 1.0;
        let targetScaleY = 1.0;

        if (this.isCritical) {
            // Aggressive Throbbing (Squash and Stretch) — faster and more extreme
            const pulse = Math.sin(this.age * 0.28 + this.lightPhase);
            // Volume preservation: one expands, other contracts
            targetScaleX = 1.0 + (pulse * 0.22); // Wider swing
            targetScaleY = 1.0 - (pulse * 0.15);

            // Micro-jitter for menacing feel
            this.jitterX = (Math.random() - 0.5) * 2.5;
            this.jitterY = (Math.random() - 0.5) * 2.5;
        } else {
            // Gentle Breathing with subtle per-shard character (tracked via lightPhase)
            const breathe = Math.sin(this.age * 0.05 + this.lightPhase);
            const breathe2 = Math.sin(this.age * 0.031 + this.lightPhase + 1.1); // Second harmonic
            targetScaleX = 1.0 + (breathe * 0.02) + (breathe2 * 0.005);
            targetScaleY = 1.0 + (breathe * 0.02) + (breathe2 * 0.005);
            this.jitterX = 0;
            this.jitterY = 0;
        }

        // Spring physics for scale
        const k = 0.2; // Spring constant
        const d = 0.85; // Damping

        // Apply timeScale to spring physics
        const fx = (targetScaleX - this.scaleX) * k;
        this.velScaleX += fx * timeScale;
        this.velScaleX *= (1 - (1 - d) * timeScale);
        this.scaleX += this.velScaleX * timeScale;

        const fy = (targetScaleY - this.scaleY) * k;
        this.velScaleY += fy * timeScale;
        this.velScaleY *= (1 - (1 - d) * timeScale);
        this.scaleY += this.velScaleY * timeScale;
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
        this.spawnTime = performance.now(); // For elastic animation
        this.maxRadius = 10; // Will be set by expansion, but starts small visually

        // In-flight wobble state
        this.wobblePhase = Math.random() * Math.PI * 2;
        this.inFlightAge = 0;

        // Pre-generate lightning arcs so draw loop doesn't call Math.random()
        this.lightningArcs = [];
        const numArcs = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < numArcs; i++) {
            const arc = {
                angle: Math.random() * Math.PI * 2,
                lenRatio: 1.5 + Math.random() * 0.8,
                jaggedOffsets: []
            };
            const steps = 4;
            for (let j = 0; j < steps; j++) {
                arc.jaggedOffsets.push(Math.random() - 0.5);
            }
            this.lightningArcs.push(arc);
        }
    }

    update(topCry, botCry, height, createParticlesCallback, scoreCallback, createShockwaveCallback, createTrailCallback, createDebrisCallback, createChunkCallback, timeScale = 1.0) {
        if (!this.active) return;

        // Track in-flight age for wobble animation
        this.inFlightAge += timeScale;

        // Visual Juice: Emit trail particles
        if (createTrailCallback && Math.random() < 0.7 * timeScale) {
             createTrailCallback(this.x, this.y, COLORS[this.colorIdx].hex);
        }

        this.radius += GAME_CONFIG.sporeExpandRate * timeScale;

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
                topCry.matchFlash = 1.0; // Energized sheen on match
                // JUICE: Squash on impact
                topCry.velScaleY -= 0.3; // Compress vertical
                topCry.velScaleX += 0.2; // Expand horizontal

                // Create particles at impact point (Spray DOWN)
                createParticlesCallback(this.x, topCry.height, COLORS[this.colorIdx].hex, 40, Math.PI / 2, 1.2, 'shard');
                // JUICE: Create Heavy Debris (Spray DOWN)
                if (createDebrisCallback) createDebrisCallback(this.x, topCry.height, COLORS[this.colorIdx].hex, 4, Math.PI / 2);
                // JUICE: Create Massive Severed Chunk (Fall DOWN)
                if (createChunkCallback) createChunkCallback(this.x, topCry.height, COLORS[this.colorIdx].hex, 1);

                if (createShockwaveCallback) createShockwaveCallback(this.x, topCry.height, COLORS[this.colorIdx].hex);
                scoreCallback(10, true, this.x, topCry.height, COLORS[this.colorIdx].hex); // Added coordinates for floating text
                topCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch();
                topCry.height = wasmManager.calculatePenaltyHeight(topCry.height, GAME_CONFIG.penaltyGrowth);

                // JUICE: Wobble on mismatch
                topCry.velScaleY += 0.1;
                topCry.velScaleX -= 0.1;

                // Rubble (Spray DOWN, wider spread)
                createParticlesCallback(this.x, topCry.height, '#777', 15, Math.PI / 2, 2.0);
                scoreCallback(0, false, this.x, topCry.height, '#555'); // Added coordinates
            }
        }

        if (collision.bottomHit) {
            hitOccurred = true;
            if (collision.bottomMatch) {
                SoundManager.match();
                botCry.height = wasmManager.calculateMatchHeight(botCry.height, GAME_CONFIG.matchShrink, 10);
                botCry.flash = 1;
                botCry.matchFlash = 1.0; // Energized sheen on match
                // JUICE: Squash on impact
                botCry.velScaleY -= 0.3;
                botCry.velScaleX += 0.2;

                // Create particles at impact point (Spray UP)
                createParticlesCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex, 40, -Math.PI / 2, 1.2, 'shard');
                // JUICE: Create Heavy Debris (Spray UP)
                if (createDebrisCallback) createDebrisCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex, 4, -Math.PI / 2);
                // JUICE: Create Massive Severed Chunk (Fly UP)
                if (createChunkCallback) createChunkCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex, -1);

                if (createShockwaveCallback) createShockwaveCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex);
                scoreCallback(10, true, this.x, height - botCry.height, COLORS[this.colorIdx].hex); // Added coordinates
                botCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch();
                botCry.height = wasmManager.calculatePenaltyHeight(botCry.height, GAME_CONFIG.penaltyGrowth);

                // JUICE: Wobble on mismatch
                botCry.velScaleY += 0.1;
                botCry.velScaleX -= 0.1;

                // Rubble (Spray UP, wider spread)
                createParticlesCallback(this.x, height - botCry.height, '#777', 15, -Math.PI / 2, 2.0);
                scoreCallback(0, false, this.x, height - botCry.height, '#555'); // Added coordinates
            }
        }

        if (hitOccurred) {
            this.active = false;
        }
    }
}

export class Particle {
    constructor(x, y, color, vx = null, vy = null, type = 'spark') {
        this._init(x, y, color, vx, vy, type);
    }

    _init(x, y, color, vx = null, vy = null, type = 'spark') {
        this.x = x;
        this.y = y;
        this.type = type;

        if (vx !== null && vy !== null) {
            this.vx = vx;
            this.vy = vy;
        } else if (type === 'aura') {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 0.6 + 0.2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed - 0.4; // bias upward
        } else if (type === 'ember') {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3 + 1.5;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const speed = type === 'debris' ? Math.random() * 8 + 4 : Math.random() * 5 + 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        }

        this.life = 1.0;
        if (type === 'debris' || type === 'shard') {
            this.maxLife = 2.0;
        } else if (type === 'aura') {
            this.maxLife = 1.5 + Math.random() * 0.8;
        } else if (type === 'ember') {
            this.maxLife = 0.8;
        } else {
            this.maxLife = 1.0;
        }
        this.color = color;
        if (type === 'debris') {
            this.size = Math.random() * 8 + 12;
        } else if (type === 'shard') {
            this.size = Math.random() * 10 + 8; // Longer shards
        } else if (type === 'aura') {
            this.size = Math.random() * 2.5 + 0.8;
        } else if (type === 'ember') {
            this.size = Math.random() * 2 + 0.8;
        } else {
            this.size = Math.random() * 6 + 2;
        }

        // Juice properties
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * ((type === 'debris' || type === 'shard' || type === 'chunk') ? 0.1 : 0.2);

        // 3D Rotation Juice
        this.angleX = Math.random() * Math.PI * 2;
        this.angleY = Math.random() * Math.PI * 2;
        this.velAngleX = (Math.random() - 0.5) * 0.2;
        this.velAngleY = (Math.random() - 0.5) * 0.2;

        this.hitFloor = false;
        this.hitWall = false;

        if (type === 'shard') {
            this.gravity = 0.8; // Heavy
            this.friction = 0.99; // Aerodynamic
            this.floorBounce = true;
        } else if (type === 'chunk') {
            this.gravity = 0.9; // Very Heavy
            this.friction = 0.99;
            this.floorBounce = false; // No bounce, shatter
            this.maxLife = 2.0;
            this.size = Math.random() * 10 + 20; // Large
        } else if (type === 'aura') {
            this.gravity = -0.03; // Float upward
            this.friction = 0.99;
            this.floorBounce = false;
        } else if (type === 'ember') {
            this.gravity = 0.12;
            this.friction = 0.97;
            this.floorBounce = false;
        } else {
            this.gravity = type === 'debris' ? 0.6 : 0.4;
            this.friction = type === 'debris' ? 0.95 : 0.98;
            this.floorBounce = true;
        }

        if (type === 'debris') {
            if (!this.polyPoints) this.polyPoints = [];
            else this.polyPoints.length = 0;
            const numPoints = 3 + Math.floor(Math.random() * 3); // 3 to 5
            for(let i=0; i<numPoints; i++) {
                const angle = (i / numPoints) * Math.PI * 2;
                const r = this.size * (0.6 + Math.random() * 0.4);
                this.polyPoints.push({
                    x: Math.cos(angle) * r,
                    y: Math.sin(angle) * r
                });
            }
        } else if (type === 'shard') {
            if (!this.polyPoints) this.polyPoints = [];
            else this.polyPoints.length = 0;
            // Create a jagged shard (elongated triangle)
            // Tip
            this.polyPoints.push({ x: 0, y: -this.size });
            // Right base
            this.polyPoints.push({ x: this.size * 0.3, y: this.size });
            // Left base
            this.polyPoints.push({ x: -this.size * 0.3, y: this.size });
        } else if (type === 'chunk') {
            if (!this.polyPoints) this.polyPoints = [];
            else this.polyPoints.length = 0;
            // Random jagged polygon
            const numPoints = 5 + Math.floor(Math.random() * 3);
            for(let i=0; i<numPoints; i++) {
                const angle = (i / numPoints) * Math.PI * 2;
                const r = this.size * (0.8 + Math.random() * 0.4);
                this.polyPoints.push({
                    x: Math.cos(angle) * r,
                    y: Math.sin(angle) * r
                });
            }
        }
    }

    reset(x, y, color, vx = null, vy = null, type = 'spark') {
        this._init(x, y, color, vx, vy, type);
    }

    update(rendererWidth, rendererHeight, onBounceCallback, timeScale = 1.0) {
        // Apply physics
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        this.vy += this.gravity * timeScale;

        // Friction with timeScale
        const adjFriction = 1 - (1 - this.friction) * timeScale;
        this.vx *= adjFriction;
        this.vy *= adjFriction;

        // Angular drag to let them settle
        this.rotationSpeed *= (1 - 0.01 * timeScale);

        const isPhysical = this.type === 'shard' || this.type === 'debris' || this.type === 'chunk';

        // Wall Collisions
        if (isPhysical) {
            let bounced = false;
            if (this.x < 0) {
                this.x = 0;
                this.vx *= -0.6; // Wall bounce damping
                this.hitWall = true;
                bounced = true;
            } else if (this.x > rendererWidth) {
                this.x = rendererWidth;
                this.vx *= -0.6;
                this.hitWall = true;
                bounced = true;
            }

            if (bounced && onBounceCallback && (Math.abs(this.vx) > 2 || Math.abs(this.vy) > 2)) {
                onBounceCallback(this.x, this.y, this.color);
            }
        }

        if (this.y > rendererHeight) {
            this.hitFloor = true;
        }

        // Floor Bounce
        if (this.floorBounce && this.y > rendererHeight) {
            this.y = rendererHeight;
            // Use WASM for bounce calc if we wanted, but calling JS -> WASM for simple float math is overkill
            // so we stick to the JS logic calling the WASM helper if available, or direct logic.
            // Using the exposed method for prompt compliance:
            // Check impact speed for dust
            if (onBounceCallback && Math.abs(this.vy) > 3) {
                 onBounceCallback(this.x, this.y, this.color);
            }

            this.vy = -this.vy * 0.6;

            // Randomize X slightly on bounce
            this.vx += (Math.random() - 0.5) * 2;

            // Spin faster on bounce
            this.velAngleX += (Math.random() - 0.5) * 0.5;
        }

        // Update rotation
        this.rotation += this.rotationSpeed * timeScale;
        this.angleX += this.velAngleX * timeScale;
        this.angleY += this.velAngleY * timeScale;

        // Decay: clamp timeScale so slow-mo doesn't make particles immortal
        const lifeDecayScale = Math.max(timeScale, 0.25);
        this.life -= 0.015 * lifeDecayScale;
    }
}

export class TrailParticle {
    constructor(x, y, color) {
        this.isTrail = true;
        this._init(x, y, color);
    }

    _init(x, y, color) {
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

    reset(x, y, color) {
        this._init(x, y, color);
    }

    update(timeScale = 1.0) {
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        const lifeDecayScale = Math.max(timeScale, 0.25);
        this.life -= 0.05 * lifeDecayScale; // Fade fast
        this.size *= (1 - 0.1 * timeScale); // Shrink
    }
}

export class ParticlePool {
    constructor(createFn, resetFn, initialSize = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.available = [];
        this.inUse = [];
        for (let i = 0; i < initialSize; i++) {
            this.available.push(createFn());
        }
    }
    acquire(...args) {
        let obj = this.available.pop() || this.createFn();
        this.resetFn(obj, ...args);
        obj._poolIndex = this.inUse.length;
        this.inUse.push(obj);
        return obj;
    }
    release(obj) {
        const idx = obj._poolIndex;
        if (idx >= 0 && idx < this.inUse.length) {
            const last = this.inUse.pop();
            if (last !== obj) {
                last._poolIndex = idx;
                this.inUse[idx] = last;
            }
            obj._poolIndex = -1;
            this.available.push(obj);
        }
    }
    releaseAll() {
        for (let i = 0; i < this.inUse.length; i++) {
            this.inUse[i]._poolIndex = -1;
            this.available.push(this.inUse[i]);
        }
        this.inUse.length = 0;
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

    update(timeScale = 1.0) {
        this.radius += 10 * timeScale; // Expand fast
        this.life -= 0.05 * timeScale; // Fade out
        this.width = Math.max(0, this.width - 0.5 * timeScale);
    }
}

export class EnergyRing {
    constructor(x, y, color, comboLevel = 1) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.comboLevel = Math.min(comboLevel, 8);
        this.radius = 5;
        this.life = 1.0;
        this.width = 5 + this.comboLevel * 0.8;
    }

    update(timeScale = 1.0) {
        const speed = 5 + this.comboLevel * 0.5;
        this.radius += speed * timeScale;
        this.life -= 0.05 * Math.max(timeScale, 0.25);
        this.width = Math.max(0, this.width - 0.25 * timeScale);
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
        this.scale = 0.1; // Start very small for pop-in
        this.targetScale = targetScale;

        // Pop-in spring state for scale overshoot
        this.scaleVel = 0;

        // Slight rotation for high-value combos (targetScale > 2.0)
        this.rotation = 0;
        this.rotVel = targetScale > 2.0 ? (Math.random() - 0.5) * 0.15 : 0;
    }

    update(timeScale = 1.0) {
        this.y += this.vy * timeScale;
        this.life -= 0.02 * timeScale;

        // Spring-based scale overshoot (easeOutBack feel via spring)
        const scaleResult = springStep(this.scale, this.scaleVel, this.targetScale, 0.25, 0.75, timeScale);
        this.scale = scaleResult.pos;
        this.scaleVel = scaleResult.vel;

        // Decay rotation for high-combo texts
        if (this.rotVel !== 0) {
            this.rotation += this.rotVel * timeScale;
            this.rotVel *= Math.pow(0.88, timeScale);
        }

        // Slow down upward movement
        this.vy *= (1 - (1 - 0.95) * timeScale);
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

        // Spring-based horizontal movement
        this.velX = 0;

        // Constants
        this.lerpFactor = 0.2;
        this.tiltFactor = 0.5;
        this.recoilRecovery = 0.1;
        this.squashRecovery = 0.1;

        // Juice
        this.age = 0;

        // Secondary motion: wing flutter
        this.wingPhase = 0;

        // Secondary motion: antenna spring
        this.antennaOffset = 0;
        this.antennaVel = 0;

        // Anticipation flag: brief pre-fire squash
        this._anticipating = false;
        this._anticipateTimer = 0;
    }

    setTargetLane(lane) {
        this.targetLane = lane;
    }

    fire() {
        // Anticipation squash (compress briefly before recoil kick)
        this.scaleX = 0.8;
        this.scaleY = 1.25;
        this._anticipating = true;
        this._anticipateTimer = 4; // frames of anticipation before full recoil
    }

    update(createTrailCallback, timeScale = 1.0) {
        this.age += timeScale;

        // Spring-based horizontal movement (allows slight overshoot on lane change)
        const targetX = (this.targetLane * this.laneWidth) + (this.laneWidth / 2);
        const dxToTarget = targetX - this.x;
        const springK = 0.045;
        const springDamp = 0.78;
        this.velX += dxToTarget * springK * timeScale;
        this.velX *= Math.pow(springDamp, timeScale);
        this.x += this.velX * timeScale;
        this.speed = Math.abs(this.velX);

        // Anticipation → recoil sequencing
        if (this._anticipating) {
            this._anticipateTimer -= timeScale;
            if (this._anticipateTimer <= 0) {
                this._anticipating = false;
                this.recoil = 15;   // Kick back
                this.scaleX = 1.3;  // Stretch horizontal
                this.scaleY = 0.7;  // Squash vertical
            }
        }

        // JUICE: Organic Hover Effect — primary bob + secondary higher-frequency wobble
        const primaryBob = Math.sin(this.age * 0.05) * 5.0;
        const secondaryBob = Math.sin(this.age * 0.13 + 0.7) * 1.5;
        this.y = (this.rendererHeight / 2) + primaryBob + secondaryBob;

        // JUICE: Speed Trail
        if (this.speed > 2.0 && createTrailCallback) {
             const offset = (Math.random() - 0.5) * 15;
             createTrailCallback(this.x + offset, this.y + 15, 'rgba(0, 255, 255, 0.5)');
        }

        // Calculate tilt based on spring velocity (velX) — bank into the turn
        const targetTilt = this.velX * 0.08;
        const fTilt = 1 - Math.pow(1 - 0.15, timeScale);
        this.tilt += (targetTilt - this.tilt) * fTilt;

        // Recover recoil
        if (this.recoil > 0) {
            this.recoil -= ((this.recoil * 0.2) + 0.1) * timeScale;
            if (this.recoil < 0) this.recoil = 0;
        }

        // Recover squash/stretch (spring back to rest)
        this.scaleX += (1.0 - this.scaleX) * this.squashRecovery * timeScale;
        this.scaleY += (1.0 - this.scaleY) * this.squashRecovery * timeScale;

        // Wing flutter — phase advances faster with speed
        this.wingPhase += (0.08 + this.speed * 0.04) * timeScale;

        // Antenna secondary spring — responds to speed with delay/overshoot
        const antennaTarget = Math.min(this.speed * 2.5, 8.0);
        const antennaResult = springStep(this.antennaOffset, this.antennaVel, antennaTarget, 0.18, 0.80, timeScale);
        this.antennaOffset = antennaResult.pos;
        this.antennaVel = antennaResult.vel;
    }
}

export class SoulParticle {
    constructor(x, y, color, targetX, targetY, scoreValue) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.targetX = targetX;
        this.targetY = targetY;
        this.scoreValue = scoreValue;

        // Initial random burst
        this.vx = (Math.random() - 0.5) * 10;
        this.vy = (Math.random() - 0.5) * 10;

        this.life = 1.0;
        this.speed = 20.0; // Fast homing speed
        this.agility = 0.08; // Turn rate
        this.size = 8;
        this.trailTimer = 0;
        this.active = true;

        // Perpendicular sway for magical curved paths
        this.swayPhase = Math.random() * Math.PI * 2;
        this.swayAmplitude = 2.5 + Math.random() * 2.0;
    }

    update(createTrailCallback, timeScale = 1.0) {
        // Inline homing physics to avoid WASM bridge overhead
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 0) {
            const desiredVx = (dx / dist) * this.speed;
            const desiredVy = (dy / dist) * this.speed;
            const agilityScale = Math.max(timeScale, 0.25);
            this.vx += (desiredVx - this.vx) * this.agility * agilityScale;
            this.vy += (desiredVy - this.vy) * this.agility * agilityScale;

            // Perpendicular sway — adds sinusoidal offset orthogonal to travel direction
            // Only while far enough from target (fades within 60px)
            const swayFade = Math.min(1.0, dist / 60);
            this.swayPhase += 0.1 * timeScale;
            const swayStrength = Math.sin(this.swayPhase) * this.swayAmplitude * swayFade;
            // Perpendicular unit vector: (-dy/dist, dx/dist)
            this.x += (-dy / dist) * swayStrength * timeScale;
            this.y += (dx / dist) * swayStrength * timeScale;
        }

        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;

        // Visual Trail
        this.trailTimer++;
        if (this.trailTimer % 3 === 0 && createTrailCallback) {
             createTrailCallback(this.x, this.y, this.color);
        }

        // Check arrival
        const distSq = dx * dx + dy * dy;

        if (distSq < 900) { // 30px radius arrival threshold
            return true; // Arrived
        }

        const lifeDecayScale = Math.max(timeScale, 0.25);
        this.life -= 0.005 * lifeDecayScale;
        if (this.life <= 0) return true; // Timeout

        return false;
    }
}

export class DustParticle {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        // Slow drift
        this.baseVx = (Math.random() - 0.5) * 0.5;
        this.baseVy = (Math.random() - 0.5) * 0.5;
        this.vx = this.baseVx;
        this.vy = this.baseVy;

        this.size = Math.random() * 2 + 0.5;
        this.alpha = Math.random() * 0.3 + 0.1;
        this.renderAlpha = this.alpha;
        this.phase = Math.random() * Math.PI * 2;
    }

    update(width, height, shockwaves, timeScale = 1.0) {
        // Apply velocity
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;

        // Pulse alpha slightly
        this.phase += 0.05 * timeScale;
        const alphaPulse = 1.0 + Math.sin(this.phase) * 0.2;
        this.renderAlpha = Math.min(1.0, Math.max(0, this.alpha * alphaPulse));

        // Wrap around
        if (this.x < 0) this.x += width;
        if (this.x > width) this.x -= width;
        if (this.y < 0) this.y += height;
        if (this.y > height) this.y -= height;

        // Return to base velocity (drag)
        const drag = 0.05 * timeScale;
        this.vx += (this.baseVx - this.vx) * drag;
        this.vy += (this.baseVy - this.vy) * drag;

        // Dust is atmospheric background fluff — no shockwave interaction
        // (Removed O(dust * shockwaves) loop that tanked framerate)
    }
}
