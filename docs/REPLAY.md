# Replay format (`.ccreplay`)

Crystal Cave records compact gameplay event logs for deterministic session reproduction, regression testing, and (future) daily-challenge validation.

## File extension and MIME type

- Extension: `.ccreplay`
- MIME: `application/vnd.cave-crystals-replay+json`

## Schema (version 1)

```json
{
  "version": 1,
  "seed": 12345,
  "recordedAt": "2026-07-22T08:00:00.000Z",
  "config": {
    "gameMode": "campaign",
    "graphics": "high",
    "levelIndex": 0
  },
  "events": [
    { "t": 0, "type": "start" },
    { "t": 120, "type": "aim", "lane": 3 },
    { "t": 145, "type": "fire" },
    { "t": 890, "type": "milestone", "kind": "match", "lane": 3, "score": 150 }
  ],
  "expect": {
    "finalScore": 420,
    "tolerance": 0
  }
}
```

### Top-level fields

| Field | Required | Description |
|-------|----------|-------------|
| `version` | yes | Integer schema version. Only `1` is supported today. |
| `seed` | yes | `u32` gameplay seed applied at session start. |
| `recordedAt` | no | ISO-8601 timestamp when the file was exported. |
| `config` | yes | Settings that affect Tier-1 gameplay outcomes (see below). |
| `events` | yes | Ordered list of timestamped events (sorted by `t` on load). |
| `expect` | no | Golden values for CI verification. |

### `config`

| Field | Description |
|-------|-------------|
| `gameMode` | `"campaign"` or `"endless"` |
| `graphics` | Quality preset: `"low"`, `"medium"`, `"high"`, or `"auto"` |
| `levelIndex` | Campaign level index at recording start (`0` = first level) |

Playback forces these settings, skips the tutorial, and blocks live pointer/keyboard input.

### Event timestamps (`t`)

Milliseconds on the **game clock**: accumulated simulation time while `active && !paused`. Pause time is excluded.

### Input events (drive playback)

| `type` | Fields | Description |
|--------|--------|-------------|
| `start` | — | Session boundary marker at `t: 0`. |
| `aim` | `lane` | Set launcher to absolute lane index. |
| `fire` | — | Fire spore at current lane. |
| `powerUp` | — | Activate held power-up (`KeyE` equivalent). |
| `pause` | — | Toggle pause on. |
| `resume` | — | Resume from pause. |

When multiple events share a timestamp, ordering is: `start` → `aim` → `fire` → `powerUp` → `pause` → `resume` → `milestone`.

### Milestone events (verification only)

| `type` | Fields | Description |
|--------|--------|-------------|
| `milestone` | `kind`, optional `lane`, `score`, `colorIdx` | Recorded during live play for anti-cheat checks. **Not replayed** into simulation. |

Kinds: `match`, `score`, `levelComplete`.

## Recording (dev)

During an active session in dev mode (`import.meta.env.DEV` or `?dev=1`):

- **Ctrl+Shift+R** — download `session.ccreplay` with current events and `expect.finalScore`.

Recording hooks live at gameplay choke points (`setTargetLane`, `shootSpore`, `activateHeldPowerUp`) so pointer and keyboard paths are normalized.

## Playback

### URL hook

```
index.html?replay=fixtures/golden_campaign_l1.ccreplay
```

Press **Start** to load and play the queued replay.

### Programmatic API

```js
const g = window.game;
g.replay.player.load(replayJson);
g.replay.player.start(g);           // real-time via rAF
g.replay.player.runToCompletion(g); // fixed 16 ms steps (tests)
```

### Playwright regression

See [`verification/verify_replay.py`](../verification/verify_replay.py) and the golden fixture at [`verification/fixtures/golden_campaign_l1.ccreplay`](../verification/fixtures/golden_campaign_l1.ccreplay).

```bash
npm run build
python3 verification/verify_replay.py
```

## Determinism

Only **Tier-1** gameplay RNG is seeded from `seed`. Visual juice may diverge without affecting score. See [`DETERMINISM.md`](./DETERMINISM.md).

## Versioning

Increment `version` for breaking schema changes. `parseReplayFile()` in [`src/modules/replayFormat.js`](../src/modules/replayFormat.js) rejects unknown versions.
