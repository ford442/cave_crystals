import { COLORS } from './RendererConstants.js';

export function installRendererCrystal(Renderer) {
    Object.assign(Renderer.prototype, {
        drawComplexCrystal(c, colorOverride = null, particleCount = 0, profile = this._qualityProfiles.high, timestamp = performance.now(), launcher = null, spores = []) {
            // JUICE: Apply stress shake + micro-jitter to position
            const shakeX = (c.shakeX || 0) + (c.jitterX || 0);
            const shakeY = (c.shakeY || 0) + (c.jitterY || 0);
            const xCenter = (c.lane * this.laneWidth) + (this.laneWidth / 2) + shakeX;
        
            // Use spring-animated displayHeight for rendering (organic "push upward" growth)
            const renderHeight = (c.displayHeight !== undefined) ? c.displayHeight : c.height;
        
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
        
            // Perf: use solid fill instead of gradients when particle chaos is high
            const useSolidFill = particleCount > 40 || profile.crystalDetail === 'low';
        
            // Compute lighting context: direction and intensity from nearby bright objects
            const crystalCenterY = c.type === 'top' ? (renderHeight * heightScale) / 2 : this.height - (renderHeight * heightScale) / 2;
            let lightDirX = 0;
            let lightDirY = 0;
            let lightIntensity = 0;
        
            if (!colorOverride && launcher) {
                const dx = launcher.x - xCenter;
                const dy = launcher.y - crystalCenterY;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const falloff = Math.max(0, 1 - dist / 500);
                lightDirX += (dx / dist) * falloff;
                lightDirY += (dy / dist) * falloff;
                lightIntensity += falloff * 0.6;
            }
        
            if (!colorOverride && spores && spores.length > 0) {
                for (let i = 0; i < Math.min(spores.length, 5); i++) {
                    const s = spores[i];
                    const dx = s.x - xCenter;
                    const dy = s.y - crystalCenterY;
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                    const falloff = Math.max(0, 1 - dist / 350);
                    if (falloff > 0) {
                        lightDirX += (dx / dist) * falloff * 0.4;
                        lightDirY += (dy / dist) * falloff * 0.4;
                        lightIntensity += falloff * 0.3;
                    }
                }
            }
        
            lightIntensity = Math.min(lightIntensity, 1.0);
            const lightMag = Math.sqrt(lightDirX * lightDirX + lightDirY * lightDirY) || 1;
            const normLightX = lightDirX / lightMag;
            const normLightY = lightDirY / lightMag;

            const time = timestamp / 1000;
            const isHighDetail = profile.crystalDetail === 'high' && !useSolidFill;
            // JUICE: Shared breathing phases — computed once per crystal, reused across shards
            const breathePhase = Math.sin(time * 1.2 + c.lightPhase);
            const ageBreathe = Math.sin(c.age * 0.05 + c.lightPhase * 0.7);
            const critPulse = c.isCritical ? (Math.sin(timestamp / 70) * 0.5 + 0.5) : 0;
            const baseRgb = this.hexToRgb(col.hex);
            const baseR = baseRgb ? baseRgb.r : 255;
            const baseG = baseRgb ? baseRgb.g : 255;
            const baseB = baseRgb ? baseRgb.b : 255;
        
            // JUICE: Critical Danger Glow — faster and more extreme for menacing feel
            if (c.isCritical && !colorOverride) {
                const pulse = critPulse;
                if (profile.crystalDetail === 'low') {
                    // Skip shadowBlur on low - use fill color tinting only
                    this.ctx.shadowBlur = 0;
                } else if (profile.crystalDetail === 'medium') {
                    this.ctx.shadowBlur = 15 + (pulse * 20);
                    this.ctx.shadowColor = 'red';
                } else {
                    // High: lean on internal glow veins over heavy shadowBlur
                    this.ctx.shadowBlur = 10 + (pulse * 16);
                    this.ctx.shadowColor = 'red';
                }
                // Tint fill slightly red
                strokeColor = `rgba(255, 50, 50, ${0.8 + pulse * 0.2})`;
                // Aggressive visual override
                fillColor = `rgba(255, ${Math.floor(pulse * 50)}, ${Math.floor(pulse * 50)}, 0.9)`;
            } else if (c.flash > 0 && !colorOverride) {
                if (profile.crystalDetail === 'low') {
                    this.ctx.shadowBlur = 0;
                } else {
                    // Enhanced glow effect for flash
                    this.ctx.shadowBlur = (profile.crystalDetail === 'medium' ? 25 : 50) * c.flash;
                    this.ctx.shadowColor = 'white';
                }
                this.ctx.fillStyle = '#fff';
                this.ctx.strokeStyle = '#fff';
            } else if (!colorOverride) {
                if (profile.crystalDetail === 'low') {
                    this.ctx.shadowBlur = 0;
                } else if (profile.crystalDetail === 'medium') {
                    this.ctx.shadowBlur = 18;
                } else {
                    this.ctx.shadowBlur = 35;
                }
                this.ctx.shadowColor = col.glow;
                this.ctx.strokeStyle = strokeColor;
            } else {
                 this.ctx.strokeStyle = strokeColor;
            }
        
            const baseLineWidth = 2;
            this.ctx.lineWidth = baseLineWidth;
            this.ctx.lineJoin = 'miter';
        
            const drawShard = (offsetX, hScale, wScale, tilt, facetStyle = 'standard', shardIndex = 0) => {
                const phaseOff = c.shardPhaseOffsets ? c.shardPhaseOffsets[shardIndex % 5] : 0;
                // JUICE: Per-shard critical throb — staggered via seeded phase offsets
                let critThrob = 0;
                if (c.isCritical && isHighDetail) {
                    critThrob = Math.sin(timestamp / 88 + phaseOff) * 0.045 * (0.6 + critPulse * 0.4);
                }
                const shardBreathe = isHighDetail ? (1 + breathePhase * 0.012 + ageBreathe * 0.006) : 1;

                // Apply height scale to the crystal height (use animated displayHeight for rendering)
                const h = renderHeight * hScale * heightScale * shardBreathe * (1 + critThrob);
                const w = width * wScale * (1 - critThrob * 0.35);
                const halfW = w / 2;
                const baseY = ((c.type === 'top') ? 0 : this.height) + shakeY;
                const tipY = ((c.type === 'top') ? h : this.height - h) + shakeY;
                const cx = xCenter + offsetX;
        
                // Compute per-facet normal (simplified 2D: direction from base center to tip)
                const facetNormX = (tilt / 20); // normalized tilt contribution
                const facetNormY = c.type === 'top' ? 1 : -1;
                // Dot product with light direction for specular
                const specularDot = Math.max(0, facetNormX * normLightX + facetNormY * normLightY * 0.5);
                const specularStrength = specularDot * lightIntensity;
                const critSpecBoost = c.isCritical && isHighDetail ? critPulse * 0.35 : 0;
        
                if (!colorOverride) {
                    if (useSolidFill) {
                        // Perf: skip expensive gradient creation under load
                        this.ctx.fillStyle = c.flash > 0 ? '#fff' : col.hex;
                    } else {
                        // Enhanced gradient with more depth and light response
                        const grad = this.ctx.createLinearGradient(cx - halfW, baseY, cx + halfW, tipY);
                        if (c.flash > 0) {
                             grad.addColorStop(0, '#fff');
                             grad.addColorStop(0.5, '#fff');
                             grad.addColorStop(1, '#fff');
                        } else {
                             // Light-responsive gradient: brighter on lit side
                             const litBoost = Math.floor((specularStrength + critSpecBoost) * 48);
                             const litColor = `rgb(${Math.min(255, baseR + litBoost)}, ${Math.min(255, baseG + litBoost)}, ${Math.min(255, baseB + litBoost)})`;
                             const darkStop = isHighDetail
                                 ? this.darkenColor(col.hex, 0.28 + breathePhase * 0.04)
                                 : this.darkenColor(col.hex, 0.3);
                             grad.addColorStop(0, litColor);
                             grad.addColorStop(0.35, col.hex);
                             grad.addColorStop(0.65, darkStop);
                             if (c.isCritical && isHighDetail) {
                                 const heat = Math.floor(40 + critPulse * 60);
                                 grad.addColorStop(0.85, `rgba(255, ${heat}, ${Math.floor(heat * 0.25)}, 0.35)`);
                             }
                             grad.addColorStop(1, 'rgba(0,0,0,0.25)');
                        }
                        this.ctx.fillStyle = grad;
                    }
                } else {
                    this.ctx.fillStyle = fillColor;
                }
        
                const useMultifacet = facetStyle === 'multifacet' && profile.crystalDetail === 'high';
        
                // Draw main crystal shape with more facets
                this.ctx.beginPath();
        
                if (useMultifacet) {
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
                if (!colorOverride && c.flash < 0.5 && profile.crystalDetail !== 'low') {
                    // Primary highlight facet - modulated by light direction
                    const highlightAlpha = 0.2 + specularStrength * 0.25 + critSpecBoost * 0.15;
                    this.ctx.fillStyle = `rgba(255,255,255,${highlightAlpha.toFixed(2)})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx - halfW*0.6, baseY);
                    if (c.type === 'top') {
                        this.ctx.lineTo(cx + tilt*0.3, baseY + (tipY - baseY) * 0.6);
                    } else {
                        this.ctx.lineTo(cx + tilt*0.3, baseY - (baseY - tipY) * 0.6);
                    }
                    this.ctx.lineTo(cx + halfW*0.2, baseY);
                    this.ctx.fill();
        
                    // Secondary highlight for crystalline effect
                    this.ctx.fillStyle = `rgba(255,255,255,${(0.1 + specularStrength * 0.15 + critSpecBoost * 0.1).toFixed(2)})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx + halfW*0.2, baseY);
                    if (c.type === 'top') {
                        this.ctx.lineTo(cx + tilt*0.7, baseY + (tipY - baseY) * 0.75);
                    } else {
                        this.ctx.lineTo(cx + tilt*0.7, baseY - (baseY - tipY) * 0.75);
                    }
                    this.ctx.lineTo(cx + halfW*0.6, baseY);
                    this.ctx.fill();

                    // JUICE: Tertiary breathing facet — high detail, organic lightPhase variation
                    if (isHighDetail) {
                        const tertiaryAlpha = (0.06 + breathePhase * 0.04 + specularStrength * 0.12).toFixed(2);
                        this.ctx.fillStyle = `rgba(220,255,255,${tertiaryAlpha})`;
                        this.ctx.beginPath();
                        const tMid = c.type === 'top'
                            ? baseY + (tipY - baseY) * (0.35 + ageBreathe * 0.05)
                            : baseY - (baseY - tipY) * (0.35 + ageBreathe * 0.05);
                        this.ctx.moveTo(cx - halfW * 0.15, baseY);
                        this.ctx.lineTo(cx + tilt * 0.45 + breathePhase * halfW * 0.04, tMid);
                        this.ctx.lineTo(cx + halfW * 0.35, baseY);
                        this.ctx.fill();
                    }
        
                    // Internal crystalline structure lines
                    this.ctx.strokeStyle = `rgba(255,255,255,${(0.15 + specularStrength * 0.1).toFixed(2)})`;
                    this.ctx.lineWidth = 1;
                    this.ctx.beginPath();
                    const midY = c.type === 'top' ? baseY + (tipY - baseY) * 0.5 : baseY - (baseY - tipY) * 0.5;
                    this.ctx.moveTo(cx - halfW*0.3, baseY);
                    this.ctx.lineTo(cx + tilt*0.5, midY);
                    this.ctx.lineTo(cx + halfW*0.3, baseY);
                    this.ctx.stroke();

                    // JUICE: Extra facet lattice lines on high detail — density modulated by age
                    if (isHighDetail) {
                        const latticeAlpha = (0.06 + Math.abs(ageBreathe) * 0.05).toFixed(2);
                        this.ctx.strokeStyle = `rgba(200,240,255,${latticeAlpha})`;
                        const latticeY1 = c.type === 'top'
                            ? baseY + (tipY - baseY) * (0.25 + breathePhase * 0.03)
                            : baseY - (baseY - tipY) * (0.25 + breathePhase * 0.03);
                        const latticeY2 = c.type === 'top'
                            ? baseY + (tipY - baseY) * 0.65
                            : baseY - (baseY - tipY) * 0.65;
                        this.ctx.beginPath();
                        this.ctx.moveTo(cx - halfW * 0.45, latticeY1);
                        this.ctx.lineTo(cx + tilt * 0.2, latticeY2);
                        this.ctx.lineTo(cx + halfW * 0.45, latticeY1);
                        this.ctx.stroke();
                    }
                    this.ctx.lineWidth = baseLineWidth;
                }
        
                // Rim lighting (medium+high) — edge glow from nearby light sources
                if (!colorOverride && c.flash < 0.5 && profile.crystalDetail !== 'low' && lightIntensity > 0.1) {
                    const rimSide = normLightX > 0 ? -1 : 1; // Rim appears opposite to light
                    const rimAlpha = (lightIntensity * 0.35 + critSpecBoost * 0.2).toFixed(2);
                    this.ctx.strokeStyle = c.isCritical && isHighDetail
                        ? `rgba(255,${Math.floor(120 + critPulse * 80)},${Math.floor(60 + critPulse * 40)},${rimAlpha})`
                        : `rgba(255,255,255,${rimAlpha})`;
                    this.ctx.lineWidth = isHighDetail ? 1.8 : 1.5;
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx + rimSide * halfW, baseY);
                    this.ctx.lineTo(cx + tilt + rimSide * halfW * 0.1, tipY);
                    this.ctx.stroke();
                    this.ctx.lineWidth = baseLineWidth;
                }
        
                // Dynamic specular catch-light (high only)
                if (!colorOverride && profile.crystalDetail === 'high' && !useSolidFill && (lightIntensity > 0.12 || critSpecBoost > 0.1)) {
                    const catchLightY = c.type === 'top'
                        ? baseY + (tipY - baseY) * (0.3 + normLightY * 0.2 + breathePhase * 0.02)
                        : baseY - (baseY - tipY) * (0.3 - normLightY * 0.2 - breathePhase * 0.02);
                    const catchLightX = cx + normLightX * halfW * 0.3;
                    const catchSize = halfW * 0.15 * (1 + specularStrength + critSpecBoost);
                    const catchAlpha = (specularStrength * 0.6 + critSpecBoost * 0.5).toFixed(2);
                    const catchGrad = this.ctx.createRadialGradient(catchLightX, catchLightY, 0, catchLightX, catchLightY, catchSize);
                    catchGrad.addColorStop(0, `rgba(255,255,255,${catchAlpha})`);
                    catchGrad.addColorStop(0.6, `rgba(${baseR},${baseG},${baseB},${(parseFloat(catchAlpha) * 0.3).toFixed(2)})`);
                    catchGrad.addColorStop(1, 'rgba(255,255,255,0)');
                    this.ctx.fillStyle = catchGrad;
                    this.ctx.beginPath();
                    this.ctx.arc(catchLightX, catchLightY, catchSize, 0, Math.PI * 2);
                    this.ctx.fill();
                }
        
                // High-detail sheen with time-varying caustics
                if (!colorOverride && profile.crystalDetail === 'high' && !useSolidFill) {
                    // Caustic/refraction pattern that shifts with time and breathing
                    const causticOffset = Math.sin(time * 1.5 + c.lightPhase + phaseOff * 0.3) * 0.15;
                    const sheenStop1 = 0.3 + causticOffset + specularStrength * 0.08;
                    const sheenStop2 = 0.55 + causticOffset * 0.5 + ageBreathe * 0.04;
                    const sheen = this.ctx.createLinearGradient(cx - halfW, baseY, cx + halfW, tipY);
                    sheen.addColorStop(0, 'rgba(255,255,255,0)');
                    sheen.addColorStop(Math.max(0.05, sheenStop1), `rgba(180,255,255,${(0.2 + specularStrength * 0.12).toFixed(2)})`);
                    sheen.addColorStop(Math.min(0.95, sheenStop2), `rgba(255,160,255,${(0.18 + breathePhase * 0.04).toFixed(2)})`);
                    sheen.addColorStop(1, 'rgba(255,255,255,0)');
                    this.ctx.fillStyle = sheen;
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx - halfW * 0.25, baseY);
                    this.ctx.lineTo(cx + tilt * 0.65, c.type === 'top' ? (baseY + (tipY - baseY) * 0.72) : (baseY - (baseY - tipY) * 0.72));
                    this.ctx.lineTo(cx + halfW * 0.25, baseY);
                    this.ctx.closePath();
                    this.ctx.fill();

                    // JUICE: Secondary caustic band — sweeps with crystal age for living depth
                    const caustic2 = Math.sin(time * 0.9 + c.age * 0.04 + phaseOff) * 0.12;
                    const bandY = c.type === 'top'
                        ? baseY + (tipY - baseY) * (0.45 + caustic2)
                        : baseY - (baseY - tipY) * (0.45 + caustic2);
                    this.ctx.fillStyle = `rgba(255,255,255,${(0.04 + specularStrength * 0.06).toFixed(2)})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(cx - halfW * 0.4, bandY - halfW * 0.06);
                    this.ctx.lineTo(cx + tilt * 0.3, bandY + halfW * 0.06);
                    this.ctx.lineTo(cx + halfW * 0.4, bandY - halfW * 0.06);
                    this.ctx.closePath();
                    this.ctx.fill();
                }
        
                // Internal cracks for taller crystals (high only, seeded)
                if (!colorOverride && profile.crystalDetail === 'high' && renderHeight > 80 && !useSolidFill) {
                    const crackCount = Math.min(5, Math.floor((renderHeight - 80) / 35) + 1);
                    const crackSeed = c.crackSeed || seed;
                    const crackDrift = Math.sin(time * 0.8 + c.lightPhase) * 0.04;
                    this.ctx.strokeStyle = `rgba(255,255,255,${(0.08 + Math.abs(breathePhase) * 0.03).toFixed(2)})`;
                    this.ctx.lineWidth = 0.5;
                    for (let ci = 0; ci < crackCount; ci++) {
                        const t = ((crackSeed * 7 + ci * 0.31) % 1);
                        const crackStartY = c.type === 'top'
                            ? baseY + (tipY - baseY) * (0.18 + t * 0.52 + crackDrift)
                            : baseY - (baseY - tipY) * (0.18 + t * 0.52 + crackDrift);
                        const crackEndY = c.type === 'top'
                            ? crackStartY + (tipY - baseY) * (0.22 + Math.abs(ageBreathe) * 0.06)
                            : crackStartY - (baseY - tipY) * (0.22 + Math.abs(ageBreathe) * 0.06);
                        const crackX = cx + (t - 0.5) * halfW * (0.8 + breathePhase * 0.05);
                        const crackMidX = crackX + ((crackSeed * 3 + ci) % 1 - 0.5) * halfW * 0.3;
                        this.ctx.beginPath();
                        this.ctx.moveTo(crackX, crackStartY);
                        this.ctx.lineTo(crackMidX, (crackStartY + crackEndY) / 2);
                        this.ctx.lineTo(crackX + (crackMidX - crackX) * 0.5, crackEndY);
                        this.ctx.stroke();
                    }
                    this.ctx.lineWidth = baseLineWidth;
                }
        
                // Critical state: danger cracks with pulsing internal "lava" lines
                if (c.isCritical && !colorOverride && profile.crystalDetail !== 'low') {
                    const dangerPulse = Math.sin(timestamp / 80 + phaseOff) * 0.5 + 0.5;
                    const dangerAlpha = (0.3 + dangerPulse * 0.5).toFixed(2);
                    this.ctx.strokeStyle = `rgba(255, ${Math.floor(30 + dangerPulse * 50)}, 0, ${dangerAlpha})`;
                    this.ctx.lineWidth = isHighDetail ? 2 : 1.5;
                    const crackSeed = c.crackSeed || seed;
                    const dangerCrackCount = isHighDetail ? 4 : 3;
                    for (let ci = 0; ci < dangerCrackCount; ci++) {
                        const t = ((crackSeed * 5 + ci * 0.37) % 1);
                        const startProgress = 0.15 + t * 0.3;
                        const endProgress = startProgress + 0.3 + dangerPulse * 0.12;
                        const crackStartY = c.type === 'top'
                            ? baseY + (tipY - baseY) * startProgress
                            : baseY - (baseY - tipY) * startProgress;
                        const crackEndY = c.type === 'top'
                            ? baseY + (tipY - baseY) * Math.min(0.9, endProgress)
                            : baseY - (baseY - tipY) * Math.min(0.9, endProgress);
                        const crackX = cx + (t - 0.5) * halfW * 0.6;
                        this.ctx.beginPath();
                        this.ctx.moveTo(crackX, crackStartY);
                        this.ctx.lineTo(crackX + Math.sin(timestamp / 200 + ci + phaseOff) * halfW * 0.15, (crackStartY + crackEndY) / 2);
                        this.ctx.lineTo(crackX, crackEndY);
                        this.ctx.stroke();
                    }

                    // JUICE: Internal glow veins on critical high detail — fill modulation, no extra blur
                    if (isHighDetail) {
                        const veinPulse = (0.25 + dangerPulse * 0.45).toFixed(2);
                        const prevOp = this.ctx.globalCompositeOperation;
                        this.ctx.globalCompositeOperation = 'lighter';
                        for (let vi = 0; vi < 2; vi++) {
                            const vt = ((crackSeed * 11 + vi * 0.43 + phaseOff * 0.1) % 1);
                            const veinY = c.type === 'top'
                                ? baseY + (tipY - baseY) * (0.35 + vt * 0.35)
                                : baseY - (baseY - tipY) * (0.35 + vt * 0.35);
                            const veinX = cx + (vt - 0.5) * halfW * 0.5;
                            const veinR = halfW * (0.12 + dangerPulse * 0.08);
                            const veinGrad = this.ctx.createRadialGradient(veinX, veinY, 0, veinX, veinY, veinR);
                            veinGrad.addColorStop(0, `rgba(255,${Math.floor(80 + dangerPulse * 100)},20,${veinPulse})`);
                            veinGrad.addColorStop(0.5, `rgba(255,40,0,${(parseFloat(veinPulse) * 0.4).toFixed(2)})`);
                            veinGrad.addColorStop(1, 'rgba(255,0,0,0)');
                            this.ctx.fillStyle = veinGrad;
                            this.ctx.beginPath();
                            this.ctx.arc(veinX, veinY, veinR, 0, Math.PI * 2);
                            this.ctx.fill();
                        }
                        this.ctx.globalCompositeOperation = prevOp;
                    }
                    this.ctx.lineWidth = baseLineWidth;
                }
        
                // Match flash: energized cleansed sheen
                if (!colorOverride && c.matchFlash > 0 && profile.crystalDetail !== 'low') {
                    const mAlpha = (c.matchFlash * 0.4).toFixed(2);
                    const mGrad = this.ctx.createLinearGradient(cx - halfW, tipY, cx + halfW, baseY);
                    mGrad.addColorStop(0, `rgba(255,255,255,${mAlpha})`);
                    mGrad.addColorStop(0.5, `rgba(200,255,240,${(c.matchFlash * 0.25).toFixed(2)})`);
                    mGrad.addColorStop(1, 'rgba(255,255,255,0)');
                    this.ctx.fillStyle = mGrad;
                    this.ctx.beginPath();
                    if (c.type === 'top') {
                        this.ctx.moveTo(cx - halfW, baseY);
                        this.ctx.lineTo(cx + tilt, tipY);
                        this.ctx.lineTo(cx + halfW, baseY);
                    } else {
                        this.ctx.moveTo(cx - halfW, baseY);
                        this.ctx.lineTo(cx + tilt, tipY);
                        this.ctx.lineTo(cx + halfW, baseY);
                    }
                    this.ctx.closePath();
                    this.ctx.fill();
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
        
            // Use cached shard config index from crystal
            const config = shardConfigs[c.shardConfigIndex || 0] || shardConfigs[0];
            config.shards.forEach((shard, shardIndex) => {
                drawShard(shard.offsetX, shard.hScale, shard.wScale, shard.tilt, shard.facetStyle, shardIndex);
            });
        
            // Post-geometry: layered soft glow (replaces some shadowBlur dependency)
            if (!colorOverride && profile.crystalDetail !== 'low' && !useSolidFill && c.flash < 0.3) {
                const glowCenterY = c.type === 'top'
                    ? shakeY + (renderHeight * heightScale * 0.4)
                    : shakeY + (this.height - renderHeight * heightScale * 0.4);
                const glowRadius = width * 0.6;
                const prevOp = this.ctx.globalCompositeOperation;
                this.ctx.globalCompositeOperation = 'lighter';
                const glowGrad = this.ctx.createRadialGradient(xCenter, glowCenterY, 0, xCenter, glowCenterY, glowRadius);
                const glowAlpha = c.isCritical && isHighDetail ? (0.14 + critPulse * 0.12) : 0.12;
                glowGrad.addColorStop(0, `rgba(${baseR}, ${baseG}, ${baseB}, ${glowAlpha.toFixed(2)})`);
                if (c.isCritical && isHighDetail) {
                    glowGrad.addColorStop(0.35, `rgba(255,${Math.floor(60 + critPulse * 80)},20,${(0.08 + critPulse * 0.1).toFixed(2)})`);
                }
                glowGrad.addColorStop(0.5, `rgba(${baseR}, ${baseG}, ${baseB}, 0.05)`);
                glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
                this.ctx.fillStyle = glowGrad;
                this.ctx.beginPath();
                this.ctx.arc(xCenter, glowCenterY, glowRadius, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.globalCompositeOperation = prevOp;
            }
        
            this.ctx.shadowBlur = 0;
        }
        ,
        darkenColor(hex, amount) {
            // Helper to darken a hex color — cached to avoid regex per call
            const cacheKey = `${hex}-${amount}`;
            let cached = this._darkenColorCache && this._darkenColorCache.get(cacheKey);
            if (cached) return cached;
            const rgb = this.hexToRgb(hex);
            if (!rgb) return hex;
            const r = Math.max(0, Math.floor(rgb.r * (1 - amount)));
            const g = Math.max(0, Math.floor(rgb.g * (1 - amount)));
            const b = Math.max(0, Math.floor(rgb.b * (1 - amount)));
            const result = `rgb(${r},${g},${b})`;
            if (!this._darkenColorCache) this._darkenColorCache = new Map();
            this._darkenColorCache.set(cacheKey, result);
            return result;
        }
        ,
        hexToRgb(hex) {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        }
        ,
        drawScanlines(intensity) {
            if (!this.ctx) return;
            const prevComposite = this.ctx.globalCompositeOperation;
            const prevAlpha = this.ctx.globalAlpha;
            const prevFillStyle = this.ctx.fillStyle;
            this.ctx.globalCompositeOperation = 'source-over';
            this.ctx.globalAlpha = intensity * 0.3;
            this.ctx.fillStyle = this.scanlinePattern;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.globalCompositeOperation = prevComposite;
            this.ctx.globalAlpha = prevAlpha;
            this.ctx.fillStyle = prevFillStyle;
        }
        ,
        drawGlitch(intensity) {
            if (!this.ctx) return;
            const numGlitches = Math.floor(intensity * 10);
        
            // Regenerate rects only when intensity changes significantly or count changes
            if (Math.abs(intensity - this._glitchIntensity) > 0.05 || this._glitchRects.length !== numGlitches) {
                this._glitchIntensity = intensity;
                this._glitchRects = [];
                for (let i = 0; i < numGlitches; i++) {
                    this._glitchRects.push({
                        x: Math.random() * this.width,
                        y: Math.random() * this.height,
                        w: Math.random() * 200 + 50,
                        h: Math.random() * 30 + 5,
                        color: Math.random() > 0.5 ? 'rgba(0, 255, 255, 0.5)' : 'rgba(255, 0, 255, 0.5)',
                        vx: (Math.random() - 0.5) * 4,
                        vy: (Math.random() - 0.5) * 4
                    });
                }
            }
        
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'exclusion';
        
            for (let i = 0; i < this._glitchRects.length; i++) {
                const r = this._glitchRects[i];
                // Animate with pre-set drift (no Math.random in hot path)
                r.x += r.vx;
                r.y += r.vy;
                if (r.x < -r.w) r.x += this.width + r.w;
                if (r.x > this.width) r.x -= this.width + r.w;
                if (r.y < -r.h) r.y += this.height + r.h;
                if (r.y > this.height) r.y -= this.height + r.h;
        
                this.ctx.fillStyle = r.color;
                this.ctx.fillRect(r.x, r.y, r.w, r.h);
            }
            this.ctx.restore();
        }
        ,
        calculateShockwaveDistortion(x, y, gameState) {
            if (!gameState.shockwaves || gameState.shockwaves.length === 0) return { x: 0, y: 0 };
        
            let dx = 0;
            let dy = 0;
            const bandWidth = 50;
        
            for (let i = 0; i < gameState.shockwaves.length; i++) {
                const sw = gameState.shockwaves[i];
                if (sw.life <= 0) continue;
        
                const distX = x - sw.x;
                const distY = y - sw.y;
                const distSq = distX * distX + distY * distY;
                const outer = sw.radius + bandWidth;
        
                // Fast reject: if outside outer band, skip sqrt entirely
                if (distSq > outer * outer) continue;
        
                // Fast reject: if inside inner band (hole), skip
                if (sw.radius > bandWidth) {
                    const inner = sw.radius - bandWidth;
                    if (distSq < inner * inner) continue;
                }
        
                const dist = Math.sqrt(distSq);
                const delta = dist - sw.radius;
                const t = delta / bandWidth;
                const strength = Math.cos(t * Math.PI / 2);
                const force = 15.0 * strength * sw.life;
        
                if (dist > 0) {
                    dx += (distX / dist) * force;
                    dy += (distY / dist) * force;
                }
            }
        
            return { x: dx, y: dy };
        }
        
    });
}
