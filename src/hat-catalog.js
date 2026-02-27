// ============================================================
// Hat Catalog — defines all 15 hats with their properties.
// Shared by REST API (index.js), game room (game-room.js),
// and referenced by client hat shop (hats.js).
// ============================================================

export const HAT_CATALOG = {
  cap:       { id: 'cap',       name: 'Cap',       tier: 'free',        cost: 0,    achievement: null },
  beanie:    { id: 'beanie',    name: 'Beanie',    tier: 'common',      cost: 50,   achievement: null },
  headband:  { id: 'headband',  name: 'Headband',  tier: 'common',      cost: 75,   achievement: null },
  baseball:  { id: 'baseball',  name: 'Baseball',  tier: 'common',      cost: 100,  achievement: null },
  party:     { id: 'party',     name: 'Party',     tier: 'rare',        cost: 200,  achievement: null },
  beret:     { id: 'beret',     name: 'Beret',     tier: 'rare',        cost: 200,  achievement: null },
  cowboy:    { id: 'cowboy',    name: 'Cowboy',    tier: 'rare',        cost: 250,  achievement: null },
  tophat:    { id: 'tophat',    name: 'Top Hat',   tier: 'rare',        cost: 300,  achievement: null },
  chef:      { id: 'chef',      name: 'Chef',      tier: 'rare',        cost: 300,  achievement: null },
  wizard:    { id: 'wizard',    name: 'Wizard',    tier: 'epic',        cost: 500,  achievement: null },
  pirate:    { id: 'pirate',    name: 'Pirate',    tier: 'epic',        cost: 750,  achievement: null },
  viking:    { id: 'viking',    name: 'Viking',    tier: 'achievement', cost: 0,    achievement: { type: 'wins', value: 3,    label: 'Win 3 games' } },
  crown:     { id: 'crown',     name: 'Crown',     tier: 'legendary',   cost: 1000, achievement: { type: 'wins', value: 10,   label: 'Win 10 games' } },
  astronaut: { id: 'astronaut', name: 'Astronaut', tier: 'legendary',   cost: 1500, achievement: { type: 'coins', value: 5000, label: 'Earn 5000 total coins' } },
  halo:      { id: 'halo',      name: 'Halo',      tier: 'legendary',   cost: 2000, achievement: { type: 'wins', value: 25,   label: 'Win 25 games' } },
};

// Ordered list for display in the hat shop
export const HAT_ORDER = [
  'cap', 'beanie', 'headband', 'baseball',
  'party', 'beret', 'cowboy', 'tophat', 'chef',
  'wizard', 'pirate',
  'viking', 'crown', 'astronaut', 'halo',
];

// Check if a user meets the achievement requirement for a hat
export function meetsAchievement(hat, user) {
  if (!hat.achievement) return true;
  switch (hat.achievement.type) {
    case 'wins':  return user.wins >= hat.achievement.value;
    case 'coins': return user.coins_total >= hat.achievement.value;
    default:      return false;
  }
}
