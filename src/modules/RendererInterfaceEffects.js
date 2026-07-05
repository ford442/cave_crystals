import { COLORS, GAME_CONFIG, PARTICLE_LOD, shouldDrawParticleWithStride } from './RendererConstants.js';

export function installRendererInterfaceEffects(Renderer) {
    Object.assign(Renderer.prototype, {
        drawHoloGrid(gameState, launcher, profile, timestamp) {
            // JUICE: Dynamic Holographic Grid
            const particleCount = gameState.particles ? gameState.particles.length : 0;
            const gridSize = particleCount > 30 ? profile.gridBase + 20 : profile.gridBase; // Coarser grid during chaos
            const time = timestamp;
            const pulse = Math.sin(time / 1000) * 0.5 + 0.5; // Slow heartbeat pulse
        
            // Setup base grid style
            this.ctx.lineWidth = 1;
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        
            // Active Lane Glow
            const activeLane = launcher ? launcher.targetLane : -1;
            const activeX = (activeLane * this.laneWidth) + (this.laneWidth / 2);
        
            // Skip expensive distortion when under load, during chaos, or when no shockwaves are active
            const frameMs = gameState.perfMetrics?.smoothedFrameMs ?? 16.7;
            const hasActiveShockwaves = profile.allowGridDistortion
                && particleCount <= 40
                && frameMs < 21
                && gameState.shockwaves
                && gameState.shockwaves.some(sw => sw.life > 0)
                && this._distortionField
                && this._distortionField.gridReady;
        
            // Precompute breathe constants
            const cx = this.width / 2;
            const cy = this.height / 2;
            const breatheScale = 0.01 * pulse;
            const prevLineWidth = this.ctx.lineWidth;
            const prevStrokeStyle = this.ctx.strokeStyle;
            const prevShadowBlur = this.ctx.shadowBlur;
            const prevShadowColor = this.ctx.shadowColor;
        
            // Horizontal Lines
            for (let y = 0; y <= this.height; y += gridSize) {
                 this.ctx.beginPath();
                 let start = true;
                 for (let x = 0; x <= this.width; x += gridSize) {
                     let distX = 0, distY = 0;
                     if (hasActiveShockwaves) {
                         const dist = this.getGridShockwaveDistortion(x, y);
                         distX = dist.x;
                         distY = dist.y;
                     }
        
                     const breatheX = (x - cx) * breatheScale;
                     const breatheY = (y - cy) * breatheScale;
        
                     const finalX = x + distX + breatheX;
                     const finalY = y + distY + breatheY;
        
                     if (start) {
                         this.ctx.moveTo(finalX, finalY);
                         start = false;
                     } else {
                         this.ctx.lineTo(finalX, finalY);
                     }
                 }
                 this.ctx.stroke();
            }
        
            // Vertical Lines
            for (let x = 0; x <= this.width; x += gridSize) {
                 const distToActive = Math.abs(x - activeX);
                 let isNearActive = false;
                 if (activeLane >= 0 && distToActive < this.laneWidth / 2) {
                     isNearActive = true;
                 }
        
                 if (isNearActive) {
                     this.ctx.strokeStyle = `rgba(0, 255, 255, ${0.1 + (pulse * 0.1)})`; // Cyan glow
                     this.ctx.lineWidth = 2;
                     this.ctx.shadowColor = 'cyan';
                     this.ctx.shadowBlur = 5;
                 } else {
                     this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                     this.ctx.lineWidth = 1;
                     this.ctx.shadowBlur = 0;
                 }
        
                 this.ctx.beginPath();
                 let start = true;
                 for (let y = 0; y <= this.height; y += gridSize) {
                     let distX = 0, distY = 0;
                     if (hasActiveShockwaves) {
                         const dist = this.getGridShockwaveDistortion(x, y);
                         distX = dist.x;
                         distY = dist.y;
                     }
        
                     const breatheX = (x - cx) * breatheScale;
                     const breatheY = (y - cy) * breatheScale;
        
                     const finalX = x + distX + breatheX;
                     const finalY = y + distY + breatheY;
        
                     if (start) {
                         this.ctx.moveTo(finalX, finalY);
                         start = false;
                     } else {
                         this.ctx.lineTo(finalX, finalY);
                     }
                 }
                 this.ctx.stroke();
            }
        
            this.ctx.lineWidth = prevLineWidth;
            this.ctx.strokeStyle = prevStrokeStyle;
            this.ctx.shadowBlur = prevShadowBlur;
            this.ctx.shadowColor = prevShadowColor;
        }
        ,
        drawTargetingSystem(gameState, launcher, timestamp) {
            if (!gameState.active || !launcher) return;
        
            const targetLane = launcher.targetLane;
            const targetLaneX = (targetLane * this.laneWidth) + (this.laneWidth / 2);
        
            // Find target crystals (inline to avoid array allocation)
            const targets = [];
            for (let i = 0; i < gameState.crystals.length; i++) {
                if (gameState.crystals[i].lane === targetLane) {
                    targets.push(gameState.crystals[i]);
                }
            }
            const nextColorIdx = gameState.nextSporeColorIdx;
            const time = timestamp;
        
            // Draw Laser Sight
            // Determine "Lock Status" based on if any crystal matches
            const hasMatch = targets.some(c => c.colorIdx === nextColorIdx);
        
            const prevLineWidth = this.ctx.lineWidth;
            const prevStrokeStyle = this.ctx.strokeStyle;
            const prevShadowBlur = this.ctx.shadowBlur;
            const prevShadowColor = this.ctx.shadowColor;
            const prevGlobalAlpha = this.ctx.globalAlpha;
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
        
                 this.ctx.setTransform(1, 0, 0, 1, cX + shakeX, tipY);
        
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
        
                 this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        
                 // Connecting Line from Launcher to Target Tip
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
            });
        
            this.ctx.lineWidth = prevLineWidth;
            this.ctx.strokeStyle = prevStrokeStyle;
            this.ctx.shadowBlur = prevShadowBlur;
            this.ctx.shadowColor = prevShadowColor;
            this.ctx.globalAlpha = prevGlobalAlpha;
        }
        ,
        drawCursor(gameState, launcher, colorOverride = null) {
            if(!gameState.active || !launcher) return;
        
            // Draw Actual Launcher Entity (Visual Position)
            this.ctx.save();
            this.ctx.translate(launcher.x, launcher.y);
            this.ctx.rotate(launcher.tilt);
        
            // JUICE: Velocity-based Squash & Stretch
            // Stretch in X (direction of movement), Squash in Y
            // launcher.scaleX/Y handles the firing recoil squash
            const speedSquash = Math.min(0.3, (launcher.speed || 0) * 0.02);
            const sx = launcher.scaleX + speedSquash;
            const sy = launcher.scaleY - (speedSquash * 0.5);
            this.ctx.scale(sx, sy);
        
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
        
            // Wings/Pointers with flutter offset
            const wingPhase = launcher.wingPhase || 0;
            const wingFlutter = Math.sin(wingPhase) * 2.5;
        
            this.ctx.beginPath();
            this.ctx.moveTo(0, -15);
            this.ctx.lineTo(8 + wingFlutter, 5);
            this.ctx.lineTo(0, 0);
            this.ctx.lineTo(-8 - wingFlutter, 5);
            this.ctx.closePath();
            this.ctx.fillStyle = wingColor;
            this.ctx.fill();
        
            this.ctx.beginPath();
            this.ctx.moveTo(0, 15);
            this.ctx.lineTo(8 + wingFlutter, -5);
            this.ctx.lineTo(0, 0);
            this.ctx.lineTo(-8 - wingFlutter, -5);
            this.ctx.closePath();
            this.ctx.fillStyle = wingColor;
            this.ctx.fill();
        
            // Secondary motion: antenna elements that respond to speed/firing
            const antennaOffset = launcher.antennaOffset || 0;
            if (antennaOffset > 0.5) {
                const antennaAlpha = Math.min(1.0, antennaOffset / 6);
                this.ctx.globalAlpha = antennaAlpha * 0.7;
                this.ctx.strokeStyle = wingColor;
                this.ctx.lineWidth = 1.5;
                this.ctx.shadowBlur = 8;
        
                // Left antenna
                this.ctx.beginPath();
                this.ctx.moveTo(-6, -8);
                this.ctx.lineTo(-10 - antennaOffset, -16 - antennaOffset * 0.8);
                this.ctx.stroke();
                // Right antenna
                this.ctx.beginPath();
                this.ctx.moveTo(6, -8);
                this.ctx.lineTo(10 + antennaOffset, -16 - antennaOffset * 0.8);
                this.ctx.stroke();
        
                this.ctx.globalAlpha = 1.0;
            }
        
            this.ctx.shadowBlur = 0;
            this.ctx.restore();
        }
        ,
        drawSpore(s, timestamp) {
            const col = COLORS[s.colorIdx];
            const time = timestamp;
        
            // Elastic spawn scale — with slight overshoot for extra juiciness
            let scale = 1.0;
            if (s.spawnTime) {
                const age = (time - s.spawnTime) / 450; // 450ms: snappier than 500ms default
                if (age < 1.0) {
                    // Elastic ease out with amplified period (2.8 vs 3.0) for wider overshoot
                    const c4 = (2 * Math.PI) / 2.8;
                    scale = age === 0 ? 0 : age === 1 ? 1 : Math.pow(2, -9 * age) * Math.sin((age * 10 - 0.75) * c4) + 1;
                    scale = Math.max(0, scale);
                }
            }
        
            // In-flight energy wobble — sinusoidal scale pulse while traveling
            // 0.35: wobble frequency (≈ 2 cycles per second at 60fps), 0.06: ±6% size pulse
            const inFlightAge = s.inFlightAge || 0;
            const wobbleScale = 1.0 + Math.sin(inFlightAge * 0.35 + (s.wobblePhase || 0)) * 0.06;
            const baseRadius = s.radius * scale * wobbleScale;
        
            this.ctx.save();
            this.ctx.translate(s.x, s.y);
        
            // JUICE: Plasma Core - Rotating Star
            const spin = time / 200;
            this.ctx.rotate(spin);
        
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = col.hex;
            this.ctx.fillStyle = '#fff';
        
            // Draw Core (4-pointed Star shape)
            const coreSize = baseRadius * 0.8;
            const innerSize = coreSize * 0.3;
            const spikes = 4;
        
            this.ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const r = (i % 2 === 0) ? coreSize : innerSize;
                const a = (i * Math.PI) / spikes;
                this.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            this.ctx.closePath();
            this.ctx.fill();
        
            // Secondary energy ripple layer — counter-rotating 4-point star at reduced opacity
            const rippleScale = 1.0 + Math.sin(inFlightAge * 0.25 + (s.wobblePhase || 0) + Math.PI) * 0.12;
            const rippleSize = baseRadius * 0.55 * rippleScale;
            this.ctx.globalAlpha = 0.45;
            this.ctx.beginPath();
            for (let i = 0; i < spikes * 2; i++) {
                const r = (i % 2 === 0) ? rippleSize : rippleSize * 0.35;
                const a = (i * Math.PI) / spikes;
                this.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            this.ctx.closePath();
            this.ctx.fill();
            this.ctx.globalAlpha = 1.0;
        
            // Outer Glow/Halo
            // Rotate opposite for halo
            this.ctx.rotate(-spin * 2);
            // Cache spore halo gradient by color
            const sporeGradKey = `spore-${col.hex}`;
            let sporeGrad = this._gradientCache.get(sporeGradKey);
            if (!sporeGrad) {
                sporeGrad = this.ctx.createRadialGradient(0, 0, 0.5, 0, 0, 1.8);
                sporeGrad.addColorStop(0, '#fff');
                sporeGrad.addColorStop(0.2, col.hex);
                sporeGrad.addColorStop(1, 'transparent');
                this._gradientCache.set(sporeGradKey, sporeGrad);
            }
            this.ctx.fillStyle = sporeGrad;
            this.ctx.beginPath();
            this.ctx.arc(0, 0, baseRadius * 2.0, 0, Math.PI * 2);
            this.ctx.fill();
        
            // JUICE: Lightning Arcs
            // Use pre-generated arcs from spore (no Math.random in draw loop)
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            this.ctx.lineCap = 'round';
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#fff';
        
            for (let i = 0; i < s.lightningArcs.length; i++) {
                const arc = s.lightningArcs[i];
                const len = baseRadius * arc.lenRatio;
        
                this.ctx.save();
                this.ctx.rotate(arc.angle);
                this.ctx.beginPath();
                this.ctx.moveTo(0, 0);
        
                // Jagged line using pre-generated offsets
                let r = baseRadius * 0.5;
                const step = len / 4;
                for (let j = 0; j < arc.jaggedOffsets.length && r < len; j++) {
                    r += step;
                    const offset = arc.jaggedOffsets[j] * (baseRadius * 0.8);
                    this.ctx.lineTo(r, offset);
                }
                this.ctx.stroke();
                this.ctx.restore();
            }
        
            this.ctx.restore();
            this.ctx.shadowBlur = 0;
        }
        ,
        drawShockwave(sw) {
            const prevAlpha = this.ctx.globalAlpha;
            const prevComposite = this.ctx.globalCompositeOperation;
            const prevLineWidth = this.ctx.lineWidth;
            const prevStrokeStyle = this.ctx.strokeStyle;
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
        
            this.ctx.globalAlpha = prevAlpha;
            this.ctx.globalCompositeOperation = prevComposite;
            this.ctx.lineWidth = prevLineWidth;
            this.ctx.strokeStyle = prevStrokeStyle;
        }
        ,
        drawEnergyRing(ring) {
            const prevAlpha = this.ctx.globalAlpha;
            const prevComposite = this.ctx.globalCompositeOperation;
            const prevLineWidth = this.ctx.lineWidth;
            const prevStrokeStyle = this.ctx.strokeStyle;
            const prevShadowBlur = this.ctx.shadowBlur;
            const prevShadowColor = this.ctx.shadowColor;
        
            const alpha = Math.max(0, ring.life);
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.shadowColor = ring.color;
            this.ctx.shadowBlur = ring.isFlash ? 18 : 12;
        
            this.ctx.globalAlpha = alpha * (ring.isFlash ? 0.95 : 0.85);
            this.ctx.lineWidth = ring.width;
            this.ctx.strokeStyle = ring.color;
            this.ctx.beginPath();
            this.ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
            this.ctx.stroke();
        
            if (!ring.isFlash && ring.comboLevel > 1 && ring.life > 0.25) {
                this.ctx.globalAlpha = alpha * 0.35;
                this.ctx.lineWidth = ring.width * 0.5;
                this.ctx.beginPath();
                this.ctx.arc(ring.x, ring.y, ring.radius * 0.55, 0, Math.PI * 2);
                this.ctx.stroke();
            }
        
            this.ctx.globalAlpha = prevAlpha;
            this.ctx.globalCompositeOperation = prevComposite;
            this.ctx.lineWidth = prevLineWidth;
            this.ctx.strokeStyle = prevStrokeStyle;
            this.ctx.shadowBlur = prevShadowBlur;
            this.ctx.shadowColor = prevShadowColor;
        }
        ,
        drawParticle(p) {
            const alpha = p._drawAlpha !== undefined ? p._drawAlpha : (p.life / p.maxLife);
            const screenSize = p._screenSize !== undefined ? p._screenSize : (p.size * alpha);

            if (p.type === 'aura') {
                this._drawAuraParticle(p, alpha);
                return;
            }
            if (p.type === 'ember') {
                this._drawEmberParticle(p, alpha);
                return;
            }
            if (p.type === 'spark') {
                this._drawSparkParticle(p, alpha, screenSize);
                return;
            }
            if (p.type === 'shard') {
                this._drawShardParticle(p, alpha, screenSize);
                return;
            }
            if (p.type === 'debris') {
                this._drawDebrisParticle(p, alpha, screenSize);
                return;
            }
            if (p.type === 'chunk') {
                this._drawChunkParticle(p, alpha, screenSize);
                return;
            }
            this._drawPhysicalParticle(p, alpha, screenSize);
        }
        ,
        _drawAuraParticle(p, alpha) {
            const ctx = this.ctx;
            const glowAlpha = alpha * 0.55;
            ctx.globalAlpha = glowAlpha * 0.3;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = glowAlpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ,
        _drawEmberParticle(p, alpha) {
            const ctx = this.ctx;
            const heat = p.emberHeat !== undefined ? p.emberHeat : 0.7;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            const coreBright = heat > 0.65 ? '#ffffaa' : '#ff8844';
            ctx.fillStyle = coreBright;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (0.35 + heat * 0.15), 0, Math.PI * 2);
            ctx.fill();
            if (heat > 0.75 && alpha > 0.4) {
                ctx.globalAlpha = alpha * 0.45;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(p.x - p.size * 0.15, p.y - p.size * 0.15, p.size * 0.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ,
        _drawTrailParticle(p, alpha) {
            const ctx = this.ctx;
            if (p.isEnergy && alpha > 0.04) {
                const stretch = (p.wispStretch || 1.4) * (0.65 + alpha * 0.35);
                const pulse = 0.85 + 0.15 * Math.sin((p.glowPhase || 0) + alpha * 8);
                const r = p.size * stretch * pulse;
                ctx.globalAlpha = alpha * 0.4;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.ellipse(p.x, p.y, r * 0.42, r, p.rotation, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = alpha * 0.85;
                ctx.fillStyle = '#fff';
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(0.7, p.size * 0.22), 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ,
        _drawSparkParticle(p, alpha, screenSize) {
            const ctx = this.ctx;
            if (screenSize < PARTICLE_LOD.cheapSparkSize) {
                ctx.globalAlpha = alpha * 0.85;
                ctx.fillStyle = p.color;
                ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
                return;
            }
            ctx.globalAlpha = alpha;
            const scaleX = Math.cos(p.angleX);
            const scaleY = Math.cos(p.angleY);
            const c = Math.cos(p.rotation);
            const s = Math.sin(p.rotation);
            ctx.setTransform(c * scaleX, s * scaleX, -s * scaleY, c * scaleY, p.x, p.y);
            ctx.fillStyle = Math.abs(scaleX) > 0.9 && Math.abs(scaleY) > 0.9 ? '#fff' : p.color;
            const sz = screenSize;
            ctx.beginPath();
            ctx.moveTo(0, -sz);
            ctx.lineTo(sz * 0.6, 0);
            ctx.lineTo(0, sz);
            ctx.lineTo(-sz * 0.6, 0);
            ctx.closePath();
            ctx.fill();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ,
        _drawShardParticle(p, alpha, screenSize) {
            const ctx = this.ctx;
            if (screenSize < PARTICLE_LOD.cheapPhysicalSize) {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(1, screenSize * 0.5), 0, Math.PI * 2);
                ctx.fill();
                return;
            }
            ctx.globalAlpha = alpha;
            const scaleX = Math.cos(p.angleX);
            const scaleY = Math.cos(p.angleY);
            const c = Math.cos(p.rotation);
            const s = Math.sin(p.rotation);
            ctx.setTransform(c * scaleX, s * scaleX, -s * scaleY, c * scaleY, p.x, p.y);
            const facing = Math.abs(scaleX) > 0.85 && Math.abs(scaleY) > 0.85;
            ctx.fillStyle = facing ? '#fff' : p.color;
            if (p.polyPoints && p.polyPoints.length > 0) {
                const shrink = alpha;
                ctx.beginPath();
                ctx.moveTo(p.polyPoints[0].x * shrink, p.polyPoints[0].y * shrink);
                for (let i = 1; i < p.polyPoints.length; i++) {
                    ctx.lineTo(p.polyPoints[i].x * shrink, p.polyPoints[i].y * shrink);
                }
                ctx.closePath();
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 + alpha * 0.35})`;
                ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.fill();
                if (facing) {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(0, -screenSize * 0.85);
                    ctx.lineTo(0, screenSize * 0.5);
                    ctx.stroke();
                }
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ,
        _drawDebrisParticle(p, alpha, screenSize) {
            const ctx = this.ctx;
            if (screenSize < PARTICLE_LOD.cheapPhysicalSize) {
                ctx.globalAlpha = alpha * 0.9;
                ctx.fillStyle = '#666';
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(1, screenSize * 0.5), 0, Math.PI * 2);
                ctx.fill();
                return;
            }
            ctx.globalAlpha = alpha;
            const scaleX = Math.cos(p.angleX);
            const scaleY = Math.cos(p.angleY);
            const c = Math.cos(p.rotation);
            const s = Math.sin(p.rotation);
            ctx.setTransform(c * scaleX, s * scaleX, -s * scaleY, c * scaleY, p.x, p.y);
            ctx.fillStyle = p.color;
            if (p.polyPoints && p.polyPoints.length > 0) {
                const shrink = alpha;
                ctx.beginPath();
                ctx.moveTo(p.polyPoints[0].x * shrink, p.polyPoints[0].y * shrink);
                for (let i = 1; i < p.polyPoints.length; i++) {
                    ctx.lineTo(p.polyPoints[i].x * shrink, p.polyPoints[i].y * shrink);
                }
                ctx.closePath();
                ctx.strokeStyle = `rgba(40, 35, 30, ${0.5 + alpha * 0.3})`;
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fill();
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ,
        _drawChunkParticle(p, alpha, screenSize) {
            const ctx = this.ctx;
            if (screenSize < PARTICLE_LOD.cheapPhysicalSize) {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(1.5, screenSize * 0.6), 0, Math.PI * 2);
                ctx.fill();
                return;
            }
            ctx.globalAlpha = alpha;
            const scaleX = Math.cos(p.angleX);
            const scaleY = Math.cos(p.angleY);
            const c = Math.cos(p.rotation);
            const s = Math.sin(p.rotation);
            ctx.setTransform(c * scaleX, s * scaleX, -s * scaleY, c * scaleY, p.x, p.y);
            ctx.fillStyle = Math.abs(scaleX) > 0.9 && Math.abs(scaleY) > 0.9 ? '#ddd' : p.color;
            if (p.polyPoints && p.polyPoints.length > 0) {
                const shrink = alpha;
                ctx.beginPath();
                ctx.moveTo(p.polyPoints[0].x * shrink, p.polyPoints[0].y * shrink);
                for (let i = 1; i < p.polyPoints.length; i++) {
                    ctx.lineTo(p.polyPoints[i].x * shrink, p.polyPoints[i].y * shrink);
                }
                ctx.closePath();
                ctx.strokeStyle = 'rgba(20, 15, 10, 0.75)';
                ctx.lineWidth = 2.5;
                ctx.stroke();
                ctx.fill();
                ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
                ctx.fill();
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ,
        _drawPhysicalParticle(p, alpha, screenSize) {
            const ctx = this.ctx;
            if (screenSize < PARTICLE_LOD.cheapPhysicalSize) {
                ctx.globalAlpha = alpha;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, Math.max(1, screenSize * 0.5), 0, Math.PI * 2);
                ctx.fill();
                return;
            }
            ctx.globalAlpha = alpha;
            const scaleX = Math.cos(p.angleX);
            const scaleY = Math.cos(p.angleY);
            const c = Math.cos(p.rotation);
            const s = Math.sin(p.rotation);
            ctx.setTransform(c * scaleX, s * scaleX, -s * scaleY, c * scaleY, p.x, p.y);
            ctx.fillStyle = Math.abs(scaleX) > 0.9 && Math.abs(scaleY) > 0.9 ? '#fff' : p.color;

            if ((p.type === 'debris' || p.type === 'shard' || p.type === 'chunk') && p.polyPoints) {
                ctx.beginPath();
                const shrink = alpha;
                if (p.polyPoints.length > 0) {
                    ctx.moveTo(p.polyPoints[0].x * shrink, p.polyPoints[0].y * shrink);
                    for (let i = 1; i < p.polyPoints.length; i++) {
                        ctx.lineTo(p.polyPoints[i].x * shrink, p.polyPoints[i].y * shrink);
                    }
                }
                ctx.closePath();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                ctx.lineWidth = p.type === 'chunk' ? 2 : 1;
                ctx.stroke();
                ctx.fill();
            } else {
                ctx.beginPath();
                const sz = screenSize;
                ctx.moveTo(0, -sz);
                ctx.lineTo(sz * 0.6, 0);
                ctx.lineTo(0, sz);
                ctx.lineTo(-sz * 0.6, 0);
                ctx.closePath();
                ctx.fill();
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        }
        ,
        drawParticlesBatched(particles, particleLimit, stride, gameState) {
            const ctx = this.ctx;
            const trackMs = gameState && gameState.devPerfOverlay;
            const t0 = trackMs ? performance.now() : 0;
            const w = this.width;
            const h = this.height;

            const isOffscreen = (p, pad) => {
                if (p._onScreen === false) return true;
                if (p._onScreen !== undefined) return false;
                return p.x + pad < 0 || p.x - pad > w || p.y + pad < 0 || p.y - pad > h;
            };

            // Pass 1: trails — lighter composite, cheap rects for plain motes
            ctx.globalCompositeOperation = 'lighter';
            let trailFill = null;
            for (let i = 0; i < particleLimit; i++) {
                const p = particles[i];
                if (!p.isTrail) continue;
                if (!shouldDrawParticleWithStride(i, p, stride)) continue;
                const s = p.size;
                if (isOffscreen(p, s)) continue;
                const alpha = p._drawAlpha !== undefined ? p._drawAlpha : p.life;
                if (!p.isEnergy && s <= PARTICLE_LOD.cheapTrailSize) {
                    ctx.globalAlpha = alpha;
                    if (p.color !== trailFill) {
                        ctx.fillStyle = p.color;
                        trailFill = p.color;
                    }
                    const d = Math.max(1, s);
                    ctx.fillRect(p.x - d * 0.5, p.y - d * 0.5, d, d);
                } else {
                    this._drawTrailParticle(p, alpha);
                }
            }

            // Pass 2: aura glows
            for (let i = 0; i < particleLimit; i++) {
                const p = particles[i];
                if (p.isTrail || p.type !== 'aura') continue;
                if (!shouldDrawParticleWithStride(i, p, stride)) continue;
                if (isOffscreen(p, p.size * 3.5)) continue;
                const alpha = p._drawAlpha !== undefined ? p._drawAlpha : (p.life / p.maxLife);
                this._drawAuraParticle(p, alpha);
            }

            // Pass 3: embers
            for (let i = 0; i < particleLimit; i++) {
                const p = particles[i];
                if (p.isTrail || p.type !== 'ember') continue;
                if (!shouldDrawParticleWithStride(i, p, stride)) continue;
                if (isOffscreen(p, p.size)) continue;
                const alpha = p._drawAlpha !== undefined ? p._drawAlpha : (p.life / p.maxLife);
                this._drawEmberParticle(p, alpha);
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1.0;

            // Pass 4: physical debris/shards/chunks — priority types always drawn
            for (let i = 0; i < particleLimit; i++) {
                const p = particles[i];
                if (p.isTrail || p.type === 'aura' || p.type === 'ember' || p.type === 'spark') continue;
                if (!shouldDrawParticleWithStride(i, p, stride)) continue;
                const alpha = p._drawAlpha !== undefined ? p._drawAlpha : (p.life / p.maxLife);
                const screenSize = p._screenSize !== undefined ? p._screenSize : (p.size * alpha);
                if (isOffscreen(p, screenSize)) continue;
                if (p.type === 'shard') {
                    this._drawShardParticle(p, alpha, screenSize);
                } else if (p.type === 'debris') {
                    this._drawDebrisParticle(p, alpha, screenSize);
                } else if (p.type === 'chunk') {
                    this._drawChunkParticle(p, alpha, screenSize);
                } else {
                    this._drawPhysicalParticle(p, alpha, screenSize);
                }
            }

            // Pass 5: sparks — fillStyle cached for cheap pixel path
            let sparkFill = null;
            for (let i = 0; i < particleLimit; i++) {
                const p = particles[i];
                if (p.isTrail || p.type !== 'spark') continue;
                if (!shouldDrawParticleWithStride(i, p, stride)) continue;
                const alpha = p._drawAlpha !== undefined ? p._drawAlpha : (p.life / p.maxLife);
                const screenSize = p._screenSize !== undefined ? p._screenSize : (p.size * alpha);
                if (isOffscreen(p, screenSize)) continue;
                if (screenSize < PARTICLE_LOD.cheapSparkSize) {
                    ctx.globalAlpha = alpha * 0.85;
                    if (p.color !== sparkFill) {
                        ctx.fillStyle = p.color;
                        sparkFill = p.color;
                    }
                    ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
                } else {
                    this._drawSparkParticle(p, alpha, screenSize);
                }
            }

            ctx.globalAlpha = 1.0;
            ctx.globalCompositeOperation = 'source-over';

            if (trackMs && gameState.perfMetrics) {
                gameState.perfMetrics.particleDrawMs = performance.now() - t0;
            }
        }
        ,
        drawTrailParticle(p) {
            const alpha = p._drawAlpha !== undefined ? p._drawAlpha : p.life;
            this.ctx.globalCompositeOperation = 'lighter';
            this._drawTrailParticle(p, alpha);
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.globalAlpha = 1.0;
        }
        ,
        drawSoulParticle(sp) {
            // Outer glow halo using additive blending
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.globalAlpha = (sp.life || 1.0) * 0.25;
            this.ctx.fillStyle = sp.color;
            this.ctx.beginPath();
            this.ctx.arc(sp.x, sp.y, sp.size * 3, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalCompositeOperation = 'source-over';
        
            this.ctx.setTransform(1, 0, 0, 1, sp.x, sp.y);
        
            this.ctx.fillStyle = sp.color;
            this.ctx.globalAlpha = sp.life || 1.0;
        
            // Glowing Orb
            this.ctx.beginPath();
            this.ctx.arc(0, 0, sp.size, 0, Math.PI * 2);
            this.ctx.fill();
        
            // Inner white core
            this.ctx.fillStyle = '#fff';
            this.ctx.beginPath();
            this.ctx.arc(0, 0, sp.size * 0.4, 0, Math.PI * 2);
            this.ctx.fill();
        
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.globalAlpha = 1.0;
        }
        ,
        drawFloatingText(ft) {
            this.ctx.setTransform(1, 0, 0, 1, ft.x, ft.y);
            // Apply rotation for high-value combo texts
            if (ft.rotation) {
                this.ctx.rotate(ft.rotation);
            }
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
        
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.globalAlpha = 1.0;
        }
        ,
        drawDevMetricsOverlay(gameState, profile) {
            const m = gameState.perfMetrics;
            const overrides = gameState.adaptiveOverrides;
            const postFlags = [
                profile.bloom ? 'B' : '',
                profile.lightShafts ? 'S' : '',
                profile.postFX ? 'F' : '',
                profile.fog ? 'G' : ''
            ].filter(Boolean).join('+') || 'none';
            const lines = [
                'DEV PERF',
                `FPS ${Math.round(m.smoothedFps || m.fps || 0)} (${m.fps || 0} raw · ${(m.instantFps || 0).toFixed(0)} inst)`,
                `Frame ${(m.smoothedFrameMs || 0).toFixed(1)}ms (${(m.frameMs || 0).toFixed(1)} inst)`,
                `Particles ${m.particleCount}/${m.particleLimit} stride ${m.particleStride}`,
                `Trails ${m.trailCount || 0} · Spores ${m.sporeCount || 0}`,
                `Env ${m.envParticleCount}/${profile.maxEnvParticles || 0} · Rings ${m.energyRingCount || 0}`,
                `Shockwaves ${m.shockwaveCount}`,
                `Quality ${gameState.renderQuality.toUpperCase()} · ${gameState.qualityMode.toUpperCase()}`,
                `Post [${postFlags}] bloom×${((profile.bloomStrength || 0) * (overrides.effectScale || 1)).toFixed(2)}`,
                `timeScale ${(gameState.timeScale || 1).toFixed(2)} · critical ${(gameState.criticalIntensity || 0).toFixed(2)}`,
                `adapt stride+${(overrides.particleStrideBoost || 0).toFixed(1)} fx ${(overrides.effectScale || 1).toFixed(2)}`,
                `update ${(m.particleUpdateMs || 0).toFixed(2)}ms · draw ${(m.particleDrawMs || 0).toFixed(2)}ms`,
                `distort ${(m.distortionPrecomputeMs || 0).toFixed(2)}ms · cells ${m.distortionGridCells || 0}`,
                '[P] toggle · __toggleDevPerf__()'
            ];

            const pad = 8;
            const lineHeight = 13;
            const boxW = 268;
            const boxH = pad * 2 + lines.length * lineHeight;

            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
            this.ctx.fillRect(10, 10, boxW, boxH);
            this.ctx.strokeStyle = 'rgba(0, 255, 136, 0.55)';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(10.5, 10.5, boxW - 1, boxH - 1);

            this.ctx.font = '11px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'top';
            for (let i = 0; i < lines.length; i++) {
                this.ctx.fillStyle = i === 0 ? 'rgba(0, 255, 136, 0.95)' : 'rgba(200, 255, 220, 0.9)';
                this.ctx.fillText(lines[i], 18, 14 + i * lineHeight);
            }
            this.ctx.restore();
        }

    });
}
