// @ts-check
/**
 * Dedicated worker for visual particle integration (trail, dust, ambient).
 */

import { loadWasmBindings } from '../modules/wasmBridge.js';
import {
    TRAIL_BATCH_MAX,
    SIMPLE_BATCH_STRIDE,
    SIMPLE_BATCH_FLOAT_COUNT,
} from '../modules/WasmConstants.js';
import {
    integrateTrailView,
    integrateAmbientView,
    jsIntegrateDustBatch,
} from '../modules/particleBatchCodec.js';

/** @typedef {import('../modules/types.js').WasmBindings} WasmBindings */

/** @type {WasmBindings | null} */
let wasm = null;
let wasmReady = false;

async function ensureWasm() {
    if (wasmReady) return wasm;
    try {
        wasm = await loadWasmBindings();
        const MAX_UINT32 = 0xffffffff;
        wasm.setSeed(Math.floor(Math.random() * MAX_UINT32));
        wasmReady = true;
        return wasm;
    } catch {
        wasm = null;
        wasmReady = false;
        return null;
    }
}

ensureWasm();

/**
 * @param {MessageEvent} event
 */
self.onmessage = async (event) => {
    const msg = event.data;
    if (!msg || msg.type !== 'integrate') return;

    const t0 = performance.now();
    await ensureWasm();

    const {
        frameId,
        timeScale,
        rw,
        rh,
        trail,
        dust,
        ambient,
    } = msg;

    let usedWasm = false;

    if (trail && trail.count > 0) {
        const view = new Float64Array(trail.buffer);
        const count = Math.min(trail.count, TRAIL_BATCH_MAX);
        if (integrateTrailView(wasm, view, count, timeScale)) {
            usedWasm = true;
        }
        trail.count = count;
    }

    if (dust && dust.count > 0) {
        const view = new Float64Array(dust.buffer);
        jsIntegrateDustBatch(view, dust.count, rw, rh, timeScale);
    }

    if (ambient && ambient.count > 0) {
        const view = new Float64Array(ambient.buffer);
        const maxAmbient = Math.floor(SIMPLE_BATCH_FLOAT_COUNT / SIMPLE_BATCH_STRIDE);
        const count = Math.min(ambient.count, maxAmbient);
        const wasmUsed = integrateAmbientView(wasm, view, count, timeScale);
        if (wasmUsed) usedWasm = true;
        ambient.count = count;
    }

    const workerMs = performance.now() - t0;
    const transfer = [];
    if (trail?.buffer) transfer.push(trail.buffer);
    if (dust?.buffer) transfer.push(dust.buffer);
    if (ambient?.buffer) transfer.push(ambient.buffer);

    /** @type {Record<string, unknown>} */
    const response = {
        type: 'integrated',
        frameId,
        workerMs,
        usedWasm,
        rw,
        rh,
        timeScale,
    };

    if (trail) {
        response.trail = { buffer: trail.buffer, count: trail.count };
    }
    if (dust) {
        response.dust = { buffer: dust.buffer, count: dust.count };
    }
    if (ambient) {
        response.ambient = { buffer: ambient.buffer, count: ambient.count };
    }

    self.postMessage(response, transfer);
};
