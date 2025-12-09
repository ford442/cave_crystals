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

    draw(gameState) {
        if (!this.ctx) return;
        this.clear();
        this.drawGuides();
        gameState.crystals.forEach(c => this.drawComplexCrystal(c));
        this.drawCursor(gameState);
        gameState.spores.forEach(s => this.drawSpore(s));
        gameState.particles.forEach(p => this.drawParticle(p));
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

    drawCursor(gameState) {
        if(!gameState.active) return;
        const laneX = (gameState.mouseLane * this.laneWidth) + (this.laneWidth / 2);

        this.ctx.beginPath();
        this.ctx.setLineDash([5, 15]);
        this.ctx.moveTo(laneX, 0);
        this.ctx.lineTo(laneX, this.height);
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        this.ctx.beginPath();
        this.ctx.arc(laneX, this.height/2, 8, 0, Math.PI*2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();
    }

    drawSpore(s) {
        const col = COLORS[s.colorIdx];

        // Glow
        this.ctx.shadowBlur = 30;
        this.ctx.shadowColor = col.hex;

        // Main body
        const grad = this.ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, col.hex);
        grad.addColorStop(1, 'transparent');

        this.ctx.fillStyle = grad;
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.radius, 0, Math.PI*2);
        this.ctx.fill();

        // Core
        this.ctx.beginPath();
        this.ctx.arc(s.x, s.y, s.radius * 0.4, 0, Math.PI*2);
        this.ctx.fillStyle = '#fff';
        this.ctx.fill();

        this.ctx.shadowBlur = 0;
    }

    drawParticle(p) {
        this.ctx.globalAlpha = p.life;
        this.ctx.shadowBlur = 10 * p.life;
        this.ctx.shadowColor = p.color;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        this.ctx.globalAlpha = 1.0;
    }

    drawComplexCrystal(c) {
        const xCenter = (c.lane * this.laneWidth) + (this.laneWidth / 2);
        const width = this.laneWidth * 0.8;
        const col = COLORS[c.colorIdx];
        const seed = c.shapeSeed;

        // Setup styles
        if (c.flash > 0) {
            this.ctx.shadowBlur = 30 * c.flash;
            this.ctx.shadowColor = 'white';
            this.ctx.fillStyle = '#fff';
            this.ctx.strokeStyle = '#fff';
        } else {
            this.ctx.shadowBlur = 25;
            this.ctx.shadowColor = col.glow;
            this.ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        }
        this.ctx.lineWidth = 1.5;
        this.ctx.lineJoin = 'round';

        const drawShard = (offsetX, hScale, wScale, tilt) => {
            const h = c.height * hScale;
            const w = width * wScale;
            const halfW = w / 2;
            const baseY = (c.type === 'top') ? 0 : this.height;
            const tipY = (c.type === 'top') ? h : this.height - h;
            const cx = xCenter + offsetX;

            // Gradient for depth
            const grad = this.ctx.createLinearGradient(cx, baseY, cx, tipY);
            if (c.flash > 0) {
                 grad.addColorStop(0, '#fff');
                 grad.addColorStop(1, '#fff');
            } else {
                 grad.addColorStop(0, col.hex);
                 grad.addColorStop(1, 'rgba(0,0,0,0.1)'); // Darken at tip or base
            }
            this.ctx.fillStyle = grad;

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

            this.ctx.fill();
            this.ctx.stroke();

            // Inner Facet for "3D" look
            if (c.flash < 0.5) {
                this.ctx.fillStyle = 'rgba(255,255,255,0.2)';
                this.ctx.beginPath();
                this.ctx.moveTo(cx - halfW*0.5, baseY);
                if (c.type === 'top') {
                    this.ctx.lineTo(cx + tilt*0.5, tipY * 0.8);
                } else {
                    this.ctx.lineTo(cx + tilt*0.5, this.height - ((this.height-tipY)*0.8));
                }
                this.ctx.lineTo(cx + halfW*0.5, baseY);
                this.ctx.fill();
            }
        };

        if (seed > 0.3) {
            drawShard(-width * 0.35, 0.6, 0.4, -5);
        }
        if (seed < 0.7) {
            drawShard(width * 0.35, 0.5, 0.4, 5);
        }

        drawShard(0, 1.0, 0.6, 0);

        this.ctx.shadowBlur = 0;
    }
}
