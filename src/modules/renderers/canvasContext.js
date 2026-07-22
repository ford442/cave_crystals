/** @typedef {CanvasRenderingContext2DSettings} Canvas2DOptions */

/**
 * Main game canvas: opaque framebuffer, low-latency presentation where supported.
 * Background PNG is a separate DOM layer; every frame clears with an opaque fill.
 */
export const MAIN_CANVAS_CONTEXT = /** @type {const} */ ({
    alpha: false,
    desynchronized: true,
    willReadFrequently: false,
});

/**
 * Offscreen FX buffers (bloom, scanline pattern): draw-only, no CPU readback.
 * Alpha required so cleared regions stay transparent for additive compositing.
 */
export const OFFSCREEN_FX_CONTEXT = /** @type {const} */ ({
    alpha: true,
    willReadFrequently: false,
});

/**
 * Film-grain tile buffer: refreshed via createImageData + putImageData (CPU write path).
 * willReadFrequently: true keeps a CPU-backed bitmap suited to frequent pixel uploads.
 */
export const GRAIN_BUFFER_CONTEXT = /** @type {const} */ ({
    alpha: true,
    willReadFrequently: true,
});

/**
 * @typedef {Object} CreateCanvas2DResult
 * @property {CanvasRenderingContext2D | null} ctx
 * @property {boolean | undefined} desynchronizedActive
 */

/**
 * Create a 2D canvas context with explicit attributes and optional desync fallback.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {Canvas2DOptions} options
 * @param {{ retryWithoutDesync?: boolean }} [opts]
 * @returns {CreateCanvas2DResult}
 */
export function createCanvas2DContext(canvas, options, { retryWithoutDesync = false } = {}) {
    let ctx = canvas.getContext('2d', options);
    let desynchronizedActive;

    if (!ctx && retryWithoutDesync && options.desynchronized) {
        const { desynchronized, ...rest } = options;
        void desynchronized;
        ctx = canvas.getContext('2d', rest);
        desynchronizedActive = false;
    } else if (ctx && typeof ctx.getContextAttributes === 'function') {
        desynchronizedActive = ctx.getContextAttributes().desynchronized === true;
    }

    return { ctx, desynchronizedActive };
}
