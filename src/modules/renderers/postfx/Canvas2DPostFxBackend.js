import { COLORS, FILM_GRAIN_REFRESH_INTERVAL_MS, FILM_GRAIN_HIGH_REFRESH_INTERVAL_MS, MAX_BLOOM_PARTICLES } from '../../RendererConstants.js';
/** @import { RendererHost } from '../RendererHost.js' */
/** @import { GameState, RenderQualityProfile } from '../../types.js' */

/**
 * Canvas 2D post-processing backend (bloom, color grade, film pass).
 */
export class Canvas2DPostFxBackend {
    /** @param {RendererHost} host */
    constructor(host) {
        this.host = host;
    }

    /** @returns {CanvasRenderingContext2D | null} */
    get ctx() {
        return this.host.ctx;
    }

    /**
     * @param {GameState} gameState
     * @param {RenderQualityProfile} profile
     */
    drawBloom(gameState, profile) {
        const host = this.host;
        const ctx = this.ctx;
        if (!ctx) return;

        const bw = host._bloomCanvas.width;
        const bh = host._bloomCanvas.height;
        const sx = bw / host.width;
        const sy = bh / host.height;
        const bctx = host._bloomCtx;
        const effectScale = gameState.adaptiveOverrides?.effectScale ?? 1.0;
        const strength = (profile.bloomStrength || 0.85) * effectScale;

        bctx.clearRect(0, 0, bw, bh);
        bctx.globalCompositeOperation = 'lighter';

        const drawBlob = (bx, by, radius, r, g, b, alpha) => {
            const cacheKey = `${Math.floor(r / 64) * 64}-${Math.floor(g / 64) * 64}-${Math.floor(b / 64) * 64}-${Math.floor(radius / 16) * 16}`;
            let grad = host._bloomGradCache.get(cacheKey);
            if (!grad) {
                grad = bctx.createRadialGradient(0, 0, 0, 0, 0, 1);
                grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
                grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.35)`);
                grad.addColorStop(1, 'rgba(0,0,0,0)');
                host._bloomGradCache.set(cacheKey, grad);
            }
            bctx.save();
            bctx.globalAlpha = alpha;
            bctx.translate(bx, by);
            bctx.scale(radius, radius);
            bctx.fillStyle = grad;
            bctx.beginPath();
            bctx.arc(0, 0, 1, 0, Math.PI * 2);
            bctx.fill();
            bctx.restore();
        };

        for (let i = 0; i < gameState.crystals.length; i++) {
            const c = gameState.crystals[i];
            const cx = ((c.lane * host.laneWidth) + (host.laneWidth / 2)) * sx;
            const h = c.height * (c.scaleY || 1.0);
            const cy = c.type === 'top' ? (h - 20) * sy : (host.height - h + 20) * sy;
            const flashBonus = c.flash * 2.0;
            const radius = (140 + flashBonus * 110 + h * 0.32) * sx * 1.8;
            const alpha = Math.min(1, (0.28 + flashBonus * 0.7) * strength);
            const col = COLORS[c.colorIdx];
            const rgb = host.hexToRgb(col.hex) || { r: 255, g: 255, b: 255 };
            drawBlob(cx, cy, radius, rgb.r, rgb.g, rgb.b, alpha);
        }

        for (let i = 0; i < gameState.spores.length; i++) {
            const s = gameState.spores[i];
            const cx = s.x * sx;
            const cy = s.y * sy;
            const radius = s.radius * sx * 7;
            const col = COLORS[s.colorIdx];
            const rgb = host.hexToRgb(col.hex) || { r: 255, g: 255, b: 255 };
            drawBlob(cx, cy, radius, rgb.r, rgb.g, rgb.b, 0.75 * strength);
        }

        if (gameState.particles) {
            const limit = Math.min(gameState.particles.length, MAX_BLOOM_PARTICLES);
            for (let i = 0; i < limit; i++) {
                const p = gameState.particles[i];
                if (p.size <= 3) continue;
                const alpha = (p.life / p.maxLife) * 0.35 * strength;
                if (alpha <= 0) continue;
                const radius = p.size * sx * 3.5;
                bctx.globalAlpha = alpha;
                bctx.fillStyle = p.color;
                bctx.beginPath();
                bctx.arc(p.x * sx, p.y * sy, radius, 0, Math.PI * 2);
                bctx.fill();
            }
            bctx.globalAlpha = 1.0;
        }

        if (gameState.impactFlash > 0.15) {
            bctx.globalAlpha = gameState.impactFlash * 0.4 * strength;
            bctx.fillStyle = gameState.impactFlashColor || '#ffffff';
            bctx.fillRect(0, 0, bw, bh);
            bctx.globalAlpha = 1.0;
        }

        bctx.globalCompositeOperation = 'source-over';

        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = strength * 0.42;
        ctx.drawImage(host._bloomCanvas, 0, 0, host.width, host.height);
        ctx.globalAlpha = strength * 0.18;
        ctx.drawImage(host._bloomCanvas, 0, 0, host.width, host.height);
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = prevOp;
    }

    /**
     * @param {GameState} gameState
     * @param {number} timestamp
     */
    drawColorGrade(gameState, timestamp) {
        const host = this.host;
        const ctx = this.ctx;
        if (!ctx) return;

        const time = timestamp / 1000;
        const prevOp = ctx.globalCompositeOperation;
        const prevAlpha = ctx.globalAlpha;
        const prevFill = ctx.fillStyle;
        const danger = gameState.criticalIntensity || 0;
        const combo = gameState.combo || 0;
        const comboT = combo > 2 ? Math.min(1, (combo - 2) / 8) : 0;
        const bloomSynergy = gameState.impactFlash > 0.1 ? gameState.impactFlash * 0.5 : 0;

        ctx.globalCompositeOperation = 'multiply';
        ctx.globalAlpha = 0.045 + comboT * 0.012;
        if (!host._colorGradeBaseGrad || host._colorGradeBaseGradH !== host.height) {
            host._colorGradeBaseGrad = ctx.createLinearGradient(0, 0, 0, host.height);
            host._colorGradeBaseGrad.addColorStop(0, 'rgba(150, 190, 255, 1)');
            host._colorGradeBaseGrad.addColorStop(1, 'rgba(70, 110, 200, 1)');
            host._colorGradeBaseGradH = host.height;
        }
        ctx.fillStyle = host._colorGradeBaseGrad;
        ctx.fillRect(0, 0, host.width, host.height);

        if (danger > 0) {
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = danger * 0.12;
            ctx.fillStyle = 'rgba(255, 55, 0, 1)';
            ctx.fillRect(0, 0, host.width, host.height);
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = danger * 0.05;
            ctx.fillStyle = 'rgba(80, 10, 0, 1)';
            ctx.fillRect(0, 0, host.width, host.height);
            if (danger > 0.25) {
                const bleedPulse = 0.7 + 0.3 * Math.sin(time * 3.2);
                ctx.globalCompositeOperation = 'soft-light';
                ctx.globalAlpha = (danger - 0.25) * 0.08 * bleedPulse;
                ctx.fillStyle = 'rgba(255, 90, 30, 1)';
                ctx.fillRect(0, 0, host.width, host.height);
            }
        }

        if (comboT > 0) {
            const shimmer = 0.5 + 0.5 * Math.sin(time * 3.5);
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = comboT * 0.068 * shimmer;
            if (!host._colorGradeComboGrad || host._colorGradeComboGradW !== host.width) {
                host._colorGradeComboGrad = ctx.createLinearGradient(0, 0, host.width, host.height);
                host._colorGradeComboGrad.addColorStop(0, 'rgba(255, 210, 60, 1)');
                host._colorGradeComboGrad.addColorStop(0.5, 'rgba(255, 175, 50, 1)');
                host._colorGradeComboGrad.addColorStop(1, 'rgba(255, 130, 30, 1)');
                host._colorGradeComboGradW = host.width;
            }
            ctx.fillStyle = host._colorGradeComboGrad;
            ctx.fillRect(0, 0, host.width, host.height);
            ctx.globalCompositeOperation = 'color-dodge';
            ctx.globalAlpha = comboT * 0.022 * (0.5 + 0.5 * Math.sin(time * 5.5));
            ctx.fillStyle = 'rgba(255, 240, 180, 1)';
            ctx.fillRect(0, 0, host.width, host.height);
        }

        if (bloomSynergy > 0) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = bloomSynergy * 0.12;
            ctx.fillStyle = gameState.impactFlashColor || '#ffffff';
            ctx.fillRect(0, 0, host.width, host.height);
        }

        ctx.globalCompositeOperation = prevOp;
        ctx.globalAlpha = prevAlpha;
        ctx.fillStyle = prevFill;
    }

    /**
     * @param {number} comboPulse
     */
    _drawBaseVignette(comboPulse = 0) {
        const host = this.host;
        const ctx = this.ctx;
        if (!ctx) return;

        if (!host._baseVignetteGradient) {
            const radius = Math.max(host.width, host.height);
            host._baseVignetteGradient = ctx.createRadialGradient(
                host.width / 2, host.height / 2, host.height * 0.28,
                host.width / 2, host.height / 2, radius * 0.92
            );
            host._baseVignetteGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
            host._baseVignetteGradient.addColorStop(1, 'rgba(0, 0, 10, 0.58)');
        }
        const prevAlpha = ctx.globalAlpha;
        const prevFill = ctx.fillStyle;
        ctx.globalAlpha = 1.0 - comboPulse * 0.04;
        ctx.fillStyle = host._baseVignetteGradient;
        ctx.fillRect(0, 0, host.width, host.height);
        if (comboPulse > 0.1) {
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = comboPulse * 0.035;
            ctx.fillStyle = 'rgba(255, 200, 120, 1)';
            ctx.fillRect(0, 0, host.width, host.height);
            ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = prevAlpha;
        ctx.fillStyle = prevFill;
    }

    /**
     * @param {number} timestamp
     * @param {number} grainAmount
     * @param {{ highQuality?: boolean, comboPulse?: number }} options
     */
    drawFilmGrain(timestamp, grainAmount = 1.0, options = {}) {
        const host = this.host;
        const ctx = this.ctx;
        if (!ctx || grainAmount <= 0) return;

        const highQuality = options.highQuality === true;
        const comboPulse = options.comboPulse || 0;
        const refreshMs = highQuality ? FILM_GRAIN_HIGH_REFRESH_INTERVAL_MS : FILM_GRAIN_REFRESH_INTERVAL_MS;
        const comboAlphaBoost = 1 + comboPulse * 0.18 * (0.6 + 0.4 * Math.sin(timestamp / 220));

        if (!host._lastGrainRefresh || timestamp - host._lastGrainRefresh > refreshMs) {
            const size = 256;
            const img = host._grainCtx.createImageData(size, size);
            for (let i = 0; i < img.data.length; i += 4) {
                const coarse = Math.random() * 28;
                const fine = Math.random() * 14;
                const micro = highQuality ? Math.random() * 8 : 0;
                const v = Math.floor(coarse * (highQuality ? 0.52 : 0.65) + fine * (highQuality ? 0.32 : 0.35) + micro * 0.16);
                img.data[i] = v;
                img.data[i + 1] = v;
                img.data[i + 2] = v;
                const alphaBase = highQuality ? 18 : 16;
                const alphaRange = highQuality ? 14 : 10;
                img.data[i + 3] = Math.floor(alphaBase + Math.random() * alphaRange);
            }
            host._grainCtx.putImageData(img, 0, 0);
            host._grainPattern = ctx.createPattern(host._grainCanvas, 'repeat');
            host._lastGrainRefresh = timestamp;
        }
        if (!host._grainPattern) return;

        const prevComposite = ctx.globalCompositeOperation;
        const prevAlpha = ctx.globalAlpha;
        const prevFillStyle = ctx.fillStyle;
        ctx.fillStyle = host._grainPattern;
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.11 * grainAmount * comboAlphaBoost * (highQuality ? 1.08 : 1.0);
        ctx.fillRect(0, 0, host.width, host.height);
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = (highQuality ? 0.052 : 0.04) * grainAmount * comboAlphaBoost;
        ctx.fillRect(0, 0, host.width, host.height);
        if (highQuality) {
            ctx.globalCompositeOperation = 'soft-light';
            ctx.globalAlpha = 0.028 * grainAmount * comboAlphaBoost;
            ctx.fillRect(0, 0, host.width, host.height);
        }
        ctx.globalCompositeOperation = prevComposite;
        ctx.globalAlpha = prevAlpha;
        ctx.fillStyle = prevFillStyle;
    }

    /**
     * @param {GameState} gameState
     * @param {number} timestamp
     * @param {RenderQualityProfile} profile
     * @param {(intensity: number, ts: number) => void} drawCriticalVignette
     */
    drawFilmPass(gameState, timestamp, profile, drawCriticalVignette) {
        const motionScale = gameState.motionScale ?? 1;
        const effectScale = (gameState.adaptiveOverrides?.effectScale ?? 1.0) * motionScale;
        const grainAmount = (profile.grainAmount || 0) * effectScale;
        const combo = gameState.combo || 0;
        const comboPulse = combo > 2 ? Math.min(1, (combo - 2) / 10) : 0;

        this._drawBaseVignette(profile.grainHighQuality ? comboPulse : 0);

        if (gameState.criticalIntensity > 0.01) {
            drawCriticalVignette(gameState.criticalIntensity * motionScale, timestamp);
        }

        const scanlineBase = profile.scanlineBase || 0;
        const scanlineIntensity = Math.min(1.0, scanlineBase + (gameState.criticalIntensity || 0) * 0.28) * motionScale;
        this.host.crystal.drawScanlines(scanlineIntensity);

        if ((gameState.criticalIntensity || 0) > 0.2) {
            this.host.crystal.drawGlitch(gameState.criticalIntensity * motionScale);
        }

        if (grainAmount > 0) {
            this.drawFilmGrain(timestamp, grainAmount, {
                highQuality: profile.grainHighQuality === true,
                comboPulse,
            });
        }
    }
}
