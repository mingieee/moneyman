// ============================================================
// D1 Database Helpers
//
// All functions take the D1 binding as the first argument.
// Uses parameterized queries to prevent SQL injection.
// ============================================================

import { HAT_CATALOG, meetsAchievement } from './hat-catalog.js';

// UUID v4 format regex for input validation
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUUID(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

// Get or create a user profile. Returns { user, hats }.
// New users get the default 'cap' hat automatically.
export async function getOrCreateUser(db, userId) {
  let user = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();

  if (!user) {
    // Create new user with default cap hat
    await db.batch([
      db.prepare(
        `INSERT INTO users (user_id, display_name, coins_total, coins_balance, wins, games_played, equipped_hat)
         VALUES (?, 'Player', 0, 0, 0, 0, 'cap')`
      ).bind(userId),
      db.prepare(
        `INSERT INTO user_hats (user_id, hat_id) VALUES (?, 'cap')`
      ).bind(userId),
    ]);
    user = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
  }

  const hatRows = await db.prepare('SELECT hat_id FROM user_hats WHERE user_id = ?').bind(userId).all();
  const hats = hatRows.results.map(r => r.hat_id);

  return { user: formatUser(user), hats };
}

// Buy a hat. Validates ownership, balance, and achievements.
// Returns { user, hats } on success, or { error, status } on failure.
export async function buyHat(db, userId, hatId) {
  const hat = HAT_CATALOG[hatId];
  if (!hat) return { error: 'Hat not found', status: 404 };

  const user = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
  if (!user) return { error: 'User not found', status: 404 };

  // Check if already owned
  const owned = await db.prepare(
    'SELECT 1 FROM user_hats WHERE user_id = ? AND hat_id = ?'
  ).bind(userId, hatId).first();
  if (owned) return { error: 'Hat already owned', status: 409 };

  // Check achievement requirement
  if (!meetsAchievement(hat, user)) {
    return { error: `Achievement required: ${hat.achievement.label}`, status: 403 };
  }

  // Check coin balance
  if (user.coins_balance < hat.cost) {
    return { error: 'Not enough coins', status: 403 };
  }

  // Deduct coins and grant hat
  await db.batch([
    db.prepare(
      `UPDATE users SET coins_balance = coins_balance - ?, updated_at = datetime('now') WHERE user_id = ?`
    ).bind(hat.cost, userId),
    db.prepare(
      'INSERT INTO user_hats (user_id, hat_id) VALUES (?, ?)'
    ).bind(userId, hatId),
  ]);

  return getOrCreateUser(db, userId);
}

// Equip a hat. Must be owned.
// Returns { user, hats } on success, or { error, status } on failure.
export async function equipHat(db, userId, hatId) {
  const hat = HAT_CATALOG[hatId];
  if (!hat) return { error: 'Hat not found', status: 404 };

  const user = await db.prepare('SELECT * FROM users WHERE user_id = ?').bind(userId).first();
  if (!user) return { error: 'User not found', status: 404 };

  // Check if owned
  const owned = await db.prepare(
    'SELECT 1 FROM user_hats WHERE user_id = ? AND hat_id = ?'
  ).bind(userId, hatId).first();
  if (!owned) return { error: 'Hat not owned', status: 403 };

  await db.prepare(
    `UPDATE users SET equipped_hat = ?, updated_at = datetime('now') WHERE user_id = ?`
  ).bind(hatId, userId);

  return getOrCreateUser(db, userId);
}

// Award coins at game end. Called by the game room DO.
// coinsByUser: [{ userId, coinsEarned, isWinner }]
export async function awardCoins(db, coinsByUser) {
  const statements = [];
  for (const { userId, coinsEarned, isWinner } of coinsByUser) {
    if (!isValidUUID(userId)) continue;

    statements.push(
      db.prepare(
        `UPDATE users SET
           coins_balance = coins_balance + ?,
           coins_total = coins_total + ?,
           wins = wins + ?,
           games_played = games_played + 1,
           updated_at = datetime('now')
         WHERE user_id = ?`
      ).bind(coinsEarned, coinsEarned, isWinner ? 1 : 0, userId)
    );
  }

  if (statements.length > 0) {
    await db.batch(statements);
  }
}

// Format raw D1 row into API-friendly camelCase object
function formatUser(row) {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    coinsBalance: row.coins_balance,
    coinsTotal: row.coins_total,
    wins: row.wins,
    gamesPlayed: row.games_played,
    equippedHat: row.equipped_hat,
  };
}
