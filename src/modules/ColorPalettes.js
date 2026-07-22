// @ts-check

/** @import { ColorShape, PaletteColor } from './types.js' */

import { COLORS } from './Constants.js';

const DEFAULT_SHAPES = /** @type {ColorShape[]} */ (['circle', 'triangle', 'square', 'diamond', 'star']);
const DEFAULT_GLYPHS = ['R', 'E', 'S', 'A', 'M'];

/** @type {PaletteColor[]} */
export const DEFAULT_PALETTE = COLORS.map((c, i) => ({
    ...c,
    shape: DEFAULT_SHAPES[i % DEFAULT_SHAPES.length],
    glyph: DEFAULT_GLYPHS[i % DEFAULT_GLYPHS.length],
    shortLabel: DEFAULT_GLYPHS[i % DEFAULT_GLYPHS.length],
}));

/** Okabe-Ito inspired palette for color-blind accessibility */
/** @type {PaletteColor[]} */
export const COLOR_BLIND_PALETTE = [
    { name: 'Cobalt', hex: '#0072B2', glow: 'rgba(0, 114, 178, 0.6)', shape: 'circle', glyph: 'C', shortLabel: 'C' },
    { name: 'Tangerine', hex: '#E69F00', glow: 'rgba(230, 159, 0, 0.6)', shape: 'triangle', glyph: 'T', shortLabel: 'T' },
    { name: 'Sky', hex: '#56B4E9', glow: 'rgba(86, 180, 233, 0.6)', shape: 'square', glyph: 'K', shortLabel: 'K' },
    { name: 'Jade', hex: '#009E73', glow: 'rgba(0, 158, 115, 0.6)', shape: 'diamond', glyph: 'J', shortLabel: 'J' },
    { name: 'Gold', hex: '#F0E442', glow: 'rgba(240, 228, 66, 0.6)', shape: 'star', glyph: 'G', shortLabel: 'G' },
];

/**
 * @param {boolean} colorBlindMode
 * @returns {PaletteColor[]}
 */
export function getActivePalette(colorBlindMode) {
    return colorBlindMode ? COLOR_BLIND_PALETTE : DEFAULT_PALETTE;
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {ColorShape} shape
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {string} strokeColor
 * @param {string} [fillColor]
 */
export function drawColorShape(ctx, shape, x, y, size, strokeColor, fillColor) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    if (fillColor) {
        ctx.fillStyle = fillColor;
    }

    ctx.beginPath();
    switch (shape) {
        case 'circle':
            ctx.arc(0, 0, size, 0, Math.PI * 2);
            break;
        case 'triangle':
            ctx.moveTo(0, -size);
            ctx.lineTo(size, size);
            ctx.lineTo(-size, size);
            ctx.closePath();
            break;
        case 'square':
            ctx.rect(-size, -size, size * 2, size * 2);
            break;
        case 'diamond':
            ctx.moveTo(0, -size);
            ctx.lineTo(size, 0);
            ctx.lineTo(0, size);
            ctx.lineTo(-size, 0);
            ctx.closePath();
            break;
        case 'star': {
            const spikes = 5;
            const outer = size;
            const inner = size * 0.45;
            let rot = Math.PI / 2 * 3;
            const step = Math.PI / spikes;
            ctx.moveTo(0, -outer);
            for (let i = 0; i < spikes; i++) {
                ctx.lineTo(Math.cos(rot) * outer, Math.sin(rot) * outer);
                rot += step;
                ctx.lineTo(Math.cos(rot) * inner, Math.sin(rot) * inner);
                rot += step;
            }
            ctx.lineTo(0, -outer);
            ctx.closePath();
            break;
        }
        default:
            ctx.arc(0, 0, size, 0, Math.PI * 2);
    }

    if (fillColor) ctx.fill();
    ctx.stroke();
    ctx.restore();
}

/**
 * @param {HTMLElement} el
 * @param {ColorShape} shape
 * @param {string} hex
 */
export function applyPreviewShape(el, shape, hex) {
    el.style.background = hex;
    switch (shape) {
        case 'circle':
            el.style.clipPath = 'circle(50% at 50% 50%)';
            break;
        case 'triangle':
            el.style.clipPath = 'polygon(50% 0%, 0% 100%, 100% 100%)';
            break;
        case 'square':
            el.style.clipPath = 'inset(0 round 2px)';
            break;
        case 'diamond':
            el.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
            break;
        case 'star':
            el.style.clipPath = 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)';
            break;
        default:
            el.style.clipPath = '';
    }
}
