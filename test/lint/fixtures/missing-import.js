export function spawnRing(state, cx, cy) {
    state.energyRings.push(new EnergyRing(cx, cy, '#ffffff', 1));
}
