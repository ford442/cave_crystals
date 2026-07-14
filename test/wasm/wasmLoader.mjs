import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const WASM_PATH = path.resolve(__dirname, '../../build/release.wasm');

/**
 * Instantiate build/release.wasm for Node contract/parity tests.
 * @returns {Promise<WebAssembly.Instance>}
 */
export async function loadReleaseWasm() {
    if (!fs.existsSync(WASM_PATH)) {
        throw new Error(
            `Missing ${WASM_PATH}. Run npm run asbuild:release before test:wasm.`
        );
    }

    const buffer = fs.readFileSync(WASM_PATH);
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
