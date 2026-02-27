CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT 'Player',
  coins_total INTEGER NOT NULL DEFAULT 0 CHECK (coins_total >= 0),
  coins_balance INTEGER NOT NULL DEFAULT 0 CHECK (coins_balance >= 0),
  wins INTEGER NOT NULL DEFAULT 0,
  games_played INTEGER NOT NULL DEFAULT 0,
  equipped_hat TEXT NOT NULL DEFAULT 'cap',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_hats (
  user_id TEXT NOT NULL,
  hat_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, hat_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);
