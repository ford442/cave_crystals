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

        this.ctx.save();

        const isShaking = gameState.shake > 2;

        if (gameState.shake > 0) {
            const dx = (Math.random() - 0.5) * gameState.shake;
            const dy = (Math.random() - 0.5) * gameState.shake;
            this.ctx.translate(dx, dy);
        }

        this.drawGuides();

        // Draw Crystals with Chromatic Aberration if shaking
        gameState.crystals.forEach(c => {
             if (isShaking) {
                 this.ctx.globalCompositeOperation = 'screen';
                 // Red Channel Offset
                 this.ctx.save();
                 this.ctx.translate(-3, 0);
                 this.drawComplexCrystal(c, 'red');
                 this.ctx.restore();

                 // Blue Channel Offset
                 this.ctx.save();
                 this.ctx.translate(3, 0);
                 this.drawComplexCrystal(c, 'blue');
                 this.ctx.restore();

                 this.ctx.globalCompositeOperation = 'source-over';
             }
             this.drawComplexCrystal(c);
        });

        this.drawCursor(gameState, launcher);
        gameState.spores.forEach(s => this.drawSpore(s));
        gameState.particles.forEach(p => this.drawParticle(p));

        if (gameState.shockwaves) {
            gameState.shockwaves.forEach(sw => this.drawShockwave(sw));
        }

        if (gameState.floatingTexts) {
            gameState.floatingTexts.forEach(ft => this.drawFloatingText(ft));
        }

        this.ctx.restore();

        // Draw Impact Flash (independent of shake translation)
        if (gameState.impactFlash > 0) {
            this.drawImpactFlash(gameState.impactFlash);
        }
    }

    drawImpactFlash(intensity) {
        this.ctx.save();
        // Use 'lighter' or just alpha blend
        this.ctx.fillStyle = `rgba(255, 255, 255, ${intensity})`;
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

    drawCursor(gameState, launcher) {
        if(!gameState.active || !launcher) return;

        // Draw Guide Line for Target Lane (where mouse is)
        // We use the launcher.targetLane for the guide to show where you are aiming
        const targetLaneX = (launcher.targetLane * this.laneWidth) + (this.laneWidth / 2);

        this.ctx.beginPath();
        this.ctx.setLineDash([5, 15]);
        this.ctx.moveTo(targetLaneX, 0);
        this.ctx.lineTo(targetLaneX, this.height);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw Actual Launcher Entity (Visual Position)
        this.ctx.save();
        this.ctx.translate(launcher.x, launcher.y);
        this.ctx.rotate(launcher.tilt);
        this.ctx.scale(launcher.scaleX, launcher.scaleY);

        // Apply recoil offset (kick back is usually down or up depending on perspective,
        // here let's say "back" means away from center, but since it's 2D side/top hybrid?
        // Let's assume recoil pushes it "down" the screen slightly if shooting up?
        // Actually, shooting spores might be "in" or "up".
        // Let's just translate Y by recoil.
        // Assuming shooting "forward" (away from player?) No, game is lanes.
        // Spore moves from launcher.y (middle?) out?
        // Wait, Game.js says: y = this.renderer.height / 2;
        // Crystals are at top and bottom.
        // So launcher is in the middle firing... both ways?
        // Spore update checks top and bottom.
        // Ah, the spore moves? Spore.radius expands.
        // Spore.update checks collisions.
        // Actually, Spore doesn't seem to move X/Y in update, it just expands radius?
        // "this.radius += GAME_CONFIG.sporeExpandRate;"
        // So the spore stays at (x,y) and grows until it hits top/bottom crystals.
        // So the launcher is in the center.

        // Recoil should probably just be a scale punch or a small shake.
        // But I added 'recoil' as a value. Let's map it to a slight Y offset
        // or maybe random jitter.
        // Let's translate Y by recoil * direction?
        // Let's just offset Y by recoil.
        this.ctx.translate(0, launcher.recoil);

        // Draw Juicy Launcher Shape (Triangle/Arrow)
        this.ctx.fillStyle = '#fff';
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = '#0ff';

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
        this.ctx.fillStyle = '#0ff';
        this.ctx.fill();

        this.ctx.beginPath();
        this.ctx.moveTo(0, 15);
        this.ctx.lineTo(8, -5);
        this.ctx.lineTo(0, 0);
        this.ctx.lineTo(-8, -5);
        this.ctx.closePath();
        this.ctx.fillStyle = '#0ff';
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
        this.ctx.lineWidth = sw.width;
        this.ctx.strokeStyle = sw.color;
        this.ctx.beginPath();
        this.ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawParticle(p) {
        const alpha = p.life / p.maxLife; // Normalize alpha
        this.ctx.globalAlpha = alpha;

        this.ctx.save();
        this.ctx.translate(p.x, p.y);
        this.ctx.rotate(p.rotation);

        // Draw shard shape instead of circle
        this.ctx.fillStyle = p.color;
        this.ctx.shadowBlur = 10 * alpha;
        this.ctx.shadowColor = p.color;

        this.ctx.beginPath();
        const s = p.size * alpha; // Scale down with life
        this.ctx.moveTo(0, -s);
        this.ctx.lineTo(s * 0.8, s * 0.8);
        this.ctx.lineTo(-s * 0.8, s * 0.8);
        this.ctx.closePath();
        this.ctx.fill();

        this.ctx.restore();

        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = 1.0;
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
        const xCenter = (c.lane * this.laneWidth) + (this.laneWidth / 2);

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

        // Enhanced glow effect
        if (c.flash > 0 && !colorOverride) {
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
            const baseY = (c.type === 'top') ? 0 : this.height;
            const tipY = (c.type === 'top') ? h : this.height - h;
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
}
