# Authoring game content

Campaign levels, power-ups and bosses are data in `src/data/`. You can add levels, arcs,
power-up variants, hazards and bosses by editing JSON. You only need code when you want a
new *kind* of behaviour.

| File | Contents |
|------|----------|
| `src/data/campaign.json` | Endless tuning plus campaign **arcs**, each with an ordered list of levels |
| `src/data/powerups.json` | Drop tuning, the default drop pool, and the power-up catalog |
| `src/data/bosses.json` | Boss encounters (see [BOSSES.md](BOSSES.md)) |

## Validation (fail fast)

`src/modules/content/ContentRegistry.js` imports all three files, validates them together
with `validateContent()` (`src/modules/content/validateContent.js`), deep-freezes the result
and exposes indexed lookups. A bad file throws a `ContentValidationError` that lists **every**
problem with its path, for example:

```
Invalid game content (2 problems):
  - campaign.arcs[1].levels[1].hazards[0].lanes[1]: lane 7 is outside this level's 7 lanes
  - powerups.powerUps[4].activation: effect "rainbow_shot" requires activation "on_shoot", got "on_activate"
```

Every gameplay test imports the registry, so broken content fails `npm run test:ci`.
`npm run test:content` runs the validation suite alone, including the malformed-content cases.

Beyond types and ranges, the validator checks the following:

- Unknown fields are rejected, so a typo like `bossID` can't silently do nothing.
- Level ids run `1..N` in campaign order across arcs, because the HUD shows the id as the level number.
- `crystalHeight.min <= max`, and streak targets are whole numbers.
- Hazard lanes fall inside the level's lane count, `laneCount` fits the candidate lanes, `warningMs < intervalMs`, and `color_shift` only appears on levels with at least 2 colors.
- `bossId` and `triggerLevelId` agree in both directions.
- Every power-up id in `defaultPool`, `powerUpPool` and boss `rewards.powerUps` exists.
- A power-up's `activation` matches its effect kind, and timed effects have `durationMs`.
- Drop pools can roll every entry: at max combo the summed chances must stay ≤ 1.

## Levels (`campaign.json`)

```jsonc
{
  "id": 7,                       // position in the campaign (1..N)
  "name": "Tremor Gallery",
  "lanes": 7,                    // 2–12
  "colorCount": 4,               // 1–5 (palette size)
  "crystalHeight": { "min": 25, "max": 55 },
  "growth": { "baseMultiplier": 0.95, "scoreDivisor": 800 },
  "objective": { "type": "survival", "target": 50 },   // score | survival (s) | streak | clearance (px)
  "description": "Survive 50 seconds of quakes",
  "bossId": "…",                 // optional — starts that boss when the level begins
  "hazards": [ … ],              // optional — see below
  "powerUpPool": ["rainbow", …]  // optional — ids that can drop here; default is powerups.json defaultPool
}
```

Arcs (`{ id, name, subtitle?, color?, levels }`) play back-to-back as one campaign. Every arc
after the first shows a banner when its first level begins.

## Lane hazards

Implemented in `src/modules/HazardController.js`. Lane picks use the seeded gameplay RNG, so
hazards are deterministic under replay.

| `kind` | Fields | Behaviour |
|--------|--------|-----------|
| `overgrowth` | `lanes`, `growthMultiplier` | Listed lanes grow N× as fast (values below 1 slow them). Shown as a tinted lane with crawling chevrons. |
| `tremor` | `intervalMs`, `warningMs`, `growth`, `laneCount`, `lanes?` | Every interval, telegraphs `laneCount` lanes for `warningMs`, then jolts their crystals by `growth` px. |
| `color_shift` | `intervalMs`, `warningMs`, `laneCount`, `lanes?` | Same cadence. It re-colors both crystals in each picked lane to a different color. |

`lanes` on tremor and color_shift limits the candidate lanes. Without it, any lane can be picked.

## Power-ups (`powerups.json`)

```jsonc
{
  "id": "fault_quake",
  "name": "Fault Quake",
  "activation": "on_activate",   // on_shoot | on_pickup | on_activate — must match the effect kind
  "durationMs": null,            // required (> 0) for timed effects, null otherwise
  "rarity": 0.04,                // base drop chance once combo >= drops.minCombo
  "color": "#FF6B3D", "hudLabel": "QUAKE", "icon": "☄",
  "description": "…",
  "activateKey": "KeyE",         // on_activate only: keyboard binding
  "activateText": "FAULT QUAKE!",// on_activate only: floating text on use (required)
  "effect": { "kind": "lane_shockwave", "shrink": 55, "minHeight": 10, "radius": 1 }
}
```

| Effect `kind` | Activation | Params |
|---------------|-----------|--------|
| `rainbow_shot` | `on_shoot` | `charges`: shots granted per pickup |
| `growth_scale` | `on_pickup` (timed) | `scale`: 0 freezes growth, 0.4 = 40% speed. When several are active the strongest wins. |
| `lane_shockwave` | `on_activate` | `shrink` px, `minHeight`, `radius`: neighbouring lanes hit on each side |

Held items are used in catalog order, so put a new variant after the original if the original
should be spent first. `defaultPool` order and rarities feed the seeded drop roll. Changing
them changes every existing replay that uses the default pool, including the golden fixture.

## Adding a new *kind*

1. Add its field spec to `POWER_UP_EFFECT_KINDS` or `HAZARD_KINDS` in `validateContent.js`.
2. Implement it in `PowerUpManager.js` or `HazardController.js`, and extend the JSDoc in `types.js`.
3. Add valid and malformed cases to `test/content/validation.test.mjs` plus behaviour tests.

## Verification

- `npm run test:content`: validation of the shipped content and malformed fixtures.
- `test/game/hazards.test.mjs`, `test/game/progression.test.mjs` and `test/powerups/variants.test.mjs`: runtime behaviour.
- `python3 verification/verify_arc2_content.py` (after `npm run build`): drives Arc II in the real game with the fixed-step clock and asserts on it. This check is not in the visual manifest.
