import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
    REPLAY_VERSION,
    parseReplayFile,
    isInputEvent,
} from '../../src/modules/replayFormat.js';
import { ReplayRecorder } from '../../src/modules/ReplayRecorder.js';
import { ReplayPlayer } from '../../src/modules/ReplayPlayer.js';
import * as gameplayRng from '../../src/modules/GameplayRng.js';

/** @returns {import('../../src/modules/Game.js').Game} */
function makeMockGame() {
    return /** @type {import('../../src/modules/Game.js').Game} */ ({
        state: {
            active: true,
            paused: false,
            gameClockMs: 0,
            score: 0,
            soulParticles: [],
            spores: [],
            sleepTimer: 0,
        },
        launcher: { targetLane: 0 },
        setTargetLane(lane, options = {}) {
            this.launcher.targetLane = lane;
            if (!options.fromReplay) {
                this.replay.recorder.onAim(this, lane);
            }
        },
        shootSpore(options = {}) {
            if (!options.fromReplay) {
                this.replay.recorder.onFire(this);
            }
        },
        update() {},
        replay: {
            recorder: new ReplayRecorder(),
            player: new ReplayPlayer(),
        },
        startGameFromReplay() {},
    });
}

describe('replayFormat', () => {
    it('parses valid replay files', () => {
        const file = parseReplayFile({
            version: REPLAY_VERSION,
            seed: 42,
            config: { gameMode: 'campaign', graphics: 'high', levelIndex: 0 },
            events: [
                { t: 0, type: 'start' },
                { t: 100, type: 'aim', lane: 2 },
                { t: 100, type: 'fire' },
            ],
        });

        assert.equal(file.seed, 42);
        assert.equal(file.events.length, 3);
        assert.equal(file.events[1].type, 'aim');
        assert.equal(file.events[2].type, 'fire');
    });

    it('rejects unsupported versions', () => {
        assert.throws(
            () => parseReplayFile({ version: 99, seed: 1, config: {}, events: [{ t: 0, type: 'start' }] }),
            /Unsupported replay version/
        );
    });

    it('sorts same-timestamp events with aim before fire', () => {
        const file = parseReplayFile({
            version: REPLAY_VERSION,
            seed: 1,
            config: { gameMode: 'campaign', graphics: 'high', levelIndex: 0 },
            events: [
                { t: 50, type: 'fire' },
                { t: 50, type: 'aim', lane: 1 },
                { t: 0, type: 'start' },
            ],
        });
        assert.equal(file.events[1].type, 'aim');
        assert.equal(file.events[2].type, 'fire');
    });
});

describe('ReplayRecorder', () => {
    it('dedupes aim events for the same lane', () => {
        const game = makeMockGame();
        game.replay.recorder.onStart(7, { gameMode: 'campaign', graphics: 'high', levelIndex: 0 });
        game.state.gameClockMs = 10;
        game.setTargetLane(2);
        game.setTargetLane(2);
        game.setTargetLane(3);
        const exported = game.replay.recorder.export();
        const aims = exported.events.filter((ev) => ev.type === 'aim');
        assert.equal(aims.length, 2);
        assert.deepEqual(aims.map((ev) => ev.lane), [2, 3]);
    });
});

describe('ReplayPlayer', () => {
    it('dispatches aim before fire at the same timestamp', () => {
        const game = makeMockGame();
        const actions = [];
        game.setTargetLane = (lane, options = {}) => {
            game.launcher.targetLane = lane;
            actions.push(`aim:${lane}:${options.fromReplay ? 'replay' : 'live'}`);
        };
        game.shootSpore = (options = {}) => {
            actions.push(`fire:${options.fromReplay ? 'replay' : 'live'}`);
        };

        const player = game.replay.player;
        player.load({
            version: REPLAY_VERSION,
            seed: 1,
            config: { gameMode: 'campaign', graphics: 'high', levelIndex: 0 },
            events: [
                { t: 0, type: 'start' },
                { t: 16, type: 'fire' },
                { t: 16, type: 'aim', lane: 4 },
            ],
        });
        player._active = true;
        player.applyEvents(game, 16);

        assert.deepEqual(actions, ['aim:4:replay', 'fire:replay']);
    });
});

describe('GameplayRng', () => {
    it('produces deterministic sequences from a seed', () => {
        gameplayRng.setGameplaySeed(12345);
        const a = gameplayRng.nextInt(10);
        const b = gameplayRng.nextInt(10);
        gameplayRng.setGameplaySeed(12345);
        assert.equal(gameplayRng.nextInt(10), a);
        assert.equal(gameplayRng.nextInt(10), b);
    });
});

describe('isInputEvent', () => {
    it('classifies milestone events as non-input', () => {
        assert.equal(isInputEvent({ t: 1, type: 'fire' }), true);
        assert.equal(isInputEvent({ t: 1, type: 'milestone', kind: 'match' }), false);
    });
});
