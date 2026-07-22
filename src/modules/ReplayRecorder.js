// @ts-check

import { REPLAY_VERSION, snapshotReplayConfig } from './replayFormat.js';

/**
 * Append-only gameplay event recorder with monotonic game-clock timestamps.
 */
export class ReplayRecorder {
    constructor() {
        /** @type {boolean} */
        this._recording = false;
        /** @type {number} */
        this._seed = 0;
        /** @type {import('./replayFormat.js').ReplayConfig | null} */
        this._config = null;
        /** @type {import('./replayFormat.js').ReplayEvent[]} */
        this._events = [];
        /** @type {number} */
        this._lastAimLane = -1;
    }

    /** @returns {boolean} */
    isRecording() {
        return this._recording;
    }

    /**
     * @param {number} seed
     * @param {import('./replayFormat.js').ReplayConfig} config
     */
    onStart(seed, config) {
        this._recording = true;
        this._seed = seed >>> 0;
        this._config = snapshotReplayConfig(config);
        this._events = [{ t: 0, type: 'start' }];
        this._lastAimLane = -1;
    }

    stop() {
        this._recording = false;
    }

    /**
     * @param {import('./Game.js').Game} game
     * @param {number} lane
     */
    onAim(game, lane) {
        if (!this._recording || lane === this._lastAimLane) return;
        this._lastAimLane = lane;
        this._events.push({ t: game.state.gameClockMs, type: 'aim', lane });
    }

    /** @param {import('./Game.js').Game} game */
    onFire(game) {
        if (!this._recording) return;
        this._events.push({ t: game.state.gameClockMs, type: 'fire' });
    }

    /** @param {import('./Game.js').Game} game */
    onPowerUp(game) {
        if (!this._recording) return;
        this._events.push({ t: game.state.gameClockMs, type: 'powerUp' });
    }

    /**
     * @param {import('./Game.js').Game} game
     * @param {Record<string, unknown>} data
     */
    onMilestone(game, data) {
        if (!this._recording) return;
        this._events.push({
            t: game.state.gameClockMs,
            type: 'milestone',
            ...data,
        });
    }

    /**
     * @param {import('./replayFormat.js').ReplayExpect} [expect]
     * @returns {import('./replayFormat.js').ReplayFile}
     */
    export(expect) {
        if (!this._config) {
            throw new Error('No recording to export');
        }
        return {
            version: REPLAY_VERSION,
            seed: this._seed,
            recordedAt: new Date().toISOString(),
            config: snapshotReplayConfig(this._config),
            events: this._events.map((ev) => ({ ...ev })),
            expect,
        };
    }

    /**
     * @param {string} [filename]
     * @param {import('./replayFormat.js').ReplayExpect} [expect]
     */
    download(filename = 'session.ccreplay', expect) {
        const payload = this.export(expect);
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: 'application/vnd.cave-crystals-replay+json',
        });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
    }
}
