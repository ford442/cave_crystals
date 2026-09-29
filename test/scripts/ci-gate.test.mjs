import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const pkg = JSON.parse(read('package.json'));
const scripts = pkg.scripts;

describe('WASM build intent', () => {
    it('dev and production build compile release WASM only', () => {
        assert.equal(scripts.dev, 'npm run asbuild:release && vite');
        assert.equal(scripts.build, 'npm run asbuild:release && vite build');
        assert.equal(scripts['verify:build'], 'npm run build');
    });

    it('keeps debug WASM on the unit/parity script and release parity on demand', () => {
        assert.equal(scripts['test:unit'], 'npm run asbuild:debug && node --test test/wasm/*.test.mjs');
        assert.equal(
            scripts['test:wasm'],
            'npm run asbuild:release && WASM_BUILD=release node --test test/wasm/*.test.mjs',
        );
        assert.equal(scripts.asbuild, 'npm run asbuild:debug && npm run asbuild:release');
    });
});

describe('merge gate', () => {
    const testCi = [
        'npm run lint',
        'npm run typecheck',
        'npm run test:lint',
        'npm run test:unit',
        'npm run test:powerups',
        'npm run test:audio',
        'npm run test:game',
        'npm run test:save',
        'node --test test/scripts/ci-gate.test.mjs',
    ].join(' && ');

    const verifyCi = [
        'npm run test:ci',
        'npm run build',
        'npm run verify:smoke',
        'npm run verify:pwa',
        'npm run verify:postfx',
    ].join(' && ');

    it('test:ci is the node half and verify:ci is the full blocking gate', () => {
        assert.equal(scripts['test:ci'], testCi);
        assert.equal(scripts['verify:ci'], verifyCi);
        assert.equal(
            scripts['verify:postfx'],
            'npm run verify:canvas-context && npm run verify:webgl-postfx && npm run verify:backend-recovery',
        );
        assert.doesNotMatch(scripts['verify:ci'], /verify:visual/);
        assert.doesNotMatch(scripts['verify:ci'], /test:wasm/);
    });

    it('GitHub workflows call the same commands', () => {
        const lint = read('.github/workflows/lint.yml');
        const ci = read('.github/workflows/ci.yml');

        assert.match(lint, /run: npm run test:ci\b/);
        assert.match(ci, /run: npm run build\b/);
        assert.match(ci, /run: npm run verify:smoke\b/);
        assert.match(ci, /run: npm run verify:pwa\b/);
        assert.match(ci, /run: npm run verify:postfx\b/);
        assert.match(ci, /run: npm run verify:visual\b/);
        assert.match(ci, /continue-on-error:\s*true/);
    });
});
