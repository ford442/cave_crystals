// Boss formation math — symmetric height profiles, telegraph, vulnerable lane masks.
// Heights are written into WASM linear memory for JS to read via Float64Array views.

const BOSS_HEIGHTS_MAX: i32 = 8;
const _bossHeights = new Float64Array(BOSS_HEIGHTS_MAX);

/** Local LCG so formation math stays deterministic for a given seed without mutating gameplay RNG. */
let _formSeed: u32 = 1;

function formRandom(): f64 {
  _formSeed = (_formSeed * 1103515245 + 12345) & 0x7fffffff;
  return f64(_formSeed) / f64(0x7fffffff);
}

function clampLanes(lanes: i32): i32 {
  if (lanes < 1) return 1;
  if (lanes > BOSS_HEIGHTS_MAX) return BOSS_HEIGHTS_MAX;
  return lanes;
}

/** Linear-memory byte offset for JS Float64Array views (not TypedArray.byteOffset). */
export function getBossHeightsByteOffset(): i32 {
  return _bossHeights.dataStart as i32;
}

export function getBossHeightsCapacity(): i32 {
  return BOSS_HEIGHTS_MAX;
}

/**
 * Generate a symmetric per-lane height profile for a boss phase.
 * Writes into `_bossHeights[0..lanes)` and returns the lane count used.
 *
 * Phase patterns:
 *   0 — center peak (Convergence intro)
 *   1 — alternating high/low
 *   2 — edge peaks (mirrored valleys)
 *   other — flat mid with seeded micro-jitter
 */
export function generateBossHeights(seed: u32, phase: i32, lanes: i32): i32 {
  const n = clampLanes(lanes);
  _formSeed = seed == 0 ? 1 : seed;

  const base: f64 = 55.0;
  const amp: f64 = 28.0;
  const mid: f64 = f64(n - 1) * 0.5;

  for (let i: i32 = 0; i < n; i++) {
    const t: f64 = mid > 0.0 ? (f64(i) - mid) / mid : 0.0; // -1..1
    let h: f64 = base;

    if (phase == 0) {
      // Center peak, edges low — classic Convergence silhouette
      h = base + amp * (1.0 - Math.abs(t));
    } else if (phase == 1) {
      // Alternating ridges
      h = base + ((i & 1) == 0 ? amp : -amp * 0.55);
    } else if (phase == 2) {
      // Edge peaks, center trough
      h = base + amp * Math.abs(t);
    } else {
      h = base + amp * 0.35 * Math.sin(f64(i) * 1.7 + f64(phase));
    }

    // Seeded micro-variation (kept small so profiles stay readable)
    h = h + (formRandom() - 0.5) * 4.0;
    if (h < 18.0) h = 18.0;
    if (h > 120.0) h = 120.0;
    _bossHeights[i] = h;
  }

  // Enforce exact mirroring for left/right symmetry (overwrites right half)
  const half: i32 = n >> 1;
  for (let i: i32 = 0; i < half; i++) {
    _bossHeights[n - 1 - i] = _bossHeights[i];
  }

  return n;
}

/**
 * Bitmask of vulnerable lanes for a boss phase (bit i set => lane i is vulnerable).
 * Patterns rotate with phase so players must re-aim.
 */
export function getBossVulnerableMask(phase: i32, lanes: i32): u32 {
  const n = clampLanes(lanes);
  let mask: u32 = 0;

  if (phase == 0) {
    // Odd lanes
    for (let i: i32 = 0; i < n; i++) {
      if ((i & 1) != 0) mask |= (1 as u32) << (i as u32);
    }
  } else if (phase == 1) {
    // Even lanes
    for (let i: i32 = 0; i < n; i++) {
      if ((i & 1) == 0) mask |= (1 as u32) << (i as u32);
    }
  } else if (phase == 2) {
    // Center lane(s)
    const mid = n >> 1;
    mask |= (1 as u32) << (mid as u32);
    if ((n & 1) == 0 && mid - 1 >= 0) {
      mask |= (1 as u32) << ((mid - 1) as u32);
    }
  } else {
    // All lanes vulnerable as fallback
    for (let i: i32 = 0; i < n; i++) {
      mask |= (1 as u32) << (i as u32);
    }
  }

  return mask;
}

/**
 * Telegraph fill progress in [0, 1] before a growth surge.
 */
export function getBossTelegraphProgress(elapsedMs: f64, telegraphMs: f64): f64 {
  if (telegraphMs <= 0.0) return 1.0;
  let t: f64 = elapsedMs / telegraphMs;
  if (t < 0.0) t = 0.0;
  if (t > 1.0) t = 1.0;
  return t;
}
