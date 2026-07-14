/**
 * Rate-limited fallback logging for WasmManager.
 * Production builds stay quiet unless window.__WASM_VERBOSE__ is set.
 */

const loggedKeys = new Set();

/**
 * @returns {boolean}
 */
export function isWasmVerboseLoggingEnabled() {
    if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
        return true;
    }
    if (typeof window !== 'undefined' && window.__WASM_VERBOSE__) {
        return true;
    }
    return false;
}

/**
 * @param {string} key
 * @param {string} message
 * @param {unknown} [detail]
 */
export function logWasmFallbackOnce(key, message, detail) {
    if (loggedKeys.has(key)) return;
    loggedKeys.add(key);
    if (!isWasmVerboseLoggingEnabled()) return;
    if (detail !== undefined) {
        console.warn(message, detail);
    } else {
        console.warn(message);
    }
}

/**
 * @param {string} message
 */
export function logWasmInfo(message) {
    if (!isWasmVerboseLoggingEnabled()) return;
    console.log(message);
}

/** Resets rate-limit state (for tests). */
export function resetWasmFallbackLogging() {
    loggedKeys.clear();
}
