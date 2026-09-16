/** @typedef {CanvasRenderingContext2DSettings} Canvas2DOptions */
/** @typedef {'canvas2d' | 'webgl2'} DisplayBackendId */

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
    /** @type {CanvasRenderingContext2D | null} */
    let ctx = canvas.getContext('2d', options);
    let desynchronizedActive;

    if (!ctx && retryWithoutDesync && options.desynchronized) {
        const { desynchronized, ...rest } = options;
        void desynchronized;
        ctx = /** @type {CanvasRenderingContext2D | null} */ (canvas.getContext('2d', rest));
        desynchronizedActive = false;
    } else if (ctx && typeof ctx.getContextAttributes === 'function') {
        desynchronizedActive = ctx.getContextAttributes().desynchronized === true;
    }

    return { ctx, desynchronizedActive };
}

/**
 * WebGL2 display canvas: opaque framebuffer matching MAIN_CANVAS_CONTEXT, no depth buffer
 * (post-FX is a 2D fullscreen-quad pipeline) and no implicit alpha blend against the page.
 */
export const WEBGL2_DISPLAY_CONTEXT = /** @type {const} */ ({
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
});

/** Options for the throwaway probe canvas used by {@link probeWebGL2Support}. */
const WEBGL2_PROBE_CONTEXT = /** @type {const} */ ({ alpha: false, antialias: false, depth: false });

/**
 * One-time capability probe on a detached canvas, so it never touches the real display
 * canvas's context-type lock (see {@link replaceCanvasElement}).
 * @returns {boolean}
 */
export function probeWebGL2Support() {
    try {
        const probe = document.createElement('canvas');
        return !!probe.getContext('webgl2', WEBGL2_PROBE_CONTEXT);
    } catch {
        return false;
    }
}

/**
 * Sync capability probe: does this browser expose the WebGPU entry point at all?
 * Cheap and side-effect free; actual adapter/device acquisition is async and stays with
 * whichever subsystem needs it (see WebGpuParticleIntegrator).
 * @returns {boolean}
 */
export function probeWebGPUSupport() {
    return typeof navigator !== 'undefined' && !!navigator.gpu;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {WebGLContextAttributes} options
 * @returns {WebGL2RenderingContext | null}
 */
export function createWebGL2Context(canvas, options) {
    try {
        return canvas.getContext('webgl2', options);
    } catch {
        return null;
    }
}

/**
 * A canvas element's context type (2D vs WebGL) is fixed for its lifetime: once bound, a
 * `getContext()` call for a different type returns null rather than switching. The only way
 * to move a *display* canvas between backends is to replace it with a fresh, contextless
 * clone (same id/class/attributes/pixel size, no bound context, no listeners).
 * @param {HTMLCanvasElement} canvas
 * @returns {HTMLCanvasElement}
 */
export function replaceCanvasElement(canvas) {
    const fresh = /** @type {HTMLCanvasElement} */ (canvas.cloneNode(false));
    canvas.replaceWith(fresh);
    return fresh;
}

/**
 * Attach WebGL context-loss/restore handling to a display canvas. `preventDefault()` on loss
 * is required for the browser to ever fire `webglcontextrestored` afterwards.
 * @param {HTMLCanvasElement} canvas
 * @param {{ onLost?: () => void, onRestored?: () => void }} [handlers]
 * @returns {() => void} detach
 */
export function attachWebGLContextLossHandling(canvas, { onLost, onRestored } = {}) {
    const lostHandler = (event) => {
        event.preventDefault();
        onLost?.();
    };
    const restoredHandler = () => {
        onRestored?.();
    };
    canvas.addEventListener('webglcontextlost', lostHandler, false);
    canvas.addEventListener('webglcontextrestored', restoredHandler, false);
    return () => {
        canvas.removeEventListener('webglcontextlost', lostHandler, false);
        canvas.removeEventListener('webglcontextrestored', restoredHandler, false);
    };
}

/**
 * Pure backend-selection policy for the current frame: no DOM access, no side effects.
 * `webgl2Supported` reflects whether the display canvas can (still) bind WebGL2 at all;
 * `webgl2ContextLost` reflects a live-but-currently-unusable GPU context (mid context-loss,
 * waiting on `webglcontextrestored`) — during that window the canvas stays WebGL2-bound (so
 * a native restore can still happen) but frames fall back to Canvas2D content.
 *
 * @param {{
 *   webgl2Supported: boolean,
 *   webgl2ContextLost: boolean,
 *   wantsWebGL: boolean,
 *   forceCanvas2D: boolean,
 *   forceWebGL2: boolean,
 * }} input
 * @returns {DisplayBackendId}
 */
export function resolveDisplayBackend({
    webgl2Supported,
    webgl2ContextLost,
    wantsWebGL,
    forceCanvas2D,
    forceWebGL2,
}) {
    const canUseWebGL = webgl2Supported && !webgl2ContextLost;
    if (forceCanvas2D) return 'canvas2d';
    if (forceWebGL2) return canUseWebGL ? 'webgl2' : 'canvas2d';
    if (!wantsWebGL) return 'canvas2d';
    return canUseWebGL ? 'webgl2' : 'canvas2d';
}

/**
 * @typedef {Object} BackendDiagnostics
 * @property {DisplayBackendId} display Backend actually driving the display canvas right now.
 * @property {boolean} webgl2Supported
 * @property {boolean} webgl2ContextLost
 * @property {boolean} webgpuSupported
 * @property {boolean | undefined} desynchronizedActive
 */

/**
 * Builds the effective-capability snapshot shared by the dev perf overlay and verification
 * scripts. Pure given its inputs; only `webgpuSupported` re-reads live browser state.
 * @param {{
 *   display: DisplayBackendId,
 *   webgl2Supported: boolean,
 *   webgl2ContextLost: boolean,
 *   desynchronizedActive?: boolean,
 * }} input
 * @returns {BackendDiagnostics}
 */
export function buildBackendDiagnostics({ display, webgl2Supported, webgl2ContextLost, desynchronizedActive }) {
    return {
        display,
        webgl2Supported,
        webgl2ContextLost,
        webgpuSupported: probeWebGPUSupport(),
        desynchronizedActive,
    };
}
