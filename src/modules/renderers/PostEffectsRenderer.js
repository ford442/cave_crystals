import { COLORS, GAME_CONFIG } from '../RendererConstants.js';
import { Canvas2DPostFxBackend } from './postfx/Canvas2DPostFxBackend.js';
import { WebGL2PostFxBackend } from './postfx/WebGL2PostFxBackend.js';
import { buildPostFxUniforms } from './postfx/PostFxUniforms.js';
/** @import { RendererHost } from './RendererHost.js' */
/** @import { GameState, Launcher, RenderQualityProfile } from '../types.js' */
/** @import { PostFxUniforms } from './postfx/PostFxUniforms.js' */

/** @typedef {'webgl2' | 'canvas2d'} PostFxBackendId */

export class PostEffectsRenderer {
    /** @param {RendererHost} host */
    constructor(host) {
        this.host = host;
        this._canvas2d = new Canvas2DPostFxBackend(host);
        /** @type {WebGL2PostFxBackend | null} */
        this._webgl = null;
        /** @type {PostFxBackendId} */
        this._activeBackend = 'canvas2d';
    }

    /** @returns {PostFxBackendId} */
    get postFxBackend() {
        return this._activeBackend;
    }

    /**
     * @param {RenderQualityProfile} profile
     * @param {GameState} gameState
     * @returns {boolean}
     */
    usesWebGL(profile, gameState) {
        return this.resolveBackend(profile, gameState) === 'webgl2';
    }

    /**
     * @param {RenderQualityProfile} profile
     * @param {GameState} gameState
     * @returns {PostFxBackendId}
     */
    resolveBackend(profile, gameState) {
        if (typeof window !== 'undefined') {
            if (window.__FORCE_CANVAS_POSTFX__) return 'canvas2d';
            if (window.__FORCE_WEBGL_POSTFX__) {
                return this.host.postFxGlReady ? 'webgl2' : 'canvas2d';
            }
        }
        if (gameState.renderQuality !== 'high' || !profile.bloom) return 'canvas2d';
        return this.host.postFxGlReady ? 'webgl2' : 'canvas2d';
    }

    /**
     * @param {RenderQualityProfile} profile
     * @param {GameState} gameState
     */
    syncBackend(profile, gameState) {
        const next = this.resolveBackend(profile, gameState);
        if (next === 'webgl2') {
            this.host.ensureWebGLDisplay();
            if (!this._webgl && this.host.postFxGl) {
                try {
                    this._webgl = new WebGL2PostFxBackend(this.host.postFxGl);
                } catch (err) {
                    console.info('[PostFX] WebGL2 backend init failed; using Canvas2D.', err);
                    this.host.postFxGlReady = false;
                    this.host.ensureCanvas2DDisplay();
                    this._activeBackend = 'canvas2d';
                    return;
                }
            }
        } else {
            this.host.ensureCanvas2DDisplay();
        }
        this._activeBackend = next;
    }

    /**
     * @param {PostFxUniforms} uniforms
     * @param {HTMLCanvasElement} sceneCanvas
     */
    runGpuPass(uniforms, sceneCanvas) {
        if (!this._webgl || !this.host.postFxGl) return;
        this._webgl.render(uniforms, sceneCanvas);
    }

    /**
     * @param {GameState} gameState
     * @param {RenderQualityProfile} profile
     * @param {Launcher | null | undefined} launcher
     * @param {number} timestamp
     */
    buildUniforms(gameState, profile, launcher, timestamp) {
        return buildPostFxUniforms(gameState, profile, launcher, this.host, timestamp);
    }

    /**
     * @param {CanvasRenderingContext2D | null | undefined} [targetCtx]
     * @returns {CanvasRenderingContext2D | null}
     */
    _resolveCtx(targetCtx) {
        return targetCtx || this.host.ctx;
    }

    /**
     * @param {number} intensity
     * @param {number} timestamp
     * @param {CanvasRenderingContext2D | null | undefined} [targetCtx]
     */
    drawVignette(intensity, timestamp, targetCtx) {
        const ctx = this._resolveCtx(targetCtx);
        if (!ctx) return;

        const pulse = 0.5 + 0.5 * Math.sin(timestamp / 200);
        const alpha = intensity * 0.6 * pulse;

        if (!this.host._vignetteGradient) {
            const radius = Math.max(this.host.width, this.host.height);
            this.host._vignetteGradient = ctx.createRadialGradient(
                this.host.width / 2, this.host.height / 2, this.host.height * 0.2,
                this.host.width / 2, this.host.height / 2, radius * 0.8
            );
            this.host._vignetteGradient.addColorStop(0, 'rgba(255, 0, 0, 0)');
            this.host._vignetteGradient.addColorStop(1, 'rgba(255, 0, 0, 1)');
        }

        const prevAlpha = ctx.globalAlpha;
        const prevFillStyle = ctx.fillStyle;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.host._vignetteGradient;
        ctx.fillRect(0, 0, this.host.width, this.host.height);
        ctx.globalAlpha = prevAlpha;

        if (intensity > 0.8 && pulse > 0.8) {
            const prevFont = ctx.font;
            const prevTextAlign = ctx.textAlign;
            const prevTextBaseline = ctx.textBaseline;
            ctx.font = 'bold 60px Righteous, monospace';
            ctx.fillStyle = `rgba(255, 0, 0, ${intensity})`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('CRITICAL!', this.host.width / 2, this.host.height * 0.3);
            ctx.font = prevFont;
            ctx.textAlign = prevTextAlign;
            ctx.textBaseline = prevTextBaseline;
            ctx.fillStyle = prevFillStyle;
        } else {
            ctx.fillStyle = prevFillStyle;
        }
    }

    drawLighting(gameState, launcher, profile, timestamp) {
        const ctx = this.host.ctx;
        if (!ctx) return;

        ctx.globalCompositeOperation = 'lighter';
        const time = timestamp / 1000;

        const drawLight = (x, y, color, radius, intensity = 1.0) => {
            const bucketRadius = Math.floor(radius / 25) * 25 + 25;
            const cacheKey = `${color}-${bucketRadius}`;
            let grad = this.host._gradientCache.get(cacheKey);
            if (!grad) {
                grad = ctx.createRadialGradient(0, 0, 0, 0, 0, bucketRadius);
                const rgb = this.host.hexToRgb(color) || { r: 255, g: 255, b: 255 };
                grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1.0)`);
                grad.addColorStop(0.3, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.5)`);
                grad.addColorStop(0.6, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                this.host._gradientCache.set(cacheKey, grad);
            }
            const prevAlpha = ctx.globalAlpha;
            ctx.globalAlpha = intensity;
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = prevAlpha;
        };

        gameState.crystals.forEach(c => {
            const x = (c.lane * this.host.laneWidth) + (this.host.laneWidth / 2);
            const h = c.height * (c.scaleY || 1.0);
            const y = c.type === 'top' ? h - 20 : this.host.height - h + 20;
            const pulse = Math.sin((time * 3) + c.lightPhase) * 0.2 + 0.8;
            const flashBonus = c.flash * 2.0;
            const radius = 150 + (flashBonus * 100) + (h * 0.3);
            const intensity = (0.3 + (flashBonus * 0.5)) * pulse;
            const col = COLORS[c.colorIdx].hex;
            drawLight(x, y, col, radius, intensity);

            if (profile.crystalDetail === 'high') {
                const baseY = c.type === 'top' ? 10 : this.host.height - 10;
                drawLight(x, baseY, col, radius * 0.5, intensity * 0.25);
            }

            if (profile.crystalDetail !== 'low' && launcher) {
                const dx = launcher.x - x;
                const dist = Math.abs(dx);
                if (dist < 300) {
                    const rimFalloff = 1 - dist / 300;
                    const rimX = x + (dx > 0 ? -15 : 15);
                    drawLight(rimX, y, '#ffffff', 20, rimFalloff * 0.2 * pulse);
                }
            }

            if (profile.crystalDetail !== 'low' && c.lane === 0) {
                ctx.setTransform(0.3, 0, 0, 2.0, 0, y);
                drawLight(0, 0, col, radius * 1.5, intensity * 0.5);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
            if (profile.crystalDetail !== 'low' && c.lane === GAME_CONFIG.lanes - 1) {
                ctx.setTransform(0.3, 0, 0, 2.0, this.host.width, y);
                drawLight(0, 0, col, radius * 1.5, intensity * 0.5);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
        });

        gameState.spores.forEach(s => {
            drawLight(s.x, s.y, COLORS[s.colorIdx].hex, s.radius * 4, 0.6);
        });

        if (launcher) {
            drawLight(launcher.x, launcher.y, '#00FFFF', 100 + launcher.recoil * 5, 0.4);
        }

        if (gameState.soulParticles) {
            gameState.soulParticles.forEach(sp => {
                drawLight(sp.x, sp.y, sp.color, 40, 0.6);
            });
        }

        const particleCount = gameState.particles ? gameState.particles.length : 0;
        if (profile.crystalDetail !== 'low' && particleCount <= 50) {
            let litCount = 0;
            for (let i = 0; i < particleCount && litCount < 15; i++) {
                const p = gameState.particles[i];
                if (p.size > 4) {
                    drawLight(p.x, p.y, p.color, p.size * 4, 0.3 * p.life);
                    litCount++;
                }
            }
        }

        ctx.globalCompositeOperation = 'source-over';
    }

    drawDust(particles, maxCount = 100) {
        const ctx = this.host.ctx;
        if (!ctx || !particles) return;
        const prevFillStyle = ctx.fillStyle;
        ctx.fillStyle = 'rgb(200, 220, 255)';
        const count = Math.min(particles.length, maxCount);
        for (let i = 0; i < count; i++) {
            const p = particles[i];
            ctx.globalAlpha = p.renderAlpha || 0.1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = prevFillStyle;
    }

    /**
     * @param {number} intensity
     * @param {string} [color]
     * @param {CanvasRenderingContext2D | null | undefined} [targetCtx]
     */
    drawImpactFlash(intensity, color = '#fff', targetCtx) {
        const ctx = this._resolveCtx(targetCtx);
        if (!ctx) return;
        const prevComposite = ctx.globalCompositeOperation;
        const prevAlpha = ctx.globalAlpha;
        const prevFillStyle = ctx.fillStyle;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = color;
        ctx.globalAlpha = intensity;
        ctx.fillRect(0, 0, this.host.width, this.host.height);
        ctx.globalCompositeOperation = prevComposite;
        ctx.globalAlpha = prevAlpha;
        ctx.fillStyle = prevFillStyle;
    }

    drawVolumetricFog(gameState, profile, timestamp) {
        const ctx = this.host.ctx;
        if (!ctx) return;

        if (!this.host._fogGradient) {
            this.host._fogGradient = ctx.createLinearGradient(0, 0, 0, this.host.height);
            this.host._fogGradient.addColorStop(0, 'rgba(70, 95, 130, 0.22)');
            this.host._fogGradient.addColorStop(0.5, 'rgba(30, 60, 95, 0.08)');
            this.host._fogGradient.addColorStop(1, 'rgba(5, 15, 28, 0.32)');
        }

        const prevAlpha = ctx.globalAlpha;
        const prevComposite = ctx.globalCompositeOperation;
        const prevFillStyle = ctx.fillStyle;
        ctx.fillStyle = this.host._fogGradient;
        ctx.fillRect(0, 0, this.host.width, this.host.height);

        const danger = gameState.criticalIntensity || 0;
        const combo = gameState.combo || 0;
        const comboT = combo > 2 ? Math.min(1, (combo - 2) / 10) : 0;
        const pulse = 0.04 + Math.sin(timestamp / 1600) * 0.02 + comboT * 0.012;
        ctx.globalAlpha = Math.max(0.02, pulse);
        ctx.globalCompositeOperation = 'screen';

        if (!this.host._fogSweepGrad) {
            this.host._fogSweepGrad = ctx.createLinearGradient(-120, 0, 120, this.host.height);
            this.host._fogSweepGrad.addColorStop(0, 'rgba(255,255,255,0)');
            this.host._fogSweepGrad.addColorStop(0.5, 'rgba(170,220,255,0.32)');
            this.host._fogSweepGrad.addColorStop(1, 'rgba(255,255,255,0)');
        }

        const sweeps = profile.crystalDetail === 'high' ? 3 : 1;
        for (let i = 0; i < sweeps; i++) {
            const x = ((timestamp * 0.01) + (i * this.host.width * 0.35)) % (this.host.width + 240) - 120;
            ctx.save();
            ctx.translate(x, 0);
            ctx.fillStyle = this.host._fogSweepGrad;
            ctx.fillRect(-120, 0, 240, this.host.height);
            ctx.restore();
        }

        if (danger > 0.05) {
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = danger * 0.06;
            ctx.fillStyle = 'rgba(255, 40, 10, 1)';
            ctx.fillRect(0, 0, this.host.width, this.host.height);
        }
        if (comboT > 0) {
            const shimmer = 0.5 + 0.5 * Math.sin(timestamp / 900);
            ctx.globalCompositeOperation = 'screen';
            ctx.globalAlpha = comboT * 0.028 * shimmer;
            ctx.fillStyle = 'rgba(255, 200, 80, 1)';
            ctx.fillRect(0, 0, this.host.width, this.host.height);
        }

        ctx.globalAlpha = prevAlpha;
        ctx.globalCompositeOperation = prevComposite;
        ctx.fillStyle = prevFillStyle;
    }

    _getShaftColorGradient(r, g, b, shaftH, ctx) {
        if (this.host._shaftGradCacheH !== shaftH) {
            this.host._shaftGradCache.clear();
            this.host._shaftGradCacheH = shaftH;
        }
        const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
        let grad = this.host._shaftGradCache.get(key);
        if (!grad) {
            grad = ctx.createLinearGradient(0, 0, 0, shaftH);
            grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.45)`);
            grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.18)`);
            grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
            this.host._shaftGradCache.set(key, grad);
        }
        return grad;
    }

    _ensureShaftDustMotes() {
        if (this.host._shaftDustMotes) return;
        this.host._shaftDustMotes = [];
        for (let i = 0; i < 14; i++) {
            this.host._shaftDustMotes.push({
                nx: 0.12 + (i * 0.063) % 0.76,
                ny: (i * 0.11 + 0.05) % 0.88,
                phase: i * 1.73,
                size: 0.55 + (i % 4) * 0.32,
                drift: 0.25 + (i % 5) * 0.12,
            });
        }
    }

    _drawShaftDustMotes(sx, topW, botW, shaftH, angOff, time, opacity, r, g, b, ctx) {
        this._ensureShaftDustMotes();
        const prevFill = ctx.fillStyle;
        for (const m of this.host._shaftDustMotes) {
            const ny = (m.ny + Math.sin(time * m.drift + m.phase) * 0.018) % 1;
            const y = ny * shaftH;
            const widthAtY = topW + (botW - topW) * ny;
            const nx = m.nx + Math.sin(time * (m.drift * 1.4) + m.phase * 1.3) * 0.035;
            const x = sx + (nx - 0.5) * 2 * widthAtY + angOff * ny;
            const twinkle = 0.35 + 0.65 * Math.sin(time * 2.8 + m.phase);
            ctx.globalAlpha = opacity * 0.22 * twinkle;
            ctx.fillStyle = `rgba(${Math.min(255, r + 40)}, ${Math.min(255, g + 30)}, ${Math.min(255, b + 20)}, 1)`;
            ctx.beginPath();
            ctx.arc(x, y, m.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = prevFill;
    }

  /**
   * @param {GameState} gameState
   * @param {Launcher | null | undefined} launcher
   * @param {number} [timestamp]
   * @param {RenderQualityProfile} [profile]
   * @param {CanvasRenderingContext2D | null | undefined} [targetCtx]
   */
    drawLightShafts(gameState, launcher, timestamp = 0, profile = {}, targetCtx) {
        const ctx = this._resolveCtx(targetCtx);
        if (!ctx) return;

        const time = timestamp / 1000;
        const danger = gameState.criticalIntensity || 0;
        const combo = gameState.combo || 0;
        const comboBoost = combo > 2 ? Math.min(1, (combo - 2) / 10) * 0.18 : 0;
        const dangerWidth = 1 + danger * 0.22;
        const dangerOpacity = 1 + danger * 0.35;
        const shaftDust = profile.shaftDust === true;

        ctx.save();
        ctx.globalCompositeOperation = 'screen';

        const sources = [];
        const lane = launcher ? launcher.targetLane : Math.floor(GAME_CONFIG.lanes / 2);
        const centerX = (lane * this.host.laneWidth) + (this.host.laneWidth / 2);
        sources.push({ x: centerX, intensity: 0.13 + comboBoost, r: 180, g: 255, b: 255 });

        for (let i = 0; i < gameState.crystals.length && sources.length < 5; i++) {
            const c = gameState.crystals[i];
            if (c.flash < 0.05 && c.height < 90) continue;
            const cx = (c.lane * this.host.laneWidth) + (this.host.laneWidth / 2);
            const col = COLORS[c.colorIdx];
            const rgb = this.host.hexToRgb(col.hex) || { r: 180, g: 255, b: 255 };
            sources.push({ x: cx, intensity: 0.055 + c.flash * 0.10, r: rgb.r, g: rgb.g, b: rgb.b });
        }

        if (gameState.shockwaves) {
            for (let i = 0; i < gameState.shockwaves.length && sources.length < 7; i++) {
                const sw = gameState.shockwaves[i];
                if (sw.life <= 0.25 || sw.y > this.host.height * 0.55) continue;
                sources.push({ x: sw.x, intensity: sw.life * 0.14, r: 255, g: 230, b: 180 });
            }
        }

        const shaftH = this.host.height * 0.68;

        for (let si = 0; si < sources.length; si++) {
            const { x, intensity, r, g, b } = sources[si];
            const isPrimary = si === 0;
            const critMod = isPrimary ? dangerWidth : 1;
            const critAlpha = isPrimary ? dangerOpacity : 1;

            for (let i = -1; i <= 1; i++) {
                const angleNoise = Math.sin(time * 0.65 + i * 1.3 + si) * 0.025;
                const widthMod = (1 + Math.sin(time * 1.05 + i * 0.85 + si * 0.7) * 0.14) * critMod;
                const opacityPulse = intensity * critAlpha * (0.8 + Math.sin(time * 2.2 + i * 2.0 + si) * 0.2);

                const sx = x + (i * this.host.laneWidth * 0.8);
                const topW = 45 * widthMod;
                const botW = 175 * widthMod;
                const angOff = angleNoise * shaftH * 0.35;

                ctx.save();
                ctx.beginPath();
                ctx.moveTo(sx - topW, 0);
                ctx.lineTo(sx + topW, 0);
                ctx.lineTo(sx + botW + angOff, shaftH);
                ctx.lineTo(sx - botW + angOff, shaftH);
                ctx.closePath();
                ctx.clip();

                ctx.globalAlpha = opacityPulse;
                ctx.fillStyle = this._getShaftColorGradient(r, g, b, shaftH, ctx);
                ctx.fillRect(sx - botW - 20, 0, (botW + topW) * 2 + 40, shaftH);

                if (this.host._grainPattern && isPrimary) {
                    ctx.globalAlpha = opacityPulse * (0.08 + danger * 0.04);
                    ctx.fillStyle = this.host._grainPattern;
                    ctx.fillRect(sx - botW - 20, 0, (botW + topW) * 2 + 40, shaftH);
                }

                if (shaftDust && isPrimary && i === 0) {
                    this._drawShaftDustMotes(sx, topW, botW, shaftH, angOff, time, opacityPulse, r, g, b, ctx);
                }

                ctx.restore();
            }
        }

        ctx.globalAlpha = 1.0;
        ctx.restore();
    }

    /**
     * @param {GameState} gameState
     * @param {RenderQualityProfile} profile
     */
    drawBloom(gameState, profile) {
        this._canvas2d.drawBloom(gameState, profile);
    }

    /**
     * @param {GameState} gameState
     * @param {number} timestamp
     */
    drawColorGrade(gameState, timestamp) {
        this._canvas2d.drawColorGrade(gameState, timestamp);
    }

    /**
     * @param {GameState} gameState
     * @param {number} timestamp
     * @param {RenderQualityProfile} profile
     */
    drawFilmPass(gameState, timestamp, profile) {
        this._canvas2d.drawFilmPass(gameState, timestamp, profile, (intensity, ts) => {
            this.drawVignette(intensity, ts);
        });
    }

    /**
     * Canvas2D overlay pass after WebGL (scanlines, glitch, critical vignette).
     * @param {GameState} gameState
     * @param {number} timestamp
     * @param {RenderQualityProfile} profile
     * @param {CanvasRenderingContext2D | null | undefined} [targetCtx]
     */
    drawOverlayFilmPass(gameState, timestamp, profile, targetCtx) {
        const ctx = this._resolveCtx(targetCtx);
        if (!ctx) return;

        const motionScale = gameState.motionScale ?? 1;

        if (gameState.criticalIntensity > 0.01) {
            this.drawVignette(gameState.criticalIntensity * motionScale, timestamp, ctx);
        }

        const scanlineBase = profile.scanlineBase || 0;
        const scanlineIntensity = Math.min(1.0, scanlineBase + (gameState.criticalIntensity || 0) * 0.28) * motionScale;
        const prevCtx = this.host.ctx;
        this.host.ctx = ctx;
        this.host.crystal.drawScanlines(scanlineIntensity);
        if ((gameState.criticalIntensity || 0) > 0.2) {
            this.host.crystal.drawGlitch(gameState.criticalIntensity * motionScale);
        }
        this.host.ctx = prevCtx;
    }
}
