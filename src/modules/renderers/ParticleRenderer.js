/** @import { RendererHost } from './RendererHost.js' */

import { PARTICLE_LOD, shouldDrawParticleWithStride } from '../RendererConstants.js';

export class ParticleRenderer {
    /** @param {RendererHost} host */
    constructor(host) {
        this.host = host;
    }

    drawShockwave(sw) {
        const prevAlpha = this.host.ctx.globalAlpha;
        const prevComposite = this.host.ctx.globalCompositeOperation;
        const prevLineWidth = this.host.ctx.lineWidth;
        const prevStrokeStyle = this.host.ctx.strokeStyle;
        this.host.ctx.globalAlpha = Math.max(0, sw.life);
    
        // JUICE: Fancy Shockwave with composite effect
        this.host.ctx.globalCompositeOperation = 'lighter';
        this.host.ctx.lineWidth = sw.width;
        this.host.ctx.strokeStyle = sw.color;
    
        // Outer ring
        this.host.ctx.beginPath();
        this.host.ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        this.host.ctx.stroke();
    
        // Inner Echo ring (Juice!)
        if (sw.life > 0.5) {
             this.host.ctx.lineWidth = sw.width * 0.5;
             this.host.ctx.globalAlpha = Math.max(0, sw.life * 0.5);
             this.host.ctx.beginPath();
             this.host.ctx.arc(sw.x, sw.y, sw.radius * 0.7, 0, Math.PI * 2);
             this.host.ctx.stroke();
        }
    
        this.host.ctx.globalAlpha = prevAlpha;
        this.host.ctx.globalCompositeOperation = prevComposite;
        this.host.ctx.lineWidth = prevLineWidth;
        this.host.ctx.strokeStyle = prevStrokeStyle;
    }

    drawEnergyRing(ring) {
        const prevAlpha = this.host.ctx.globalAlpha;
        const prevComposite = this.host.ctx.globalCompositeOperation;
        const prevLineWidth = this.host.ctx.lineWidth;
        const prevStrokeStyle = this.host.ctx.strokeStyle;
        const prevShadowBlur = this.host.ctx.shadowBlur;
        const prevShadowColor = this.host.ctx.shadowColor;
    
        const alpha = Math.max(0, ring.life);
        this.host.ctx.globalCompositeOperation = 'lighter';
        this.host.ctx.shadowColor = ring.color;
        this.host.ctx.shadowBlur = ring.isFlash ? 18 : 12;
    
        this.host.ctx.globalAlpha = alpha * (ring.isFlash ? 0.95 : 0.85);
        this.host.ctx.lineWidth = ring.width;
        this.host.ctx.strokeStyle = ring.color;
        this.host.ctx.beginPath();
        this.host.ctx.arc(ring.x, ring.y, ring.radius, 0, Math.PI * 2);
        this.host.ctx.stroke();
    
        if (!ring.isFlash && ring.comboLevel > 1 && ring.life > 0.25) {
            this.host.ctx.globalAlpha = alpha * 0.35;
            this.host.ctx.lineWidth = ring.width * 0.5;
            this.host.ctx.beginPath();
            this.host.ctx.arc(ring.x, ring.y, ring.radius * 0.55, 0, Math.PI * 2);
            this.host.ctx.stroke();
        }
    
        this.host.ctx.globalAlpha = prevAlpha;
        this.host.ctx.globalCompositeOperation = prevComposite;
        this.host.ctx.lineWidth = prevLineWidth;
        this.host.ctx.strokeStyle = prevStrokeStyle;
        this.host.ctx.shadowBlur = prevShadowBlur;
        this.host.ctx.shadowColor = prevShadowColor;
    }

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

    _drawAuraParticle(p, alpha) {
        const ctx = this.host.ctx;
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

    _drawEmberParticle(p, alpha) {
        const ctx = this.host.ctx;
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

    _drawTrailParticle(p, alpha) {
        const ctx = this.host.ctx;
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

    _drawSparkParticle(p, alpha, screenSize) {
        const ctx = this.host.ctx;
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

    _drawShardParticle(p, alpha, screenSize) {
        const ctx = this.host.ctx;
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

    _drawDebrisParticle(p, alpha, screenSize) {
        const ctx = this.host.ctx;
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

    _drawChunkParticle(p, alpha, screenSize) {
        const ctx = this.host.ctx;
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

    _drawPhysicalParticle(p, alpha, screenSize) {
        const ctx = this.host.ctx;
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

    drawParticlesBatched(particles, particleLimit, stride, gameState) {
        const ctx = this.host.ctx;
        const trackMs = gameState && gameState.devPerfOverlay;
        const t0 = trackMs ? performance.now() : 0;
        const w = this.host.width;
        const h = this.host.height;

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

    drawTrailParticle(p) {
        const alpha = p._drawAlpha !== undefined ? p._drawAlpha : p.life;
        this.host.ctx.globalCompositeOperation = 'lighter';
        this._drawTrailParticle(p, alpha);
        this.host.ctx.globalCompositeOperation = 'source-over';
        this.host.ctx.globalAlpha = 1.0;
    }

    drawSoulParticle(sp) {
        // Outer glow halo using additive blending
        this.host.ctx.globalCompositeOperation = 'lighter';
        this.host.ctx.globalAlpha = (sp.life || 1.0) * 0.25;
        this.host.ctx.fillStyle = sp.color;
        this.host.ctx.beginPath();
        this.host.ctx.arc(sp.x, sp.y, sp.size * 3, 0, Math.PI * 2);
        this.host.ctx.fill();
        this.host.ctx.globalCompositeOperation = 'source-over';
    
        this.host.ctx.setTransform(1, 0, 0, 1, sp.x, sp.y);
    
        this.host.ctx.fillStyle = sp.color;
        this.host.ctx.globalAlpha = sp.life || 1.0;
    
        // Glowing Orb
        this.host.ctx.beginPath();
        this.host.ctx.arc(0, 0, sp.size, 0, Math.PI * 2);
        this.host.ctx.fill();
    
        // Inner white core
        this.host.ctx.fillStyle = '#fff';
        this.host.ctx.beginPath();
        this.host.ctx.arc(0, 0, sp.size * 0.4, 0, Math.PI * 2);
        this.host.ctx.fill();
    
        this.host.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.host.ctx.globalAlpha = 1.0;
    }

    drawFloatingText(ft) {
        this.host.ctx.setTransform(1, 0, 0, 1, ft.x, ft.y);
        // Apply rotation for high-value combo texts
        if (ft.rotation) {
            this.host.ctx.rotate(ft.rotation);
        }
        this.host.ctx.scale(ft.scale, ft.scale);
    
        // Outline
        this.host.ctx.strokeStyle = '#000';
        this.host.ctx.lineWidth = 3;
        this.host.ctx.lineJoin = 'round';
        this.host.ctx.globalAlpha = ft.life;
    
        // Text style
        this.host.ctx.font = 'bold 24px Arial, sans-serif';
        this.host.ctx.textAlign = 'center';
        this.host.ctx.textBaseline = 'middle';
    
        // Draw stroke and fill
        this.host.ctx.strokeText(ft.text, 0, 0);
        this.host.ctx.fillStyle = ft.color;
        this.host.ctx.fillText(ft.text, 0, 0);
    
        this.host.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.host.ctx.globalAlpha = 1.0;
    }
}
