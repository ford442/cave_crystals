import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = path.resolve(__dirname, '../../build');

export const WASM_DEBUG_PATH = path.join(BUILD_DIR, 'debug.wasm');
export const WASM_RELEASE_PATH = path.join(BUILD_DIR, 'release.wasm');

/**
 * @param {'debug' | 'release'} [variant]
 * @returns {string}
 */
function resolveWasmPath(variant = 'debug') {
    if (process.env.WASM_BUILD === 'release' || variant === 'release') {
        return WASM_RELEASE_PATH;
    }
    return WASM_DEBUG_PATH;
}

/**
 * Instantiate debug or release WASM for Node contract/parity tests.
 * @param {'debug' | 'release'} [variant]
 * @returns {Promise<WebAssembly.Instance>}
 */
export async function loadWasm(variant = 'debug') {
    const wasmPath = resolveWasmPath(variant);
    if (!fs.existsSync(wasmPath)) {
        const hint = variant === 'release'
            ? 'npm run asbuild:release before test:wasm'
            : 'npm run test:unit';
        throw new Error(`Missing ${wasmPath}. Run ${hint}.`);
    }

    const buffer = fs.readFileSync(wasmPath);
    const imports = {
        env: {
            abort: (msg, file, line, col) => {
                throw new Error(`WASM abort: ${msg} at ${file}:${line}:${col}`);
            },
            seed: () => 0.123456789
        }
    };

    const wasm = await WebAssembly.instantiate(buffer, imports);
    return wasm.instance;
}

/** @deprecated Use loadWasm('release') — kept for test:wasm release contract checks. */
export async function loadReleaseWasm() {
    return loadWasm('release');
}

/**
 * @param {WebAssembly.Instance} instance
 * @param {string} name
 */
export function requireExport(instance, name) {
    const value = instance.exports[name];
    if (value === undefined) {
        throw new Error(`Missing required WASM export: ${name}`);
    }
    return value;
}
