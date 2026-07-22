// @ts-check

import { isInputEvent, parseReplayFile } from './replayFormat.js';

/**
 * Replays normalized input events into Game at recorded game-clock times.
 */
export class ReplayPlayer {
    constructor() {
        /** @type {import('./replayFormat.js').ReplayFile | null} */
        this._file = null;
        /** @type {number} */
        this._nextIndex = 0;
        /** @type {boolean} */
        this._active = false;
        /** @type {boolean} */
        this._complete = false;
        /** @type {import('./replayFormat.js').ReplayEvent[]} */
        this._milestones = [];
        /** @type {number} */
        this._endTime = 0;
        /** @type {boolean} */
        this._stepMode = false;
    }

    /** @returns {boolean} */
    isActive() {
        return this._active;
    }

    /** @returns {boolean} */
    isComplete() {
        return this._complete;
    }

    /**
     * @param {string | import('./replayFormat.js').ReplayFile} raw
     * @returns {import('./replayFormat.js').ReplayFile}
     */
    load(raw) {
        this._file = parseReplayFile(raw);
        this._nextIndex = 0;
        this._active = false;
        this._complete = false;
        this._milestones = [];
        const inputEvents = this._file.events.filter(isInputEvent);
        this._endTime = inputEvents.length > 0
            ? inputEvents[inputEvents.length - 1].t
            : 0;
        return this._file;
    }

    /**
     * @param {import('./Game.js').Game} game
     */
    start(game) {
        if (!this._file) {
            throw new Error('No replay loaded');
        }
        this._nextIndex = 0;
        this._active = true;
        this._complete = false;
        this._milestones = [];
        game.startGameFromReplay(this._file.config, this._file.seed);
        this.applyEvents(game, 0);
    }

    /**
     * @param {import('./Game.js').Game} game
     * @param {number} gameClockMs
     */
    applyEvents(game, gameClockMs) {
        if (!this._file || !this._active || this._complete) return;

        while (this._nextIndex < this._file.events.length) {
            const event = this._file.events[this._nextIndex];
            if (event.t > gameClockMs) break;
            this._dispatchEvent(game, event);
            this._nextIndex++;
        }

        if (this._nextIndex >= this._file.events.length && gameClockMs >= this._endTime) {
            this._complete = true;
            this._active = false;
        }
    }

    /**
     * @param {import('./Game.js').Game} game
     * @param {import('./replayFormat.js').ReplayEvent} event
     */
    _dispatchEvent(game, event) {
        switch (event.type) {
            case 'start':
                break;
            case 'aim':
                if (typeof event.lane === 'number') {
                    game.setTargetLane(event.lane, { fromReplay: true });
                }
                break;
            case 'fire':
                game.shootSpore({ fromReplay: true });
                break;
            case 'powerUp':
                game.activateHeldPowerUp({ fromReplay: true });
                break;
            case 'pause':
                if (!game.state.paused) game.togglePause();
                break;
            case 'resume':
                if (game.state.paused) game.resumeGame();
                break;
            case 'milestone':
                this._milestones.push({ ...event });
                break;
            default:
                break;
        }
    }

    /**
     * @param {import('./Game.js').Game} game
     * @param {number} dt
     */
    poll(game, dt) {
        if (!this._active || this._complete) {
            return { laneDelta: 0, fire: false };
        }

        if (!this._stepMode && !game.state.paused) {
            game.state.gameClockMs += dt;
        }
        this.applyEvents(game, game.state.gameClockMs);
        return { laneDelta: 0, fire: false };
    }

    /**
     * Fixed-timestep simulation for tests (no rAF).
     * @param {import('./Game.js').Game} game
     * @param {number} [deltaMs]
     */
    step(game, deltaMs = 16) {
        if (!this._active && this._file && !this._complete) {
            this.start(game);
        }
        if (!this._active) return;

        this._stepMode = true;
        try {
            const target = game.state.gameClockMs + deltaMs;
            while (game.state.gameClockMs < target && !this._complete) {
                const slice = Math.min(16, target - game.state.gameClockMs);
                if (!game.state.paused) {
                    game.state.gameClockMs += slice;
                }
                this.applyEvents(game, game.state.gameClockMs);
                if (game.state.active && !game.state.paused) {
                    game.update(slice);
                }
            }
        } finally {
            this._stepMode = false;
        }
    }

    /**
     * Step replay events then drain physics until score settles.
     * @param {import('./Game.js').Game} game
     * @param {number} [maxMs]
     */
    runToCompletion(game, maxMs = 60000) {
        let elapsed = 0;
        while (elapsed < maxMs) {
            if (!this._complete) {
                this.step(game, 16);
            } else if (
                game.state.soulParticles.length === 0 &&
                game.state.spores.length === 0 &&
                game.state.sleepTimer <= 0
            ) {
                break;
            } else {
                this._stepMode = true;
                try {
                    if (!game.state.paused) {
                        game.state.gameClockMs += 16;
                    }
                    if (game.state.active && !game.state.paused) {
                        game.update(16);
                    }
                } finally {
                    this._stepMode = false;
                }
            }
            elapsed += 16;
        }
    }

    /** @returns {import('./replayFormat.js').ReplayEvent[]} */
    getMilestones() {
        return this._milestones.map((ev) => ({ ...ev }));
    }

    /** @returns {import('./replayFormat.js').ReplayFile | null} */
    getFile() {
        return this._file;
    }
}
