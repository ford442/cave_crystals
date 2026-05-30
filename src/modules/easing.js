// Reusable easing helpers for animation juice

/**
 * Elastic ease out — overshoots, then settles.
 * t: normalized progress [0..1]
 */
export function easeOutElastic(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/**
 * Back ease out — overshoots slightly, then settles.
 * t: normalized progress [0..1]
 * overshoot: controls amount of overshoot (default 1.70158)
 */
export function easeOutBack(t, overshoot = 1.70158) {
    const c1 = overshoot;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
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
 * Spring step helper — advances a spring toward a target.
 * Returns { pos, vel } after one step.
 * k: spring constant (stiffness), d: damping [0..1], timeScale: frame scale
 */
export function springStep(pos, vel, target, k, d, timeScale) {
    const force = (target - pos) * k;
    vel = (vel + force * timeScale) * Math.pow(d, timeScale);
    pos = pos + vel * timeScale;
    return { pos, vel };
}
