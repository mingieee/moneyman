// Worker entry point — routes WebSocket connections to the GameRoom Durable Object,
// serves REST API endpoints for user profiles and hat management,
// and serves static assets from public/ via the [assets] binding in wrangler.toml.

export { GameRoom } from './game-room.js';
import { isValidUUID, getOrCreateUser, buyHat, equipHat } from './db.js';

// JSON response helper
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // --- WebSocket upgrade ---
    if (url.pathname === '/ws') {
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      // Validate origin to prevent cross-site WebSocket hijacking
      const origin = request.headers.get('Origin');
      if (origin) {
        const originHost = new URL(origin).host;
        if (originHost !== url.host) {
          return new Response('Forbidden', { status: 403 });
        }
      }

      // Single global game room — all players connect to the same DO instance.
      // Pass env so the DO can access the D1 binding for coin awards.
      const id = env.GAME_ROOM.idFromName('main');
      const room = env.GAME_ROOM.get(id);
      return room.fetch(request);
    }

    // --- REST API ---
    if (url.pathname.startsWith('/api/')) {
      return handleAPI(request, url, env);
    }

    // Everything else is handled by the [assets] binding (static files)
    return new Response('Not Found', { status: 404 });
  },
};

async function handleAPI(request, url, env) {
  const db = env.DB;

  // GET /api/profile?userId=<uuid>
  if (url.pathname === '/api/profile' && request.method === 'GET') {
    const userId = url.searchParams.get('userId');
    if (!isValidUUID(userId)) {
      return json({ error: 'Invalid userId' }, 400);
    }
    const result = await getOrCreateUser(db, userId);
    return json(result);
  }

  // POST /api/hat/buy — body: { userId, hatId }
  if (url.pathname === '/api/hat/buy' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { userId, hatId } = body;
    if (!isValidUUID(userId)) return json({ error: 'Invalid userId' }, 400);
    if (!hatId || typeof hatId !== 'string') return json({ error: 'Invalid hatId' }, 400);

    const result = await buyHat(db, userId, hatId);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }

  // POST /api/hat/equip — body: { userId, hatId }
  if (url.pathname === '/api/hat/equip' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

    const { userId, hatId } = body;
    if (!isValidUUID(userId)) return json({ error: 'Invalid userId' }, 400);
    if (!hatId || typeof hatId !== 'string') return json({ error: 'Invalid hatId' }, 400);

    const result = await equipHat(db, userId, hatId);
    if (result.error) return json({ error: result.error }, result.status);
    return json(result);
  }

  return json({ error: 'Not Found' }, 404);
}
