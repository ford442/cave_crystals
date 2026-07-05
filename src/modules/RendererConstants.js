import { COLORS, GAME_CONFIG } from './Constants.js';

const FILM_GRAIN_REFRESH_INTERVAL_MS = 90;
const FILM_GRAIN_HIGH_REFRESH_INTERVAL_MS = 72;
const EMERGENCY_PARTICLE_STRIDE_BOOST = 1;
const PARTICLE_LOD = {
    cheapSparkSize: 2.5,
    cheapPhysicalSize: 4,
    cheapAuraSize: 1.8,
    cheapTrailSize: 2.8,
    loadStrideStartRatio: 0.65,
    loadStrideMidRatio: 0.82,
    frameMsStrideStep: 3.5
};
// Frame-time micro-adaptation within a quality profile (~55 FPS budget)
const ADAPTIVE_FRAME_BUDGET = {
    targetFrameMs: 18.2,
    softFrameMs: 16.7,
    hardFrameMs: 24.0,
    maxStrideBoost: 3,
    minEffectScale: 0.6,
    strideStep: 1,
    strideRecovery: 0.15,
    effectScaleStep: 0.06
};

function resolveParticleStride(profile, particleCount, adaptiveOverrides = null, frameMs = 16.7, instantFrameMs = frameMs) {
    let stride = profile.particleStride;
    const maxP = profile.maxParticles;
    const stressMs = Math.max(frameMs, instantFrameMs * 0.85);
    if (particleCount > maxP) {
        stride += EMERGENCY_PARTICLE_STRIDE_BOOST;
    }
    if (particleCount > maxP * PARTICLE_LOD.loadStrideMidRatio) {
        stride += 1;
    } else if (particleCount > maxP * PARTICLE_LOD.loadStrideStartRatio) {
        stride += 1;
    }
    if (stressMs > ADAPTIVE_FRAME_BUDGET.softFrameMs) {
        stride += Math.min(3, Math.floor((stressMs - ADAPTIVE_FRAME_BUDGET.softFrameMs) / PARTICLE_LOD.frameMsStrideStep));
    }
    if (adaptiveOverrides && adaptiveOverrides.particleStrideBoost > 0) {
        stride += Math.floor(adaptiveOverrides.particleStrideBoost);
    }
    return Math.max(1, stride);
}

const PRIORITY_PARTICLE_TYPES = new Set(['chunk', 'shard', 'debris']);

function shouldDrawParticleWithStride(index, particle, stride) {
    if (stride <= 1) return true;
    if (PRIORITY_PARTICLE_TYPES.has(particle.type)) return true;
    if (particle.type === 'aura' && particle.size >= PARTICLE_LOD.cheapAuraSize) return true;
    return (index % stride) === 0;
}
// Maximum number of explosion particles sampled for bloom — caps cost during chaos
const MAX_BLOOM_PARTICLES = 40;
// Cave environment constants for seeded geometry generation
const CAVE_SEED_BASE = 12345;
const CAVE_SEED_WIDTH_FACTOR = 7;
const CAVE_SEED_HEIGHT_FACTOR = 13;
const CAVE_VEIN_COLORS = ['#FF4488', '#44FF88', '#4488FF', '#AA44FF', '#FFAA44'];
const RENDER_QUALITY_PROFILES = {
    high: {
        maxDust: 140, maxParticles: 1400, particleStride: 1, gridBase: 50,
        crystalDetail: 'high', postFX: true, lightShafts: true, shaftDust: true, fog: true, allowGridDistortion: true,
        bloom: true, bloomStrength: 0.85, grainAmount: 1.0, grainHighQuality: true, colorGrade: true, scanlineBase: 0.08,
        caveDetail: 'high', maxEnvParticles: 80
    },
    medium: {
        maxDust: 95, maxParticles: 800, particleStride: 1, gridBase: 65,
        crystalDetail: 'medium', postFX: true, lightShafts: true, shaftDust: false, fog: true, allowGridDistortion: false,
        bloom: false, bloomStrength: 0.0, grainAmount: 0.65, grainHighQuality: false, colorGrade: true, scanlineBase: 0.04,
        caveDetail: 'medium', maxEnvParticles: 45
    },
    low: {
        maxDust: 55, maxParticles: 420, particleStride: 2, gridBase: 90,
        crystalDetail: 'low', postFX: false, lightShafts: false, shaftDust: false, fog: true, allowGridDistortion: false,
        bloom: false, bloomStrength: 0.0, grainAmount: 0.0, grainHighQuality: false, colorGrade: false, scanlineBase: 0.0,
        caveDetail: 'low', maxEnvParticles: 20
    }
};

export {
    COLORS,
    GAME_CONFIG,
    FILM_GRAIN_REFRESH_INTERVAL_MS,
    FILM_GRAIN_HIGH_REFRESH_INTERVAL_MS,
    EMERGENCY_PARTICLE_STRIDE_BOOST,
    ADAPTIVE_FRAME_BUDGET,
    PARTICLE_LOD,
    PRIORITY_PARTICLE_TYPES,
    resolveParticleStride,
    shouldDrawParticleWithStride,
    MAX_BLOOM_PARTICLES,
    CAVE_SEED_BASE,
    CAVE_SEED_WIDTH_FACTOR,
    CAVE_SEED_HEIGHT_FACTOR,
    CAVE_VEIN_COLORS,
    RENDER_QUALITY_PROFILES
};
