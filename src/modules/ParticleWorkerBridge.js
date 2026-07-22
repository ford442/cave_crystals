// @ts-check
/**
 * Main-thread coordinator for off-thread particle integration.
 */

import {
    TRAIL_BATCH_STRIDE,
    TRAIL_BATCH_MAX,
    SIMPLE_BATCH_STRIDE,
    SIMPLE_BATCH_FLOAT_COUNT,
    DUST_BATCH_STRIDE,
    DUST_BATCH_MAX,
} from './WasmConstants.js';
import {
    packTrailBatch,
    packDustBatch,
    packAmbientBatch,
    scatterTrailBatch,
    scatterAmbientBatch,
    scatterDustBatch,
    applyAmbientRotation,
    WORKER_MIN_PARTICLES,
} from './particleBatchCodec.js';

/** @typedef {'worker' | 'main' | 'idle'} IntegratorPath */

/**
 * @typedef {Object} ParticleWorkerStatus
 * @property {IntegratorPath} path
 * @property {number} workerMs
 * @property {number} backlog
 * @property {boolean} enabled
 * @property {boolean} ready
 */

/**
 * @typedef {Object} VisualIntegrationParams
 * @property {import('./Entities.js').TrailParticle[]} trailBatch
 * @property {number} trailCount
 * @property {import('./Entities.js').DustParticle[]} dustParticles
 * @property {import('./Entities.js').Particle[]} ambientBatch
 * @property {number} ambientCount
 * @property {number} timeScale
 * @property {number} rw
 * @property {number} rh
 * @property {string} renderQuality
 * @property {import('./WasmManager.js').WasmManager} wasmManager
 */

/**
 * @typedef {Object} PendingApply
 * @property {number} frameId
 * @property {number} timeScale
 * @property {number} rw
 * @property {number} rh
 * @property {import('./Entities.js').TrailParticle[]} trailBatch
 * @property {number} trailCount
 * @property {import('./Entities.js').DustParticle[]} dustParticles
 * @property {number} dustCount
 * @property {import('./Entities.js').Particle[]} ambientBatch
 * @property {number} ambientCount
 * @property {Float64Array} [trailBuffer]
 * @property {Float64Array} [dustBuffer]
 * @property {Float64Array} [ambientBuffer]
 */

export class ParticleWorkerBridge {
    constructor() {
        /** @type {Worker | null} */
        this.worker = null;
        this.ready = false;
        this.enabled = true;
        this.frameId = 0;
        this.inFlight = 0;
        /** @type {IntegratorPath} */
        this.lastPath = 'idle';
        this.lastWorkerMs = 0;
        this.backlog = 0;

        /** @type {PendingApply | null} */
        this._pendingApply = null;
        /** @type {PendingApply | null} */
        this._readyApply = null;

        this._trailBuffer = new Float64Array(TRAIL_BATCH_MAX * TRAIL_BATCH_STRIDE);
        this._dustBuffer = new Float64Array(DUST_BATCH_MAX * DUST_BATCH_STRIDE);
        this._ambientBuffer = new Float64Array(
            Math.floor(SIMPLE_BATCH_FLOAT_COUNT / SIMPLE_BATCH_STRIDE) * SIMPLE_BATCH_STRIDE
        );
    }

    /**
     * Whether the particle worker is explicitly disabled.
     * @returns {boolean}
     */
    isExplicitlyDisabled() {
        const root = typeof globalThis !== 'undefined' ? globalThis : undefined;
        if (root && root.__PARTICLE_WORKER__ === false) {
            return true;
        }
        return false;
    }

    async init() {
        if (this.isExplicitlyDisabled()) {
            this.enabled = false;
            return false;
        }

        if (typeof Worker === 'undefined') {
            this.enabled = false;
            return false;
        }

        try {
            const WorkerCtor = (
                await import('../workers/particleIntegrator.worker.js?worker')
            ).default;
            this.worker = new WorkerCtor();
            this.worker.onmessage = (event) => this._onWorkerMessage(event);
            this.worker.onerror = () => {
                this.enabled = false;
                this.ready = false;
            };
            this.ready = true;
            this.enabled = true;
            return true;
        } catch {
            this.enabled = false;
            this.ready = false;
            return false;
        }
    }

    /**
     * @returns {ParticleWorkerStatus}
     */
    getStatus() {
        return {
            path: this.lastPath,
            workerMs: this.lastWorkerMs,
            backlog: this.backlog,
            enabled: this.enabled,
            ready: this.ready,
        };
    }

    /**
     * @param {VisualIntegrationParams} params
     * @returns {{ usedWorker: boolean, appliedResult: boolean }}
     */
    scheduleVisualIntegration(params) {
        const {
            trailBatch,
            trailCount,
            dustParticles,
            ambientBatch,
            ambientCount,
            timeScale,
            rw,
            rh,
            renderQuality,
            wasmManager,
        } = params;

        const hadReady = this._readyApply !== null;
        this._applyReadyResult();

        const dustCount = dustParticles.length;
        const totalVisual = trailCount + dustCount + ambientCount;
        const canUseWorker = this._canUseWorker(totalVisual, renderQuality);

        if (canUseWorker) {
            const posted = this._postToWorker({
                trailBatch,
                trailCount,
                dustParticles,
                dustCount,
                ambientBatch,
                ambientCount,
                timeScale,
                rw,
                rh,
            });
            if (posted) {
                this.lastPath = 'worker';
                return { usedWorker: true, appliedResult: hadReady };
            }
        }

        this._integrateOnMainThread({
            trailBatch,
            trailCount,
            dustParticles,
            ambientBatch,
            ambientCount,
            timeScale,
            rw,
            rh,
            wasmManager,
        });
        this.lastPath = 'main';
        return { usedWorker: false, appliedResult: hadReady };
    }

    /**
     * Flush any pending worker result (call before shutdown or quality changes).
     */
    flush() {
        this._applyReadyResult();
    }

    /**
     * @param {number} totalVisual
     * @param {string} renderQuality
     * @returns {boolean}
     */
    _canUseWorker(totalVisual, renderQuality) {
        if (!this.enabled || !this.ready || !this.worker) return false;
        if (renderQuality === 'low') return false;
        if (totalVisual < WORKER_MIN_PARTICLES) return false;
        if (this.inFlight > 1) return false;
        return true;
    }

    /**
     * @param {Omit<PendingApply, 'frameId' | 'trailBuffer' | 'dustBuffer' | 'ambientBuffer'>} payload
     * @returns {boolean}
     */
    _postToWorker(payload) {
        if (!this.worker) return false;

        const frameId = ++this.frameId;
        const trailCount = Math.min(payload.trailCount, TRAIL_BATCH_MAX);
        const dustCount = Math.min(payload.dustCount, DUST_BATCH_MAX);
        const maxAmbient = Math.floor(SIMPLE_BATCH_FLOAT_COUNT / SIMPLE_BATCH_STRIDE);
        const ambientCount = Math.min(payload.ambientCount, maxAmbient);

        if (trailCount > 0) {
            packTrailBatch(payload.trailBatch, trailCount, this._trailBuffer);
        }
        if (dustCount > 0) {
            packDustBatch(payload.dustParticles, dustCount, this._dustBuffer);
        }
        if (ambientCount > 0) {
            packAmbientBatch(payload.ambientBatch, ambientCount, this._ambientBuffer);
        }

        /** @type {Record<string, unknown>} */
        const msg = {
            type: 'integrate',
            frameId,
            timeScale: payload.timeScale,
            rw: payload.rw,
            rh: payload.rh,
        };

        /** @type {Transferable[]} */
        const transfer = [];

        if (trailCount > 0) {
            const trailCopy = this._trailBuffer.slice(0, trailCount * TRAIL_BATCH_STRIDE).buffer;
            msg.trail = { buffer: trailCopy, count: trailCount };
            transfer.push(trailCopy);
            this._trailBuffer = new Float64Array(TRAIL_BATCH_MAX * TRAIL_BATCH_STRIDE);
        }
        if (dustCount > 0) {
            const dustCopy = this._dustBuffer.slice(0, dustCount * DUST_BATCH_STRIDE).buffer;
            msg.dust = { buffer: dustCopy, count: dustCount };
            transfer.push(dustCopy);
            this._dustBuffer = new Float64Array(DUST_BATCH_MAX * DUST_BATCH_STRIDE);
        }
        if (ambientCount > 0) {
            const ambientCopy = this._ambientBuffer.slice(0, ambientCount * SIMPLE_BATCH_STRIDE).buffer;
            msg.ambient = { buffer: ambientCopy, count: ambientCount };
            transfer.push(ambientCopy);
            this._ambientBuffer = new Float64Array(
                Math.floor(SIMPLE_BATCH_FLOAT_COUNT / SIMPLE_BATCH_STRIDE) * SIMPLE_BATCH_STRIDE
            );
        }

        this._pendingApply = {
            frameId,
            timeScale: payload.timeScale,
            rw: payload.rw,
            rh: payload.rh,
            trailBatch: payload.trailBatch,
            trailCount,
            dustParticles: payload.dustParticles,
            dustCount,
            ambientBatch: payload.ambientBatch,
            ambientCount,
        };

        try {
            this.worker.postMessage(msg, transfer);
            this.inFlight++;
            this.backlog = this.inFlight;
            return true;
        } catch {
            this._pendingApply = null;
            return false;
        }
    }

    /**
     * @param {MessageEvent} event
     */
    _onWorkerMessage(event) {
        const msg = event.data;
        if (!msg || msg.type !== 'integrated') return;

        this.inFlight = Math.max(0, this.inFlight - 1);
        this.backlog = this.inFlight;
        this.lastWorkerMs = msg.workerMs || 0;

        if (!this._pendingApply || this._pendingApply.frameId !== msg.frameId) {
            return;
        }

        const pending = this._pendingApply;
        this._pendingApply = null;

        if (msg.trail?.buffer) {
            pending.trailBuffer = new Float64Array(msg.trail.buffer);
            pending.trailCount = msg.trail.count;
        }
        if (msg.dust?.buffer) {
            pending.dustBuffer = new Float64Array(msg.dust.buffer);
            pending.dustCount = msg.dust.count;
        }
        if (msg.ambient?.buffer) {
            pending.ambientBuffer = new Float64Array(msg.ambient.buffer);
            pending.ambientCount = msg.ambient.count;
        }

        this._readyApply = pending;
    }

    _applyReadyResult() {
        const ready = this._readyApply;
        if (!ready) return;

        this._readyApply = null;

        if (ready.trailCount > 0 && ready.trailBuffer) {
            scatterTrailBatch(
                ready.trailBatch,
                ready.trailCount,
                ready.trailBuffer,
                ready.rw,
                ready.rh
            );
        }

        if (ready.dustCount > 0 && ready.dustBuffer) {
            scatterDustBatch(ready.dustParticles, ready.dustCount, ready.dustBuffer);
        }

        if (ready.ambientCount > 0 && ready.ambientBuffer) {
            scatterAmbientBatch(
                ready.ambientBatch,
                ready.ambientCount,
                ready.ambientBuffer,
                ready.rw,
                ready.rh
            );
            applyAmbientRotation(ready.ambientBatch, ready.ambientCount, ready.timeScale);
        }
    }

    /**
     * @param {Omit<VisualIntegrationParams, 'renderQuality'>} params
     */
    _integrateOnMainThread(params) {
        const {
            trailBatch,
            trailCount,
            dustParticles,
            ambientBatch,
            ambientCount,
            timeScale,
            rw,
            rh,
            wasmManager,
        } = params;

        if (trailCount > 0) {
            const usedWasm = wasmManager.batchIntegrateTrailParticles(
                trailBatch, trailCount, timeScale, rw, rh
            );
            if (!usedWasm) {
                for (let j = 0; j < trailCount; j++) {
                    trailBatch[j].update(timeScale, rw, rh);
                }
            }
        }

        for (let i = 0; i < dustParticles.length; i++) {
            dustParticles[i].update(rw, rh, timeScale);
        }

        if (ambientCount > 0) {
            const usedWasm = wasmManager.batchIntegrateAmbientParticles(
                ambientBatch, ambientCount, timeScale, rw, rh
            );
            if (!usedWasm) {
                for (let j = 0; j < ambientCount; j++) {
                    ambientBatch[j].updateAmbient(rw, rh, timeScale);
                }
            }
        }
    }
}

export const particleWorkerBridge = new ParticleWorkerBridge();
