import { COLORS, GAME_CONFIG } from './Constants.js';

const FILM_GRAIN_REFRESH_INTERVAL_MS = 90;
const EMERGENCY_PARTICLE_STRIDE_BOOST = 1;
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
        crystalDetail: 'high', postFX: true, lightShafts: true, fog: true, allowGridDistortion: true,
        bloom: true, bloomStrength: 0.85, grainAmount: 1.0, colorGrade: true, scanlineBase: 0.08,
        caveDetail: 'high', maxEnvParticles: 80
    },
    medium: {
        maxDust: 95, maxParticles: 800, particleStride: 1, gridBase: 65,
        crystalDetail: 'medium', postFX: true, lightShafts: true, fog: true, allowGridDistortion: false,
        bloom: false, bloomStrength: 0.0, grainAmount: 0.65, colorGrade: true, scanlineBase: 0.04,
        caveDetail: 'medium', maxEnvParticles: 45
    },
    low: {
        maxDust: 55, maxParticles: 420, particleStride: 2, gridBase: 90,
        crystalDetail: 'low', postFX: false, lightShafts: false, fog: true, allowGridDistortion: false,
        bloom: false, bloomStrength: 0.0, grainAmount: 0.0, colorGrade: false, scanlineBase: 0.0,
        caveDetail: 'low', maxEnvParticles: 20
    }
};

export {
    COLORS,
    GAME_CONFIG,
    FILM_GRAIN_REFRESH_INTERVAL_MS,
    EMERGENCY_PARTICLE_STRIDE_BOOST,
    MAX_BLOOM_PARTICLES,
    CAVE_SEED_BASE,
    CAVE_SEED_WIDTH_FACTOR,
    CAVE_SEED_HEIGHT_FACTOR,
    CAVE_VEIN_COLORS,
    RENDER_QUALITY_PROFILES
};
