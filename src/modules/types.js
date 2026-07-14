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
 * @property {QualityMode} qualityMode
 * @property {RenderQualityLevel} renderQuality
 * @property {boolean} devPerfOverlay
 * @property {PerfMetrics} perfMetrics
 * @property {AdaptiveOverrides} adaptiveOverrides
 * @property {Map<number, LaneCrystalPair>} laneMap
 * @property {InstanceType<typeof import('./Entities.js').EnergyRing>[]} energyRings
 * @property {EnvParticle[]} envParticles
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
 * @property {HTMLSelectElement | null} qualitySelect
 */

export {};
