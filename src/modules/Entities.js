import { COLORS, GAME_CONFIG } from './Constants.js';
import { SoundManager } from './Audio.js';
import { wasmManager } from './WasmManager.js';

export class Crystal {
    constructor(lane, type, height, colorIdx, spawnDelay = 0) {
        this.lane = lane;
        this.type = type; // 'top' or 'bottom'
        this.height = height;
        this.colorIdx = colorIdx;
        this.flash = 0;
        this.shapeSeed = Math.random();
        this.lightPhase = Math.random() * Math.PI * 2; // Randomize start phase for pulsing light
        this.spawnTime = Date.now() + spawnDelay;

        // Elastic Juice properties
        this.scaleX = 1.0;
        this.scaleY = 0.0; // Start hidden for spawn animation
        this.velScaleX = 0;
        this.velScaleY = 0;

        // Critical State Juice
        this.isCritical = false;
        this.shakeX = 0;
        this.shakeY = 0;
    }

    update(growthRate, timeScale = 1.0) {
        this.height += growthRate;
        if(this.flash > 0) this.flash -= 0.1 * timeScale;

        // Handle spawn delay
        if (Date.now() < this.spawnTime) {
            this.scaleY = 0.0;
            return;
        }

        // Spring physics for scale
        // Target is 1.0
        const k = 0.2; // Spring constant
        const d = 0.85; // Damping

        // Apply timeScale to spring physics
        const fx = (1.0 - this.scaleX) * k;
        this.velScaleX += fx * timeScale;
        this.velScaleX *= (1 - (1 - d) * timeScale);
        this.scaleX += this.velScaleX * timeScale;

        const fy = (1.0 - this.scaleY) * k;
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
        this.spawnTime = Date.now(); // For elastic animation
        this.maxRadius = 10; // Will be set by expansion, but starts small visually
    }

    update(crystals, height, createParticlesCallback, scoreCallback, createShockwaveCallback, createTrailCallback, createDebrisCallback, createChunkCallback, timeScale = 1.0) {
        if (!this.active) return;

        // Visual Juice: Emit trail particles
        if (createTrailCallback && Math.random() < 0.7 * timeScale) {
             createTrailCallback(this.x, this.y, COLORS[this.colorIdx].hex);
        }

        this.radius += GAME_CONFIG.sporeExpandRate * timeScale;

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

                // Create particles at impact point (Spray DOWN)
                createParticlesCallback(this.x, topCry.height, COLORS[this.colorIdx].hex, 40, Math.PI / 2, 1.2, 'shard');
                // JUICE: Create Heavy Debris
                if (createDebrisCallback) createDebrisCallback(this.x, topCry.height, COLORS[this.colorIdx].hex, 4);
                // JUICE: Create Massive Severed Chunk
                if (createChunkCallback) createChunkCallback(this.x, topCry.height, COLORS[this.colorIdx].hex);

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
                // JUICE: Squash on impact
                botCry.velScaleY -= 0.3;
                botCry.velScaleX += 0.2;

                // Create particles at impact point (Spray UP)
                createParticlesCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex, 40, -Math.PI / 2, 1.2, 'shard');
                // JUICE: Create Heavy Debris
                if (createDebrisCallback) createDebrisCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex, 4);
                // JUICE: Create Massive Severed Chunk
                if (createChunkCallback) createChunkCallback(this.x, height - botCry.height, COLORS[this.colorIdx].hex);

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
        this.x = x;
        this.y = y;
        this.type = type;

        if (vx !== null && vy !== null) {
            this.vx = vx;
            this.vy = vy;
        } else {
            const angle = Math.random() * Math.PI * 2;
            const speed = type === 'debris' ? Math.random() * 8 + 4 : Math.random() * 5 + 2;
            this.vx = Math.cos(angle) * speed;
            this.vy = Math.sin(angle) * speed;
        }

        this.life = 1.0;
        this.maxLife = (type === 'debris' || type === 'shard') ? 2.0 : 1.0;
        this.color = color;
        if (type === 'debris') {
            this.size = Math.random() * 8 + 12;
        } else if (type === 'shard') {
            this.size = Math.random() * 10 + 8; // Longer shards
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
        } else {
            this.gravity = type === 'debris' ? 0.6 : 0.4;
            this.friction = type === 'debris' ? 0.95 : 0.98;
            this.floorBounce = true;
        }

        if (type === 'debris') {
            this.polyPoints = [];
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
            this.polyPoints = [];
            // Create a jagged shard (elongated triangle)
            // Tip
            this.polyPoints.push({ x: 0, y: -this.size });
            // Right base
            this.polyPoints.push({ x: this.size * 0.3, y: this.size });
            // Left base
            this.polyPoints.push({ x: -this.size * 0.3, y: this.size });
        } else if (type === 'chunk') {
            this.polyPoints = [];
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

    update(rendererHeight = 800, timeScale = 1.0) {
        // Apply physics
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        this.vy += this.gravity * timeScale;

        // Friction with timeScale
        const adjFriction = 1 - (1 - this.friction) * timeScale;
        this.vx *= adjFriction;
        this.vy *= adjFriction;

        if (this.y > rendererHeight) {
            this.hitFloor = true;
        }

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
        this.rotation += this.rotationSpeed * timeScale;
        this.angleX += this.velAngleX * timeScale;
        this.angleY += this.velAngleY * timeScale;

        // Decay
        this.life -= 0.015 * timeScale;
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

    update(timeScale = 1.0) {
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        this.life -= 0.05 * timeScale; // Fade fast
        this.size *= (1 - 0.1 * timeScale); // Shrink
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

    update(timeScale = 1.0) {
        this.y += this.vy * timeScale;
        this.life -= 0.02 * timeScale;

        // Pop in effect
        if (this.scale < this.targetScale) {
            this.scale += (this.targetScale - this.scale) * 0.2 * timeScale;
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

    update(createTrailCallback, timeScale = 1.0) {
        // Lerp position
        const targetX = (this.targetLane * this.laneWidth) + (this.laneWidth / 2);
        const dx = targetX - this.x;

        const f = 1 - Math.pow(1 - this.lerpFactor, timeScale);
        const moveStep = dx * f;
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
        const fTilt = 1 - Math.pow(1 - 0.15, timeScale);
        this.tilt += (targetTilt - this.tilt) * fTilt;

        // Recover recoil
        if (this.recoil > 0) {
            this.recoil -= ((this.recoil * 0.2) + 0.1) * timeScale;
            if (this.recoil < 0) this.recoil = 0;
        }

        // Recover squash/stretch
        this.scaleX += (1.0 - this.scaleX) * this.squashRecovery * timeScale;
        this.scaleY += (1.0 - this.scaleY) * this.squashRecovery * timeScale;
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
    }

    update(createTrailCallback, timeScale = 1.0) {
        // Use WASM for homing physics
        // Apply timeScale to agility
        this.vx = wasmManager.calculateHomingVx(this.vx, this.vy, this.x, this.y, this.targetX, this.targetY, this.speed, this.agility * timeScale);
        this.vy = wasmManager.calculateHomingVy(this.vx, this.vy, this.x, this.y, this.targetX, this.targetY, this.speed, this.agility * timeScale);

        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;

        // Visual Trail
        this.trailTimer++;
        if (this.trailTimer % 3 === 0 && createTrailCallback) {
             createTrailCallback(this.x, this.y, this.color);
        }

        // Check arrival
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const distSq = dx * dx + dy * dy;

        if (distSq < 900) { // 30px radius arrival threshold
            return true; // Arrived
        }

        this.life -= 0.005 * timeScale;
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

        // Shockwave Interaction
        if (shockwaves) {
            shockwaves.forEach(sw => {
                // Only active shockwaves
                if (sw.life <= 0) return;

                const dx = this.x - sw.x;
                const dy = this.y - sw.y;
                const distSq = dx*dx + dy*dy;
                // Expanded radius for influence
                const radius = sw.radius + 100;

                if (distSq < radius * radius) {
                    const dist = Math.sqrt(distSq);
                    if (dist > 0) {
                        // Push away
                        // Force strongest near the wave front? Or just inside?
                        // Let's just push away from center
                        const force = (1.0 - (dist / radius)) * 2.0 * sw.life;
                        this.vx += (dx / dist) * force * timeScale;
                        this.vy += (dy / dist) * force * timeScale;
                    }
                }
            });
        }
    }
}
