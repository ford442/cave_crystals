import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

import { WASM_MANAGER_WASM_EXPORTS } from '../../src/modules/WasmConstants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RELEASE_D_TS = path.join(ROOT, 'build/release.d.ts');

/**
 * @param {string} dtsSource
 * @returns {Set<string>}
 */
function parseReleaseDeclarations(dtsSource) {
    const names = new Set();
    const functionRe = /export declare function (\w+)/g;
    const memoryRe = /export declare const (memory)\b/;
    let match;

    while ((match = functionRe.exec(dtsSource)) !== null) {
        names.add(match[1]);
    }

    const memoryMatch = memoryRe.exec(dtsSource);
    if (memoryMatch) {
        names.add(memoryMatch[1]);
    }

    return names;
}

describe('WASM bindings contract (release.d.ts vs WasmManager)', () => {
    it('release.d.ts exists after asbuild:release', () => {
        assert.ok(fs.existsSync(RELEASE_D_TS), `missing ${RELEASE_D_TS}; run npm run asbuild:release`);
    });

    it('every WasmManager WASM delegate is declared in release.d.ts', () => {
        const dts = fs.readFileSync(RELEASE_D_TS, 'utf8');
        const declared = parseReleaseDeclarations(dts);

        for (const name of WASM_MANAGER_WASM_EXPORTS) {
            assert.ok(declared.has(name), `release.d.ts missing export used by WasmManager: ${name}`);
        }
    });

    it('WasmManager WASM export list has no duplicates', () => {
        const unique = new Set(WASM_MANAGER_WASM_EXPORTS);
        assert.equal(unique.size, WASM_MANAGER_WASM_EXPORTS.length);
    });
});
