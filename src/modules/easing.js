// Reusable easing helpers for animation juice

/**
 * Elastic ease out — overshoots, then settles.
 * t: normalized progress [0..1]
 */
export function easeOutElastic(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    // c4 controls oscillation period: 2π/3 ≈ one full overshoot cycle over t=1
    const c4 = (2 * Math.PI) / 3;
    // 2^(-10t) decays the amplitude; sin gives the oscillation
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/**
 * Back ease out — overshoots slightly, then settles.
 * t: normalized progress [0..1]
 * overshoot: controls amount of overshoot (default 1.70158)
 */
export function easeOutBack(t, overshoot = 1.70158) {
    const s = overshoot;        // overshoot coefficient
    const c = s + 1;            // cubic coefficient derived from overshoot
    return 1 + c * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);
}

/**
 * Cubic ease out — smooth deceleration.
 */
export function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

/**
 * Quart ease out — sharper deceleration.
 */
export function easeOutQuart(t) {
    return 1 - Math.pow(1 - t, 4);
}

/**
 * Spring step helper — advances a spring toward a target by one timestep.
 * @param {number} pos   - current position
 * @param {number} vel   - current velocity
 * @param {number} target - spring rest position
 * @param {number} k     - spring stiffness (0..1; higher = stiffer)
 * @param {number} d     - damping per unit time (0..1; lower = more oscillation)
 * @param {number} timeScale - frame time scale for consistent feel under slow-mo
 * @returns {{ pos: number, vel: number }} updated position and velocity
 */
export function springStep(pos, vel, target, k, d, timeScale) {
    const force = (target - pos) * k;
    vel = (vel + force * timeScale) * Math.pow(d, timeScale);
    pos = pos + vel * timeScale;
    return { pos, vel };
}
