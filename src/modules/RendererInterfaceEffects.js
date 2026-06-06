import { COLORS, GAME_CONFIG } from './RendererConstants.js';

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
        
            // Skip expensive distortion when there are too many particles (chaos mode)
            // or when no shockwaves are active
            const hasActiveShockwaves = profile.allowGridDistortion && particleCount <= 40 && gameState.shockwaves && gameState.shockwaves.some(sw => sw.life > 0);
        
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
                         const dist = this.calculateShockwaveDistortion(x, y, gameState);
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
                         const dist = this.calculateShockwaveDistortion(x, y, gameState);
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
            this.ctx.shadowBlur = 12;
        
            // Outer ring
            this.ctx.globalAlpha = alpha * 0.85;
            this.ctx.lineWidth = ring.width;
            this.ctx.strokeStyle = ring.color;
            this.ctx.beginPath();
            this.ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
            this.ctx.stroke();
        
            // Inner echo for combos > 1
            if (ring.comboLevel > 1 && ring.life > 0.25) {
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
            // Fast path for aura particles: soft additive glow circles
            if (p.type === 'aura') {
                const alpha = (p.life / p.maxLife) * 0.55;
                this.ctx.globalCompositeOperation = 'lighter';
                // Outer soft glow
                this.ctx.globalAlpha = alpha * 0.3;
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * 3.5, 0, Math.PI * 2);
                this.ctx.fill();
                // Bright core
                this.ctx.globalAlpha = alpha;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalCompositeOperation = 'source-over';
                this.ctx.globalAlpha = 1.0;
                return;
            }
        
            // Fast path for ember particles: bright tiny spark with white core
            if (p.type === 'ember') {
                const alpha = p.life / p.maxLife;
                this.ctx.globalAlpha = alpha;
                this.ctx.globalCompositeOperation = 'lighter';
                this.ctx.fillStyle = p.color;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.fillStyle = '#ffff88';
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalCompositeOperation = 'source-over';
                this.ctx.globalAlpha = 1.0;
                return;
            }
        
            const alpha = p.life / p.maxLife; // Normalize alpha
            this.ctx.globalAlpha = alpha;
        
            // 3D Rotation Simulation
            const scaleX = Math.cos(p.angleX);
            const scaleY = Math.cos(p.angleY);
            const c = Math.cos(p.rotation);
            const s = Math.sin(p.rotation);
            this.ctx.setTransform(c * scaleX, s * scaleX, -s * scaleY, c * scaleY, p.x, p.y);
        
            this.ctx.fillStyle = p.color;
        
            // Glint effect if facing camera
            if (Math.abs(scaleX) > 0.9 && Math.abs(scaleY) > 0.9) {
                this.ctx.fillStyle = '#fff';
            }
        
            if ((p.type === 'debris' || p.type === 'shard' || p.type === 'chunk') && p.polyPoints) {
                this.ctx.beginPath();
                const shrink = alpha;
        
                if (p.polyPoints.length > 0) {
                    this.ctx.moveTo(p.polyPoints[0].x * shrink, p.polyPoints[0].y * shrink);
                    for(let i=1; i<p.polyPoints.length; i++) {
                        this.ctx.lineTo(p.polyPoints[i].x * shrink, p.polyPoints[i].y * shrink);
                    }
                }
                this.ctx.closePath();
        
                this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
                this.ctx.lineWidth = p.type === 'chunk' ? 2 : 1;
                this.ctx.stroke();
                this.ctx.fill();
        
            } else {
                this.ctx.beginPath();
                const sz = p.size * alpha;
                this.ctx.moveTo(0, -sz);
                this.ctx.lineTo(sz * 0.6, 0);
                this.ctx.lineTo(0, sz);
                this.ctx.lineTo(-sz * 0.6, 0);
                this.ctx.closePath();
                this.ctx.fill();
            }
        
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.globalAlpha = 1.0;
        }
        ,
        drawTrailParticle(p) {
            this.ctx.globalAlpha = p.life;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
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
        
    });
}
