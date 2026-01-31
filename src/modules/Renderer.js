import { COLORS, GAME_CONFIG } from './Constants.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.laneWidth = this.width / GAME_CONFIG.lanes;
    }

    resize(w, h) {
        this.width = w;
        this.height = h;
        this.canvas.width = w;
        this.canvas.height = h;
        this.laneWidth = w / GAME_CONFIG.lanes;
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
    }

    draw(gameState, launcher) {
        if (!this.ctx) return;
        this.clear();

        // JUICE: Dynamic Lighting System
        // 1. Darken the world so lights pop
        this.ctx.fillStyle = 'rgba(0, 0, 10, 0.5)'; // Slight blue tint for cave atmosphere
        this.ctx.fillRect(0, 0, this.width, this.height);

        // 2. Render Additive Lighting Pass
        this.ctx.save();
        this.drawLighting(gameState, launcher);
        this.ctx.restore();

        // Background Color Override based on Flash
        if (gameState.impactFlash > 0.3) {
             // Subtle background tinting during strong flashes
             this.ctx.fillStyle = gameState.impactFlashColor || '#000';
             this.ctx.globalAlpha = gameState.impactFlash * 0.2;
             this.ctx.fillRect(0, 0, this.width, this.height);
             this.ctx.globalAlpha = 1.0;
        }

        this.ctx.save();

        // Calculate Chromatic Aberration Magnitude based on Shake AND Player Velocity
        // "Warp Drive" Effect: Moving fast distorts reality
        const launcherSpeed = launcher ? launcher.speed : 0;
        // JUICE: Increased warp sensitivity to speed for more impact
        const warpMagnitude = gameState.shake + (launcherSpeed * 2.5);

        const isWarping = warpMagnitude > 1.0;

        // JUICE: Impact Zoom
        if (gameState.zoom && gameState.zoom > 1.0) {
            const zx = gameState.zoomFocus ? gameState.zoomFocus.x : this.width / 2;
            const zy = gameState.zoomFocus ? gameState.zoomFocus.y : this.height / 2;
            this.ctx.translate(zx, zy);
            this.ctx.scale(gameState.zoom, gameState.zoom);
            this.ctx.translate(-zx, -zy);
        }

        // Apply centralized shake offset (calculated in Game.js for sync with background)
        if (gameState.shakeOffset) {
             // Rotate around center
             const cx = this.width / 2;
             const cy = this.height / 2;

             this.ctx.translate(cx, cy);
             this.ctx.rotate(gameState.shakeOffset.angle || 0);
             this.ctx.translate(-cx, -cy);

             this.ctx.translate(gameState.shakeOffset.x || 0, gameState.shakeOffset.y || 0);
        } else if (gameState.shake > 0) {
            const dx = (Math.random() - 0.5) * gameState.shake;
            const dy = (Math.random() - 0.5) * gameState.shake;
            this.ctx.translate(dx, dy);
        }

        if (gameState.dustParticles) {
            this.drawDust(gameState.dustParticles);
        }

        this.drawGuides();
        this.drawTargetingSystem(gameState, launcher);

        // Draw Crystals with Chromatic Aberration
        gameState.crystals.forEach(c => {
             // JUICE: Apply Shockwave Distortion
             // Calculate center of crystal
             const cX = (c.lane * this.laneWidth) + (this.laneWidth / 2);
             const cY = c.type === 'top' ? c.height / 2 : this.height - (c.height / 2);
             const distortion = this.calculateShockwaveDistortion(cX, cY, gameState);

             this.ctx.save();
             this.ctx.translate(distortion.x, distortion.y);

             if (isWarping) {
                 this.ctx.globalCompositeOperation = 'screen';
                 // Red Channel Offset
                 this.ctx.save();
                 this.ctx.translate(-3 - (warpMagnitude * 0.1), 0);
                 this.drawComplexCrystal(c, 'red');
                 this.ctx.restore();

                 // Blue Channel Offset
                 this.ctx.save();
                 this.ctx.translate(3 + (warpMagnitude * 0.1), 0);
                 this.drawComplexCrystal(c, 'blue');
                 this.ctx.restore();

                 this.ctx.globalCompositeOperation = 'source-over';
             }
             this.drawComplexCrystal(c);
             this.ctx.restore();
        });

        // Draw Launcher with Chromatic Aberration (Motion Blur)
        if (launcher) {
            // JUICE: Apply Shockwave Distortion
            const distortion = this.calculateShockwaveDistortion(launcher.x, launcher.y, gameState);
            this.ctx.save();
            this.ctx.translate(distortion.x, distortion.y);

            if (isWarping) {
                this.ctx.globalCompositeOperation = 'screen';
                // Red Channel
                this.ctx.save();
                this.ctx.translate(-4 - (warpMagnitude * 0.2), 0);
                this.drawCursor(gameState, launcher, 'red');
                this.ctx.restore();

                // Blue Channel
                this.ctx.save();
                this.ctx.translate(4 + (warpMagnitude * 0.2), 0);
                this.drawCursor(gameState, launcher, 'blue');
                this.ctx.restore();

                this.ctx.globalCompositeOperation = 'source-over';
            }
            this.drawCursor(gameState, launcher);
            this.ctx.restore();
        }
        gameState.spores.forEach(s => this.drawSpore(s));
        gameState.particles.forEach(p => {
             if (p.constructor.name === 'TrailParticle') {
                 this.drawTrailParticle(p);
             } else {
                 this.drawParticle(p);
             }
        });

        if (gameState.shockwaves) {
            gameState.shockwaves.forEach(sw => this.drawShockwave(sw));
        }

        if (gameState.floatingTexts) {
            gameState.floatingTexts.forEach(ft => this.drawFloatingText(ft));
        }

        if (gameState.soulParticles) {
            gameState.soulParticles.forEach(sp => this.drawSoulParticle(sp));
        }

        this.ctx.restore();

        // JUICE: Red Alert Vignette
        if (gameState.criticalIntensity > 0.01) {
            this.drawVignette(gameState.criticalIntensity);
        }

        // Draw Impact Flash (independent of shake translation)
        if (gameState.impactFlash > 0) {
            this.drawImpactFlash(gameState.impactFlash, gameState.impactFlashColor);
        }
    }

    drawVignette(intensity) {
        if (!this.ctx) return;
        this.ctx.save();

        // Pulse alpha
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 200);
        const alpha = intensity * 0.6 * pulse; // Max 0.6 opacity

        // Radial gradient from center out
        // Use larger dimension for radius to ensure coverage
        const radius = Math.max(this.width, this.height);
        const grad = this.ctx.createRadialGradient(this.width / 2, this.height / 2, this.height * 0.2, this.width / 2, this.height / 2, radius * 0.8);
        grad.addColorStop(0, 'rgba(255, 0, 0, 0)');
        grad.addColorStop(1, `rgba(255, 0, 0, ${alpha})`);

        this.ctx.fillStyle = grad;
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Add "Danger" text if intensity is very high
        if (intensity > 0.8 && pulse > 0.8) {
             this.ctx.font = 'bold 60px Righteous, monospace';
             this.ctx.fillStyle = `rgba(255, 0, 0, ${intensity})`;
             this.ctx.textAlign = 'center';
             this.ctx.textBaseline = 'middle';
             this.ctx.fillText("CRITICAL!", this.width / 2, this.height * 0.3);
        }

        this.ctx.restore();
    }

    drawLighting(gameState, launcher) {
        this.ctx.globalCompositeOperation = 'lighter';

        const time = Date.now() / 1000;

        // Helper to draw a light blob
        const drawLight = (x, y, color, radius, intensity = 1.0) => {
             const grad = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
             // Parse hex to rgba for gradient
             const rgb = this.hexToRgb(color) || {r:255, g:255, b:255};

             grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${intensity})`);
             grad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${intensity * 0.3})`);
             grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

             this.ctx.fillStyle = grad;
             this.ctx.beginPath();
             this.ctx.arc(x, y, radius, 0, Math.PI * 2);
             this.ctx.fill();
        };

        // 1. Crystal Lights
        gameState.crystals.forEach(c => {
             const x = (c.lane * this.laneWidth) + (this.laneWidth / 2);
             const h = c.height * (c.scaleY || 1.0);
             let y;
             if (c.type === 'top') {
                 y = h - 20; // Near the tip
             } else {
                 y = this.height - h + 20;
             }

             // Calculate dynamic intensity
             // Base pulse using the new lightPhase
             const pulse = Math.sin((time * 3) + c.lightPhase) * 0.2 + 0.8;
             // Flash intensity
             const flashBonus = c.flash * 2.0;

             const radius = 150 + (flashBonus * 100);
             const intensity = (0.3 + (flashBonus * 0.5)) * pulse;

             const col = COLORS[c.colorIdx].hex;
             drawLight(x, y, col, radius, intensity);

             // Wall Reflections
             // If in first lane, reflect on left wall
             if (c.lane === 0) {
                 // Squeeze the light vertically against the wall
                 this.ctx.save();
                 this.ctx.translate(0, y);
                 this.ctx.scale(0.3, 2.0); // Make it a vertical strip
                 drawLight(0, 0, col, radius * 1.5, intensity * 0.5);
                 this.ctx.restore();
             }
             // If in last lane, reflect on right wall
             if (c.lane === GAME_CONFIG.lanes - 1) {
                 this.ctx.save();
                 this.ctx.translate(this.width, y);
                 this.ctx.scale(0.3, 2.0);
                 drawLight(0, 0, col, radius * 1.5, intensity * 0.5);
                 this.ctx.restore();
             }
        });

        // 2. Spore Lights
        gameState.spores.forEach(s => {
             const col = COLORS[s.colorIdx].hex;
             // Pulsing fast
             const radius = s.radius * 4;
             drawLight(s.x, s.y, col, radius, 0.6);
        });

        // 3. Launcher Light
        if (launcher) {
            drawLight(launcher.x, launcher.y, '#00FFFF', 100 + launcher.recoil * 5, 0.4);
        }

        // 4. Soul Particles Light
        if (gameState.soulParticles) {
             gameState.soulParticles.forEach(sp => {
                 drawLight(sp.x, sp.y, sp.color, 40, 0.6);
             });
        }

        // 5. Particle Sparkles (Only large ones or groups to save perf)
        // We can batch draw a faint glow for particles?
        // Or just skip for performance as there can be many.
        // Let's do a simple iterate for large particles only
        gameState.particles.forEach(p => {
             if (p.size > 4) {
                 drawLight(p.x, p.y, p.color, p.size * 4, 0.3 * p.life);
             }
        });

        this.ctx.globalCompositeOperation = 'source-over';
    }

    drawDust(particles) {
        if (!particles) return;
        this.ctx.save();
        // Faint blue-ish white for dust
        this.ctx.fillStyle = 'rgb(200, 220, 255)';
        particles.forEach(p => {
             // Use pre-calculated renderAlpha which includes pulse
             this.ctx.globalAlpha = p.renderAlpha || 0.1;
             this.ctx.beginPath();
             this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
             this.ctx.fill();
        });
        this.ctx.restore();
    }

    drawImpactFlash(intensity, color = '#fff') {
        this.ctx.save();
        // Use 'lighter' or just alpha blend
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.fillStyle = color;
        this.ctx.globalAlpha = intensity;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();
    }

    drawGuides() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        for(let i=1; i<GAME_CONFIG.lanes; i++) {
            const x = i * this.laneWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
    }

    drawTargetingSystem(gameState, launcher) {
        if (!gameState.active || !launcher) return;

        const targetLane = launcher.targetLane;
        const targetLaneX = (targetLane * this.laneWidth) + (this.laneWidth / 2);

        // Find target crystals
        const targets = gameState.crystals.filter(c => c.lane === targetLane);
        const nextColorIdx = gameState.nextSporeColorIdx;
        const time = Date.now();

        // Draw Laser Sight
        // Determine "Lock Status" based on if any crystal matches
        const hasMatch = targets.some(c => c.colorIdx === nextColorIdx);

        this.ctx.save();

        const beamX = targetLaneX;

        if (hasMatch) {
            // MATCH: High Energy Beam
            const col = COLORS[nextColorIdx].hex;
            this.ctx.strokeStyle = col;
            this.ctx.lineWidth = 3;
            this.ctx.shadowColor = col;
            this.ctx.shadowBlur = 15;
            this.ctx.setLineDash([20, 10]);
            this.ctx.lineDashOffset = -(time / 10); // Fast flow
        } else {
            // NO MATCH: Searching/Scanning Beam
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.lineWidth = 1;
            this.ctx.shadowBlur = 0;
            this.ctx.setLineDash([5, 15]);
            this.ctx.lineDashOffset = -(time / 50); // Slow flow
        }

        this.ctx.beginPath();
        this.ctx.moveTo(beamX, 0);
        this.ctx.lineTo(beamX, this.height);
        this.ctx.stroke();

        this.ctx.setLineDash([]);

        // Draw Reticles on Targets
        targets.forEach(c => {
            const isMatch = c.colorIdx === nextColorIdx;

            // Calculate Crystal Tip Position
            const cX = beamX; // Assumes crystal is centered in lane
            // Adding shake
            const shakeX = c.shakeX || 0;
            const shakeY = c.shakeY || 0;

            let tipY;
             if (c.type === 'top') {
                 tipY = c.height + shakeY;
             } else {
                 tipY = this.height - c.height + shakeY;
             }

             this.ctx.save();
             this.ctx.translate(cX + shakeX, tipY);

             // Reticle Animation
             if (isMatch) {
                 const spin = time / 100;
                 const scale = 1.0 + Math.sin(time / 50) * 0.2;
                 this.ctx.rotate(spin);
                 this.ctx.scale(scale, scale);

                 this.ctx.strokeStyle = COLORS[c.colorIdx].hex;
                 this.ctx.lineWidth = 3;
                 this.ctx.shadowColor = COLORS[c.colorIdx].hex;
                 this.ctx.shadowBlur = 10;

                 // Draw Bracket
                 this.ctx.beginPath();
                 this.ctx.arc(0, 0, 30, 0, Math.PI * 2); // Full ring for match
                 this.ctx.stroke();

                 // Inner crosshair
                 this.ctx.beginPath();
                 this.ctx.moveTo(-10, 0); this.ctx.lineTo(10, 0);
                 this.ctx.moveTo(0, -10); this.ctx.lineTo(0, 10);
                 this.ctx.stroke();

             } else {
                 // No match - Warning/Scanning
                 const spin = time / 1000; // Slow spin
                 this.ctx.rotate(spin);

                 this.ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)'; // Reddish warning
                 this.ctx.lineWidth = 2;

                 // Draw Broken Bracket
                 this.ctx.beginPath();
                 this.ctx.arc(0, 0, 30, 0, Math.PI * 0.5);
                 this.ctx.stroke();
                 this.ctx.beginPath();
                 this.ctx.arc(0, 0, 30, Math.PI, Math.PI * 1.5);
                 this.ctx.stroke();
             }

             this.ctx.restore();

             // Connecting Line from Launcher to Target Tip
             // Only draw if active match or maybe always?
             // Let's draw it faint if no match, strong if match
             this.ctx.save();
             this.ctx.beginPath();
             this.ctx.moveTo(launcher.x, launcher.y); // Start at actual launcher pos
             this.ctx.lineTo(cX + shakeX, tipY);

             if (isMatch) {
                 this.ctx.strokeStyle = COLORS[c.colorIdx].hex;
                 this.ctx.globalAlpha = 0.6;
                 this.ctx.lineWidth = 2;
             } else {
                 this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                 this.ctx.lineWidth = 1;
             }
             this.ctx.stroke();
             this.ctx.restore();
        });

        this.ctx.restore();
    }

    drawCursor(gameState, launcher, colorOverride = null) {
        if(!gameState.active || !launcher) return;

        // Draw Actual Launcher Entity (Visual Position)
        this.ctx.save();
        this.ctx.translate(launcher.x, launcher.y);
        this.ctx.rotate(launcher.tilt);
        this.ctx.scale(launcher.scaleX, launcher.scaleY);

        this.ctx.translate(0, launcher.recoil);

        // Setup Colors
        let mainColor = '#fff';
        let wingColor = '#0ff';
        let glowColor = '#0ff';
        let shadowBlur = 15;

        if (colorOverride === 'red') {
            mainColor = 'rgba(255, 0, 0, 0.7)';
            wingColor = 'rgba(255, 0, 0, 0.7)';
            glowColor = 'red';
            shadowBlur = 10;
        } else if (colorOverride === 'blue') {
            mainColor = 'rgba(0, 255, 255, 0.7)';
            wingColor = 'rgba(0, 255, 255, 0.7)';
            glowColor = 'cyan';
            shadowBlur = 10;
        }

        // Draw Juicy Launcher Shape (Triangle/Arrow)
        this.ctx.fillStyle = mainColor;
        this.ctx.shadowBlur = shadowBlur;
        this.ctx.shadowColor = glowColor;

        this.ctx.beginPath();
        // Central hub
        this.ctx.arc(0, 0, 10, 0, Math.PI*2);
        this.ctx.fill();

        // Wings/Pointers
        this.ctx.beginPath();
        this.ctx.moveTo(0, -15);
        this.ctx.lineTo(8, 5);
        this.ctx.lineTo(0, 0);
        this.ctx.lineTo(-8, 5);
        this.ctx.closePath();
        this.ctx.fillStyle = wingColor;
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.moveTo(0, 15);
        this.ctx.lineTo(8, -5);
        this.ctx.lineTo(0, 0);
        this.ctx.lineTo(-8, -5);
        this.ctx.closePath();
        this.ctx.fillStyle = wingColor;
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
        this.ctx.restore();
    }

    drawSpore(s) {
        const col = COLORS[s.colorIdx];

        // Elastic Spawn Animation
        // Determine "visual" radius vs logical radius
        // Logical radius is s.radius
        // We want a bounce effect.
        // Assume spore expands linearly in logic.
        // We add a wobble based on time.

        const time = Date.now() / 100;
        const wobble = Math.sin(time * 20) * 2; // High frequency wobble

        // Elastic spawn scale
        let scale = 1.0;
        if (s.spawnTime) {
            const age = (Date.now() - s.spawnTime) / 500; // 0.5s duration
            if (age < 1.0) {
                // Elastic ease out
                const c4 = (2 * Math.PI) / 3;
                scale = age === 0 ? 0 : age === 1 ? 1 : Math.pow(2, -10 * age) * Math.sin((age * 10 - 0.75) * c4) + 1;
            }
        }

        const visualRadius = (s.radius + wobble) * scale;

        // Glow
        this.ctx.shadowBlur = 30;
        this.ctx.shadowColor = col.hex;

        // Main body
        const grad = this.ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, visualRadius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, col.hex);
        grad.addColorStop(1, 'transparent');

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, visualRadius, 0, Math.PI*2);
        this.ctx.fill();

        // Core
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, visualRadius * 0.4, 0, Math.PI*2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
    }

    drawShockwave(sw) {
        this.ctx.save();
        this.ctx.globalAlpha = Math.max(0, sw.life);

        // JUICE: Fancy Shockwave with composite effect
        this.ctx.globalCompositeOperation = 'lighter';
        this.ctx.lineWidth = sw.width;
        this.ctx.strokeStyle = sw.color;

        // Outer ring
        this.ctx.beginPath();
        this.ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        this.ctx.stroke();

        // Inner Echo ring (Juice!)
        if (sw.life > 0.5) {
             this.ctx.lineWidth = sw.width * 0.5;
             this.ctx.globalAlpha = Math.max(0, sw.life * 0.5);
             this.ctx.beginPath();
             this.ctx.arc(sw.x, sw.y, sw.radius * 0.7, 0, Math.PI * 2);
             this.ctx.stroke();
        }

        this.ctx.restore();
    }

    drawParticle(p) {
        const alpha = p.life / p.maxLife; // Normalize alpha
        this.ctx.globalAlpha = alpha;

        this.ctx.save();
        this.ctx.translate(p.x, p.y);

        // 3D Rotation Simulation
        // Rotate in 2D
        this.ctx.rotate(p.rotation);
        // Scale to simulate 3D rotation
        const scaleX = Math.cos(p.angleX);
        const scaleY = Math.cos(p.angleY);
        this.ctx.scale(scaleX, scaleY);

        // Draw shard shape instead of circle
        this.ctx.fillStyle = p.color;
        this.ctx.shadowBlur = 10 * alpha;
        this.ctx.shadowColor = p.color;

        // Glint effect if facing camera
        if (Math.abs(scaleX) > 0.9 && Math.abs(scaleY) > 0.9) {
            this.ctx.fillStyle = '#fff';
            this.ctx.shadowBlur = 20 * alpha;
        }

        if ((p.type === 'debris' || p.type === 'shard' || p.type === 'chunk') && p.polyPoints) {
            this.ctx.beginPath();
            const s = p.size * alpha; // Scale size, not points directly to keep shape relative
            // Actually points were calculated with initial size.
            // But we want to shrink them over time.
            const shrink = alpha;

            // Note: polyPoints are relative to (0,0)
            if (p.polyPoints.length > 0) {
                this.ctx.moveTo(p.polyPoints[0].x * shrink, p.polyPoints[0].y * shrink);
                for(let i=1; i<p.polyPoints.length; i++) {
                    this.ctx.lineTo(p.polyPoints[i].x * shrink, p.polyPoints[i].y * shrink);
                }
            }
            this.ctx.closePath();

            // Add a stroke to make it look like a rock/crystal chunk
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
            this.ctx.lineWidth = p.type === 'chunk' ? 2 : 1;
            this.ctx.stroke();
            this.ctx.fill();

        } else {
            this.ctx.beginPath();
            const s = p.size * alpha; // Scale down with life
            // Make it a diamond/shard shape
            this.ctx.moveTo(0, -s);
            this.ctx.lineTo(s * 0.6, 0);
            this.ctx.lineTo(0, s);
            this.ctx.lineTo(-s * 0.6, 0);
            this.ctx.closePath();
            this.ctx.fill();
        }

        this.ctx.restore();

        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = 1.0;
    }

    drawTrailParticle(p) {
        this.ctx.globalAlpha = p.life;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.globalAlpha = 1.0;
    }

    drawSoulParticle(sp) {
        this.ctx.save();
        this.ctx.translate(sp.x, sp.y);

        this.ctx.fillStyle = sp.color;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = sp.color;

        // Glowing Orb
        this.ctx.beginPath();
        this.ctx.arc(0, 0, sp.size, 0, Math.PI * 2);
        this.ctx.fill();

        // Inner white core
        this.ctx.fillStyle = '#fff';
        this.ctx.beginPath();
        this.ctx.arc(0, 0, sp.size * 0.4, 0, Math.PI * 2);
        this.ctx.fill();

        this.ctx.restore();
    }

    drawFloatingText(ft) {
        this.ctx.save();
        this.ctx.translate(ft.x, ft.y);
        this.ctx.scale(ft.scale, ft.scale);

        // Outline
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 3;
        this.ctx.lineJoin = 'round';
        this.ctx.globalAlpha = ft.life;

        // Text style
        this.ctx.font = 'bold 24px Arial, sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Draw stroke and fill
        this.ctx.strokeText(ft.text, 0, 0);
        this.ctx.fillStyle = ft.color;
        this.ctx.fillText(ft.text, 0, 0);

        this.ctx.restore();
    }

    drawComplexCrystal(c, colorOverride = null) {
        // JUICE: Apply stress shake to position
        const shakeX = c.shakeX || 0;
        const shakeY = c.shakeY || 0;
        const xCenter = (c.lane * this.laneWidth) + (this.laneWidth / 2) + shakeX;

        // Apply elastic scale (Juice!)
        const width = this.laneWidth * 0.8 * (c.scaleX || 1.0);
        const heightScale = c.scaleY || 1.0;

        const col = COLORS[c.colorIdx];
        const seed = c.shapeSeed;

        let fillColor = col.hex;
        let strokeColor = 'rgba(255,255,255,0.8)';

        if (colorOverride === 'red') {
            fillColor = 'rgba(255, 0, 0, 0.7)';
            strokeColor = 'rgba(255, 0, 0, 0.7)';
        } else if (colorOverride === 'blue') {
            fillColor = 'rgba(0, 255, 255, 0.7)';
            strokeColor = 'rgba(0, 255, 255, 0.7)';
        }

        // JUICE: Critical Danger Glow
        if (c.isCritical && !colorOverride) {
            const pulse = Math.sin(Date.now() / 100) * 0.5 + 0.5;
            this.ctx.shadowBlur = 20 + (pulse * 30);
            this.ctx.shadowColor = 'red';
            // Tint fill slightly red
            strokeColor = `rgba(255, 50, 50, ${0.8 + pulse * 0.2})`;
            // Aggressive visual override
            fillColor = `rgba(255, ${Math.floor(pulse * 50)}, ${Math.floor(pulse * 50)}, 0.9)`;
        } else if (c.flash > 0 && !colorOverride) {
            // Enhanced glow effect for flash
            this.ctx.shadowBlur = 50 * c.flash;
            this.ctx.shadowColor = 'white';
            this.ctx.fillStyle = '#fff';
            this.ctx.strokeStyle = '#fff';
        } else if (!colorOverride) {
            this.ctx.shadowBlur = 35;
            this.ctx.shadowColor = col.glow;
            this.ctx.strokeStyle = strokeColor;
        } else {
             this.ctx.strokeStyle = strokeColor;
        }

        const baseLineWidth = 2;
        this.ctx.lineWidth = baseLineWidth;
        this.ctx.lineJoin = 'miter';

        const drawShard = (offsetX, hScale, wScale, tilt, facetStyle = 'standard') => {
            // Apply height scale to the crystal height
            const h = c.height * hScale * heightScale;
            const w = width * wScale;
            const halfW = w / 2;
            const baseY = ((c.type === 'top') ? 0 : this.height) + shakeY;
            const tipY = ((c.type === 'top') ? h : this.height - h) + shakeY;
            const cx = xCenter + offsetX;

            if (!colorOverride) {
                // Enhanced gradient with more depth
                const grad = this.ctx.createLinearGradient(cx - halfW, baseY, cx + halfW, tipY);
                if (c.flash > 0) {
                     grad.addColorStop(0, '#fff');
                     grad.addColorStop(0.5, '#fff');
                     grad.addColorStop(1, '#fff');
                } else {
                     // More vibrant color gradient
                     grad.addColorStop(0, col.hex);
                     grad.addColorStop(0.4, col.hex);
                     grad.addColorStop(0.7, this.darkenColor(col.hex, 0.3));
                     grad.addColorStop(1, 'rgba(0,0,0,0.2)');
                }
                this.ctx.fillStyle = grad;
            } else {
                this.ctx.fillStyle = fillColor;
            }

            // Draw main crystal shape with more facets
            this.ctx.beginPath();

            if (facetStyle === 'multifacet') {
                // Create a more complex, multi-faceted shape
                const segments = 5;
                const angleVariation = tilt / segments;
                
                if (c.type === 'top') {
                    this.ctx.moveTo(cx - halfW, baseY);
                    for (let i = 1; i < segments; i++) {
                        const progress = i / segments;
                        const yPos = baseY + (tipY - baseY) * progress;
                        const xOffset = Math.sin(progress * Math.PI) * angleVariation;
                        this.ctx.lineTo(cx + xOffset + tilt * progress, yPos);
                    }
                    this.ctx.lineTo(cx + tilt, tipY);
                    for (let i = segments - 1; i > 0; i--) {
                        const progress = i / segments;
                        const yPos = baseY + (tipY - baseY) * progress;
                        const xOffset = -Math.sin(progress * Math.PI) * angleVariation;
                        this.ctx.lineTo(cx + xOffset + tilt * progress, yPos);
                    }
                    this.ctx.lineTo(cx + halfW, baseY);
                } else {
                    this.ctx.moveTo(cx - halfW, baseY);
                    for (let i = 1; i < segments; i++) {
                        const progress = i / segments;
                        const yPos = baseY - (baseY - tipY) * progress;
                        const xOffset = Math.sin(progress * Math.PI) * angleVariation;
                        this.ctx.lineTo(cx + xOffset + tilt * progress, yPos);
                    }
                    this.ctx.lineTo(cx + tilt, tipY);
                    for (let i = segments - 1; i > 0; i--) {
                        const progress = i / segments;
                        const yPos = baseY - (baseY - tipY) * progress;
                        const xOffset = -Math.sin(progress * Math.PI) * angleVariation;
                        this.ctx.lineTo(cx + xOffset + tilt * progress, yPos);
                    }
                    this.ctx.lineTo(cx + halfW, baseY);
                }
            } else {
                // Standard triangular shape
                if (c.type === 'top') {
                    this.ctx.moveTo(cx - halfW, baseY);
                    this.ctx.lineTo(cx + tilt, tipY);
                    this.ctx.lineTo(cx + halfW, baseY);
                } else {
                    this.ctx.moveTo(cx - halfW, baseY);
                    this.ctx.lineTo(cx + tilt, tipY);
                    this.ctx.lineTo(cx + halfW, baseY);
                }
            }

            this.ctx.fill();
            this.ctx.stroke();

            // Enhanced internal facets with multiple layers
            if (!colorOverride && c.flash < 0.5) {
                // Primary highlight facet
                this.ctx.fillStyle = 'rgba(255,255,255,0.3)';
                this.ctx.beginPath();
                this.ctx.moveTo(cx - halfW*0.6, baseY);
                if (c.type === 'top') {
                    this.ctx.lineTo(cx + tilt*0.3, tipY * 0.6);
                } else {
                    this.ctx.lineTo(cx + tilt*0.3, this.height - ((this.height-tipY)*0.6));
                }
                this.ctx.lineTo(cx + halfW*0.2, baseY);
                this.ctx.fill();

                // Secondary highlight for crystalline effect
                this.ctx.fillStyle = 'rgba(255,255,255,0.15)';
                this.ctx.beginPath();
                this.ctx.moveTo(cx + halfW*0.2, baseY);
                if (c.type === 'top') {
                    this.ctx.lineTo(cx + tilt*0.7, tipY * 0.75);
                } else {
                    this.ctx.lineTo(cx + tilt*0.7, this.height - ((this.height-tipY)*0.75));
                }
                this.ctx.lineTo(cx + halfW*0.6, baseY);
                this.ctx.fill();

                // Internal crystalline structure lines
                this.ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                const midY = c.type === 'top' ? tipY * 0.5 : this.height - ((this.height-tipY)*0.5);
                this.ctx.moveTo(cx - halfW*0.3, baseY);
                this.ctx.lineTo(cx + tilt*0.5, midY);
                this.ctx.lineTo(cx + halfW*0.3, baseY);
                this.ctx.stroke();
                this.ctx.lineWidth = baseLineWidth;
            }
        };

        // More strategic and varied shard arrangement based on seed
        const shardConfigs = [
            // Configuration 1: Symmetric cluster
            { condition: seed < 0.2, shards: [
                { offsetX: -width * 0.4, hScale: 0.65, wScale: 0.35, tilt: -8, facetStyle: 'standard' },
                { offsetX: width * 0.4, hScale: 0.65, wScale: 0.35, tilt: 8, facetStyle: 'standard' },
                { offsetX: 0, hScale: 1.0, wScale: 0.65, tilt: 0, facetStyle: 'multifacet' }
            ]},
            // Configuration 2: Asymmetric left-heavy
            { condition: seed >= 0.2 && seed < 0.4, shards: [
                { offsetX: -width * 0.45, hScale: 0.75, wScale: 0.4, tilt: -12, facetStyle: 'multifacet' },
                { offsetX: -width * 0.15, hScale: 0.55, wScale: 0.3, tilt: -5, facetStyle: 'standard' },
                { offsetX: width * 0.25, hScale: 0.5, wScale: 0.3, tilt: 6, facetStyle: 'standard' },
                { offsetX: 0, hScale: 1.0, wScale: 0.6, tilt: -3, facetStyle: 'multifacet' }
            ]},
            // Configuration 3: Asymmetric right-heavy
            { condition: seed >= 0.4 && seed < 0.6, shards: [
                { offsetX: -width * 0.25, hScale: 0.5, wScale: 0.3, tilt: -6, facetStyle: 'standard' },
                { offsetX: width * 0.15, hScale: 0.55, wScale: 0.3, tilt: 5, facetStyle: 'standard' },
                { offsetX: width * 0.45, hScale: 0.75, wScale: 0.4, tilt: 12, facetStyle: 'multifacet' },
                { offsetX: 0, hScale: 1.0, wScale: 0.6, tilt: 3, facetStyle: 'multifacet' }
            ]},
            // Configuration 4: Triple spire
            { condition: seed >= 0.6 && seed < 0.8, shards: [
                { offsetX: -width * 0.35, hScale: 0.8, wScale: 0.38, tilt: -7, facetStyle: 'multifacet' },
                { offsetX: 0, hScale: 1.0, wScale: 0.55, tilt: 0, facetStyle: 'multifacet' },
                { offsetX: width * 0.35, hScale: 0.8, wScale: 0.38, tilt: 7, facetStyle: 'multifacet' }
            ]},
            // Configuration 5: Dense cluster
            { condition: seed >= 0.8, shards: [
                { offsetX: -width * 0.4, hScale: 0.6, wScale: 0.35, tilt: -10, facetStyle: 'standard' },
                { offsetX: -width * 0.15, hScale: 0.7, wScale: 0.3, tilt: -4, facetStyle: 'standard' },
                { offsetX: width * 0.15, hScale: 0.7, wScale: 0.3, tilt: 4, facetStyle: 'standard' },
                { offsetX: width * 0.4, hScale: 0.6, wScale: 0.35, tilt: 10, facetStyle: 'standard' },
                { offsetX: 0, hScale: 1.0, wScale: 0.6, tilt: 0, facetStyle: 'multifacet' }
            ]}
        ];

        // Find and render the appropriate configuration
        const config = shardConfigs.find(cfg => cfg.condition) || shardConfigs[0]; // Fallback to first config
        config.shards.forEach(shard => {
            drawShard(shard.offsetX, shard.hScale, shard.wScale, shard.tilt, shard.facetStyle);
        });

        this.ctx.shadowBlur = 0;
    }

    darkenColor(hex, amount) {
        // Helper to darken a hex color
        const rgb = this.hexToRgb(hex);
        if (!rgb) return hex;
        const r = Math.max(0, Math.floor(rgb.r * (1 - amount)));
        const g = Math.max(0, Math.floor(rgb.g * (1 - amount)));
        const b = Math.max(0, Math.floor(rgb.b * (1 - amount)));
        return `rgb(${r},${g},${b})`;
    }

    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    calculateShockwaveDistortion(x, y, gameState) {
        let dx = 0;
        let dy = 0;

        if (!gameState.shockwaves) return { x: 0, y: 0 };

        gameState.shockwaves.forEach(sw => {
            // Only affect if shockwave is strong/active
            if (sw.life <= 0) return;

            const distX = x - sw.x;
            const distY = y - sw.y;
            const dist = Math.sqrt(distX * distX + distY * distY);

            // Check if point is near the shockwave ring
            // The ring expands. We distort things near the radius.
            // Width of distortion band:
            const bandWidth = 50;
            const delta = dist - sw.radius;

            if (Math.abs(delta) < bandWidth) {
                // We are inside the distortion band
                // Normalized position in band (-1 to 1)
                const t = delta / bandWidth;

                // Distortion curve: simple sine hump
                // At t=0 (on the ring), distortion is max.
                // At t=1 or -1, distortion is 0.
                const strength = Math.cos(t * Math.PI / 2);

                // Displacement force
                // Push AWAY from center
                const force = 15.0 * strength * sw.life; // Scale by life

                if (dist > 0) {
                    dx += (distX / dist) * force;
                    dy += (distY / dist) * force;
                }
            }
        });

        return { x: dx, y: dy };
    }
}
