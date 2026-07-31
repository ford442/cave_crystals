# Particle integrator ladder

Particle simulation is visual-only Tier-2 work and must never gate gameplay correctness or replay score determinism.

## Runtime ladder

1. **WebGPU compute** (`renderQuality === 'high'`, feature-detected)
2. **Dedicated worker + WASM batch**
3. **Main thread WASM/JS fallback**
4. **Low quality profile** (reduced particle caps, no worker/WebGPU path preference)

The game always falls back automatically. If WebGPU or worker init fails, gameplay continues with main-thread integration.

## Batch layouts (CPU staging source of truth)

Layouts live in `src/modules/WasmConstants.js` and are packed/scattered by `src/modules/particleBatchCodec.js`.

- Trail stride `6`: `x, y, vx, vy, life, size`
- Ambient/simple stride `7`: `x, y, vx, vy, life, gravity, friction`
- Dust stride `8` (JS path): `x, y, vx, vy, phase, alpha, baseVx, baseVy`

WebGPU compute stages the same semantic fields into `Float32Array` buffers for WGSL compute and decodes results back into entity objects.

## Ownership / rendering compatibility

WebGPU integration uses compute-only device usage and does **not** claim `#gameCanvas`, preserving existing WebGL2 post-FX ownership in `RendererHost`.

## Debug + verification

- Dev perf overlay (`P`) reports integrator path as `webgpu`, `worker`, or `main`.
- Programmatic ladder assertions: `python3 verification/verify_particle_integrator.py`.
