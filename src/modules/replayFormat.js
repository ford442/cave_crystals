/** @typedef {import('./types.js').GameMode} GameMode */
/** @typedef {import('./types.js').QualityMode} QualityMode */

export const REPLAY_VERSION = 1;

/** @typedef {'start' | 'aim' | 'fire' | 'powerUp' | 'pause' | 'resume' | 'milestone'} ReplayEventType */

/**
 * @typedef {Object} ReplayConfig
 * @property {GameMode} gameMode
 * @property {QualityMode} graphics
 * @property {number} levelIndex
 */

/**
 * @typedef {Object} ReplayExpect
 * @property {number} finalScore
 * @property {number} [tolerance]
 */

/**
 * @typedef {Object} ReplayFile
 * @property {number} version
 * @property {number} seed
 * @property {string} [recordedAt]
 * @property {ReplayConfig} config
 * @property {ReplayEvent[]} events
 * @property {ReplayExpect} [expect]
 */

/**
 * @typedef {Object} ReplayEvent
 * @property {number} t
 * @property {ReplayEventType} type
 * @property {number} [lane]
 * @property {string} [kind]
 * @property {number} [score]
 * @property {number} [colorIdx]
 */

const INPUT_TYPES = new Set(['start', 'aim', 'fire', 'powerUp', 'pause', 'resume']);
const EVENT_ORDER = { start: 0, aim: 1, fire: 2, powerUp: 3, pause: 4, resume: 5, milestone: 6 };

/**
 * @param {unknown} raw
 * @returns {ReplayFile}
 */
export function parseReplayFile(raw) {
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data || typeof data !== 'object') {
        throw new Error('Replay must be a JSON object');
    }
    if (data.version !== REPLAY_VERSION) {
        throw new Error(`Unsupported replay version: ${data.version}`);
    }
    if (typeof data.seed !== 'number' || !Number.isFinite(data.seed)) {
        throw new Error('Replay missing valid seed');
    }
    if (!data.config || typeof data.config !== 'object') {
        throw new Error('Replay missing config');
    }
    if (!Array.isArray(data.events) || data.events.length === 0) {
        throw new Error('Replay missing events');
    }

    /** @type {ReplayEvent[]} */
    const events = data.events.map((/** @type {ReplayEvent} */ ev, /** @type {number} */ i) => {
        if (typeof ev.t !== 'number' || typeof ev.type !== 'string') {
            throw new Error(`Invalid event at index ${i}`);
        }
        if (ev.type === 'aim' && typeof ev.lane !== 'number') {
            throw new Error(`aim event at index ${i} missing lane`);
        }
        return { ...ev };
    });

    events.sort((a, b) => {
        if (a.t !== b.t) return a.t - b.t;
        return (EVENT_ORDER[a.type] ?? 99) - (EVENT_ORDER[b.type] ?? 99);
    });

    return {
        version: REPLAY_VERSION,
        seed: data.seed >>> 0,
        recordedAt: typeof data.recordedAt === 'string' ? data.recordedAt : undefined,
        config: {
            gameMode: data.config.gameMode ?? 'campaign',
            graphics: data.config.graphics ?? 'high',
            levelIndex: data.config.levelIndex ?? 0,
        },
        events,
        expect: data.expect,
    };
}

/**
 * @param {ReplayEvent} event
 * @returns {boolean}
 */
export function isInputEvent(event) {
    return INPUT_TYPES.has(event.type);
}

/**
 * @param {ReplayConfig} config
 * @returns {ReplayConfig}
 */
export function snapshotReplayConfig(config) {
    return {
        gameMode: config.gameMode,
        graphics: config.graphics,
        levelIndex: config.levelIndex,
    };
}
