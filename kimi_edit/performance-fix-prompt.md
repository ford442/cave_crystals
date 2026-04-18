# Kimi-CLI Performance Fix Prompt for Cave Crystals

## Context
The game "Crystal Cave Spore Hunter" (a 2D Canvas arcade shooter) has degraded framerate. The repository is at `https://github.com/ford442/cave_crystals`. Clone it, then apply the following targeted performance fixes across the codebase.

## Repository Setup
```bash
git clone https://github.com/ford442/cave_crystals.git
cd cave_crystals
npm install
```

## Critical Fixes (Apply in order)

### 1. RENDERER.JS - Fix Redundant Canvas Clear + Darken Overlay
**Problem**: `clear()` does `clearRect()`, then `draw()` immediately does a full-canvas `fillRect()` with the dark overlay. The clear is wasted work.
**Fix in `Renderer.clear()` and `Renderer.draw()`**: Remove the standalone `clear()` method's `clearRect` and combine. Replace the draw() dark overlay fill with a single fillRect that serves as both clear and darken:
```javascript
// In draw(), BEFORE the lighting pass:
this.ctx.fillStyle = 'rgba(0, 0, 10, 1.0)';
this.ctx.fillRect(0, 0, this.width, this.height);
```
Delete or make `clear()` a no-op. Remove the separate `clear()` call from `draw()`.

---

### 2. RENDERER.JS - Cache Radial Gradients in Lighting Pass
**Problem**: `drawLighting()` creates `createRadialGradient()` for EVERY crystal, spore, soul particle, and large particle EVERY frame. On a 1920x1080 screen with 14 crystals + spores + particles, this is ~20+ radial gradient allocations per frame. Radial gradient creation is one of the most expensive Canvas 2D operations.
**Fix**: Cache radial gradients by color and radius tier. At the top of `Renderer` class, add a gradient cache:
```javascript
this.lightGradients = new Map(); // key: `${color}-${radius}`, value: CanvasGradient
```
Create a helper `getLightGradient(color, radius)` that reuses gradients. Since the gradient is always center-weighted (0,0 -> 0,radius), we can create it once per color/radius combo and reuse with translate. However, since we need different positions, use this approach:
- Pre-create a standard gradient at (0,0) to (0,radius) and cache by `${color}-${Math.floor(radius/10)*10}` (bucket radius to nearest 10 to limit cache size)
- When drawing, `translate(x,y)` then `scale(radius/originalRadius)` 

**Simpler approach**: Since the gradient structure is identical (center white/intense, edge transparent), just create ONE master gradient per color at a standard radius and reuse it with scaling. Replace the inline gradient creation in `drawLight` helper with a cached lookup:
```javascript
const cacheKey = `${color}-${Math.floor(radius/25)*25}`; // bucket by 25px
let grad = this._gradientCache.get(cacheKey);
if (!grad) {
    grad = this.ctx.createRadialGradient(0, 0, 0, 0, 0, Math.floor(radius/25)*25 + 25);
    const rgb = this.hexToRgb(color);
    grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1.0)`);
    grad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this._gradientCache.set(cacheKey, grad);
}
this.ctx.save();
this.ctx.translate(x, y);
this.ctx.scale(radius / (Math.floor(radius/25)*25 + 25), radius / (Math.floor(radius/25)*25 + 25));
this.ctx.fillStyle = grad;
this.ctx.beginPath();
this.ctx.arc(0, 0, Math.floor(radius/25)*25 + 25, 0, Math.PI * 2);
this.ctx.fill();
this.ctx.restore();
```
Initialize `_gradientCache = new Map()` in the constructor.

---

### 3. RENDERER.JS - Optimize Chromatic Aberration (Triple Draw)
**Problem**: When `isWarping` is true (shake > 1.0 OR launcher speed > 0.4), every crystal and the launcher are drawn 3 times (red channel, blue channel, normal). During ANY screen shake, this triples draw calls for all crystals.
**Fix**: 
1. Only enable chromatic aberration when shake is actually VISIBLE (> 3.0) AND the element is moving fast:
```javascript
const isWarping = warpMagnitude > 3.0; // Raise threshold from 1.0 to 3.0
```
2. Skip chromatic aberration for crystals entirely when there are many particles (indicating an explosion is happening - visual chaos already covers it). Add a check:
```javascript
const particleCount = gameState.particles ? gameState.particles.length : 0;
const skipChromaticOnCrystals = particleCount > 50; // During explosions, skip
```
3. Combine the 3 draws into a single draw using globalCompositeOperation trick when possible, or at minimum skip the red/blue pass for crystals and only do it on the launcher (the fastest moving element):
```javascript
// Only apply chromatic aberration to launcher, not crystals
// Crystals are stationary - chromatic aberration is barely visible on them
```

---

### 4. RENDERER.JS - Cache Shard Configuration Lookup
**Problem**: `drawComplexCrystal()` does `shardConfigs.find(cfg => cfg.condition)` for EVERY crystal EVERY frame. This is an array search.
**Fix**: Cache the shard configuration index on the Crystal object during construction. In `drawComplexCrystal()`, use the cached index instead of `find()`:
```javascript
// In Crystal constructor, add:
this.shardConfigIndex = this._getShardConfigIndex();

_getShardConfigIndex() {
    const configs = [
        () => this.shapeSeed < 0.2,
        () => this.shapeSeed >= 0.2 && this.shapeSeed < 0.4,
        () => this.shapeSeed >= 0.4 && this.shapeSeed < 0.6,
        () => this.shapeSeed >= 0.6 && this.shapeSeed < 0.8,
        () => this.shapeSeed >= 0.8,
    ];
    for (let i = 0; i < configs.length; i++) {
        if (configs[i]()) return i;
    }
    return 0;
}
```
Then in drawComplexCrystal: `const config = shardConfigs[c.shardConfigIndex || 0];`

---

### 5. RENDERER.JS - Batch Shadow Blur State Changes
**Problem**: `shadowBlur` and `shadowColor` are set and reset dozens of times per frame across different draw methods. Each change flushes the canvas state.
**Fix**: Group draw calls by shadow settings. Draw all glow elements together, then all non-glow elements. Specifically:
- In `draw()`, draw all particles first (many, no shadow or consistent shadow), then crystals (consistent glow), then UI elements (no shadow)
- Minimize `shadowBlur = 0` resets by drawing zero-shadow items in batches

---

### 6. RENDERER.JS - Optimize HoloGrid Shockwave Distortion
**Problem**: `drawHoloGrid()` calls `calculateShockwaveDistortion()` for EVERY grid vertex. On a 1920x1080 screen with 50px grid spacing, that's ~800 vertices. Each distortion call iterates all shockwaves and does `Math.sqrt()`.
**Fix**: 
1. Only apply shockwave distortion to the grid when there are shockwaves:
```javascript
const hasActiveShockwaves = gameState.shockwaves && gameState.shockwaves.some(sw => sw.life > 0);
```
2. If no active shockwaves, skip the distortion call entirely and use simplified draw
3. Reduce grid resolution when many particles are active (during explosions):
```javascript
const gridSize = particleCount > 30 ? 80 : 50; // Coarser grid during chaos
```

---

### 7. RENDERER.JS - Optimize Scanlines
**Problem**: `drawScanlines()` does `fillRect(0, y, this.width, 2)` in a loop ~270 times per frame on 1080p.
**Fix**: Draw scanlines as a single repeating pattern image or CSS. Simpler fix - create an offscreen canvas with scanlines once and drawImage it:
```javascript
// In constructor:
this.scanlineCanvas = document.createElement('canvas');
this.scanlineCanvas.width = 1;
this.scanlineCanvas.height = 4;
const sctx = this.scanlineCanvas.getContext('2d');
sctx.fillStyle = 'rgba(0, 0, 0, 1)';
sctx.fillRect(0, 0, 1, 2); // 2px line, 2px gap

// In drawScanlines:
this.ctx.globalAlpha = intensity * 0.3;
this.ctx.fillStyle = this.ctx.createPattern(this.scanlineCanvas, 'repeat');
this.ctx.fillRect(0, 0, this.width, this.height);
this.ctx.globalAlpha = 1.0;
```

---

### 8. RENDERER.JS - Fix calculateShockwaveDistortion Hot Path
**Problem**: Called for crystals, launcher, and grid vertices. Each call loops ALL shockwaves.
**Fix**: 
1. Inline this calculation for the grid to avoid function call overhead
2. For crystals/launcher, cache the distortion result and reuse within the frame
3. Early exit when no shockwaves exist:
```javascript
calculateShockwaveDistortion(x, y, gameState) {
    if (!gameState.shockwaves || gameState.shockwaves.length === 0) return { x: 0, y: 0 };
    // ... rest of function
}
```

---

### 9. GAME.JS - Replace O(n^2) Crystal Lookup with Lane Map
**Problem**: Line 376 does `this.state.crystals.find()` inside a `forEach` over all crystals - O(n^2) every frame.
**Fix**: Create a helper that builds a lane lookup:
```javascript
_getCrystalPair(lane) {
    const top = this.state.crystals.find(c => c.lane === lane && c.type === 'top');
    const bottom = this.state.crystals.find(c => c.lane === lane && c.type === 'bottom');
    return { top, bottom };
}
```
Or better, maintain a lane map that updates when crystals are added/removed:
```javascript
// Add to state:
laneMap: new Map(), // key: lane, value: { top: crystal, bottom: crystal }

// When adding crystal:
updateLaneMap() {
    this.state.laneMap.clear();
    this.state.crystals.forEach(c => {
        if (!this.state.laneMap.has(c.lane)) {
            this.state.laneMap.set(c.lane, { top: null, bottom: null });
        }
        this.state.laneMap.get(c.lane)[c.type] = c;
    });
}
```
Call `updateLaneMap()` after crystal additions/removals, then use `this.state.laneMap.get(c.lane)` in the update loop.

---

### 10. GAME.JS - Cache DOM Style Updates
**Problem**: Lines 599-608 set `this.ui.score.style.transform` EVERY frame, even when unchanged. This triggers style recalculation.
**Fix**: Only update the DOM when the value actually changes:
```javascript
const newScale = 1.0 + (this.state.shake * 0.01) + (oldDisplay !== this.state.displayScore ? 0.1 : 0);
if (this._lastScoreScale !== newScale) {
    this.ui.score.style.transform = `scale(${newScale})`;
    this._lastScoreScale = newScale;
}
```

---

### 11. ENTITIES.JS - Fix Spore Collision Crystal Lookup
**Problem**: Lines 99-100 do `crystals.find()` twice per spore per frame.
**Fix**: Pass the lane-mapped crystals from Game.js instead:
```javascript
// In Game.js update, pass pre-looked-up crystals
const laneCrystals = this.state.laneMap.get(s.lane);
if (laneCrystals) {
    s.updateWithLaneCrystals(laneCrystals.top, laneCrystals.bottom, ...);
}
```
Or modify `Spore.update()` to accept pre-found crystals as parameters.

---

### 12. WASM MANAGER - Inline Simple Math, Reduce Bridge Calls
**Problem**: Every frame makes multiple WASM calls for trivial operations (growth multiplier, smoke velocity, etc.). The JS->WASM boundary crossing overhead exceeds the math cost for simple operations.
**Fix**: For operations that are simple single math expressions, inline the JS fallback and skip WASM:
```javascript
// calculateGrowthMultiplier - trivial, inline in JS
calculateGrowthMultiplier(score, divisor = 500) {
    return 1 + (score / divisor); // Always use JS, skip WASM call
}

// calculateCrystalGrowth - trivial
calculateCrystalGrowth(baseRate, multiplier) {
    return baseRate * multiplier; // Always use JS
}

// checkCrystalGameOver - trivial
checkCrystalGameOver(height1, height2, maxHeight) {
    return height1 + height2 >= maxHeight; // Always use JS
}
```
Keep WASM only for the particle shatter math (which has more complex logic).

---

### 13. BACKGROUND - Add will-change CSS, Skip Unchanged Transforms
**Problem**: Game.js line 272 sets `this.background.image.style.transform` every frame during shake, even when the value hasn't changed.
**Fix in style.css or Background.js**:
```css
#backgroundImage {
    will-change: transform;
}
```
In Game.js `calculateShake()`, only set the transform when shake values actually change:
```javascript
const newTransform = `translate(${dx}px, ${dy}px) rotate(${angle}rad) scale(1.02)`;
if (this._lastBgTransform !== newTransform) {
    this.background.image.style.transform = newTransform;
    this._lastBgTransform = newTransform;
}
```

---

### 14. ENTITIES.JS - Object Pool for High-Frequency Particles
**Problem**: `new Particle()`, `new TrailParticle()` are called frequently during explosions, causing GC pressure.
**Fix**: Add a simple object pool for the most frequently created entities (TrailParticle, Particle):
```javascript
// Simple pool implementation
class ParticlePool {
    constructor(createFn, resetFn, initialSize = 50) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.available = [];
        this.inUse = [];
        for (let i = 0; i < initialSize; i++) {
            this.available.push(createFn());
        }
    }
    acquire(...args) {
        let obj = this.available.pop() || this.createFn();
        this.resetFn(obj, ...args);
        this.inUse.push(obj);
        return obj;
    }
    release(obj) {
        const idx = this.inUse.indexOf(obj);
        if (idx >= 0) this.inUse.splice(idx, 1);
        this.available.push(obj);
    }
    releaseAll() {
        this.available.push(...this.inUse);
        this.inUse.length = 0;
    }
}
```
Use the pool for `TrailParticle` (highest creation frequency) and `Particle` during explosions.

---

## Build and Verify
After all fixes:
```bash
npm run build
# Verify no build errors, test the game plays correctly
```

## Expected Outcome
- Reduced per-frame Canvas 2D state changes by ~60%
- Eliminated per-frame radial gradient allocations
- Reduced shockwave distortion calculations by ~80% (skipping when inactive)
- Eliminated O(n^2) crystal lookups
- Reduced GC pressure from particle creation
- Overall target: stable 60fps even during heavy explosion effects
