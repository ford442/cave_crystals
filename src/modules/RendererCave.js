import { COLORS, CAVE_SEED_BASE, CAVE_SEED_WIDTH_FACTOR, CAVE_SEED_HEIGHT_FACTOR, CAVE_VEIN_COLORS } from './RendererConstants.js';

export function installRendererCave(Renderer) {
    Object.assign(Renderer.prototype, {
        _initCaveGeometry(w, h) {
            let seed = ((CAVE_SEED_BASE + Math.floor(w) * CAVE_SEED_WIDTH_FACTOR + Math.floor(h) * CAVE_SEED_HEIGHT_FACTOR) | 0) >>> 0;
            const rand = () => {
                seed = ((seed * 1664525 + 1013904223) | 0) >>> 0;
                return seed / 4294967296;
            };
        
            const topCount = 9 + Math.floor(rand() * 5);
            const topStalactites = [];
            for (let i = 0; i < topCount; i++) {
                topStalactites.push({
                    x: rand() * w,
                    w: 30 + rand() * 90,
                    depth: 40 + rand() * 120,
                    baseDepth: 10 + rand() * 25,
                    colorIdx: Math.floor(rand() * 5),
                });
            }
            topStalactites.sort((a, b) => a.x - b.x);
        
            const botCount = 8 + Math.floor(rand() * 5);
            const bottomStalactites = [];
            for (let i = 0; i < botCount; i++) {
                bottomStalactites.push({
                    x: rand() * w,
                    w: 30 + rand() * 90,
                    depth: 40 + rand() * 120,
                    baseDepth: 10 + rand() * 25,
                    colorIdx: Math.floor(rand() * 5),
                });
            }
            bottomStalactites.sort((a, b) => a.x - b.x);
        
            const veins = [];
            for (let i = 0; i < 14; i++) {
                const onLeft = i < 7;
                const startX = onLeft ? rand() * w * 0.18 : w * 0.82 + rand() * w * 0.18;
                const startY = rand() * h;
                const points = [{ x: startX, y: startY }];
                let cx = startX, cy = startY;
                const segments = 3 + Math.floor(rand() * 3);
                for (let s = 0; s < segments; s++) {
                    cx += (onLeft ? 1 : -1) * (15 + rand() * 35);
                    cy += (rand() - 0.5) * 80;
                    points.push({ x: Math.max(0, Math.min(w, cx)), y: Math.max(0, Math.min(h, cy)) });
                }
                veins.push({
                    points,
                    color: CAVE_VEIN_COLORS[Math.floor(rand() * CAVE_VEIN_COLORS.length)],
                    width: 1 + rand() * 3,
                    phase: rand() * Math.PI * 2,
                    pulseSpeed: 0.4 + rand() * 0.8,
                });
            }
        
            const bioPatches = [];
            for (let i = 0; i < 10; i++) {
                const onLeft = i < 5;
                bioPatches.push({
                    x: onLeft ? rand() * w * 0.15 : w * 0.85 + rand() * w * 0.15,
                    y: rand() * h,
                    radius: 25 + rand() * 55,
                    colorIdx: Math.floor(rand() * 5),
                    phase: rand() * Math.PI * 2,
                });
            }
        
            const dripSpawnPositions = topStalactites.map(st => ({
                x: st.x,
                y: st.baseDepth + st.depth,
            }));
        
            return { topStalactites, bottomStalactites, veins, bioPatches, dripSpawnPositions };
        }
        ,
        drawCaveLayers(gameState, timestamp) {
            const profile = this.getQualityProfile(gameState.renderQuality);
            const caveDetail = profile.caveDetail || 'low';
            const { width: w, height: h } = this;
        
            if (!this._caveGeometry || this._caveGeometryW !== w || this._caveGeometryH !== h) {
                this._caveGeometry = this._initCaveGeometry(w, h);
                this._caveGeometryW = w;
                this._caveGeometryH = h;
            }
            const geo = this._caveGeometry;
            const ctx = this.ctx;
            const time = timestamp * 0.001;
        
            const shakeX = gameState.shakeOffset ? gameState.shakeOffset.x : 0;
            const shakeY = gameState.shakeOffset ? gameState.shakeOffset.y : 0;
        
            ctx.save();
            const farGrad = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
            farGrad.addColorStop(0, 'rgba(5, 0, 15, 0.0)');
            farGrad.addColorStop(1, 'rgba(0, 0, 8, 0.85)');
            ctx.fillStyle = farGrad;
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        
            if (caveDetail === 'low') return;
        
            const dangerBoost = (gameState.criticalIntensity || 0) * 0.6;
            const comboBoost = Math.min((gameState.combo || 0) / 20, 1) * 0.3;
        
            ctx.save();
            ctx.translate(shakeX * 0.08, shakeY * 0.08);
            ctx.globalCompositeOperation = 'screen';
            for (const vein of geo.veins) {
                const pulse = 0.3 + 0.35 * Math.sin(time * vein.pulseSpeed + vein.phase) + dangerBoost * 0.3 + comboBoost * 0.15;
                const alpha = Math.max(0, Math.min(1, pulse));
                const rgb = this.hexToRgb(vein.color);
                if (!rgb) continue;
                ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
                ctx.lineWidth = vein.width * (1 + pulse * 0.5);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.shadowColor = vein.color;
                ctx.shadowBlur = 6 + pulse * 10;
                ctx.beginPath();
                ctx.moveTo(vein.points[0].x, vein.points[0].y);
                for (let i = 1; i < vein.points.length; i++) {
                    ctx.lineTo(vein.points[i].x, vein.points[i].y);
                }
                ctx.stroke();
            }
            ctx.shadowBlur = 0;
            ctx.restore();
        
            if (caveDetail !== 'high') return;
        
            ctx.save();
            ctx.translate(shakeX * 0.12, shakeY * 0.12);
            ctx.globalCompositeOperation = 'screen';
            for (const patch of geo.bioPatches) {
                const pulse = 0.5 + 0.5 * Math.sin(time * 0.6 + patch.phase);
                const intensity = (0.10 + dangerBoost * 0.12 + comboBoost * 0.08) * pulse;
                if (intensity < 0.01) continue;
                const color = COLORS[patch.colorIdx];
                const rgb = this.hexToRgb(color.hex);
                if (!rgb) continue;
                const grad = ctx.createRadialGradient(patch.x, patch.y, 0, patch.x, patch.y, patch.radius);
                grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${intensity})`);
                grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(patch.x, patch.y, patch.radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
        ,
        drawCaveWallOverlays(gameState, timestamp) {
            const profile = this.getQualityProfile(gameState.renderQuality);
            const caveDetail = profile.caveDetail || 'low';
            if (caveDetail === 'low') return;
            if (!this._caveGeometry) return;
        
            const geo = this._caveGeometry;
            const ctx = this.ctx;
            const { width: w, height: h } = this;
            const time = timestamp * 0.001;
            const dangerLevel = gameState.criticalIntensity || 0;
            const combo = gameState.combo || 0;
        
            const top = geo.topStalactites;
            if (top.length > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(-1, -1);
                ctx.lineTo(-1, top[0].baseDepth);
                for (const st of top) {
                    ctx.lineTo(st.x - st.w * 0.5, st.baseDepth);
                    ctx.lineTo(st.x, st.baseDepth + st.depth);
                    ctx.lineTo(st.x + st.w * 0.5, st.baseDepth);
                }
                ctx.lineTo(w + 1, top[top.length - 1].baseDepth);
                ctx.lineTo(w + 1, -1);
                ctx.closePath();
                ctx.fillStyle = 'rgba(0, 0, 5, 0.92)';
                ctx.fill();
                if (dangerLevel > 0.1) {
                    const dangerAlpha = dangerLevel * 0.25 * (0.7 + 0.3 * Math.sin(time * 2.8));
                    ctx.fillStyle = `rgba(160, 20, 10, ${dangerAlpha})`;
                    ctx.fill();
                }
                ctx.restore();
            }
        
            const bot = geo.bottomStalactites;
            if (bot.length > 0) {
                ctx.save();
                ctx.beginPath();
                ctx.moveTo(-1, h + 1);
                ctx.lineTo(-1, h - bot[0].baseDepth);
                for (const st of bot) {
                    ctx.lineTo(st.x - st.w * 0.5, h - st.baseDepth);
                    ctx.lineTo(st.x, h - st.baseDepth - st.depth);
                    ctx.lineTo(st.x + st.w * 0.5, h - st.baseDepth);
                }
                ctx.lineTo(w + 1, h - bot[bot.length - 1].baseDepth);
                ctx.lineTo(w + 1, h + 1);
                ctx.closePath();
                ctx.fillStyle = 'rgba(0, 0, 5, 0.92)';
                ctx.fill();
                if (dangerLevel > 0.1) {
                    const dangerAlpha = dangerLevel * 0.25 * (0.7 + 0.3 * Math.sin(time * 2.8 + 1.0));
                    ctx.fillStyle = `rgba(160, 20, 10, ${dangerAlpha})`;
                    ctx.fill();
                }
                ctx.restore();
            }
        
            if (caveDetail === 'high') {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                for (const st of top) {
                    const tipX = st.x;
                    const tipY = st.baseDepth + st.depth;
                    const pulse = 0.5 + 0.5 * Math.sin(time * 1.2 + st.x * 0.01);
                    const glowR = 8 + pulse * 10 + dangerLevel * 6;
                    const color = COLORS[st.colorIdx];
                    const rgb = this.hexToRgb(color.hex);
                    if (!rgb) continue;
                    const grad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, glowR);
                    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.55 + pulse * 0.3})`);
                    grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(tipX, tipY, glowR, 0, Math.PI * 2);
                    ctx.fill();
                }
                for (const st of bot) {
                    const tipX = st.x;
                    const tipY = h - st.baseDepth - st.depth;
                    const pulse = 0.5 + 0.5 * Math.sin(time * 1.0 + st.x * 0.01 + 1.5);
                    const glowR = 8 + pulse * 10 + dangerLevel * 6;
                    const color = COLORS[st.colorIdx];
                    const rgb = this.hexToRgb(color.hex);
                    if (!rgb) continue;
                    const grad = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, glowR);
                    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.55 + pulse * 0.3})`);
                    grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(tipX, tipY, glowR, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
        
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                const edgeAlpha = 0.06 + dangerLevel * 0.06 + Math.min(combo / 25, 1) * 0.04;
                const leftSpill = ctx.createLinearGradient(0, 0, w * 0.18, 0);
                leftSpill.addColorStop(0, `rgba(80, 30, 120, ${edgeAlpha})`);
                leftSpill.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = leftSpill;
                ctx.fillRect(0, 0, w * 0.18, h);
                const rightSpill = ctx.createLinearGradient(w, 0, w * 0.82, 0);
                rightSpill.addColorStop(0, `rgba(80, 30, 120, ${edgeAlpha})`);
                rightSpill.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = rightSpill;
                ctx.fillRect(w * 0.82, 0, w * 0.18, h);
                ctx.restore();
            }
        }
        ,
        drawEnvironmentalParticles(particles, gameState, timestamp) {
            if (!particles || particles.length === 0) return;
            const ctx = this.ctx;
            const profile = this.getQualityProfile(gameState.renderQuality);
            const caveDetail = profile.caveDetail || 'low';
        
            ctx.save();
            for (const p of particles) {
                if (!p || p.life <= 0) continue;
                const alpha = Math.min(1, p.life * 2) * p.life;
        
                if (p.type === 'drip') {
                    if (p.glowing) {
                        ctx.globalCompositeOperation = 'screen';
                        const rgb = this.hexToRgb(p.color || '#88CCFF');
                        ctx.fillStyle = rgb
                            ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.8})`
                            : `rgba(136, 204, 255, ${alpha * 0.8})`;
                    } else {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.fillStyle = `rgba(160, 200, 240, ${alpha * 0.6})`;
                    }
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    if (p.size > 1.2 && p.vy > 0.5) {
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y - p.vy * 1.5);
                        ctx.lineTo(p.x, p.y + p.size);
                        ctx.strokeStyle = ctx.fillStyle;
                        ctx.lineWidth = p.size * 0.8;
                        ctx.stroke();
                    }
                } else if (p.type === 'mote') {
                    ctx.globalCompositeOperation = 'screen';
                    const rgb = this.hexToRgb(p.color || '#FFAA44');
                    ctx.fillStyle = rgb
                        ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.7})`
                        : `rgba(255, 170, 68, ${alpha * 0.7})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                    if (caveDetail === 'high' && rgb) {
                        const haloGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
                        haloGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha * 0.3})`);
                        haloGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
                        ctx.fillStyle = haloGrad;
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
                        ctx.fill();
                    }
                } else if (p.type === 'rockdust') {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.fillStyle = `rgba(100, 90, 80, ${alpha * 0.55})`;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
            ctx.globalCompositeOperation = 'source-over';
            ctx.restore();
        }
    });
}
