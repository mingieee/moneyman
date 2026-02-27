// ============================================================
// MoneyMan — Multiplayer Client
//
// Connects to the server via WebSocket. The server is authoritative:
// it spawns coins, detects collisions, and tracks scores.
// This client handles input, rendering, and local prediction.
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- HTML escaping (defense-in-depth for player names in innerHTML) ---
function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Fixed game dimensions (same as server) ---
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;
const GROUND_Y = CANVAS_HEIGHT - 40;
const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 70;
const PLAYER_SPEED = 350;
const COIN_RADIUS = 16;

// --- DOM elements ---
const hud = document.getElementById('hud');
const timerDisplay = document.getElementById('timer');
const scoreboard = document.getElementById('scoreboard');
const lobbyScreen = document.getElementById('lobby-screen');
const lobbyPlayers = document.getElementById('lobby-players');
const lobbyTimer = document.getElementById('lobby-timer');
const countdownScreen = document.getElementById('countdown-screen');
const countdownNumber = document.getElementById('countdown-number');
const gameoverScreen = document.getElementById('gameover-screen');
const results = document.getElementById('results');
const playAgainBtn = document.getElementById('play-again-btn');
const waitingScreen = document.getElementById('waiting-screen');
const waitingMessage = document.getElementById('waiting-message');
const disconnectedScreen = document.getElementById('disconnected-screen');
const nameScreen = document.getElementById('name-screen');
const nameInput = document.getElementById('name-input');
const joinBtn = document.getElementById('join-btn');
const nameHatPreview = document.getElementById('name-hat-preview');
const lobbyPlayerCount = document.getElementById('lobby-player-count');
const gameoverTitle = document.getElementById('gameover-title');

// --- Persistent identity (UUID in localStorage) ---
let userId = localStorage.getItem('moneyman_userId');
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem('moneyman_userId', userId);
}
let equippedHat = 'cap';
let userProfile = null;

// Load profile from API (creates user if new)
async function loadProfile() {
  try {
    const res = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      userProfile = data.user;
      equippedHat = data.user.equippedHat || 'cap';
    }
  } catch (err) { console.error('Failed to load profile:', err); }
}

// Render the equipped hat character preview on the name screen
function renderNameHatPreview() {
  const pvCtx = nameHatPreview.getContext('2d');
  pvCtx.clearRect(0, 0, 80, 100);
  drawHatPreview(pvCtx, equippedHat, 80, 100);
}

loadProfile().then(renderNameHatPreview);

// --- Player name ---
let playerName = '';

// --- Game state (received from server) ---
let myPlayerId = null;
let currentScreen = 'name'; // name | lobby | countdown | playing | gameover | waiting | disconnected
let serverPlayers = [];       // [{ playerId, x, score, color, name }]
let serverCoins = [];          // [{ id, x, y, rotation }]
let serverTimeLeft = 60;
let particles = [];

// --- Client-side coin extrapolation ---
// Server sends coin positions at ~20Hz. Client renders at 60fps.
// Between server updates, extrapolate coin positions using velocity
// estimated from the two most recent server snapshots.
let coinPrevSnapshot = null;   // { time, coins[] }
let coinCurrSnapshot = null;   // { time, coins[] }

// --- Local prediction ---
// We track our own X position locally for responsive input,
// and send it to the server. The server position is authoritative.
let localX = CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2;
let localFacingRight = true;
let localMoving = false;
let localBobTimer = 0;

// --- Move send throttle (match server tick rate) ---
let lastSentX = -1;
let lastSendTime = 0;
const SEND_INTERVAL_MS = 1000 / 20; // 20Hz — match server tick rate

// --- Responsive canvas scaling ---
// Uses visualViewport when available (better on mobile — accounts for on-screen keyboard)
function resizeCanvas() {
  const vv = window.visualViewport;
  const maxW = vv ? vv.width : window.innerWidth;
  const maxH = vv ? vv.height : window.innerHeight;
  const scale = Math.min(maxW / CANVAS_WIDTH, maxH / CANVAS_HEIGHT);
  const w = Math.floor(CANVAS_WIDTH * scale) + 'px';
  const h = Math.floor(CANVAS_HEIGHT * scale) + 'px';
  canvas.style.width = w;
  canvas.style.height = h;
  const container = document.getElementById('game-container');
  container.style.width = w;
  container.style.height = h;
}
window.addEventListener('resize', resizeCanvas);
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', resizeCanvas);
}
resizeCanvas();

// ============================================================
// Input — Keyboard
// ============================================================
const keys = {};

document.addEventListener('keydown', (e) => {
  keys[e.key] = true;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
    e.preventDefault();
  }
});

document.addEventListener('keyup', (e) => {
  keys[e.key] = false;
});

// ============================================================
// Input — Touch (simple left/right arrow buttons)
// ============================================================
let touchLeft = false;
let touchRight = false;
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// Track which touches are on left/right zones.
// Left zone: left third of canvas. Right zone: right third.
const activeTouches = new Map(); // touchId → 'left' | 'right'

function getTouchZone(clientX) {
  // Convert client X to canvas-relative position
  const rect = canvas.getBoundingClientRect();
  const relX = (clientX - rect.left) / rect.width;
  if (relX < 0.4) return 'left';
  if (relX > 0.6) return 'right';
  return null;
}

function recalcTouch() {
  touchLeft = false;
  touchRight = false;
  for (const zone of activeTouches.values()) {
    if (zone === 'left') touchLeft = true;
    if (zone === 'right') touchRight = true;
  }
}

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    const zone = getTouchZone(t.clientX);
    if (zone) activeTouches.set(t.identifier, zone);
  }
  recalcTouch();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  // If a finger slides to a different zone, update it
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (activeTouches.has(t.identifier)) {
      const zone = getTouchZone(t.clientX);
      if (zone) {
        activeTouches.set(t.identifier, zone);
      } else {
        activeTouches.delete(t.identifier);
      }
    }
  }
  recalcTouch();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    activeTouches.delete(e.changedTouches[i].identifier);
  }
  recalcTouch();
}, { passive: false });

canvas.addEventListener('touchcancel', (e) => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    activeTouches.delete(e.changedTouches[i].identifier);
  }
  recalcTouch();
});

// ============================================================
// WebSocket
// ============================================================
let ws = null;
let reconnectTimer = null;
let reconnectDelay = 2000;
const MAX_RECONNECT_DELAY = 15000;

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/ws`);

  ws.onopen = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    reconnectDelay = 2000; // Reset backoff on successful connect
    // If player already has a name (reconnect), auto-rejoin immediately
    if (playerName) {
      send({ type: 'join', name: playerName, userId, hat: equippedHat });
    } else {
      showScreen('name');
    }
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    showScreen('disconnected');
    // Clear stale game state so reconnect doesn't flash old data
    serverPlayers = [];
    serverCoins = [];
    particles = [];
    coinPrevSnapshot = null;
    coinCurrSnapshot = null;
    scheduleReconnect();
  };

  ws.onerror = () => {
    ws.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    reconnectDelay = Math.min(reconnectDelay * 1.5, MAX_RECONNECT_DELAY);
  }, reconnectDelay);
}

function send(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ============================================================
// Message handling
// ============================================================
function handleMessage(msg) {
  switch (msg.type) {
    case 'welcome':
      myPlayerId = msg.playerId;
      break;

    case 'lobby':
      showScreen('lobby');
      renderLobby(msg.players, msg.idleTimer);
      break;

    case 'countdown':
      showScreen('countdown');
      countdownNumber.textContent = msg.seconds;
      break;

    case 'gameState':
      // Only show the playing screen if we're actually in the game
      if (msg.players.some(p => p.playerId === myPlayerId)) {
        showScreen('playing');
      }
      serverPlayers = msg.players;
      serverCoins = msg.coins;
      serverTimeLeft = msg.timeLeft;
      // Track snapshots for client-side extrapolation
      coinPrevSnapshot = coinCurrSnapshot;
      coinCurrSnapshot = { time: performance.now(), coins: msg.coins };
      // Collected events are batched into gameState to reduce broadcasts
      if (msg.collected) {
        for (const c of msg.collected) {
          spawnParticles(c.x, c.y);
        }
      }
      break;

    case 'gameOver':
      showScreen('gameover');
      renderResults(msg.players);
      break;

    case 'waiting':
      showScreen('waiting');
      waitingMessage.textContent = msg.message;
      break;

    case 'nameRejected':
      // Name was blocked by profanity filter — show error on name screen
      showScreen('name');
      nameInput.style.borderColor = '#e74c3c';
      nameInput.placeholder = 'Try another name';
      nameInput.value = '';
      break;
  }
}

// ============================================================
// Screen management
// ============================================================
function showScreen(screen) {
  currentScreen = screen;
  nameScreen.classList.toggle('hidden', screen !== 'name');
  lobbyScreen.classList.toggle('hidden', screen !== 'lobby');
  countdownScreen.classList.toggle('hidden', screen !== 'countdown');
  gameoverScreen.classList.toggle('hidden', screen !== 'gameover');

  // Re-render hat preview when returning to name screen (hat may have changed)
  if (screen === 'name') renderNameHatPreview();
  waitingScreen.classList.toggle('hidden', screen !== 'waiting');
  disconnectedScreen.classList.toggle('hidden', screen !== 'disconnected');
  hud.classList.toggle('hidden', screen !== 'playing');

  // Stop the lobby countdown ticker when leaving the lobby
  if (screen !== 'lobby') stopLobbyCountdown();
}

// Client-side lobby countdown so the timer visually ticks down
let lobbyCountdownInterval = null;
let lobbySecondsLeft = 0;

function startLobbyCountdown(seconds) {
  lobbySecondsLeft = Math.ceil(seconds);
  lobbyTimer.textContent = `Game starts in ${lobbySecondsLeft}s`;

  if (lobbyCountdownInterval) clearInterval(lobbyCountdownInterval);
  lobbyCountdownInterval = setInterval(() => {
    lobbySecondsLeft--;
    if (lobbySecondsLeft <= 0) {
      clearInterval(lobbyCountdownInterval);
      lobbyCountdownInterval = null;
      lobbyTimer.textContent = 'Starting...';
    } else {
      lobbyTimer.textContent = `Game starts in ${lobbySecondsLeft}s`;
    }
  }, 1000);
}

function stopLobbyCountdown() {
  if (lobbyCountdownInterval) {
    clearInterval(lobbyCountdownInterval);
    lobbyCountdownInterval = null;
  }
}

function renderLobby(players, idleTimer) {
  lobbyPlayers.innerHTML = '';
  for (const p of players) {
    const card = document.createElement('div');
    const isMe = p.playerId === myPlayerId;
    card.className = 'lobby-card' + (isMe ? ' lobby-card-me' : '');

    // Mini canvas character preview with hat
    const cvs = document.createElement('canvas');
    cvs.width = 80;
    cvs.height = 100;
    cvs.className = 'lobby-preview';
    const pvCtx = cvs.getContext('2d');
    drawHatPreview(pvCtx, p.hat || 'cap', 80, 100);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'lobby-card-name';
    nameSpan.textContent = p.name + (isMe ? ' (you)' : '');

    card.appendChild(cvs);
    card.appendChild(nameSpan);
    lobbyPlayers.appendChild(card);
  }
  // Player count
  lobbyPlayerCount.textContent = players.length + '/5 players';
  startLobbyCountdown(idleTimer);
}

function renderResults(players) {
  // Dynamic title: "You Win!" if local player is #1 with score > 0
  const isWinner = players.length > 0
    && players[0].playerId === myPlayerId
    && players[0].score > 0;
  gameoverTitle.textContent = isWinner ? 'You Win!' : 'Game Over!';

  results.innerHTML = '';
  players.forEach((p, i) => {
    const row = document.createElement('div');
    const winner = i === 0 && p.score > 0;
    row.className = 'result-row' + (winner ? ' result-winner' : '');

    // Mini canvas character preview with hat
    const cvs = document.createElement('canvas');
    cvs.width = 50;
    cvs.height = 65;
    cvs.className = 'result-preview';
    const pvCtx = cvs.getContext('2d');
    drawHatPreview(pvCtx, p.hat || 'cap', 50, 65);

    const coinsText = p.coinsEarned ? ` (+${p.coinsEarned} coins)` : '';
    row.innerHTML = `
      <span class="result-rank">#${i + 1}</span>
    `;
    row.appendChild(cvs);

    const nameSpan = document.createElement('span');
    nameSpan.className = 'result-name';
    nameSpan.textContent = p.name + (p.playerId === myPlayerId ? ' (you)' : '');
    row.appendChild(nameSpan);

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'result-score';
    scoreSpan.textContent = p.score + (p.playerId === myPlayerId ? coinsText : '');
    row.appendChild(scoreSpan);

    results.appendChild(row);
  });
  // Refresh profile to pick up new coin balance
  loadProfile();
}

// Join button (name screen)
function submitName() {
  const name = nameInput.value.trim().slice(0, 8) || 'Player';
  playerName = name;
  send({ type: 'join', name: playerName, userId, hat: equippedHat });
}

joinBtn.addEventListener('click', submitName);
nameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitName();
});

// Play Again button — reuse the same name
playAgainBtn.addEventListener('click', () => {
  send({ type: 'join', name: playerName, userId, hat: equippedHat });
});

// ============================================================
// Particles (client-only visual effect)
// ============================================================
function spawnParticles(x, y) {
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 / 8) * i + Math.random() * 0.5;
    const speed = 80 + Math.random() * 120;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.5 + Math.random() * 0.3,
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
    p.vy += 200 * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
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

// ============================================================
// Coin interpolation — smooth motion between server updates
//
// Renders 60ms behind the server so we're always interpolating
// between two known positions (no guessing/extrapolation).
// This adds imperceptible latency to coin visuals but eliminates
// the jitter caused by position snaps when new data arrives.
// ============================================================
const INTERP_DELAY_MS = 60;

function getDisplayCoins() {
  if (!coinCurrSnapshot) return [];
  if (!coinPrevSnapshot) return coinCurrSnapshot.coins;

  const snapshotDt = coinCurrSnapshot.time - coinPrevSnapshot.time;
  if (snapshotDt <= 0) return coinCurrSnapshot.coins;

  const renderTime = performance.now() - INTERP_DELAY_MS;
  // t=0 → prev position, t=1 → curr position, t>1 → gentle extrapolation
  const t = Math.max(0, Math.min((renderTime - coinPrevSnapshot.time) / snapshotDt, 1.5));

  const prevMap = new Map();
  for (const c of coinPrevSnapshot.coins) {
    prevMap.set(c.id, c);
  }

  const result = [];
  for (const curr of coinCurrSnapshot.coins) {
    const prev = prevMap.get(curr.id);
    if (prev) {
      result.push({
        id: curr.id,
        x: prev.x + (curr.x - prev.x) * t,
        y: prev.y + (curr.y - prev.y) * t,
        rotation: prev.rotation + (curr.rotation - prev.rotation) * t,
      });
    } else {
      result.push(curr);
    }
  }
  return result;
}

// ============================================================
// Drawing — Background (rendered once to offscreen canvas, blit each frame)
// ============================================================
const bgCanvas = document.createElement('canvas');
bgCanvas.width = CANVAS_WIDTH;
bgCanvas.height = CANVAS_HEIGHT;
(function initBackground() {
  const bg = bgCanvas.getContext('2d');

  // Sky gradient
  const gradient = bg.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
  gradient.addColorStop(0, '#0f0c29');
  gradient.addColorStop(0.5, '#302b63');
  gradient.addColorStop(1, '#24243e');
  bg.fillStyle = gradient;
  bg.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  // City skyline silhouette
  bg.fillStyle = '#1a1a3e';
  // Rescaled x-positions by 1.2 (960/800) + added buildings to fill wider canvas
  const buildings = [
    { x: 24, w: 60, h: 120 },
    { x: 108, w: 45, h: 180 },
    { x: 174, w: 70, h: 100 },
    { x: 276, w: 40, h: 200 },
    { x: 336, w: 80, h: 140 },
    { x: 456, w: 50, h: 170 },
    { x: 528, w: 65, h: 110 },
    { x: 624, w: 45, h: 190 },
    { x: 690, w: 75, h: 130 },
    { x: 804, w: 55, h: 160 },
    { x: 882, w: 60, h: 140 },
    { x: 770, w: 30, h: 105 },
  ];
  for (const b of buildings) {
    bg.fillRect(b.x, GROUND_Y - b.h, b.w, b.h);
    bg.fillStyle = 'rgba(255, 255, 150, 0.15)';
    for (let wy = GROUND_Y - b.h + 15; wy < GROUND_Y - 10; wy += 25) {
      for (let wx = b.x + 8; wx < b.x + b.w - 8; wx += 18) {
        bg.fillRect(wx, wy, 8, 10);
      }
    }
    bg.fillStyle = '#1a1a3e';
  }

  // Ground
  bg.fillStyle = '#2d2d5e';
  bg.fillRect(0, GROUND_Y, CANVAS_WIDTH, CANVAS_HEIGHT - GROUND_Y);

  // Ground line
  bg.strokeStyle = '#4a4a8a';
  bg.lineWidth = 2;
  bg.beginPath();
  bg.moveTo(0, GROUND_Y);
  bg.lineTo(CANVAS_WIDTH, GROUND_Y);
  bg.stroke();
})();

function drawBackground() {
  ctx.drawImage(bgCanvas, 0, 0);
}

// ============================================================
// Drawing — Player character (parameterized with color)
// ============================================================
function drawPlayer(px, py, color, facingRight, moving, bobTimer, name, hat) {
  const bobOffset = Math.sin(bobTimer) * 3;
  const drawY = py + bobOffset;
  const centerX = px + PLAYER_WIDTH / 2;
  const dir = facingRight ? 1 : -1;

  ctx.save();

  // --- Legs ---
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  const legSpread = moving ? Math.sin(bobTimer * 1.5) * 8 : 0;

  ctx.beginPath();
  ctx.moveTo(centerX - 8, drawY + PLAYER_HEIGHT - 18);
  ctx.lineTo(centerX - 12 - legSpread, drawY + PLAYER_HEIGHT);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(centerX + 8, drawY + PLAYER_HEIGHT - 18);
  ctx.lineTo(centerX + 12 + legSpread, drawY + PLAYER_HEIGHT);
  ctx.stroke();

  // --- Body (torso) — use player color ---
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(centerX, drawY + PLAYER_HEIGHT - 30, 16, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Money bag ---
  const bagX = centerX + dir * 20;
  const bagY = drawY + PLAYER_HEIGHT - 35;

  ctx.fillStyle = '#8B7355';
  ctx.beginPath();
  ctx.ellipse(bagX, bagY + 6, 12, 14, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#6B5335';
  ctx.beginPath();
  ctx.ellipse(bagX, bagY - 7, 7, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', bagX, bagY + 7);

  // --- Arm holding bag ---
  ctx.strokeStyle = '#e8b88a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(centerX + dir * 10, drawY + PLAYER_HEIGHT - 38);
  ctx.lineTo(bagX, bagY);
  ctx.stroke();

  // --- Other arm ---
  const armSwing = moving ? Math.sin(bobTimer * 1.5) * 12 : 0;
  ctx.beginPath();
  ctx.moveTo(centerX - dir * 10, drawY + PLAYER_HEIGHT - 38);
  ctx.lineTo(centerX - dir * 18 + armSwing, drawY + PLAYER_HEIGHT - 22);
  ctx.stroke();

  // --- Head ---
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(centerX, drawY + 14, 14, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath();
  ctx.arc(centerX + dir * 5, drawY + 12, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centerX - dir * 2, drawY + 12, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(centerX + dir * 2, drawY + 17, 5, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // --- Hat (rendered via hat-renderer.js) ---
  drawHat(ctx, hat || 'cap', centerX, drawY, color);

  // --- Name label above head ---
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'rgba(0,0,0,0.7)';
  ctx.shadowBlur = 3;
  ctx.fillText(name || '', centerX, drawY - 6);
  ctx.shadowBlur = 0;

  ctx.restore();
}

// ============================================================
// Drawing — Coin (preserved 3D spin effect)
// ============================================================
function drawCoin(coin) {
  ctx.save();
  ctx.translate(coin.x, coin.y);

  const scaleX = Math.cos(coin.rotation);
  ctx.scale(scaleX, 1);

  // Outer ring
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(0, 0, COIN_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // Inner ring
  ctx.fillStyle = '#ffec80';
  ctx.beginPath();
  ctx.arc(0, 0, COIN_RADIUS * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Dollar sign
  if (Math.abs(scaleX) > 0.3) {
    ctx.fillStyle = '#b8860b';
    ctx.font = `bold ${COIN_RADIUS}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
  }

  // Shine
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.beginPath();
  ctx.arc(-COIN_RADIUS * 0.3, -COIN_RADIUS * 0.3, COIN_RADIUS * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ============================================================
// Drawing — Touch indicators (simple left/right arrows)
// ============================================================
function drawTouchIndicators() {
  if (!isTouchDevice) return;

  const arrowSize = 24;
  const padding = 50;
  const yPos = CANVAS_HEIGHT - 24;

  ctx.save();

  // Left arrow
  const leftAlpha = touchLeft ? 0.6 : 0.25;
  ctx.globalAlpha = leftAlpha;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(padding, yPos);
  ctx.lineTo(padding + arrowSize, yPos - arrowSize / 2);
  ctx.lineTo(padding + arrowSize, yPos + arrowSize / 2);
  ctx.closePath();
  ctx.fill();

  // "LEFT" label
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('<', padding + arrowSize + 12, yPos);

  // Right arrow
  const rightAlpha = touchRight ? 0.6 : 0.25;
  ctx.globalAlpha = rightAlpha;
  ctx.beginPath();
  ctx.moveTo(CANVAS_WIDTH - padding, yPos);
  ctx.lineTo(CANVAS_WIDTH - padding - arrowSize, yPos - arrowSize / 2);
  ctx.lineTo(CANVAS_WIDTH - padding - arrowSize, yPos + arrowSize / 2);
  ctx.closePath();
  ctx.fill();

  ctx.fillText('>', CANVAS_WIDTH - padding - arrowSize - 12, yPos);

  ctx.globalAlpha = 1;
  ctx.restore();
}

// ============================================================
// HUD rendering
// ============================================================
function updateHUD() {
  // Timer
  timerDisplay.textContent = Math.ceil(serverTimeLeft);

  // Scoreboard — sorted by score descending
  const sorted = [...serverPlayers].sort((a, b) => b.score - a.score);
  scoreboard.innerHTML = sorted.map(p =>
    `<div class="score-entry">
       <span class="score-dot" style="background:${esc(p.color)}"></span>
       ${esc(p.name)}${p.playerId === myPlayerId ? ' (you)' : ''}: ${p.score}
     </div>`
  ).join('');
}

// ============================================================
// Main render loop
// ============================================================
let lastFrameTime = 0;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastFrameTime) / 1000, 0.05);
  lastFrameTime = timestamp;

  // --- Local input and prediction (only during gameplay) ---
  if (currentScreen === 'playing') {
    const movingLeft = keys['ArrowLeft'] || keys['a'] || keys['A'] || touchLeft;
    const movingRight = keys['ArrowRight'] || keys['d'] || keys['D'] || touchRight;

    localMoving = false;
    if (movingLeft) {
      localX -= PLAYER_SPEED * dt;
      localMoving = true;
      localFacingRight = false;
    }
    if (movingRight) {
      localX += PLAYER_SPEED * dt;
      localMoving = true;
      localFacingRight = true;
    }

    // Clamp to bounds
    localX = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, localX));

    // Send position to server — throttled to 20Hz + only when changed
    const roundedX = Math.round(localX);
    const now = performance.now();
    if (roundedX !== lastSentX && now - lastSendTime >= SEND_INTERVAL_MS) {
      send({ type: 'move', x: roundedX });
      lastSentX = roundedX;
      lastSendTime = now;
    }

    // Heartbeat: send position even when idle so the server has messages
    // to drive physics at 20Hz (message-driven tick model).
    if (now - lastSendTime >= SEND_INTERVAL_MS) {
      send({ type: 'move', x: roundedX });
      lastSendTime = now;
    }

    // Bob animation
    if (localMoving) {
      localBobTimer += dt * 8;
    } else {
      localBobTimer *= 0.9;
    }
  }

  // --- Update particles ---
  updateParticles(dt);

  // --- Render ---
  drawBackground();

  if (currentScreen === 'playing') {
    // Draw coins (extrapolated for smooth motion between server updates)
    const displayCoins = getDisplayCoins();
    for (const coin of displayCoins) {
      drawCoin(coin);
    }

    // Draw particles
    drawParticles();

    // Draw all players
    for (const p of serverPlayers) {
      const isMe = p.playerId === myPlayerId;
      const px = isMe ? localX : p.x;
      const py = GROUND_Y - PLAYER_HEIGHT;
      // For remote players, use simple idle animation
      const moving = isMe ? localMoving : false;
      const bobTimer = isMe ? localBobTimer : 0;
      const facingRight = isMe ? localFacingRight : true;

      drawPlayer(px, py, p.color, facingRight, moving, bobTimer, p.name, p.hat);
    }

    // Draw touch indicators
    drawTouchIndicators();

    // Update HUD
    updateHUD();
  }

  requestAnimationFrame(gameLoop);
}

// ============================================================
// Start
// ============================================================

// Draw initial background behind the lobby overlay
drawBackground();

// Start render loop
lastFrameTime = performance.now();
requestAnimationFrame(gameLoop);

// Connect to server
connect();
