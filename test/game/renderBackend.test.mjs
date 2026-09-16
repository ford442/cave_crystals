import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildBackendDiagnostics, resolveDisplayBackend } from '../../src/modules/renderers/canvasContext.js';

describe('resolveDisplayBackend', () => {
    it('prefers webgl2 when supported and wanted', () => {
        const backend = resolveDisplayBackend({
            webgl2Supported: true,
            webgl2ContextLost: false,
            wantsWebGL: true,
            forceCanvas2D: false,
            forceWebGL2: false,
        });
        assert.equal(backend, 'webgl2');
    });

    it('falls back to canvas2d when webgl2 is unsupported', () => {
        const backend = resolveDisplayBackend({
            webgl2Supported: false,
            webgl2ContextLost: false,
            wantsWebGL: true,
            forceCanvas2D: false,
            forceWebGL2: false,
        });
        assert.equal(backend, 'canvas2d');
    });

    it('falls back to canvas2d while the webgl2 context is lost, even though still wanted', () => {
        const backend = resolveDisplayBackend({
            webgl2Supported: true,
            webgl2ContextLost: true,
            wantsWebGL: true,
            forceCanvas2D: false,
            forceWebGL2: false,
        });
        assert.equal(backend, 'canvas2d');
    });

    it('stays on canvas2d when quality does not want webgl2', () => {
        const backend = resolveDisplayBackend({
            webgl2Supported: true,
            webgl2ContextLost: false,
            wantsWebGL: false,
            forceCanvas2D: false,
            forceWebGL2: false,
        });
        assert.equal(backend, 'canvas2d');
    });

    it('forceCanvas2D wins over every other input, including forceWebGL2', () => {
        const backend = resolveDisplayBackend({
            webgl2Supported: true,
            webgl2ContextLost: false,
            wantsWebGL: true,
            forceCanvas2D: true,
            forceWebGL2: true,
        });
        assert.equal(backend, 'canvas2d');
    });

    it('forceWebGL2 ignores quality intent but still respects real availability', () => {
        const wanted = resolveDisplayBackend({
            webgl2Supported: true,
            webgl2ContextLost: false,
            wantsWebGL: false,
            forceCanvas2D: false,
            forceWebGL2: true,
        });
        assert.equal(wanted, 'webgl2');

        const unavailable = resolveDisplayBackend({
            webgl2Supported: false,
            webgl2ContextLost: false,
            wantsWebGL: false,
            forceCanvas2D: false,
            forceWebGL2: true,
        });
        assert.equal(unavailable, 'canvas2d');
    });
});

describe('buildBackendDiagnostics', () => {
    it('carries the display/capability inputs through untouched', () => {
        const diagnostics = buildBackendDiagnostics({
            display: 'webgl2',
            webgl2Supported: true,
            webgl2ContextLost: false,
            desynchronizedActive: true,
        });
        assert.equal(diagnostics.display, 'webgl2');
        assert.equal(diagnostics.webgl2Supported, true);
        assert.equal(diagnostics.webgl2ContextLost, false);
        assert.equal(diagnostics.desynchronizedActive, true);
        assert.equal(typeof diagnostics.webgpuSupported, 'boolean');
    });
});
