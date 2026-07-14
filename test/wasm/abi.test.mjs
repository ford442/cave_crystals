import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

import {
    REQUIRED_WASM_EXPORTS,
    SIMPLE_BATCH_STRIDE,
    SIMPLE_BATCH_FLOAT_COUNT,
    TRAIL_BATCH_STRIDE,
    TRAIL_BATCH_FLOAT_COUNT
} from '../../src/modules/WasmConstants.js';
import { loadReleaseWasm, requireExport } from './wasmLoader.mjs';

describe('WASM ABI contract', () => {
    /** @type {WebAssembly.Instance} */
    let instance;

    before(async () => {
        instance = await loadReleaseWasm();
    });

    it('exports all required symbols', () => {
        for (const name of REQUIRED_WASM_EXPORTS) {
            assert.notEqual(instance.exports[name], undefined, `missing export: ${name}`);
        }
    });

    it('memory is WebAssembly.Memory with enough pages for batch buffers', () => {
        const memory = instance.exports.memory;
        assert.ok(memory instanceof WebAssembly.Memory);
        assert.ok(memory.buffer.byteLength >= SIMPLE_BATCH_FLOAT_COUNT * 8);
        assert.ok(memory.buffer.byteLength >= TRAIL_BATCH_FLOAT_COUNT * 8);
    });

    it('simple batch layout matches WasmConstants', () => {
        const stride = /** @type {() => number} */ (requireExport(instance, 'getSimpleBatchStride'))();
        const floatCount = /** @type {() => number} */ (requireExport(instance, 'getSimpleBatchFloatCount'))();
        const byteOffset = /** @type {() => number} */ (requireExport(instance, 'getSimpleBatchByteOffset'))();

        assert.equal(stride, SIMPLE_BATCH_STRIDE);
        assert.equal(floatCount, SIMPLE_BATCH_FLOAT_COUNT);
        assert.equal(byteOffset % 8, 0, 'simple batch byteOffset must be Float64-aligned');
        assert.ok(byteOffset >= 0);
        assert.ok(byteOffset + floatCount * 8 <= instance.exports.memory.buffer.byteLength);
    });

    it('trail batch layout matches WasmConstants', () => {
        const stride = /** @type {() => number} */ (requireExport(instance, 'getTrailBatchStride'))();
        const floatCount = /** @type {() => number} */ (requireExport(instance, 'getTrailBatchFloatCount'))();
        const byteOffset = /** @type {() => number} */ (requireExport(instance, 'getTrailBatchByteOffset'))();

        assert.equal(stride, TRAIL_BATCH_STRIDE);
        assert.equal(floatCount, TRAIL_BATCH_FLOAT_COUNT);
        assert.equal(byteOffset % 8, 0, 'trail batch byteOffset must be Float64-aligned');
        assert.ok(byteOffset >= 0);
        assert.ok(byteOffset + floatCount * 8 <= instance.exports.memory.buffer.byteLength);
    });

    it('simple and trail batch regions do not overlap', () => {
        const simpleOffset = /** @type {() => number} */ (requireExport(instance, 'getSimpleBatchByteOffset'))();
        const simpleBytes = SIMPLE_BATCH_FLOAT_COUNT * 8;
        const trailOffset = /** @type {() => number} */ (requireExport(instance, 'getTrailBatchByteOffset'))();
        const trailBytes = TRAIL_BATCH_FLOAT_COUNT * 8;

        const simpleEnd = simpleOffset + simpleBytes;
        const trailEnd = trailOffset + trailBytes;
        const disjoint = simpleEnd <= trailOffset || trailEnd <= simpleOffset;
        assert.ok(disjoint, 'batch buffer regions must not overlap');
    });
});
