# Boss encounters

Spectacle boss fights with authored phase timings, WASM formation math, and juice rewards.

## Authoring format (`src/data/bosses.json`)

Each entry in the `bosses` array:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Stable id referenced by `LevelDefinition.bossId` |
| `name` | string | Display name (HUD + floating text) |
| `triggerLevelId` | number | Campaign level `id` that starts this boss |
| `colors.primary` | hex | Boss accent / HP bar start |
| `colors.secondary` | hex | Secondary accent / name color |
| `colors.telegraph` | hex | Telegraph ring + surge flash |
| `colors.vulnerable` | hex | Vulnerable lane markers |
| `hp` | number | Hits required on vulnerable lanes to defeat |
| `introMs` | number | Intro hold before first telegraph |
| `defeatMs` | number | Defeat linger before level-complete flow |
| `fireRateMultiplier` | number | `< 1` slows player fire during the fight |
| `colorLockAlternating` | boolean | Lock lane colors to an alternating pattern |
| `phases[]` | array | Combat phases (see below) |
| `rewards.scoreBonus` | number | Score granted on defeat |
| `rewards.rainbowCount` | number | Rainbow power-ups granted on defeat |

### Phase object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Phase label for debugging |
| `formationPhase` | number | Pattern index for WASM `generateBossHeights` / `getBossVulnerableMask` (`0` center peak, `1` alternating ridges, `2` edge peaks) |
| `telegraphMs` | number | Wind-up before the growth surge |
| `surgeMs` | number | Simultaneous growth pulse duration |
| `vulnerableMs` | number | Window where matching vulnerable lanes deals boss damage |
| `surgeGrowth` | number | Per-frame height added during surge |
| `idleGrowth` | number | Slow growth during telegraph / vulnerable |

### Wiring a level

Set `bossId` on a campaign level in `LevelDefinitions.js`:

```js
{
  id: 5,
  name: 'The Convergence',
  // ...
  bossId: 'convergence',
  description: 'Defeat The Convergence',
}
```

When that level begins, `Game._maybeStartBoss()` loads the definition, snaps crystals to the formation profile, and starts the state machine.

## State machine (`BossController.js`)

```
idle → intro → phase(telegraph → surge → vulnerable) × N → defeat → idle
```

- **intro** — formation applied, no surge growth, sting audio
- **telegraph** — HUD ring fills (`getBossTelegraphProgress`)
- **surge** — screen shockwave + elevated growth
- **vulnerable** — bitmask of lanes from WASM; matches deal 1 HP
- **defeat** — rewards, then existing `handleLevelComplete()` / campaign flow

Crystal touch during a boss still uses the normal game-over path.

## WASM formation math (`src/assembly/formations.ts`)

| Export | Role |
|--------|------|
| `generateBossHeights(seed, phase, lanes)` | Writes symmetric heights into linear memory |
| `getBossHeightsByteOffset()` / `getBossHeightsCapacity()` | Buffer layout for JS views |
| `getBossVulnerableMask(phase, lanes)` | Bitmask of damageable lanes |
| `getBossTelegraphProgress(elapsedMs, telegraphMs)` | `0..1` telegraph fill |

JS mirrors live in `WasmFallbacks.js`. `WasmManager.generateBossHeights` returns a copied `Float64Array` and always falls back if WASM is unavailable.

## Verification

```bash
npm run build
python3 verification/verify_boss_encounter.py
```

The script calls `window.game.forceStartBoss('convergence')`, advances through intro → vulnerable, deals scripted damage, and asserts defeat + reward flow.
