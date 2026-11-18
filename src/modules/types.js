/**
 * Shared JSDoc contracts for Crystal Cave Spore Hunter.
 * Import typedefs with: `@import { GameState, Crystal, ... } from './types.js'`
 *
 * @module types
 */

/**
 * @typedef {'top' | 'bottom'} CrystalType
 */

/**
 * @typedef {'high' | 'medium' | 'low'} RenderQualityLevel
 */

/**
 * @typedef {'auto' | 'dev' | 'high' | 'medium' | 'low'} QualityMode
 */

/**
 * @typedef {'spark' | 'shard' | 'debris' | 'chunk' | 'aura' | 'ember'} ParticleType
 */

/**
 * @typedef {'drip' | 'mote' | 'rockdust'} EnvParticleType
 */

/**
 * @typedef {Object} Vec2
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} ShakeOffset
 * @property {number} x
 * @property {number} y
 * @property {number} angle
 */

/**
 * @typedef {Object} AdaptiveOverrides
 * @property {number} particleStrideBoost
 * @property {number} effectScale
 */

/**
 * @typedef {Object} PerfMetrics
 * @property {number} fps
 * @property {number} smoothedFps
 * @property {number} frameMs
 * @property {number} smoothedFrameMs
 * @property {number} particleCount
 * @property {number} particleLimit
 * @property {number} particleStride
 * @property {number} envParticleCount
 * @property {number} shockwaveCount
 * @property {number} distortionPrecomputeMs
 * @property {number} distortionGridCells
 * @property {number} distortionLookupCount
 * @property {number} instantFps
 * @property {number} trailCount
 * @property {number} energyRingCount
 * @property {number} sporeCount
 * @property {number} particleDrawMs
 * @property {number} particleUpdateMs
 * @property {'webgpu' | 'worker' | 'main' | 'idle'} [particleIntegratorPath]
 * @property {number} [particleWorkerMs]
 * @property {number} [particleWorkerBacklog]
 */

/**
 * @typedef {Object} RenderQualityProfile
 * @property {number} maxDust
 * @property {number} maxParticles
 * @property {number} particleStride
 * @property {number} gridBase
 * @property {'high' | 'medium' | 'low'} crystalDetail
 * @property {boolean} postFX
 * @property {boolean} lightShafts
 * @property {boolean} shaftDust
 * @property {boolean} fog
 * @property {boolean} allowGridDistortion
 * @property {boolean} bloom
 * @property {number} bloomStrength
 * @property {number} grainAmount
 * @property {boolean} grainHighQuality
 * @property {boolean} colorGrade
 * @property {number} scanlineBase
 * @property {'high' | 'medium' | 'low'} caveDetail
 * @property {number} maxEnvParticles
 * @property {number} [webgpuMaxDust]
 * @property {number} [webgpuMaxParticles]
 * @property {number} [webgpuMaxEnvParticles]
 */

/**
 * @typedef {Record<RenderQualityLevel, RenderQualityProfile>} RenderQualityProfileMap
 */

/**
 * Lane lookup uses live crystal class instances at runtime.
 * @typedef {Object} LaneCrystalPair
 * @property {InstanceType<typeof import('./Entities.js').Crystal> | null} top
 * @property {InstanceType<typeof import('./Entities.js').Crystal> | null} bottom
 */

/**
 * @typedef {Object} CollisionResult
 * @property {boolean} topHit
 * @property {boolean} topMatch
 * @property {boolean} bottomHit
 * @property {boolean} bottomMatch
 */

/**
 * @typedef {Object} SporeLightningArc
 * @property {number} angle
 * @property {number} lenRatio
 * @property {number[]} jaggedOffsets
 */

/**
 * @typedef {Object} GameColor
 * @property {string} name
 * @property {string} hex
 * @property {string} glow
 */

/**
 * @typedef {'circle' | 'triangle' | 'square' | 'diamond' | 'star'} ColorShape
 */

/**
 * @typedef {GameColor & { shape: ColorShape, glyph: string, shortLabel?: string }} PaletteColor
 */

/**
 * @typedef {Object} GameConfig
 * @property {number} lanes
 * @property {number} baseGrowthRate
 * @property {number} sporeExpandRate
 * @property {number} maxSporeSize
 * @property {number} penaltyGrowth
 * @property {number} matchShrink
 */

/**
 * @typedef {'score' | 'survival' | 'streak' | 'clearance'} ObjectiveType
 */

/**
 * @typedef {'on_shoot' | 'on_activate' | 'on_pickup'} PowerUpActivation
 */

/**
 * @typedef {Object} Crystal
 * @property {number} lane
 * @property {CrystalType} type
 * @property {number} height
 * @property {number} colorIdx
 * @property {number} flash
 * @property {number} shapeSeed
 * @property {number} lightPhase
 * @property {number} spawnDelay
 * @property {number} spawnTimer
 * @property {boolean} hasSpawned
 * @property {number} scaleX
 * @property {number} scaleY
 * @property {number} velScaleX
 * @property {number} velScaleY
 * @property {number} age
 * @property {boolean} isCritical
 * @property {number} shakeX
 * @property {number} shakeY
 * @property {number} matchFlash
 * @property {number} crackSeed
 * @property {number} displayHeight
 * @property {number} displayHeightVel
 * @property {number[]} shardPhaseOffsets
 * @property {number} facetDensity
 * @property {number} jitterX
 * @property {number} jitterY
 * @property {number} shardConfigIndex
 */

/**
 * @typedef {Object} Spore
 * @property {number} x
 * @property {number} y
 * @property {number} lane
 * @property {number} radius
 * @property {number} colorIdx
 * @property {boolean} active
 * @property {number} spawnTime
 * @property {number} maxRadius
 * @property {number} wobblePhase
 * @property {number} inFlightAge
 * @property {SporeLightningArc[]} lightningArcs
 * @property {{ rainbow?: boolean }} modifiers
 */

/**
 * @typedef {Object} PolyPoint
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {Object} Particle
 * @property {number} x
 * @property {number} y
 * @property {ParticleType} type
 * @property {boolean} [isTrail]
 * @property {number} vx
 * @property {number} vy
 * @property {number} life
 * @property {number} maxLife
 * @property {string} color
 * @property {number} size
 * @property {number} rotation
 * @property {number} rotationSpeed
 * @property {number} angleX
 * @property {number} angleY
 * @property {number} velAngleX
 * @property {number} velAngleY
 * @property {boolean} hitFloor
 * @property {boolean} hitWall
 * @property {number} gravity
 * @property {number} friction
 * @property {boolean} [floorBounce]
 * @property {number} [emberHeat]
 * @property {PolyPoint[]} [polyPoints]
 * @property {boolean} [isTrail]
 * @property {number} [_drawAlpha]
 * @property {number} [_screenSize]
 * @property {boolean} [_onScreen]
 * @property {number} [_poolIndex]
 */

/**
 * @typedef {Object} TrailParticle
 * @property {boolean} isTrail
 * @property {ParticleType} [type]
 * @property {boolean} [hitFloor]
 * @property {boolean} [hitWall]
 * @property {number} x
 * @property {number} y
 * @property {string} color
 * @property {boolean} isEnergy
 * @property {number} life
 * @property {number} maxLife
 * @property {number} size
 * @property {number} wispStretch
 * @property {number} glowPhase
 * @property {number} rotation
 * @property {number} vx
 * @property {number} vy
 * @property {number} [_drawAlpha]
 * @property {number} [_screenSize]
 * @property {boolean} [_onScreen]
 * @property {number} [_poolIndex]
 */

/** @typedef {Particle | TrailParticle} AnyParticle */

/**
 * @typedef {Object} Shockwave
 * @property {number} x
 * @property {number} y
 * @property {string} color
 * @property {number} radius
 * @property {number} maxRadius
 * @property {number} life
 * @property {number} width
 */

/**
 * @typedef {Object} EnergyRingOptions
 * @property {boolean} [flash]
 */

/**
 * @typedef {Object} EnergyRing
 * @property {number} x
 * @property {number} y
 * @property {string} color
 * @property {boolean} isFlash
 * @property {number} comboLevel
 * @property {number} radius
 * @property {number} life
 * @property {number} maxLife
 * @property {number} width
 */

/**
 * @typedef {Object} FloatingText
 * @property {number} x
 * @property {number} y
 * @property {string} text
 * @property {string} color
 * @property {number} life
 * @property {number} vy
 * @property {number} scale
 * @property {number} targetScale
 * @property {number} scaleVel
 * @property {number} rotation
 * @property {number} rotVel
 */

/**
 * @typedef {Object} SoulParticle
 * @property {number} x
 * @property {number} y
 * @property {string} color
 * @property {number} targetX
 * @property {number} targetY
 * @property {number} scoreValue
 * @property {number} vx
 * @property {number} vy
 * @property {number} life
 * @property {number} speed
 * @property {number} agility
 * @property {number} size
 * @property {number} trailTimer
 * @property {boolean} active
 * @property {number} swayPhase
 * @property {number} swayAmplitude
 */

/**
 * @typedef {Object} DustParticle
 * @property {number} x
 * @property {number} y
 * @property {number} baseVx
 * @property {number} baseVy
 * @property {number} vx
 * @property {number} vy
 * @property {number} size
 * @property {number} alpha
 * @property {number} renderAlpha
 * @property {number} phase
 */

/**
 * @typedef {Object} EnvParticle
 * @property {EnvParticleType} type
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} size
 * @property {number} life
 * @property {number} decayRate
 * @property {boolean} [glowing]
 * @property {string | null} [color]
 */

/**
 * @typedef {Object} Launcher
 * @property {number} laneWidth
 * @property {number} rendererHeight
 * @property {number} targetLane
 * @property {number} x
 * @property {number} y
 * @property {number} tilt
 * @property {number} recoil
 * @property {number} scaleX
 * @property {number} scaleY
 * @property {number} speed
 * @property {number} velX
 * @property {number} lerpFactor
 * @property {number} tiltFactor
 * @property {number} recoilRecovery
 * @property {number} squashRecovery
 * @property {number} age
 * @property {number} wingPhase
 * @property {number} antennaOffset
 * @property {number} antennaVel
 * @property {boolean} _anticipating
 * @property {number} _anticipateTimer
 */

/**
 * @typedef {Object} GameState
 * @property {boolean} active
 * @property {boolean} [paused]
 * @property {number} gameClockMs
 * @property {number} score
 * @property {number} level
 * @property {number} lastTime
 * @property {InstanceType<typeof import('./Entities.js').Crystal>[]} crystals
 * @property {InstanceType<typeof import('./Entities.js').Spore>[]} spores
 * @property {(InstanceType<typeof import('./Entities.js').Particle> | InstanceType<typeof import('./Entities.js').TrailParticle>)[]} particles
 * @property {InstanceType<typeof import('./Entities.js').Shockwave>[]} shockwaves
 * @property {InstanceType<typeof import('./Entities.js').FloatingText>[]} floatingTexts
 * @property {InstanceType<typeof import('./Entities.js').SoulParticle>[]} soulParticles
 * @property {InstanceType<typeof import('./Entities.js').DustParticle>[]} dustParticles
 * @property {number} nextSporeColorIdx
 * @property {number} growthMultiplier
 * @property {number} shake
 * @property {number} shakeVel
 * @property {number} displayScore
 * @property {number} impactFlash
 * @property {string} impactFlashColor
 * @property {number} sleepTimer
 * @property {number} kickY
 * @property {ShakeOffset} shakeOffset
 * @property {number} combo
 * @property {number} comboTimer
 * @property {number} zoom
 * @property {number} zoomVel
 * @property {Vec2} zoomFocus
 * @property {number} criticalIntensity
 * @property {number} heartbeatTimer
 * @property {number} timeScale
 * @property {number} targetTimeScale
 * @property {number} slowMoTimer
 * @property {boolean} paused
 * @property {number} motionScale
 * @property {boolean} reducedMotion
 * @property {boolean} colorBlindMode
 * @property {import('./types.js').PaletteColor[]} colorPalette
 * @property {QualityMode} qualityMode
 * @property {RenderQualityLevel} renderQuality
 * @property {boolean} devPerfOverlay
 * @property {PerfMetrics} perfMetrics
 * @property {AdaptiveOverrides} adaptiveOverrides
 * @property {Map<number, LaneCrystalPair>} laneMap
 * @property {InstanceType<typeof import('./Entities.js').EnergyRing>[]} energyRings
 * @property {EnvParticle[]} envParticles
 * @property {BossHudState | null} [boss]
 * @property {import('./HazardController.js').HazardRenderState | null} [hazards]
 */

/**
 * @typedef {Object} BossColors
 * @property {string} primary
 * @property {string} secondary
 * @property {string} telegraph
 * @property {string} [vulnerable]
 */

/**
 * @typedef {Object} BossPhaseDefinition
 * @property {string} id
 * @property {number} formationPhase
 * @property {number} telegraphMs
 * @property {number} surgeMs
 * @property {number} vulnerableMs
 * @property {number} [surgeGrowth]
 * @property {number} [idleGrowth]
 */

/**
 * @typedef {Object} BossRewards
 * @property {number} [scoreBonus]
 * @property {Record<string, number>} [powerUps] Power-up id → count granted on defeat.
 */

/**
 * @typedef {Object} BossDefinition
 * @property {string} id
 * @property {string} name
 * @property {number} triggerLevelId
 * @property {BossColors} colors
 * @property {number} hp
 * @property {number} [introMs]
 * @property {number} [defeatMs]
 * @property {number} [fireRateMultiplier]
 * @property {boolean} [colorLockAlternating]
 * @property {BossPhaseDefinition[]} phases
 * @property {BossRewards} [rewards]
 */

/**
 * @typedef {Object} BossHudState
 * @property {boolean} active
 * @property {string} name
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} telegraph
 * @property {number} phaseIndex
 * @property {number} phaseCount
 * @property {string} state
 * @property {string} phaseStep
 * @property {BossColors} colors
 * @property {number} vulnerableMask
 * @property {number} lanes
 */

/**
 * @callback CreateParticlesCallback
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @param {number} [count]
 * @param {number | null} [angle]
 * @param {number} [spread]
 * @param {ParticleType} [type]
 * @returns {void}
 */

/**
 * @callback SporeScoreCallback
 * @param {number} points
 * @param {boolean} isMatch
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @returns {void}
 */

/**
 * @callback CreateShockwaveCallback
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @returns {void}
 */

/**
 * @callback CreateTrailCallback
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @returns {void}
 */

/**
 * @callback CreateDebrisCallback
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @param {number} [count]
 * @param {number | null} [angle]
 * @returns {void}
 */

/**
 * @callback CreateChunkCallback
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @param {number} [dirY]
 * @returns {void}
 */

/**
 * @callback ImpactDustCallback
 * @param {number} x
 * @param {number} y
 * @param {string} color
 * @returns {void}
 */

/**
 * @typedef {Object} WasmExports
 * @property {(seed: number) => void} [setSeed]
 * @property {(y: number, radius: number, lane: number, colorIdx: number, topHeight: number, topColorIdx: number, bottomHeight: number, bottomColorIdx: number, canvasHeight: number) => number} [checkCollisions]
 * @property {(currentHeight: number, shrinkAmount: number, minHeight: number) => number} [calculateMatchHeight]
 * @property {(currentHeight: number, growthAmount: number) => number} [calculatePenaltyHeight]
 * @property {(index: number, total: number, force: number) => number} [getShatterVx]
 * @property {(index: number, total: number, force: number) => number} [getShatterVy]
 * @property {(vy: number, damping: number) => number} [getBounceVy]
 * @property {(index: number, total: number, force: number, angle: number, spread: number) => number} [getDirectionalVx]
 * @property {(index: number, total: number, force: number, angle: number, spread: number) => number} [getDirectionalVy]
 * @property {(random: number) => number} [getSmokeVx]
 * @property {(random: number) => number} [getSmokeVy]
 * @property {(currVx: number, currVy: number, x: number, y: number, tx: number, ty: number, speed: number, agility: number) => number} [calculateHomingVx]
 * @property {(currVx: number, currVy: number, x: number, y: number, tx: number, ty: number, speed: number, agility: number) => number} [calculateHomingVy]
 * @property {(index: number, total: number, force: number, spiralFactor: number) => number} [getSpiralVx]
 * @property {(index: number, total: number, force: number, spiralFactor: number) => number} [getSpiralVy]
 * @property {() => number} [getBossHeightsByteOffset]
 * @property {() => number} [getBossHeightsCapacity]
 * @property {(seed: number, phase: number, lanes: number) => number} [generateBossHeights]
 * @property {(phase: number, lanes: number) => number} [getBossVulnerableMask]
 * @property {(elapsedMs: number, telegraphMs: number) => number} [getBossTelegraphProgress]
 * @property {(batchCount: number, timeScale: number, lifeDecay: number) => void} [batchIntegrateSimpleParticles]
 * @property {(batchCount: number, timeScale: number) => void} [batchIntegrateTrailParticles]
 * @property {() => number} [getSimpleBatchByteOffset]
 * @property {() => number} [getSimpleBatchStride]
 * @property {() => number} [getSimpleBatchFloatCount]
 * @property {() => number} [getTrailBatchByteOffset]
 * @property {() => number} [getTrailBatchStride]
 * @property {() => number} [getTrailBatchFloatCount]
 * @property {WebAssembly.Memory} [memory]
 */

/**
 * Alias for the raw ASC-generated bindings surface loaded via `wasmBridge.js`.
 * @typedef {WasmExports} WasmBindings
 */

/**
 * Public WASM wrapper surface — each method falls back to JavaScript when WASM is unavailable.
 * @typedef {Object} WasmManagerApi
 * @property {() => Promise<boolean>} init
 * @property {() => boolean} isReady
 * @property {(seed: number) => void} setGameplaySeed
 * @property {(spore: Spore, topCrystal: Crystal, bottomCrystal: Crystal, canvasHeight: number) => CollisionResult} checkCollisions
 * @property {(currentHeight: number, shrinkAmount: number, minHeight: number) => number} calculateMatchHeight
 * @property {(currentHeight: number, growthAmount: number) => number} calculatePenaltyHeight
 * @property {(baseRate: number, multiplier: number) => number} calculateCrystalGrowth
 * @property {(score: number, divisor?: number) => number} calculateGrowthMultiplier
 * @property {(height1: number, height2: number, maxHeight: number) => boolean} checkCrystalGameOver
 * @property {(index: number, total: number, force: number) => number} getShatterVx
 * @property {(index: number, total: number, force: number) => number} getShatterVy
 * @property {(vy: number, damping: number) => number} getBounceVy
 * @property {(index: number, total: number, force: number, angle: number, spread: number) => number} getDirectionalVx
 * @property {(index: number, total: number, force: number, angle: number, spread: number) => number} getDirectionalVy
 * @property {(random: number) => number} getSmokeVx
 * @property {(random: number) => number} getSmokeVy
 * @property {(currVx: number, currVy: number, x: number, y: number, tx: number, ty: number, speed: number, agility: number) => number} calculateHomingVx
 * @property {(currVx: number, currVy: number, x: number, y: number, tx: number, ty: number, speed: number, agility: number) => number} calculateHomingVy
 * @property {(index: number, total: number, force: number, spiralFactor: number) => number} getSpiralVx
 * @property {(index: number, total: number, force: number, spiralFactor: number) => number} getSpiralVy
 * @property {(seed: number, phase: number, lanes: number) => Float64Array} generateBossHeights
 * @property {(phase: number, lanes: number) => number} getBossVulnerableMask
 * @property {(elapsedMs: number, telegraphMs: number) => number} getBossTelegraphProgress
 * @property {(ambientParticles: InstanceType<typeof import('./Entities.js').Particle>[], count: number, timeScale: number, rendererWidth: number, rendererHeight: number) => boolean} batchIntegrateAmbientParticles
 * @property {(trailParticles: InstanceType<typeof import('./Entities.js').TrailParticle>[], count: number, timeScale: number, rendererWidth: number, rendererHeight: number) => boolean} batchIntegrateTrailParticles
 */

/**
 * @typedef {'campaign' | 'endless'} GameMode
 */

/**
 * @typedef {Object} SporeModifiers
 * @property {boolean} [rainbow]
 */

/**
 * @typedef {Object} PowerUpDefinition
 * @property {string} id
 * @property {string} name
 * @property {PowerUpActivation} activation
 * @property {number | null} durationMs
 * @property {number} rarity
 * @property {string} color
 * @property {string} hudLabel
 * @property {string} icon
 * @property {string} description
 * @property {string} [activateKey]
 * @property {string} [activateText]
 * @property {PowerUpEffect} effect
 */

/**
 * @typedef {Object} PowerUpEffect
 * @property {'rainbow_shot' | 'growth_scale' | 'lane_shockwave'} kind
 * @property {number} [charges]    rainbow_shot: shots granted per pickup.
 * @property {number} [scale]      growth_scale: growth multiplier while active (0 = frozen).
 * @property {number} [shrink]     lane_shockwave: px removed from each crystal.
 * @property {number} [minHeight]  lane_shockwave: floor height.
 * @property {number} [radius]     lane_shockwave: neighbouring lanes hit on each side.
 */

/**
 * @typedef {Object} ActivePowerUpTimer
 * @property {string} typeId
 * @property {number} remainingMs
 * @property {number} durationMs
 * @property {number} [stacks]
 */

/**
 * @typedef {Object} HudPowerUpSlot
 * @property {string} typeId
 * @property {string} label
 * @property {string} color
 * @property {string} icon
 * @property {number} count
 * @property {number | null} remainingMs
 * @property {number | null} durationMs
 * @property {string} activation
 */

/**
 * @typedef {Object} LevelObjective
 * @property {ObjectiveType} type
 * @property {number} target
 */

/**
 * @typedef {Object} LevelGrowthConfig
 * @property {number} baseMultiplier
 * @property {number} scoreDivisor
 */

/**
 * @typedef {Object} LevelRuntimeConfig
 * @property {number} lanes
 * @property {number} colorCount
 * @property {{ min: number, max: number }} crystalHeight
 * @property {LevelGrowthConfig} growth
 * @property {LevelObjective} [objective]
 */

/**
 * @typedef {Object} LevelDefinition
 * @property {number} id
 * @property {string} name
 * @property {number} lanes
 * @property {number} colorCount
 * @property {{ min: number, max: number }} crystalHeight
 * @property {LevelGrowthConfig} growth
 * @property {LevelObjective} objective
 * @property {string} description
 * @property {string} [bossId]
 * @property {LevelHazard[]} [hazards]
 * @property {string[]} [powerUpPool] Power-up ids that can drop; defaults to the catalog's defaultPool.
 */

/**
 * @typedef {Object} LevelHazard
 * @property {'overgrowth' | 'tremor' | 'color_shift'} kind
 * @property {number[]} [lanes]            overgrowth: affected lanes; tremor/color_shift: candidate lanes.
 * @property {number} [growthMultiplier]   overgrowth
 * @property {number} [intervalMs]         tremor/color_shift
 * @property {number} [warningMs]          tremor/color_shift: telegraph before it fires.
 * @property {number} [growth]             tremor: px added instantly.
 * @property {number} [laneCount]          tremor/color_shift: lanes picked per event.
 */

/**
 * @typedef {Object} CampaignArc
 * @property {string} id
 * @property {string} name
 * @property {string} [subtitle]
 * @property {string} [color]
 * @property {LevelDefinition[]} levels
 */

/**
 * @typedef {Object} SpawnConfig
 * @property {number} lanes
 * @property {number} colorCount
 * @property {number} heightMin
 * @property {number} heightMax
 */

/**
 * @typedef {Object} ObjectiveProgress
 * @property {string} label
 * @property {number} current
 * @property {number} target
 * @property {number} percent
 * @property {string} levelName
 * @property {number} levelNumber
 */

/**
 * @typedef {Object} GameUiElements
 * @property {HTMLElement | null} start
 * @property {HTMLElement | null} gameOver
 * @property {HTMLElement | null} score
 * @property {HTMLElement | null} finalScore
 * @property {HTMLElement | null} level
 * @property {HTMLElement | null} preview
 * @property {HTMLElement | null} startBtn
 * @property {HTMLElement | null} restartBtn
 * @property {HTMLElement | null} fps
 * @property {HTMLSelectElement | null} [qualitySelect]
 * @property {HTMLSelectElement | null} [modeSelect]
 * @property {HTMLElement | null} objectiveLabel
 * @property {HTMLElement | null} objectiveProgress
 * @property {HTMLElement | null} objectiveBar
 * @property {HTMLElement | null} levelName
 * @property {HTMLElement | null} gameOverTitle
 * @property {HTMLElement | null} powerUpHud
 * @property {HTMLButtonElement | null} powerUpActivateBtn
 * @property {HTMLElement | null} pause
 * @property {HTMLButtonElement | null} resumeBtn
 * @property {HTMLElement | null} highScoreVal
 * @property {HTMLElement | null} bestComboVal
 * @property {HTMLElement | null} accuracyVal
 * @property {HTMLElement | null} totalGamesVal
 * @property {HTMLElement | null} totalShotsVal
 * @property {HTMLElement | null} bossesDefeatedVal
 * @property {HTMLElement | null} timePlayedVal
 * @property {HTMLElement | null} achievementsUnlockedCount
 * @property {HTMLElement | null} achievementsTotalCount
 * @property {HTMLElement | null} achievementsList
 */

// ---------------------------------------------------------------------------
// Persisted settings and stats (SaveManager, SettingsManager)
// ---------------------------------------------------------------------------

/**
 * Persisted audio preferences. Every level is a unit gain in 0..1.
 * @typedef {Object} AudioSettingsData
 * @property {number} master
 * @property {number} music
 * @property {number} sfx
 * @property {number} ui
 * @property {boolean} muted
 * @property {boolean} reducedIntensity Quieter SFX and no tension/combo layers in the ambient bed.
 */

/**
 * @typedef {Object} InputSettings
 * @property {boolean} keyboard
 * @property {boolean} gamepad
 */

/**
 * Validated settings as stored in the save and used at runtime.
 * @typedef {Object} GameSettings
 * @property {QualityMode} graphics
 * @property {GameMode} gameMode
 * @property {boolean} reducedMotion
 * @property {boolean} colorBlindMode
 * @property {boolean} showTutorial
 * @property {boolean} tutorialCompleted
 * @property {InputSettings} input
 * @property {AudioSettingsData} audio
 */

/**
 * Settings from outside the type system: parsed localStorage JSON, a save written by an
 * older version, or a raw DOM control value. `normalizeSettings` accepts this and returns a
 * validated {@link GameSettings}. Every `GameSettings` is also a valid `RawGameSettings`.
 * @typedef {Omit<Partial<GameSettings>, 'graphics' | 'gameMode' | 'input' | 'audio'> & {
 *     graphics?: string,
 *     gameMode?: string,
 *     input?: Partial<InputSettings>,
 *     audio?: Partial<AudioSettingsData>,
 * }} RawGameSettings
 */

/**
 * @typedef {Object} GameStats
 * @property {number} highScore
 * @property {number} bestCombo
 * @property {number} totalGames
 * @property {number} totalShots
 * @property {number} totalMatches
 * @property {number} totalMismatches
 * @property {number} bossesDefeated
 * @property {number} timePlayedMs
 * @property {Record<string, number>} achievements Achievement id -> unlock timestamp (epoch ms).
 */

/**
 * @typedef {Object} SaveData
 * @property {number} version
 * @property {GameSettings} settings
 * @property {GameStats} stats
 */

/**
 * A save blob before validation. `normalizeSave` accepts this and returns {@link SaveData}.
 * @typedef {Object} RawSaveData
 * @property {number} [version]
 * @property {RawGameSettings} [settings]
 * @property {Partial<GameStats>} [stats]
 */

// ---------------------------------------------------------------------------
// Input polling (InputManager, ReplayPlayer, GameLoop)
// ---------------------------------------------------------------------------

/**
 * Lane movement requested this frame: one lane left, none, or one lane right.
 * @typedef {-1 | 0 | 1} LaneDelta
 */

/**
 * What one input source (keyboard/gamepad or a replay) asks for this frame.
 * @typedef {Object} InputPollResult
 * @property {LaneDelta} laneDelta
 * @property {boolean} fire Buffered fire intent. It stays true until `InputManager#consumeFire`.
 */

/**
 * Which physical sources `InputManager#poll` should read. A missing key counts as enabled.
 * @typedef {Partial<InputSettings>} InputPollSettings
 */

// ---------------------------------------------------------------------------
// Tutorial (TutorialManager)
// ---------------------------------------------------------------------------

/**
 * `idle` before the tutorial starts and `complete` after it ends or is skipped. Neither shows copy.
 * @typedef {'idle' | 'aim' | 'match' | 'mismatch' | 'hints' | 'complete'} TutorialStep
 */

/**
 * Keys of the tutorial copy table: one per visible step, plus the keyboard variant of `aim`
 * and the two context hints that can replace the `hints` copy.
 * @typedef {Exclude<TutorialStep, 'idle' | 'complete'> | 'aimKeyboard' | 'combo' | 'critical'} TutorialCopyKey
 */

// ---------------------------------------------------------------------------
// Audio (SoundManager, AmbientMusic, audio/*)
// ---------------------------------------------------------------------------

/**
 * @typedef {'master' | 'music' | 'sfx' | 'ui'} AudioChannel
 */

/**
 * The gain nodes a synthesized sound can be routed through. `masterGain` feeds the destination
 * and the other three feed `masterGain`.
 * @typedef {Object} AudioBuses
 * @property {GainNode} masterGain
 * @property {GainNode} musicGain
 * @property {GainNode} sfxGain
 * @property {GainNode} uiGain
 */

/**
 * Game state the ambient bed reacts to, as passed to `SoundManager#updateSession`.
 * @typedef {Object} AudioSessionState
 * @property {boolean} [active] False while paused. A missing value counts as active.
 * @property {number} [criticalIntensity] 0..1 danger level.
 * @property {number} [combo]
 * @property {number} [level]
 */

/**
 * {@link AudioSessionState} plus the intensity preference that `SoundManager` merges in.
 * @typedef {AudioSessionState & { reducedIntensity?: boolean }} AmbientMusicState
 */

/**
 * One oscillator voice of the ambient drone, wired osc -> filter -> gain -> music bus.
 * @typedef {Object} AmbientLayer
 * @property {OscillatorNode} osc
 * @property {BiquadFilterNode} filter
 * @property {GainNode} gain
 */

/**
 * The part of `SoundManager` that browser-lifecycle code needs.
 * @typedef {Object} AudioResumable
 * @property {() => Promise<void> | undefined} resume Resolves when an AudioContext resumes.
 *   Returns undefined when there is nothing to resume.
 */

export {};
