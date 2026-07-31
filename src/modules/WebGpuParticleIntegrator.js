// @ts-check
/**
 * Optional WebGPU compute integrator for visual-only particle batches.
 */

import {
    SIMPLE_BATCH_STRIDE,
    TRAIL_BATCH_STRIDE,
} from './WasmConstants.js';
import { applyAmbientRotation, applyTrailDrawCache } from './particleBatchCodec.js';

export const WEBGPU_MIN_PARTICLES = 96;
const WORKGROUP_SIZE = 64;
const AMBIENT_LIFE_DECAY = 0.015;

const TRAIL_SHADER = /* wgsl */`
struct Params {
    count: u32,
    stride: u32,
    timeScale: f32,
    lifeDecay: f32,
}

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.count) {
        return;
    }
    let base = i * params.stride;
    let lifeDecayScale = max(0.25, params.timeScale);

    var x = data[base];
    var y = data[base + 1u];
    let vx = data[base + 2u];
    let vy = data[base + 3u];
    var life = data[base + 4u];
    var size = data[base + 5u];

    x = x + vx * params.timeScale;
    y = y + vy * params.timeScale;
    life = life - 0.05 * lifeDecayScale;
    size = size * (1.0 - 0.1 * params.timeScale);

    data[base] = x;
    data[base + 1u] = y;
    data[base + 4u] = life;
    data[base + 5u] = size;
}
`;

const AMBIENT_SHADER = /* wgsl */`
struct Params {
    count: u32,
    stride: u32,
    timeScale: f32,
    lifeDecay: f32,
}

@group(0) @binding(0) var<storage, read_write> data: array<f32>;
@group(0) @binding(1) var<uniform> params: Params;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
    let i = id.x;
    if (i >= params.count) {
        return;
    }
    let base = i * params.stride;
    let lifeDecayScale = max(0.25, params.timeScale);

    var x = data[base];
    var y = data[base + 1u];
    var vx = data[base + 2u];
    var vy = data[base + 3u];
    var life = data[base + 4u];
    let gravity = data[base + 5u];
    let friction = data[base + 6u];

    x = x + vx * params.timeScale;
    y = y + vy * params.timeScale;
    vy = vy + gravity * params.timeScale;

    let adjFriction = 1.0 - (1.0 - friction) * params.timeScale;
    vx = vx * adjFriction;
    vy = vy * adjFriction;
    life = life - params.lifeDecay * lifeDecayScale;

    data[base] = x;
    data[base + 1u] = y;
    data[base + 2u] = vx;
    data[base + 3u] = vy;
    data[base + 4u] = life;
}
`;

/**
 * @param {import('./Entities.js').TrailParticle[]} particles
 * @param {number} count
 * @returns {Float32Array}
 */
export function encodeTrailBatchF32(particles, count) {
    const out = new Float32Array(count * TRAIL_BATCH_STRIDE);
    for (let i = 0; i < count; i++) {
        const p = particles[i];
        const base = i * TRAIL_BATCH_STRIDE;
        out[base] = p.x;
        out[base + 1] = p.y;
        out[base + 2] = p.vx;
        out[base + 3] = p.vy;
        out[base + 4] = p.life;
        out[base + 5] = p.size;
    }
    return out;
}

/**
 * @param {import('./Entities.js').Particle[]} particles
 * @param {number} count
 * @returns {Float32Array}
 */
export function encodeAmbientBatchF32(particles, count) {
    const out = new Float32Array(count * SIMPLE_BATCH_STRIDE);
    for (let i = 0; i < count; i++) {
        const p = particles[i];
        const base = i * SIMPLE_BATCH_STRIDE;
        out[base] = p.x;
        out[base + 1] = p.y;
        out[base + 2] = p.vx;
        out[base + 3] = p.vy;
        out[base + 4] = p.life;
        out[base + 5] = p.gravity;
        out[base + 6] = p.friction;
    }
    return out;
}

/**
 * @param {import('./Entities.js').TrailParticle[]} particles
 * @param {number} count
 * @param {Float32Array} view
 * @param {number} rendererWidth
 * @param {number} rendererHeight
 */
export function decodeTrailBatchF32(particles, count, view, rendererWidth, rendererHeight) {
    for (let i = 0; i < count; i++) {
        const p = particles[i];
        const base = i * TRAIL_BATCH_STRIDE;
        p.x = view[base];
        p.y = view[base + 1];
        p.vx = view[base + 2];
        p.vy = view[base + 3];
        p.life = view[base + 4];
        p.size = view[base + 5];
        applyTrailDrawCache(p, rendererWidth, rendererHeight);
    }
}

/**
 * @param {import('./Entities.js').Particle[]} particles
 * @param {number} count
 * @param {Float32Array} view
 * @param {number} rendererWidth
 * @param {number} rendererHeight
 * @param {number} timeScale
 */
export function decodeAmbientBatchF32(particles, count, view, rendererWidth, rendererHeight, timeScale) {
    for (let i = 0; i < count; i++) {
        const p = particles[i];
        const base = i * SIMPLE_BATCH_STRIDE;
        p.x = view[base];
        p.y = view[base + 1];
        p.vx = view[base + 2];
        p.vy = view[base + 3];
        p.life = view[base + 4];
        p._cacheDrawState(rendererWidth, rendererHeight);
    }
    applyAmbientRotation(particles, count, timeScale);
}

/**
 * @typedef {Object} WebGpuDispatchState
 * @property {number} frameId
 * @property {number} timeScale
 * @property {number} rw
 * @property {number} rh
 * @property {import('./Entities.js').TrailParticle[]} trailBatch
 * @property {number} trailCount
 * @property {import('./Entities.js').Particle[]} ambientBatch
 * @property {number} ambientCount
 * @property {Float32Array | null} [trailBuffer]
 * @property {Float32Array | null} [ambientBuffer]
 */

export class WebGpuParticleIntegrator {
    constructor() {
        this.enabled = true;
        this.ready = false;
        this.supported = false;
        this.frameId = 0;
        this.inFlight = 0;
        this.lastGpuMs = 0;
        this.backlog = 0;
        this._pendingApply = null;
        this._readyApply = null;

        this.device = null;
        this.trailPipeline = null;
        this.ambientPipeline = null;
        this.bindGroupLayout = null;
    }

    isExplicitlyDisabled() {
        const root = typeof globalThis !== 'undefined' ? globalThis : undefined;
        return !!(root && root.__PARTICLE_WEBGPU__ === false);
    }

    async init() {
        if (this.isExplicitlyDisabled()) {
            this.enabled = false;
            this.ready = false;
            return false;
        }
        const gpu = typeof navigator !== 'undefined' ? navigator.gpu : undefined;
        if (!gpu) {
            this.supported = false;
            this.ready = false;
            return false;
        }
        try {
            const adapter = await gpu.requestAdapter();
            if (!adapter) {
                this.supported = false;
                this.ready = false;
                return false;
            }
            const device = await adapter.requestDevice();
            const computeStage = /** @type {any} */ (globalThis).GPUShaderStage?.COMPUTE;
            if (typeof computeStage !== 'number') {
                this.supported = false;
                this.ready = false;
                this.enabled = false;
                return false;
            }
            this.device = device;
            this.bindGroupLayout = device.createBindGroupLayout({
                entries: [
                    {
                        binding: 0,
                        visibility: computeStage,
                        buffer: { type: 'storage' },
                    },
                    {
                        binding: 1,
                        visibility: computeStage,
                        buffer: { type: 'uniform' },
                    },
                ],
            });
            const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });
            this.trailPipeline = device.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: device.createShaderModule({ code: TRAIL_SHADER }), entryPoint: 'main' },
            });
            this.ambientPipeline = device.createComputePipeline({
                layout: pipelineLayout,
                compute: { module: device.createShaderModule({ code: AMBIENT_SHADER }), entryPoint: 'main' },
            });
            void device.lost.then(() => {
                this.ready = false;
                this.enabled = false;
            });
            this.supported = true;
            this.ready = true;
            this.enabled = true;
            return true;
        } catch {
            this.supported = false;
            this.ready = false;
            this.enabled = false;
            this.device = null;
            return false;
        }
    }

    /**
     * @param {number} totalVisual
     * @param {string} renderQuality
     */
    canUse(totalVisual, renderQuality) {
        if (!this.enabled || !this.ready || !this.device) return false;
        if (renderQuality !== 'high') return false;
        if (totalVisual < WEBGPU_MIN_PARTICLES) return false;
        if (this.inFlight > 0) return false;
        return true;
    }

    /**
     * @param {{
     * trailBatch: import('./Entities.js').TrailParticle[],
     * trailCount: number,
     * ambientBatch: import('./Entities.js').Particle[],
     * ambientCount: number,
     * timeScale: number,
     * rw: number,
     * rh: number,
     * }} payload
     * @returns {boolean}
     */
    dispatch(payload) {
        if (!this.device || !this.bindGroupLayout || !this.trailPipeline || !this.ambientPipeline) {
            return false;
        }
        const frameId = ++this.frameId;
        const trailCount = payload.trailCount;
        const ambientCount = payload.ambientCount;

        if (trailCount <= 0 && ambientCount <= 0) {
            return false;
        }

        const pending = {
            frameId,
            timeScale: payload.timeScale,
            rw: payload.rw,
            rh: payload.rh,
            trailBatch: payload.trailBatch,
            trailCount,
            ambientBatch: payload.ambientBatch,
            ambientCount,
            trailBuffer: null,
            ambientBuffer: null,
        };
        this._pendingApply = pending;

        try {
            const encoder = this.device.createCommandEncoder();
            const readPromises = [];
            if (trailCount > 0) {
                const trailData = encodeTrailBatchF32(payload.trailBatch, trailCount);
                readPromises.push(
                    this._encodeDispatchAndRead({
                        encoder,
                        data: trailData,
                        count: trailCount,
                        stride: TRAIL_BATCH_STRIDE,
                        timeScale: payload.timeScale,
                        lifeDecay: 0,
                        pipeline: this.trailPipeline,
                    }).then((view) => ({ kind: 'trail', view }))
                );
            }
            if (ambientCount > 0) {
                const ambientData = encodeAmbientBatchF32(payload.ambientBatch, ambientCount);
                readPromises.push(
                    this._encodeDispatchAndRead({
                        encoder,
                        data: ambientData,
                        count: ambientCount,
                        stride: SIMPLE_BATCH_STRIDE,
                        timeScale: payload.timeScale,
                        lifeDecay: AMBIENT_LIFE_DECAY,
                        pipeline: this.ambientPipeline,
                    }).then((view) => ({ kind: 'ambient', view }))
                );
            }

            const t0 = performance.now();
            this.device.queue.submit([encoder.finish()]);
            this.inFlight++;
            this.backlog = this.inFlight;

            Promise.all(readPromises).then((parts) => {
                if (!this._pendingApply || this._pendingApply.frameId !== frameId) {
                    this._clearInflight();
                    return;
                }
                for (const part of parts) {
                    if (part.kind === 'trail') pending.trailBuffer = part.view;
                    if (part.kind === 'ambient') pending.ambientBuffer = part.view;
                }
                this.lastGpuMs = performance.now() - t0;
                this._pendingApply = null;
                this._readyApply = pending;
                this._clearInflight();
            }).catch(() => {
                this._pendingApply = null;
                this.enabled = false;
                this.ready = false;
                this._clearInflight();
            });
            return true;
        } catch {
            this._pendingApply = null;
            this.enabled = false;
            this.ready = false;
            return false;
        }
    }

    _clearInflight() {
        this.inFlight = Math.max(0, this.inFlight - 1);
        this.backlog = this.inFlight;
    }

    /**
     * @param {{
     * encoder: any,
     * data: Float32Array,
     * count: number,
     * stride: number,
     * timeScale: number,
     * lifeDecay: number,
     * pipeline: any,
     * }} params
     * @returns {Promise<Float32Array>}
     */
    async _encodeDispatchAndRead(params) {
        if (!this.device || !this.bindGroupLayout) return new Float32Array(0);
        const dataBytes = params.data.byteLength;
        const usage = /** @type {any} */ (globalThis).GPUBufferUsage;
        const mapMode = /** @type {any} */ (globalThis).GPUMapMode;
        if (!usage || !mapMode) return new Float32Array(0);
        const storageBuffer = this.device.createBuffer({
            size: dataBytes,
            usage: usage.STORAGE | usage.COPY_SRC | usage.COPY_DST,
        });
        const readBuffer = this.device.createBuffer({
            size: dataBytes,
            usage: usage.COPY_DST | usage.MAP_READ,
        });
        const uniforms = new ArrayBuffer(16);
        const uniformDv = new DataView(uniforms);
        uniformDv.setUint32(0, params.count, true);
        uniformDv.setUint32(4, params.stride, true);
        uniformDv.setFloat32(8, params.timeScale, true);
        uniformDv.setFloat32(12, params.lifeDecay, true);
        const uniformBuffer = this.device.createBuffer({
            size: 16,
            usage: usage.UNIFORM | usage.COPY_DST,
        });

        this.device.queue.writeBuffer(storageBuffer, 0, params.data.buffer, params.data.byteOffset, dataBytes);
        this.device.queue.writeBuffer(uniformBuffer, 0, uniforms);

        const bindGroup = this.device.createBindGroup({
            layout: this.bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: storageBuffer } },
                { binding: 1, resource: { buffer: uniformBuffer } },
            ],
        });

        const pass = params.encoder.beginComputePass();
        pass.setPipeline(params.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(params.count / WORKGROUP_SIZE));
        pass.end();
        params.encoder.copyBufferToBuffer(storageBuffer, 0, readBuffer, 0, dataBytes);

        await readBuffer.mapAsync(mapMode.READ);
        const view = new Float32Array(readBuffer.getMappedRange()).slice();
        readBuffer.unmap();
        return view;
    }

    /**
     * @returns {boolean}
     */
    applyReadyResult() {
        const ready = this._readyApply;
        if (!ready) return false;
        this._readyApply = null;

        if (ready.trailCount > 0 && ready.trailBuffer) {
            decodeTrailBatchF32(ready.trailBatch, ready.trailCount, ready.trailBuffer, ready.rw, ready.rh);
        }
        if (ready.ambientCount > 0 && ready.ambientBuffer) {
            decodeAmbientBatchF32(
                ready.ambientBatch,
                ready.ambientCount,
                ready.ambientBuffer,
                ready.rw,
                ready.rh,
                ready.timeScale
            );
        }
        return true;
    }
}
