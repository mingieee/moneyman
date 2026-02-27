// ============================================================
// MoneyMan - A browser-based coin collection game
// Player runs left/right with a money bag, catching falling coins.
// Difficulty increases over time (faster coins, more frequent spawns).
// Missing coins costs lives — lose all 3 and it's game over.
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Fixed game dimensions
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

// --- Game State ---

let player = null;      // Player object
let coins = [];          // Active falling coins
let particles = [];      // Visual sparkle effects on coin pickup
let score = 0;
let lives = 3;
let gameRunning = false;
let lastTime = 0;        // For delta-time calculation
let difficulty = 1;      // Scales up over time
let timeSinceStart = 0;  // Seconds elapsed in current game
let coinSpawnTimer = 0;  // Countdown to next coin spawn

// --- Configuration ---

const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 70;
const PLAYER_SPEED = 350;         // Pixels per second
const COIN_RADIUS = 16;
const COIN_BASE_SPEED = 120;      // Starting fall speed (px/sec)
const COIN_SPEED_INCREASE = 15;   // Extra fall speed per difficulty level
const SPAWN_INTERVAL_BASE = 0.9;  // Seconds between coin spawns at start
const SPAWN_INTERVAL_MIN = 0.25;  // Fastest possible spawn rate
const DIFFICULTY_RAMP = 0.04;     // Difficulty increase per second
const GROUND_Y = CANVAS_HEIGHT - 40; // Where the ground line sits
const MAX_LIVES = 3;

// --- Responsive Canvas Scaling ---
// The game logic always uses 800x600 internally.
// On smaller screens (iPad, phone) we CSS-scale the canvas to fit.

function resizeCanvas() {
  const maxW = window.innerWidth;
  const maxH = window.innerHeight;
  const scale = Math.min(maxW / CANVAS_WIDTH, maxH / CANVAS_HEIGHT);
  canvas.style.width = Math.floor(CANVAS_WIDTH * scale) + 'px';
  canvas.style.height = Math.floor(CANVAS_HEIGHT * scale) + 'px';
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// --- Input Tracking ---

const keys = {};

document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  // Prevent page scroll when playing
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// --- Touch Input ---
// Touch left half of canvas = move left, right half = move right.
// Supports multi-touch (e.g. touching both sides simultaneously).

let touchLeft = false;
let touchRight = false;

function handleTouches(e) {
  e.preventDefault(); // Prevent scrolling/zooming while playing

  touchLeft = false;
  touchRight = false;

  // Get canvas position on screen (accounts for CSS scaling)
  const rect = canvas.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;

  for (let i = 0; i < e.touches.length; i++) {
    const tx = e.touches[i].clientX;
    // Only count touches that are on/near the canvas
    if (tx >= rect.left && tx <= rect.right) {
      if (tx < midX) {
        touchLeft = true;
      } else {
        touchRight = true;
      }
    }
  }
}

canvas.addEventListener('touchstart', handleTouches, { passive: false });
canvas.addEventListener('touchmove', handleTouches, { passive: false });
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  // Re-evaluate remaining touches (finger lifted)
  touchLeft = false;
  touchRight = false;
  const rect = canvas.getBoundingClientRect();
  const midX = rect.left + rect.width / 2;
  for (let i = 0; i < e.touches.length; i++) {
    const tx = e.touches[i].clientX;
    if (tx >= rect.left && tx <= rect.right) {
      if (tx < midX) touchLeft = true;
      else touchRight = true;
    }
  }
}, { passive: false });
canvas.addEventListener('touchcancel', () => {
  touchLeft = false;
  touchRight = false;
});

// --- UI Elements ---

const scoreDisplay = document.getElementById('score-display');
const livesDisplay = document.getElementById('lives-display');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// --- Player ---

function createPlayer() {
  return {
    x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
    y: GROUND_Y - PLAYER_HEIGHT,
    width: PLAYER_WIDTH,
    height: PLAYER_HEIGHT,
    // Simple bob animation while moving
    bobTimer: 0,
    moving: false,
    facingRight: true,
  };
}

function updatePlayer(dt) {
  const movingLeft = keys['ArrowLeft'] || keys['a'] || keys['A'] || touchLeft;
  const movingRight = keys['ArrowRight'] || keys['d'] || keys['D'] || touchRight;

  player.moving = false;

  if (movingLeft) {
    player.x -= PLAYER_SPEED * dt;
    player.moving = true;
    player.facingRight = false;
  }
  if (movingRight) {
    player.x += PLAYER_SPEED * dt;
    player.moving = true;
    player.facingRight = true;
  }

  // Keep player in bounds
  player.x = Math.max(0, Math.min(CANVAS_WIDTH - player.width, player.x));

  // Bob animation
  if (player.moving) {
    player.bobTimer += dt * 8;
  } else {
    // Settle back to neutral
    player.bobTimer *= 0.9;
  }
}

function drawPlayer() {
  const px = player.x;
  const bobOffset = Math.sin(player.bobTimer) * 3;
  const py = player.y + bobOffset;
  const pw = player.width;
  const ph = player.height;
  const centerX = px + pw / 2;
  const dir = player.facingRight ? 1 : -1;

  ctx.save();

  // --- Legs ---
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';

  const legSpread = player.moving ? Math.sin(player.bobTimer * 1.5) * 8 : 0;

  // Left leg
  ctx.beginPath();
  ctx.moveTo(centerX - 8, py + ph - 18);
  ctx.lineTo(centerX - 12 - legSpread, py + ph);
  ctx.stroke();

  // Right leg
  ctx.beginPath();
  ctx.moveTo(centerX + 8, py + ph - 18);
  ctx.lineTo(centerX + 12 + legSpread, py + ph);
  ctx.stroke();

  // --- Body (torso) ---
  ctx.fillStyle = '#3498db';
  ctx.beginPath();
  ctx.ellipse(centerX, py + ph - 30, 16, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Money bag (held in front arm) ---
  const bagX = centerX + dir * 20;
  const bagY = py + ph - 35;

  // Bag body
  ctx.fillStyle = '#8B7355';
  ctx.beginPath();
  ctx.ellipse(bagX, bagY + 6, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bag neck/tie
  ctx.fillStyle = '#6B5335';
  ctx.beginPath();
  ctx.ellipse(bagX, bagY - 7, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Dollar sign on bag
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', bagX, bagY + 7);

  // --- Arm holding the bag ---
  ctx.strokeStyle = '#e8b88a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX + dir * 10, py + ph - 38);
  ctx.lineTo(bagX, bagY);
  ctx.stroke();

  // --- Other arm (swinging) ---
  const armSwing = player.moving ? Math.sin(player.bobTimer * 1.5) * 12 : 0;
  ctx.beginPath();
  ctx.moveTo(centerX - dir * 10, py + ph - 38);
  ctx.lineTo(centerX - dir * 18 + armSwing, py + ph - 22);
  ctx.stroke();

  // --- Head ---
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(centerX, py + 14, 14, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath();
  ctx.arc(centerX + dir * 5, py + 12, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centerX - dir * 2, py + 12, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX + dir * 2, py + 17, 5, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // --- Hat (flat cap) ---
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath();
  ctx.ellipse(centerX, py + 3, 18, 6, 0, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(centerX - 18, py + 1, 36, 4);

  ctx.restore();
}

// --- Coins ---

function spawnCoin() {
  // Random horizontal position, avoiding the very edges
  const x = COIN_RADIUS + Math.random() * (CANVAS_WIDTH - COIN_RADIUS * 2);
  const speed = COIN_BASE_SPEED + COIN_SPEED_INCREASE * difficulty + Math.random() * 40;

  coins.push({
    x: x,
    y: -COIN_RADIUS, // Start above the screen
    radius: COIN_RADIUS,
    speed: speed,
    rotation: Math.random() * Math.PI * 2,  // Visual spin
    rotationSpeed: 3 + Math.random() * 4,
    // Slight horizontal wobble
    wobbleOffset: Math.random() * Math.PI * 2,
    wobbleAmount: 0.3 + Math.random() * 0.5,
  });
}

function updateCoins(dt) {
  // Spawn timer
  const spawnInterval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - difficulty * 0.05);
  coinSpawnTimer -= dt;
  if (coinSpawnTimer <= 0) {
    spawnCoin();
    coinSpawnTimer = spawnInterval;

    // Occasionally spawn 2 coins at once at higher difficulty
    if (difficulty > 3 && Math.random() < 0.3) {
      spawnCoin();
    }
  }

  for (let i = coins.length - 1; i >= 0; i--) {
    const coin = coins[i];

    // Fall downward
    coin.y += coin.speed * dt;
    // Slight horizontal wobble
    coin.x += Math.sin(coin.y * 0.02 + coin.wobbleOffset) * coin.wobbleAmount;
    // Spin
    coin.rotation += coin.rotationSpeed * dt;

    // Check if coin reached the ground (missed)
    if (coin.y - coin.radius > GROUND_Y) {
      coins.splice(i, 1);
      loseLife();
      continue;
    }

    // Check collision with player
    // Use a simple box-circle overlap test
    const closestX = Math.max(player.x, Math.min(coin.x, player.x + player.width));
    const closestY = Math.max(player.y, Math.min(coin.y, player.y + player.height));
    const distX = coin.x - closestX;
    const distY = coin.y - closestY;
    const distSq = distX * distX + distY * distY;

    if (distSq < coin.radius * coin.radius) {
      // Collected!
      coins.splice(i, 1);
      collectCoin(coin);
    }
  }
}

function drawCoin(coin) {
  ctx.save();
  ctx.translate(coin.x, coin.y);

  // The "3D spin" effect: scale X by cos(rotation) to simulate flipping
  const scaleX = Math.cos(coin.rotation);

  ctx.scale(scaleX, 1);

  // Outer ring
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(0, 0, coin.radius, 0, Math.PI * 2);
  ctx.fill();

  // Inner ring
  ctx.fillStyle = '#ffec80';
  ctx.beginPath();
  ctx.arc(0, 0, coin.radius * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Dollar sign (only visible when facing forward-ish)
  if (Math.abs(scaleX) > 0.3) {
    ctx.fillStyle = '#b8860b';
    ctx.font = `bold ${coin.radius}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
  }

  // Shine highlight
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(-coin.radius * 0.3, -coin.radius * 0.3, coin.radius * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// --- Particles (sparkle effect on coin pickup) ---

function spawnParticles(x, y) {
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.5;
    const speed = 80 + Math.random() * 120;
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.3, // seconds
      maxLife: 0.5 + Math.random() * 0.3,
      size: 3 + Math.random() * 3,
      color: Math.random() > 0.5 ? '#ffd700' : '#ffec80',
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 200 * dt; // gravity on particles
    p.life -= dt;
    if (p.life <= 0) {
      particles.splice(i, 1);
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// --- Game Logic ---

function collectCoin(coin) {
  score += 10;
  scoreDisplay.textContent = `Score: ${score}`;
  spawnParticles(coin.x, coin.y);
}

function loseLife() {
  lives -= 1;
  livesDisplay.textContent = `Lives: ${lives}`;
  if (lives <= 0) {
    endGame();
  }
}

function startGame() {
  // Reset everything
  player = createPlayer();
  coins = [];
  particles = [];
  score = 0;
  lives = MAX_LIVES;
  difficulty = 1;
  timeSinceStart = 0;
  coinSpawnTimer = 0;
  gameRunning = true;

  scoreDisplay.textContent = `Score: ${score}`;
  livesDisplay.textContent = `Lives: ${lives}`;

  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');

  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}

function endGame() {
  gameRunning = false;
  finalScoreEl.textContent = score;
  gameOverScreen.classList.remove('hidden');
}

// --- Rendering ---

function drawBackground() {
  // Sky gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#0f0c29');
  gradient.addColorStop(0.5, '#302b63');
  gradient.addColorStop(1, '#24243e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // Simple city skyline silhouette in the background
  ctx.fillStyle = '#1a1a3e';
  const buildings = [
    { x: 20, w: 60, h: 120 },
    { x: 90, w: 45, h: 180 },
    { x: 145, w: 70, h: 100 },
    { x: 230, w: 40, h: 200 },
    { x: 280, w: 80, h: 140 },
    { x: 380, w: 50, h: 170 },
    { x: 440, w: 65, h: 110 },
    { x: 520, w: 45, h: 190 },
    { x: 575, w: 75, h: 130 },
    { x: 670, w: 55, h: 160 },
    { x: 735, w: 60, h: 140 },
  ];
  for (const b of buildings) {
    ctx.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
    // A few lit windows
    ctx.fillStyle = 'rgba(255, 255, 150, 0.15)';
    for (let wy = GROUND_Y - b.h + 15; wy < GROUND_Y - 10; wy += 25) {
      for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 18) {
        ctx.fillRect(wx, wy, 8, 10);
      }
    }
    ctx.fillStyle = '#1a1a3e';
  }

  // Ground
  ctx.fillStyle = '#2d2d5e';
  ctx.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

  // Ground line
  ctx.strokeStyle = '#4a4a8a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  ctx.lineTo(CANVAS_WIDTH, GROUND_Y);
  ctx.stroke();
}

// --- Main Game Loop ---

function gameLoop(timestamp) {
  if (!gameRunning) return;

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // Cap delta to avoid big jumps
  lastTime = timestamp;

  // Increase difficulty over time
  timeSinceStart += dt;
  difficulty = 1 + timeSinceStart * DIFFICULTY_RAMP;

  // Update
  updatePlayer(dt);
  updateCoins(dt);
  updateParticles(dt);

  // Draw
  drawBackground();

  for (const coin of coins) {
    drawCoin(coin);
  }

  drawParticles();
  drawPlayer();
  drawTouchIndicators();

  requestAnimationFrame(gameLoop);
}

// --- Touch Zone Indicators ---
// Show subtle arrow hints on touch devices so players know where to tap.
// Only visible on devices that support touch.

const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

function drawTouchIndicators() {
  if (!isTouchDevice) return;

  const arrowSize = 30;
  const yPos = GROUND_Y + 20; // In the ground area, out of the way
  const alpha = 0.25;

  // Left arrow — highlight when actively touching
  ctx.globalAlpha = touchLeft ? 0.5 : alpha;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(60, yPos);
  ctx.lineTo(60 + arrowSize, yPos - arrowSize / 2);
  ctx.lineTo(60 + arrowSize, yPos + arrowSize / 2);
  ctx.closePath();
  ctx.fill();

  // Right arrow
  ctx.globalAlpha = touchRight ? 0.5 : alpha;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH - 60, yPos);
  ctx.lineTo(CANVAS_WIDTH - 60 - arrowSize, yPos - arrowSize / 2);
  ctx.lineTo(CANVAS_WIDTH - 60 - arrowSize, yPos + arrowSize / 2);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 1;
}

// --- Initial Draw ---
// Show the background behind the start screen
drawBackground();
