// --- CONFIGURATION ---
const COLORS = [
    { name: 'Ruby', hex: '#FF0055', glow: 'rgba(255, 0, 85, 0.6)' },
    { name: 'Emerald', hex: '#00FF66', glow: 'rgba(0, 255, 102, 0.6)' },
    { name: 'Sapphire', hex: '#00CCFF', glow: 'rgba(0, 204, 255, 0.6)' },
    { name: 'Amethyst', hex: '#CC00FF', glow: 'rgba(204, 0, 255, 0.6)' },
    { name: 'Amber', hex: '#FFAA00', glow: 'rgba(255, 170, 0, 0.6)' }
];

const GAME_CONFIG = {
    lanes: 7,
    baseGrowthRate: 0.1,
    sporeExpandRate: 8,
    maxSporeSize: 60,
    penaltyGrowth: 40,
    matchShrink: 150,
};

// --- AUDIO SYSTEM (WEB AUDIO API) ---
const SoundManager = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    playTone: function(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    shoot: function() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.2);
        
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    },

    match: function() {
        if (!this.ctx) return;
        const base = 400 + Math.random() * 200;
        [base, base * 1.25, base * 1.5].forEach((freq, i) => {
            setTimeout(() => {
                this.playTone(freq, 'sine', 0.6, 0.1);
            }, i * 50);
        });
    },

    mismatch: function() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, this.ctx.currentTime + 0.3);
        
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    },

    gameOver: function() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + 2.0);
        
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.01, this.ctx.currentTime + 2.0);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 2.0);
    }
};

// --- DOM ELEMENTS & STATE ---
let canvas, ctx;
let ui = {};

// Game State
let gameState = {
    active: false,
    score: 0,
    level: 1,
    lastTime: 0,
    crystals: [], 
    spores: [],
    particles: [],
    nextSporeColorIdx: 0,
    laneWidth: 0,
    height: 0,
    width: 0,
    mouseLane: 3,
    growthMultiplier: 1
};

// --- INITIALIZATION ---
window.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    ui = {
        start: document.getElementById('startScreen'),
        gameOver: document.getElementById('gameOverScreen'),
        score: document.getElementById('scoreVal'),
        finalScore: document.getElementById('finalScore'),
        level: document.getElementById('levelVal'),
        preview: document.getElementById('nextSporePreview'),
        startBtn: document.getElementById('startBtn'),
        restartBtn: document.getElementById('restartBtn')
    };

    // Button Listeners
    ui.startBtn.addEventListener('click', startGame);
    ui.restartBtn.addEventListener('click', resetGame);

    // Window Listeners
    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleInput);
    window.addEventListener('touchstart', handleTouch);

    // Initial Resize
    resize();

    // Start Loop (draws background/crystals even if not active)
    requestAnimationFrame(gameLoop);
});

// --- INPUT HANDLING ---
function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gameState.width = canvas.width;
    gameState.height = canvas.height;
    gameState.laneWidth = canvas.width / GAME_CONFIG.lanes;
}

function handleMouseMove(e) {
    if (!gameState.active) return;
    const lane = Math.floor(e.clientX / gameState.laneWidth);
    gameState.mouseLane = Math.min(Math.max(0, lane), GAME_CONFIG.lanes - 1);
}

function handleInput(e) {
    if (!gameState.active) return;
    shootSpore();
}

function handleTouch(e) {
    if (!gameState.active) return;
    const touchX = e.touches[0].clientX;
    const lane = Math.floor(touchX / gameState.laneWidth);
    gameState.mouseLane = Math.min(Math.max(0, lane), GAME_CONFIG.lanes - 1);
    shootSpore();
}

// --- GAME LOGIC ---

function startGame() {
    SoundManager.init(); 

    gameState.active = true;
    gameState.score = 0;
    gameState.level = 1;
    gameState.growthMultiplier = 1;
    gameState.crystals = [];
    gameState.spores = [];
    gameState.particles = [];
    gameState.nextSporeColorIdx = Math.floor(Math.random() * COLORS.length);
    
    ui.start.classList.add('hidden');
    ui.gameOver.classList.add('hidden');
    
    updateUI();
    initCrystals();
}

function resetGame() {
    startGame();
}

function initCrystals() {
    for (let i = 0; i < GAME_CONFIG.lanes; i++) {
        // Top
        gameState.crystals.push({
            type: 'top',
            lane: i,
            height: 20 + Math.random() * 60,
            colorIdx: Math.floor(Math.random() * COLORS.length),
            flash: 0,
            shapeSeed: Math.random()
        });
        // Bottom
        gameState.crystals.push({
            type: 'bottom',
            lane: i,
            height: 20 + Math.random() * 60,
            colorIdx: Math.floor(Math.random() * COLORS.length),
            flash: 0,
            shapeSeed: Math.random()
        });
    }
}

function shootSpore() {
    SoundManager.shoot(); 

    const colorIdx = gameState.nextSporeColorIdx;
    
    const x = (gameState.mouseLane * gameState.laneWidth) + (gameState.laneWidth / 2);
    const y = gameState.height / 2;

    gameState.spores.push({
        x: x,
        y: y,
        lane: gameState.mouseLane,
        radius: 10,
        colorIdx: colorIdx,
        active: true
    });

    gameState.nextSporeColorIdx = Math.floor(Math.random() * COLORS.length);
    updateUI();
}

function createParticles(x, y, color, count = 10) {
    for(let i=0; i<count; i++) {
        gameState.particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 10,
            vy: (Math.random() - 0.5) * 10,
            life: 1.0,
            color: color,
            size: Math.random() * 4 + 1
        });
    }
}

function update(dt) {
    // 1. Update Growth
    gameState.growthMultiplier = 1 + (gameState.score / 500);
    const currentGrowth = GAME_CONFIG.baseGrowthRate * gameState.growthMultiplier;

    let gameOver = false;

    gameState.crystals.forEach(c => {
        c.height += currentGrowth;
        if(c.flash > 0) c.flash -= 0.1;

        const opposite = gameState.crystals.find(oc => oc.lane === c.lane && oc.type !== c.type);
        if (opposite) {
            if (c.height + opposite.height >= gameState.height) {
                gameOver = true;
            }
        }
    });

    if (gameOver) {
        gameState.active = false;
        SoundManager.gameOver();
        ui.finalScore.innerText = gameState.score;
        ui.gameOver.classList.remove('hidden');
        return;
    }

    // 2. Update Spores
    for (let i = gameState.spores.length - 1; i >= 0; i--) {
        let s = gameState.spores[i];
        if (!s.active) {
            gameState.spores.splice(i, 1);
            continue;
        }

        s.radius += GAME_CONFIG.sporeExpandRate;

        const topCry = gameState.crystals.find(c => c.lane === s.lane && c.type === 'top');
        const botCry = gameState.crystals.find(c => c.lane === s.lane && c.type === 'bottom');

        const topHit = s.y - s.radius < topCry.height;
        const botHit = s.y + s.radius > gameState.height - botCry.height;

        let hitOccurred = false;

        if (topHit) {
            hitOccurred = true;
            if (s.colorIdx === topCry.colorIdx) {
                SoundManager.match(); 
                topCry.height = Math.max(10, topCry.height - GAME_CONFIG.matchShrink);
                topCry.flash = 1;
                createParticles(s.x, topCry.height, COLORS[s.colorIdx].hex, 20);
                gameState.score += 10;
                topCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch(); 
                topCry.height += GAME_CONFIG.penaltyGrowth;
                createParticles(s.x, topCry.height, '#555', 5); 
            }
        }

        if (botHit) {
            hitOccurred = true;
            if (s.colorIdx === botCry.colorIdx) {
                SoundManager.match(); 
                botCry.height = Math.max(10, botCry.height - GAME_CONFIG.matchShrink);
                botCry.flash = 1;
                createParticles(s.x, gameState.height - botCry.height, COLORS[s.colorIdx].hex, 20);
                gameState.score += 10;
                botCry.colorIdx = Math.floor(Math.random() * COLORS.length);
            } else {
                SoundManager.mismatch(); 
                botCry.height += GAME_CONFIG.penaltyGrowth;
                createParticles(s.x, gameState.height - botCry.height, '#555', 5);
            }
        }

        if (hitOccurred) {
            s.active = false; 
            updateUI();
        }
    }

    // 3. Update Particles
    for (let i = gameState.particles.length - 1; i >= 0; i--) {
        let p = gameState.particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.02;
        if (p.life <= 0) gameState.particles.splice(i, 1);
    }
}

function updateUI() {
    ui.score.innerText = gameState.score;
    ui.level.innerText = Math.floor(gameState.score / 500) + 1;
    
    const nextCol = COLORS[gameState.nextSporeColorIdx];
    ui.preview.style.backgroundColor = nextCol.hex;
    ui.preview.style.boxShadow = `0 0 20px ${nextCol.hex}`;
}

// --- RENDER ---
function draw() {
    if (!ctx) return;

    // Clear canvas to be transparent so CSS background shows
    ctx.clearRect(0, 0, gameState.width, gameState.height);

    // Draw Lane Guides (subtle)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for(let i=1; i<GAME_CONFIG.lanes; i++) {
        const x = i * gameState.laneWidth;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, gameState.height);
        ctx.stroke();
    }

    // Draw Crystals
    gameState.crystals.forEach(c => {
        drawComplexCrystal(c);
    });

    // Draw Cursor / Aim Line
    if(gameState.active) {
        const laneX = (gameState.mouseLane * gameState.laneWidth) + (gameState.laneWidth / 2);
        
        ctx.beginPath();
        ctx.setLineDash([5, 15]);
        ctx.moveTo(laneX, 0);
        ctx.lineTo(laneX, gameState.height);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(laneX, gameState.height/2, 8, 0, Math.PI*2);
        ctx.fillStyle = '#fff';
        ctx.fill();
    }

    // Draw Spores
    gameState.spores.forEach(s => {
        const col = COLORS[s.colorIdx];
        
        ctx.shadowBlur = 20;
        ctx.shadowColor = col.hex;
        
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI*2);
        ctx.fillStyle = col.hex;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius * 0.6, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fill();
        
        ctx.shadowBlur = 0;
    });

    // Draw Particles
    gameState.particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
}

function drawComplexCrystal(c) {
    const xCenter = (c.lane * gameState.laneWidth) + (gameState.laneWidth / 2);
    const width = gameState.laneWidth * 0.8; 
    const col = COLORS[c.colorIdx];
    const seed = c.shapeSeed; 

    // Setup styles
    ctx.fillStyle = col.hex;
    if (c.flash > 0) {
        ctx.shadowBlur = 30 * c.flash;
        ctx.shadowColor = 'white';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#fff';
    } else {
        ctx.shadowBlur = 15;
        ctx.shadowColor = col.glow;
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    }
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';

    const drawShard = (offsetX, hScale, wScale, tilt) => {
        const h = c.height * hScale;
        const w = width * wScale;
        const halfW = w / 2;
        const baseY = (c.type === 'top') ? 0 : gameState.height;
        const tipY = (c.type === 'top') ? h : gameState.height - h;
        const cx = xCenter + offsetX;

        ctx.beginPath();
        
        if (c.type === 'top') {
            ctx.moveTo(cx - halfW, baseY); 
            ctx.lineTo(cx + tilt, tipY);
            ctx.lineTo(cx + halfW, baseY);
        } else {
            ctx.moveTo(cx - halfW, baseY); 
            ctx.lineTo(cx + tilt, tipY);
            ctx.lineTo(cx + halfW, baseY);
        }
        
        ctx.fill();
        
        if (c.flash < 0.5) {
            ctx.beginPath();
            ctx.moveTo(cx, baseY);
            const facetY = (c.type === 'top') ? h * 0.85 : gameState.height - (h * 0.85);
            ctx.lineTo(cx + (tilt * 0.5), facetY);
            ctx.stroke();
        }
    };

    if (seed > 0.3) {
        drawShard(-width * 0.35, 0.6, 0.4, -5);
    }
    if (seed < 0.7) {
        drawShard(width * 0.35, 0.5, 0.4, 5);
    }

    drawShard(0, 1.0, 0.6, 0);
    
    ctx.shadowBlur = 0;
}

// --- LOOP ---
function gameLoop(timestamp) {
    if (!gameState.lastTime) gameState.lastTime = timestamp;
    const dt = timestamp - gameState.lastTime;

    if (gameState.active) {
        update(dt);
    }
    draw();

    gameState.lastTime = timestamp;
    requestAnimationFrame(gameLoop);
}
