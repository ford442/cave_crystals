/** @import { RendererHost } from './RendererHost.js' */

import { DEFAULT_PALETTE, drawColorShape } from '../ColorPalettes.js';

export class HudEffectsRenderer {
    /** @param {RendererHost} host */
    constructor(host) {
        this.host = host;
    }

    drawHoloGrid(gameState, launcher, profile, timestamp) {
        // JUICE: Dynamic Holographic Grid
        const particleCount = gameState.particles ? gameState.particles.length : 0;
        const gridSize = particleCount > 30 ? profile.gridBase + 20 : profile.gridBase; // Coarser grid during chaos
        const time = timestamp;
        const pulse = Math.sin(time / 1000) * 0.5 + 0.5; // Slow heartbeat pulse
    
        // Setup base grid style
        this.host.ctx.lineWidth = 1;
        this.host.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    
        // Active Lane Glow
        const activeLane = launcher ? launcher.targetLane : -1;
        const activeX = (activeLane * this.host.laneWidth) + (this.host.laneWidth / 2);
    
        // Skip expensive distortion when under load, during chaos, or when no shockwaves are active
        const frameMs = gameState.perfMetrics?.smoothedFrameMs ?? 16.7;
        const hasActiveShockwaves = profile.allowGridDistortion
            && particleCount <= 40
            && frameMs < 21
            && gameState.shockwaves
            && gameState.shockwaves.some(sw => sw.life > 0)
            && this.host._distortionField
            && this.host._distortionField.gridReady;
    
        // Precompute breathe constants
        const cx = this.host.width / 2;
        const cy = this.host.height / 2;
        const breatheScale = 0.01 * pulse;
        const prevLineWidth = this.host.ctx.lineWidth;
        const prevStrokeStyle = this.host.ctx.strokeStyle;
        const prevShadowBlur = this.host.ctx.shadowBlur;
        const prevShadowColor = this.host.ctx.shadowColor;
    
        // Horizontal Lines
        for (let y = 0; y <= this.host.height; y += gridSize) {
             this.host.ctx.beginPath();
             let start = true;
             for (let x = 0; x <= this.host.width; x += gridSize) {
                 let distX = 0, distY = 0;
                 if (hasActiveShockwaves) {
                     const dist = this.host.crystal.getGridShockwaveDistortion(x, y);
                     distX = dist.x;
                     distY = dist.y;
                 }
    
                 const breatheX = (x - cx) * breatheScale;
                 const breatheY = (y - cy) * breatheScale;
    
                 const finalX = x + distX + breatheX;
                 const finalY = y + distY + breatheY;
    
                 if (start) {
                     this.host.ctx.moveTo(finalX, finalY);
                     start = false;
                 } else {
                     this.host.ctx.lineTo(finalX, finalY);
                 }
             }
             this.host.ctx.stroke();
        }
    
        // Vertical Lines
        for (let x = 0; x <= this.host.width; x += gridSize) {
             const distToActive = Math.abs(x - activeX);
             let isNearActive = false;
             if (activeLane >= 0 && distToActive < this.host.laneWidth / 2) {
                 isNearActive = true;
             }
    
             if (isNearActive) {
                 this.host.ctx.strokeStyle = `rgba(0, 255, 255, ${0.1 + (pulse * 0.1)})`; // Cyan glow
                 this.host.ctx.lineWidth = 2;
                 this.host.ctx.shadowColor = 'cyan';
                 this.host.ctx.shadowBlur = 5;
             } else {
                 this.host.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
                 this.host.ctx.lineWidth = 1;
                 this.host.ctx.shadowBlur = 0;
             }
    
             this.host.ctx.beginPath();
             let start = true;
             for (let y = 0; y <= this.host.height; y += gridSize) {
                 let distX = 0, distY = 0;
                 if (hasActiveShockwaves) {
                     const dist = this.host.crystal.getGridShockwaveDistortion(x, y);
                     distX = dist.x;
                     distY = dist.y;
                 }
    
                 const breatheX = (x - cx) * breatheScale;
                 const breatheY = (y - cy) * breatheScale;
    
                 const finalX = x + distX + breatheX;
                 const finalY = y + distY + breatheY;
    
                 if (start) {
                     this.host.ctx.moveTo(finalX, finalY);
                     start = false;
                 } else {
                     this.host.ctx.lineTo(finalX, finalY);
                 }
             }
             this.host.ctx.stroke();
        }
    
        this.host.ctx.lineWidth = prevLineWidth;
        this.host.ctx.strokeStyle = prevStrokeStyle;
        this.host.ctx.shadowBlur = prevShadowBlur;
        this.host.ctx.shadowColor = prevShadowColor;
    }

    drawTargetingSystem(gameState, launcher, timestamp) {
        if (!gameState.active || !launcher) return;
    
        const targetLane = launcher.targetLane;
        const targetLaneX = (targetLane * this.host.laneWidth) + (this.host.laneWidth / 2);
    
        // Find target crystals (inline to avoid array allocation)
        const targets = [];
        for (let i = 0; i < gameState.crystals.length; i++) {
            if (gameState.crystals[i].lane === targetLane) {
                targets.push(gameState.crystals[i]);
            }
        }
        const palette = this.host.activePalette || DEFAULT_PALETTE;
        const nextColorIdx = gameState.nextSporeColorIdx;
        const time = timestamp;
    
        // Draw Laser Sight
        // Determine "Lock Status" based on if any crystal matches
        const hasMatch = targets.some(c => c.colorIdx === nextColorIdx);
    
        const prevLineWidth = this.host.ctx.lineWidth;
        const prevStrokeStyle = this.host.ctx.strokeStyle;
        const prevShadowBlur = this.host.ctx.shadowBlur;
        const prevShadowColor = this.host.ctx.shadowColor;
        const prevGlobalAlpha = this.host.ctx.globalAlpha;
        const beamX = targetLaneX;
    
        if (hasMatch) {
            const col = palette[nextColorIdx].hex;
            this.host.ctx.strokeStyle = col;
            this.host.ctx.lineWidth = 3;
            this.host.ctx.shadowColor = col;
            this.host.ctx.shadowBlur = 15;
            this.host.ctx.setLineDash([20, 10]);
            this.host.ctx.lineDashOffset = -(time / 10); // Fast flow
        } else {
            // NO MATCH: Searching/Scanning Beam
            this.host.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            this.host.ctx.lineWidth = 1;
            this.host.ctx.shadowBlur = 0;
            this.host.ctx.setLineDash([5, 15]);
            this.host.ctx.lineDashOffset = -(time / 50); // Slow flow
        }
    
        this.host.ctx.beginPath();
        this.host.ctx.moveTo(beamX, 0);
        this.host.ctx.lineTo(beamX, this.host.height);
        this.host.ctx.stroke();
    
        this.host.ctx.setLineDash([]);
    
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
                 tipY = this.host.height - c.height + shakeY;
             }
    
             this.host.ctx.setTransform(1, 0, 0, 1, cX + shakeX, tipY);
    
             // Reticle Animation
             if (isMatch) {
                 const spin = time / 100;
                 const scale = 1.0 + Math.sin(time / 50) * 0.2;
                 this.host.ctx.rotate(spin);
                 this.host.ctx.scale(scale, scale);

                 const paletteCol = palette[c.colorIdx];
                 this.host.ctx.strokeStyle = paletteCol.hex;
                 this.host.ctx.lineWidth = 3;
                 this.host.ctx.shadowColor = paletteCol.hex;
                 this.host.ctx.shadowBlur = 10;

                 this.host.ctx.beginPath();
                 this.host.ctx.arc(0, 0, 30, 0, Math.PI * 2);
                 this.host.ctx.stroke();

                 if (this.host.colorBlindMode) {
                     drawColorShape(this.host.ctx, paletteCol.shape, 0, 0, 18, '#fff', paletteCol.hex);
                 } else {
                     this.host.ctx.beginPath();
                     this.host.ctx.moveTo(-10, 0); this.host.ctx.lineTo(10, 0);
                     this.host.ctx.moveTo(0, -10); this.host.ctx.lineTo(0, 10);
                     this.host.ctx.stroke();
                 }

             } else {
                 // No match - Warning/Scanning
                 const spin = time / 1000; // Slow spin
                 this.host.ctx.rotate(spin);
    
                 this.host.ctx.strokeStyle = 'rgba(255, 50, 50, 0.5)'; // Reddish warning
                 this.host.ctx.lineWidth = 2;
    
                 // Draw Broken Bracket
                 this.host.ctx.beginPath();
                 this.host.ctx.arc(0, 0, 30, 0, Math.PI * 0.5);
                 this.host.ctx.stroke();
                 this.host.ctx.beginPath();
                 this.host.ctx.arc(0, 0, 30, Math.PI, Math.PI * 1.5);
                 this.host.ctx.stroke();
             }
    
             this.host.ctx.setTransform(1, 0, 0, 1, 0, 0);
    
             // Connecting Line from Launcher to Target Tip
             this.host.ctx.beginPath();
             this.host.ctx.moveTo(launcher.x, launcher.y); // Start at actual launcher pos
             this.host.ctx.lineTo(cX + shakeX, tipY);
    
             if (isMatch) {
                 this.host.ctx.strokeStyle = palette[c.colorIdx].hex;
                 this.host.ctx.globalAlpha = 0.6;
                 this.host.ctx.lineWidth = 2;
             } else {
                 this.host.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                 this.host.ctx.lineWidth = 1;
             }
             this.host.ctx.stroke();
        });
    
        this.host.ctx.lineWidth = prevLineWidth;
        this.host.ctx.strokeStyle = prevStrokeStyle;
        this.host.ctx.shadowBlur = prevShadowBlur;
        this.host.ctx.shadowColor = prevShadowColor;
        this.host.ctx.globalAlpha = prevGlobalAlpha;
    }

    drawCursor(gameState, launcher, colorOverride = null) {
        if(!gameState.active || !launcher) return;
    
        // Draw Actual Launcher Entity (Visual Position)
        this.host.ctx.save();
        this.host.ctx.translate(launcher.x, launcher.y);
        this.host.ctx.rotate(launcher.tilt);
    
        // JUICE: Velocity-based Squash & Stretch
        // Stretch in X (direction of movement), Squash in Y
        // launcher.scaleX/Y handles the firing recoil squash
        const speedSquash = Math.min(0.3, (launcher.speed || 0) * 0.02);
        const sx = launcher.scaleX + speedSquash;
        const sy = launcher.scaleY - (speedSquash * 0.5);
        this.host.ctx.scale(sx, sy);
    
        this.host.ctx.translate(0, launcher.recoil);
    
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
        this.host.ctx.fillStyle = mainColor;
        this.host.ctx.shadowBlur = shadowBlur;
        this.host.ctx.shadowColor = glowColor;
    
        this.host.ctx.beginPath();
        // Central hub
        this.host.ctx.arc(0, 0, 10, 0, Math.PI*2);
        this.host.ctx.fill();
    
        // Wings/Pointers with flutter offset
        const wingPhase = launcher.wingPhase || 0;
        const wingFlutter = Math.sin(wingPhase) * 2.5;
    
        this.host.ctx.beginPath();
        this.host.ctx.moveTo(0, -15);
        this.host.ctx.lineTo(8 + wingFlutter, 5);
        this.host.ctx.lineTo(0, 0);
        this.host.ctx.lineTo(-8 - wingFlutter, 5);
        this.host.ctx.closePath();
        this.host.ctx.fillStyle = wingColor;
        this.host.ctx.fill();
    
        this.host.ctx.beginPath();
        this.host.ctx.moveTo(0, 15);
        this.host.ctx.lineTo(8 + wingFlutter, -5);
        this.host.ctx.lineTo(0, 0);
        this.host.ctx.lineTo(-8 - wingFlutter, -5);
        this.host.ctx.closePath();
        this.host.ctx.fillStyle = wingColor;
        this.host.ctx.fill();
    
        // Secondary motion: antenna elements that respond to speed/firing
        const antennaOffset = launcher.antennaOffset || 0;
        if (antennaOffset > 0.5) {
            const antennaAlpha = Math.min(1.0, antennaOffset / 6);
            this.host.ctx.globalAlpha = antennaAlpha * 0.7;
            this.host.ctx.strokeStyle = wingColor;
            this.host.ctx.lineWidth = 1.5;
            this.host.ctx.shadowBlur = 8;
    
            // Left antenna
            this.host.ctx.beginPath();
            this.host.ctx.moveTo(-6, -8);
            this.host.ctx.lineTo(-10 - antennaOffset, -16 - antennaOffset * 0.8);
            this.host.ctx.stroke();
            // Right antenna
            this.host.ctx.beginPath();
            this.host.ctx.moveTo(6, -8);
            this.host.ctx.lineTo(10 + antennaOffset, -16 - antennaOffset * 0.8);
            this.host.ctx.stroke();
    
            this.host.ctx.globalAlpha = 1.0;
        }
    
        this.host.ctx.shadowBlur = 0;
        this.host.ctx.restore();
    }

    drawSpore(s, timestamp) {
        const palette = this.host.activePalette || DEFAULT_PALETTE;
        const col = palette[s.colorIdx];
        const time = timestamp;
        const isRainbow = Boolean(s.modifiers?.rainbow);
    
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
    
        this.host.ctx.save();
        this.host.ctx.translate(s.x, s.y);
    
        // JUICE: Plasma Core - Rotating Star
        const spin = time / 200;
        this.host.ctx.rotate(spin);
    
        this.host.ctx.shadowBlur = 20;
        this.host.ctx.shadowColor = isRainbow
            ? `hsl(${(time / 8) % 360}, 100%, 70%)`
            : col.hex;
        this.host.ctx.fillStyle = isRainbow ? '#ffffff' : '#fff';
    
        // Draw Core (4-pointed Star shape)
        const coreSize = baseRadius * 0.8;
        const innerSize = coreSize * 0.3;
        const spikes = 4;
    
        this.host.ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const r = (i % 2 === 0) ? coreSize : innerSize;
            const a = (i * Math.PI) / spikes;
            this.host.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        this.host.ctx.closePath();
        this.host.ctx.fill();
    
        // Secondary energy ripple layer — counter-rotating 4-point star at reduced opacity
        const rippleScale = 1.0 + Math.sin(inFlightAge * 0.25 + (s.wobblePhase || 0) + Math.PI) * 0.12;
        const rippleSize = baseRadius * 0.55 * rippleScale;
        this.host.ctx.globalAlpha = 0.45;
        this.host.ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
            const r = (i % 2 === 0) ? rippleSize : rippleSize * 0.35;
            const a = (i * Math.PI) / spikes;
            this.host.ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        this.host.ctx.closePath();
        this.host.ctx.fill();
        this.host.ctx.globalAlpha = 1.0;
    
        // Outer Glow/Halo
        // Rotate opposite for halo
        this.host.ctx.rotate(-spin * 2);
        // Cache spore halo gradient by color
        const sporeGradKey = `spore-${col.hex}`;
        let sporeGrad = this.host._gradientCache.get(sporeGradKey);
        if (!sporeGrad) {
            sporeGrad = this.host.ctx.createRadialGradient(0, 0, 0.5, 0, 0, 1.8);
            sporeGrad.addColorStop(0, '#fff');
            sporeGrad.addColorStop(0.2, col.hex);
            sporeGrad.addColorStop(1, 'transparent');
            this.host._gradientCache.set(sporeGradKey, sporeGrad);
        }
        this.host.ctx.fillStyle = sporeGrad;
        this.host.ctx.beginPath();
        this.host.ctx.arc(0, 0, baseRadius * 2.0, 0, Math.PI * 2);
        this.host.ctx.fill();
    
        // JUICE: Lightning Arcs
        // Use pre-generated arcs from spore (no Math.random in draw loop)
        this.host.ctx.strokeStyle = '#fff';
        this.host.ctx.lineWidth = 2;
        this.host.ctx.lineCap = 'round';
        this.host.ctx.shadowBlur = 10;
        this.host.ctx.shadowColor = '#fff';
    
        for (let i = 0; i < s.lightningArcs.length; i++) {
            const arc = s.lightningArcs[i];
            const len = baseRadius * arc.lenRatio;
    
            this.host.ctx.save();
            this.host.ctx.rotate(arc.angle);
            this.host.ctx.beginPath();
            this.host.ctx.moveTo(0, 0);
    
            // Jagged line using pre-generated offsets
            let r = baseRadius * 0.5;
            const step = len / 4;
            for (let j = 0; j < arc.jaggedOffsets.length && r < len; j++) {
                r += step;
                const offset = arc.jaggedOffsets[j] * (baseRadius * 0.8);
                this.host.ctx.lineTo(r, offset);
            }
            this.host.ctx.stroke();
            this.host.ctx.restore();
        }

        if (!isRainbow && col.shape) {
            drawColorShape(this.host.ctx, col.shape, 0, 0, baseRadius * 0.9, '#fff', col.hex);
        }

        this.host.ctx.restore();
        this.host.ctx.shadowBlur = 0;
    }

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
            `integrator ${m.particleIntegratorPath || 'idle'} · worker ${(m.particleWorkerMs || 0).toFixed(2)}ms · backlog ${m.particleWorkerBacklog || 0}`,
            `distort ${(m.distortionPrecomputeMs || 0).toFixed(2)}ms · cells ${m.distortionGridCells || 0}`,
            ...(typeof this.host._desynchronizedActive === 'boolean'
                ? [`Canvas desync: ${this.host._desynchronizedActive ? 'ON' : 'OFF'}`]
                : []),
            '[P] toggle · __toggleDevPerf__()'
        ];

        const pad = 8;
        const lineHeight = 13;
        const boxW = 268;
        const boxH = pad * 2 + lines.length * lineHeight;

        this.host.ctx.save();
        this.host.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.host.ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
        this.host.ctx.fillRect(10, 10, boxW, boxH);
        this.host.ctx.strokeStyle = 'rgba(0, 255, 136, 0.55)';
        this.host.ctx.lineWidth = 1;
        this.host.ctx.strokeRect(10.5, 10.5, boxW - 1, boxH - 1);

        this.host.ctx.font = '11px monospace';
        this.host.ctx.textAlign = 'left';
        this.host.ctx.textBaseline = 'top';
        for (let i = 0; i < lines.length; i++) {
            this.host.ctx.fillStyle = i === 0 ? 'rgba(0, 255, 136, 0.95)' : 'rgba(200, 255, 220, 0.9)';
            this.host.ctx.fillText(lines[i], 18, 14 + i * lineHeight);
        }
        this.host.ctx.restore();
    }
}
