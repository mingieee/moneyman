// ============================================================
// GameRoom — Durable Object managing a single multiplayer game room.
//
// State machine: LOBBY → COUNTDOWN → PLAYING → GAME_OVER → LOBBY
//
// Uses the WebSocket Hibernation API. State is persisted to
// ctx.storage on transitions. During PLAYING, player messages
// drive physics (message-driven ticks) with a 1Hz fallback alarm.
// Player data is attached to each WebSocket (survives hibernation).
// ============================================================

/* global WebSocketPair */

import { HAT_CATALOG } from './hat-catalog.js';
import { isValidUUID, awardCoins } from './db.js';

// --- Game constants (must match client for rendering) ---
const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 540;
const GROUND_Y = CANVAS_HEIGHT - 40;
const PLAYER_WIDTH = 60;
const PLAYER_HEIGHT = 70;
const COIN_RADIUS = 16;

// --- Timing ---
const BROADCAST_THROTTLE_MS = 50;  // Max 20Hz broadcast rate
const FALLBACK_ALARM_MS = 1000;    // 1Hz fallback alarm during PLAYING
const MAX_PHYSICS_DT = 0.2;        // Cap physics step at 200ms
const GAME_DURATION = 60;
const COUNTDOWN_SECONDS = 5;
const GAME_OVER_DISPLAY_SECONDS = 5;
const LOBBY_IDLE_TIMEOUT = 20;
const MAX_PLAYERS = 5;

// --- Coin spawning ---
const COIN_BASE_SPEED = 89;       // Scaled from 100 by 500/560 for 540px canvas
const COIN_SPEED_VARIATION = 71;  // Scaled from 80 — keeps identical fall time
const COIN_SPAWN_INTERVAL = 0.5;  // Spawn a coin every 0.5 seconds (double rate)

// --- Collision ---
const COLLISION_FORGIVENESS = 8;

// --- Player colors ---
const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6'];

// --- Profanity filter ---
const BLOCKED_WORDS = [
  'fuck', 'shit', 'ass', 'dick', 'cock', 'cunt', 'bitch', 'damn',
  'piss', 'slut', 'whore', 'fag', 'nig', 'rape', 'porn', 'sex',
  'tit', 'boob', 'penis', 'vagin', 'anus', 'jizz', 'cum', 'wank',
  'twat', 'prick', 'homo', 'retard',
];

function isNameClean(name) {
  // Strip separators before checking — catches "f_u_c_k", "s-h-i-t", etc.
  const lower = name.toLowerCase().replace(/[_\-\s]/g, '');
  return !BLOCKED_WORDS.some(word => lower.includes(word));
}

function sanitizeName(name) {
  return name.replace(/[^a-zA-Z0-9 _-]/g, '').trim().slice(0, 8);
}

export class GameRoom {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;

    // In-memory state — persisted to storage only on state transitions
    this.state = 'LOBBY';
    this.players = new Map();
    this.waitingRoom = new Map();
    this.coins = [];
    this.nextCoinId = 1;
    this.timeLeft = GAME_DURATION;
    this.countdownSeconds = COUNTDOWN_SECONDS;
    this.coinSpawnAccumulator = 0;
    this.nextPlayerId = 1;
    this.lastPhysicsTime = 0;
    this.lastBroadcastTime = 0;
    this.pendingCollected = [];
    this.initialized = false;
  }

  // --- Restore state from storage + WebSocket attachments ---
  async _ensureInitialized() {
    if (this.initialized) return;
    this.initialized = true;

    const gs = await this.ctx.storage.get('gs');
    if (gs) {
      this.state = gs.state || 'LOBBY';
      this.timeLeft = gs.timeLeft ?? GAME_DURATION;
      this.countdownSeconds = gs.countdownSeconds ?? COUNTDOWN_SECONDS;
      this.nextPlayerId = gs.nextPlayerId ?? 1;
      this.coins = gs.coins || [];
      this.nextCoinId = gs.nextCoinId || 1;
      this.coinSpawnAccumulator = gs.coinSpawnAccumulator || 0;
      this.lastPhysicsTime = gs.lastPhysicsTime || Date.now();
    }

    // Rebuild player maps from live WebSocket attachments
    this.players = new Map();
    this.waitingRoom = new Map();
    const sockets = this.ctx.getWebSockets();

    for (const ws of sockets) {
      const att = ws.deserializeAttachment();
      if (!att || !att.playerId) continue;

      if (att.role === 'waiting') {
        this.waitingRoom.set(att.playerId, {
          ws, color: att.color, name: att.name,
          hat: att.hat || 'cap', userId: att.userId || null,
        });
      } else if (att.role === 'player') {
        this.players.set(att.playerId, {
          ws,
          x: att.x ?? CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
          score: att.score ?? 0,
          color: att.color,
          name: att.name,
          hat: att.hat || 'cap',
          userId: att.userId || null,
          connected: true,
        });
      }
    }

    // Re-schedule alarm if the DO was evicted mid-state.
    // Without this, a PLAYING game would freeze permanently after eviction.
    if (this.state === 'PLAYING' && this.players.size > 0) {
      this.ctx.storage.setAlarm(Date.now() + FALLBACK_ALARM_MS);
    } else if (this.state === 'COUNTDOWN') {
      this.ctx.storage.setAlarm(Date.now() + 1000);
    } else if (this.state === 'GAME_OVER') {
      this.ctx.storage.setAlarm(Date.now() + GAME_OVER_DISPLAY_SECONDS * 1000);
    } else if (this.state === 'LOBBY' && this.players.size > 0) {
      this.ctx.storage.setAlarm(Date.now() + LOBBY_IDLE_TIMEOUT * 1000);
    } else if (this.state === 'PLAYING' && this.players.size === 0) {
      // Game was running but all players left — clean up
      this.state = 'LOBBY';
      this.coins = [];
    }
  }

  // Persist state to storage (only call on transitions, not every tick)
  async _persistState() {
    await this.ctx.storage.put('gs', {
      state: this.state,
      timeLeft: this.timeLeft,
      countdownSeconds: this.countdownSeconds,
      nextPlayerId: this.nextPlayerId,
      coins: this.coins,
      nextCoinId: this.nextCoinId,
      coinSpawnAccumulator: this.coinSpawnAccumulator,
      lastPhysicsTime: this.lastPhysicsTime,
    });
    this._savePlayerAttachments();
  }

  // Save per-player data to WebSocket attachments
  _savePlayerAttachments() {
    for (const [playerId, p] of this.players) {
      try {
        p.ws.serializeAttachment({
          playerId, name: p.name, color: p.color,
          x: p.x, score: p.score, role: 'player',
          hat: p.hat || 'cap', userId: p.userId || null,
        });
      } catch { /* socket gone */ }
    }
    for (const [playerId, w] of this.waitingRoom) {
      try {
        w.ws.serializeAttachment({
          playerId, name: w.name, color: w.color,
          x: 0, score: 0, role: 'waiting',
          hat: w.hat || 'cap', userId: w.userId || null,
        });
      } catch { /* socket gone */ }
    }
  }

  // --- HTTP handler ---
  async fetch(_request) {
    await this._ensureInitialized();

    // Connection limit — prevent resource exhaustion
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= 20) {
      return new Response('Room full', { status: 503 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const playerId = String(this.nextPlayerId++);
    this.ctx.acceptWebSocket(server, [playerId]);

    server.serializeAttachment({ playerId, role: 'new' });
    server.send(JSON.stringify({ type: 'welcome', playerId }));

    await this._persistState();
    return new Response(null, { status: 101, webSocket: client });
  }

  // --- WebSocket handlers ---

  async webSocketMessage(ws, message) {
    // Reject binary frames and oversized messages
    if (typeof message !== 'string' || message.length > 512) return;

    let data;
    try { data = JSON.parse(message); } catch { return; }

    // Fast path for move messages during gameplay — each message drives
    // a physics step (message-driven ticks). Uses WebSocket tags for playerId.
    if (data.type === 'move' && this.initialized && this.state === 'PLAYING') {
      const playerId = this._getPlayerId(ws);
      if (playerId && this.players.has(playerId)) {
        const x = Number(data.x);
        if (!isNaN(x)) {
          // Update player position first (used in collision detection)
          this.players.get(playerId).x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, x));

          // Advance physics by elapsed time
          const now = Date.now();
          const dt = Math.min((now - this.lastPhysicsTime) / 1000, MAX_PHYSICS_DT);
          const collected = this._advancePhysics(dt);
          this.lastPhysicsTime = now;

          if (collected.length > 0) {
            this.pendingCollected.push(...collected);
          }

          // Check game-over
          if (this.timeLeft <= 0) {
            this.timeLeft = 0;
            this._endGame();
            this._persistState();
            return;
          }

          // Throttled broadcast (max 20Hz)
          if (now - this.lastBroadcastTime >= BROADCAST_THROTTLE_MS) {
            this._broadcastGameState(this.pendingCollected);
            this.pendingCollected = [];
            this.lastBroadcastTime = now;
          }
        }
      }
      return;
    }

    // Normal path for join and other messages
    await this._ensureInitialized();

    const att = ws.deserializeAttachment();
    if (!att || !att.playerId) return;
    const playerId = att.playerId;

    switch (data.type) {
      case 'join': {
        // Already joined — ignore duplicate
        if (this.players.has(playerId) || this.waitingRoom.has(playerId)) break;

        let name = sanitizeName(String(data.name || ''));
        if (!name) name = 'Player';
        if (!isNameClean(name)) {
          this._sendTo(ws, { type: 'nameRejected', reason: 'That name is not allowed.' });
          break;
        }

        // Validate userId (UUID) and hat ID from client
        const userId = (typeof data.userId === 'string' && isValidUUID(data.userId)) ? data.userId : null;
        const hat = (typeof data.hat === 'string' && HAT_CATALOG[data.hat]) ? data.hat : 'cap';

        if (this.state === 'LOBBY') {
          this._addPlayerToLobby(playerId, ws, name, hat, userId);
        } else {
          this._addToWaitingRoom(playerId, ws, name, hat, userId);
        }
        await this._persistState();
        break;
      }

      case 'move':
        // Fallback for moves before initialization (rare — DO just restarted)
        if (this.state === 'PLAYING' && this.players.has(playerId)) {
          const x = Number(data.x);
          if (!isNaN(x)) {
            this.players.get(playerId).x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_WIDTH, x));
          }
        }
        break;
    }
  }

  async webSocketClose(ws, _code, _reason) {
    await this._ensureInitialized();

    const att = ws.deserializeAttachment();
    if (!att || !att.playerId) return;

    this.players.delete(att.playerId);
    this.waitingRoom.delete(att.playerId);

    if (this.state === 'LOBBY') {
      this._broadcastLobbyMsg();
    }

    // If all players left during an active game, return to lobby immediately
    if (this.players.size === 0 && this.state !== 'LOBBY') {
      this._returnToLobby();
    }

    await this._persistState();
  }

  async webSocketError(ws, _error) {
    try { ws.close(1011, 'WebSocket error'); } catch { /* already closed */ }
  }

  // --- Alarm handler ---

  async alarm() {
    await this._ensureInitialized();

    switch (this.state) {
      case 'LOBBY':
        if (this.players.size > 0) {
          this._startCountdown();
          await this._persistState();
        }
        break;

      case 'COUNTDOWN':
        this.countdownSeconds--;
        if (this.countdownSeconds <= 0) {
          this._startPlaying();
          await this._persistState();
        } else {
          this._broadcastAll({ type: 'countdown', seconds: this.countdownSeconds });
          this.ctx.storage.setAlarm(Date.now() + 1000);
          await this._persistState();
        }
        break;

      case 'PLAYING': {
        // 1Hz fallback — keeps physics running when no player messages arrive
        if (this.players.size === 0) {
          this._returnToLobby();
          await this._persistState();
          break;
        }

        const now = Date.now();
        const dt = Math.min((now - this.lastPhysicsTime) / 1000, MAX_PHYSICS_DT);
        const collected = this._advancePhysics(dt);
        this.lastPhysicsTime = now;

        if (collected.length > 0) {
          this.pendingCollected.push(...collected);
        }

        if (this.timeLeft <= 0) {
          this.timeLeft = 0;
          this._endGame();
          await this._persistState();
          break;
        }

        // Broadcast on every fallback tick
        this._broadcastGameState(this.pendingCollected);
        this.pendingCollected = [];
        this.lastBroadcastTime = now;
        this._savePlayerAttachments();
        this.ctx.storage.setAlarm(Date.now() + FALLBACK_ALARM_MS);
        break;
      }

      case 'GAME_OVER':
        this._returnToLobby();
        await this._persistState();
        break;
    }
  }

  // --- Player management ---

  _addPlayerToLobby(playerId, ws, name, hat = 'cap', userId = null) {
    if (this.players.size >= MAX_PLAYERS) {
      this._addToWaitingRoom(playerId, ws, name, hat, userId);
      return;
    }

    const colorIndex = this.players.size % PLAYER_COLORS.length;
    this.players.set(playerId, {
      ws,
      x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
      score: 0,
      color: PLAYER_COLORS[colorIndex],
      name,
      hat,
      userId,
      connected: true,
    });

    // Update attachment BEFORE broadcast so _broadcastAll doesn't skip this socket
    ws.serializeAttachment({
      playerId, name, color: PLAYER_COLORS[colorIndex],
      x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2, score: 0, role: 'player',
      hat, userId,
    });

    this._broadcastLobbyMsg();

    // Only set the idle timer for the first player — prevents griefing via join-spam reset
    if (this.players.size === 1) {
      this.ctx.storage.setAlarm(Date.now() + LOBBY_IDLE_TIMEOUT * 1000);
    }

    if (this.players.size >= MAX_PLAYERS) {
      this._startCountdown();
    }
  }

  _addToWaitingRoom(playerId, ws, name, hat = 'cap', userId = null) {
    const colorIndex = this.waitingRoom.size % PLAYER_COLORS.length;
    this.waitingRoom.set(playerId, { ws, color: PLAYER_COLORS[colorIndex], name, hat, userId });
    ws.serializeAttachment({
      playerId, name, color: PLAYER_COLORS[colorIndex],
      x: 0, score: 0, role: 'waiting', hat, userId,
    });
    this._sendTo(ws, {
      type: 'waiting',
      message: 'Game in progress \u2014 you\'ll join the next round!',
    });
  }

  // --- State transitions ---

  _startCountdown() {
    this.state = 'COUNTDOWN';
    this.countdownSeconds = COUNTDOWN_SECONDS;
    this._broadcastAll({ type: 'countdown', seconds: this.countdownSeconds });
    this.ctx.storage.setAlarm(Date.now() + 1000);
  }

  _startPlaying() {
    this.state = 'PLAYING';
    this.timeLeft = GAME_DURATION;
    this.coins = [];
    this.nextCoinId = 1;
    this.coinSpawnAccumulator = 0;
    this.lastPhysicsTime = Date.now();
    this.lastBroadcastTime = 0;
    this.pendingCollected = [];

    let i = 0;
    for (const [, player] of this.players) {
      player.score = 0;
      player.x = (CANVAS_WIDTH / (this.players.size + 1)) * (i + 1) - PLAYER_WIDTH / 2;
      i++;
    }

    // 1Hz fallback alarm — player messages drive physics at higher frequency
    this.ctx.storage.setAlarm(Date.now() + FALLBACK_ALARM_MS);
  }

  // Advance physics by dt seconds. Pure game logic — no broadcasting,
  // no alarm scheduling. Called from both message handler and fallback alarm.
  _advancePhysics(dt) {
    this.timeLeft -= dt;

    // Spawn coins
    this.coinSpawnAccumulator += dt;
    while (this.coinSpawnAccumulator >= COIN_SPAWN_INTERVAL) {
      this.coinSpawnAccumulator -= COIN_SPAWN_INTERVAL;
      this._spawnCoin();
    }

    // Move coins + collision detection
    const collected = [];
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.y += coin.speed * dt;
      coin.x += Math.sin(coin.y * 0.02 + coin.wobbleOffset) * coin.wobbleAmount;
      coin.rotation += coin.rotationSpeed * dt;

      if (coin.y - COIN_RADIUS > GROUND_Y) {
        this.coins.splice(i, 1);
        continue;
      }

      for (const [playerId, player] of this.players) {
        const playerY = GROUND_Y - PLAYER_HEIGHT;
        const closestX = Math.max(player.x, Math.min(coin.x, player.x + PLAYER_WIDTH));
        const closestY = Math.max(playerY, Math.min(coin.y, playerY + PLAYER_HEIGHT));
        const distX = coin.x - closestX;
        const distY = coin.y - closestY;
        const distSq = distX * distX + distY * distY;
        const hitRadius = COIN_RADIUS + COLLISION_FORGIVENESS;

        if (distSq < hitRadius * hitRadius) {
          player.score += 10;
          collected.push({ playerId, x: coin.x, y: coin.y });
          this.coins.splice(i, 1);
          break;
        }
      }
    }

    return collected;
  }

  _spawnCoin() {
    if (this.coins.length >= 50) return; // Hard cap prevents runaway growth
    this.coins.push({
      id: this.nextCoinId++,
      x: COIN_RADIUS + Math.random() * (CANVAS_WIDTH - COIN_RADIUS * 2),
      y: -COIN_RADIUS,
      speed: COIN_BASE_SPEED + Math.random() * COIN_SPEED_VARIATION,
      radius: COIN_RADIUS,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: 3 + Math.random() * 4,
      wobbleOffset: Math.random() * Math.PI * 2,
      wobbleAmount: 0.3 + Math.random() * 0.5,
    });
  }

  _endGame() {
    this.state = 'GAME_OVER';

    const ranked = [];
    for (const [playerId, player] of this.players) {
      ranked.push({ playerId, name: player.name, score: player.score, color: player.color, hat: player.hat, userId: player.userId });
    }
    ranked.sort((a, b) => b.score - a.score);

    // Calculate coin earnings
    const coinAwards = [];
    for (let i = 0; i < ranked.length; i++) {
      const p = ranked[i];
      const isWinner = (i === 0 && p.score > 0);
      // score is in points (10 per coin collected), convert to coin currency
      const coinsFromScore = p.score; // 10 points per coin * 1 coin currency = score itself
      const bonus = isWinner ? 50 : 0;
      const participation = 25;
      const coinsEarned = coinsFromScore + bonus + participation;
      p.coinsEarned = coinsEarned;
      p.isWinner = isWinner;
      if (p.userId) {
        coinAwards.push({ userId: p.userId, coinsEarned, isWinner, name: p.name });
      }
    }

    this._broadcastAll({ type: 'gameOver', players: ranked });
    for (const [, w] of this.waitingRoom) {
      this._sendTo(w.ws, { type: 'gameOver', players: ranked });
    }

    // Award coins to D1 (fire-and-forget — don't block game flow)
    if (coinAwards.length > 0 && this.env.DB) {
      awardCoins(this.env.DB, coinAwards).catch(() => {
        // D1 write failed — coins lost this round. Acceptable tradeoff
        // vs. blocking the game loop on a database write.
      });
    }

    this.ctx.storage.setAlarm(Date.now() + GAME_OVER_DISPLAY_SECONDS * 1000);
  }

  _returnToLobby() {
    this.state = 'LOBBY';
    this.coins = [];

    const allPlayers = new Map();
    let index = 0;

    for (const [id, p] of this.players) {
      p.color = PLAYER_COLORS[index % PLAYER_COLORS.length];
      p.score = 0;
      p.x = CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2;
      allPlayers.set(id, p);
      index++;
      if (index >= MAX_PLAYERS) break;
    }

    // Promote waiting room players to active players (up to MAX_PLAYERS).
    // Excess waiting players stay in the waiting room for the next round.
    const remainingWaiters = new Map();
    for (const [id, w] of this.waitingRoom) {
      if (index < MAX_PLAYERS) {
        allPlayers.set(id, {
          ws: w.ws,
          x: CANVAS_WIDTH / 2 - PLAYER_WIDTH / 2,
          score: 0,
          color: PLAYER_COLORS[index % PLAYER_COLORS.length],
          name: w.name,
          hat: w.hat || 'cap',
          userId: w.userId || null,
          connected: true,
        });
        index++;
      } else {
        remainingWaiters.set(id, w);
      }
    }

    this.players = allPlayers;
    this.waitingRoom = remainingWaiters;

    this._broadcastLobbyMsg();

    if (this.players.size > 0) {
      this.ctx.storage.setAlarm(Date.now() + LOBBY_IDLE_TIMEOUT * 1000);
    }
  }

  // --- Broadcasting ---

  _broadcastLobbyMsg() {
    const playerList = [];
    for (const [id, p] of this.players) {
      playerList.push({ playerId: id, name: p.name, color: p.color, hat: p.hat || 'cap' });
    }
    this._broadcastAll({
      type: 'lobby',
      players: playerList,
      idleTimer: LOBBY_IDLE_TIMEOUT,
    });
  }

  // Build gameState and broadcast to all joined players + waiters.
  // Uses JSON.stringify for safety — eliminates injection risk from
  // manual string concatenation. Perf is fine at 5 players / 50 coins.
  _broadcastGameState(collected) {
    const state = {
      type: 'gameState',
      players: [],
      coins: [],
      timeLeft: Math.round(this.timeLeft * 10) / 10,
    };

    for (const [id, p] of this.players) {
      state.players.push({
        playerId: id,
        x: Math.round(p.x),
        score: p.score,
        color: p.color,
        name: p.name,
        hat: p.hat || 'cap',
      });
    }

    for (const c of this.coins) {
      state.coins.push({
        id: c.id,
        x: Math.round(c.x * 10) / 10,
        y: Math.round(c.y * 10) / 10,
        rotation: Math.round(c.rotation * 100) / 100,
      });
    }

    if (collected && collected.length > 0) {
      state.collected = collected;
    }

    const json = JSON.stringify(state);

    for (const [id, p] of this.players) {
      try { p.ws.send(json); } catch { this.players.delete(id); }
    }
    for (const [id, w] of this.waitingRoom) {
      try { w.ws.send(json); } catch { this.waitingRoom.delete(id); }
    }
  }

  // Fast broadcast — sends to in-memory player + waiting maps only.
  // No ctx.getWebSockets() or deserializeAttachment() calls.
  // Use this in the hot game loop (PLAYING state).
  // Dead sockets are removed from the maps to prevent accumulation.
  _broadcastToJoined(msg) {
    const json = JSON.stringify(msg);
    for (const [id, p] of this.players) {
      try { p.ws.send(json); } catch { this.players.delete(id); }
    }
    for (const [id, w] of this.waitingRoom) {
      try { w.ws.send(json); } catch { this.waitingRoom.delete(id); }
    }
  }

  // Full broadcast — walks all WebSockets via hibernation API.
  // Slower (deserializes attachments) but correct for any state.
  // Use for lobby, countdown, game-over — infrequent messages.
  _broadcastAll(msg) {
    const json = JSON.stringify(msg);
    const sockets = this.ctx.getWebSockets();
    for (const ws of sockets) {
      try {
        const att = ws.deserializeAttachment();
        if (att && att.role === 'new') continue;
        ws.send(json);
      } catch { /* socket gone */ }
    }
  }

  _sendTo(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }

  _getPlayerId(ws) {
    const tags = this.ctx.getTags(ws);
    return tags.length > 0 ? tags[0] : null;
  }
}
