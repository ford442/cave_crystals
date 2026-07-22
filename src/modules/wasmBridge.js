/**
 * Lazy loader for ASC-generated ESM bindings (`build/release.js` + `release.wasm`).
 * Vite resolves the glue module and co-emits the `.wasm` asset via `import.meta.url`.
 */

/** @type {typeof import('../../build/release.js') | null} */
let cache = null;

/**
 * Load release WASM through generated ASC bindings (no manual fetch URL construction).
 * @returns {Promise<typeof import('../../build/release.js')>}
 */
export async function loadWasmBindings() {
    if (cache) return cache;
    const bindings = await import('../../build/release.js');
    cache = bindings;
    return bindings;
}

/**
 * @returns {typeof import('../../build/release.js') | null}
 */
export function getWasmBindings() {
    return cache;
}

/** Reset cached bindings (tests only). */
export function _resetWasmBindingsForTests() {
    cache = null;
}
