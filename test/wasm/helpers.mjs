import assert from 'node:assert/strict';

export const EPS = 1e-9;
/** Looser tolerance for f64 WASM/JS float drift (RNG, trig). */
export const RELAXED_EPS = 1e-6;

/** @param {number} a @param {number} b @param {number} [tol] */
export function assertClose(a, b, tol = EPS) {
    assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (tol ${tol})`);
}

/** @param {Float64Array} a @param {Float64Array} b @param {number} [tol] */
export function assertFloat64ArraysClose(a, b, tol = EPS) {
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
        assertClose(a[i], b[i], tol);
    }
}
