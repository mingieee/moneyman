// ============================================================
// Hat Shop — browse, preview, buy, and equip hats.
//
// Reads userId from localStorage (same as game.js).
// Uses REST API for profile, buy, and equip operations.
// Uses hat-renderer.js for canvas hat previews.
// ============================================================

// --- HTML escaping ---
function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// --- Hat catalog (mirrors server hat-catalog.js) ---
const HAT_CATALOG = [
  { id: 'cap',       name: 'Cap',       tier: 'free',        cost: 0,    achievement: null },
  { id: 'beanie',    name: 'Beanie',    tier: 'common',      cost: 50,   achievement: null },
  { id: 'headband',  name: 'Headband',  tier: 'common',      cost: 75,   achievement: null },
  { id: 'baseball',  name: 'Baseball',  tier: 'common',      cost: 100,  achievement: null },
  { id: 'party',     name: 'Party',     tier: 'rare',        cost: 200,  achievement: null },
  { id: 'beret',     name: 'Beret',     tier: 'rare',        cost: 200,  achievement: null },
  { id: 'cowboy',    name: 'Cowboy',    tier: 'rare',        cost: 250,  achievement: null },
  { id: 'tophat',    name: 'Top Hat',   tier: 'rare',        cost: 300,  achievement: null },
  { id: 'chef',      name: 'Chef',      tier: 'rare',        cost: 300,  achievement: null },
  { id: 'wizard',    name: 'Wizard',    tier: 'epic',        cost: 500,  achievement: null },
  { id: 'pirate',    name: 'Pirate',    tier: 'epic',        cost: 750,  achievement: null },
  { id: 'viking',    name: 'Viking',    tier: 'achievement', cost: 0,    achievement: { type: 'wins', value: 3,    label: 'Win 3 games' } },
  { id: 'crown',     name: 'Crown',     tier: 'legendary',   cost: 1000, achievement: { type: 'wins', value: 10,   label: 'Win 10 games' } },
  { id: 'astronaut', name: 'Astronaut', tier: 'legendary',   cost: 1500, achievement: { type: 'coins', value: 5000, label: 'Earn 5000 total coins' } },
  { id: 'halo',      name: 'Halo',      tier: 'legendary',   cost: 2000, achievement: { type: 'wins', value: 25,   label: 'Win 25 games' } },
];

// --- Persistent identity ---
let userId = localStorage.getItem('moneyman_userId');
if (!userId) {
  userId = crypto.randomUUID();
  localStorage.setItem('moneyman_userId', userId);
}

// --- State ---
let userProfile = null;
let ownedHats = [];

// --- DOM ---
const hatGrid = document.getElementById('hat-grid');
const playerNameEl = document.getElementById('player-name');
const coinBalanceEl = document.getElementById('coin-balance');
const currentHatPreview = document.getElementById('current-hat-preview');
const toast = document.getElementById('toast');

// --- Toast ---
let toastTimer = null;
function showToast(message, type = 'success') {
  toast.textContent = message;
  toast.className = type;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'hidden'; }, 2500);
}

// --- API helpers ---
async function fetchProfile() {
  const res = await fetch(`/api/profile?userId=${encodeURIComponent(userId)}`);
  if (!res.ok) throw new Error('Failed to load profile');
  const data = await res.json();
  userProfile = data.user;
  ownedHats = data.hats;
  updateHeader();
  renderHatGrid();
}

async function buyHat(hatId) {
  const res = await fetch('/api/hat/buy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, hatId }),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Purchase failed', 'error');
    return;
  }
  userProfile = data.user;
  ownedHats = data.hats;
  showToast(`Bought ${HAT_CATALOG.find(h => h.id === hatId)?.name || hatId}!`);
  updateHeader();
  renderHatGrid();
}

async function equipHat(hatId) {
  const res = await fetch('/api/hat/equip', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, hatId }),
  });
  const data = await res.json();
  if (!res.ok) {
    showToast(data.error || 'Equip failed', 'error');
    return;
  }
  userProfile = data.user;
  ownedHats = data.hats;
  showToast(`Equipped ${HAT_CATALOG.find(h => h.id === hatId)?.name || hatId}!`);
  updateHeader();
  renderHatGrid();
}

// --- Header ---
function updateHeader() {
  if (!userProfile) return;
  playerNameEl.textContent = userProfile.displayName;
  coinBalanceEl.textContent = `${userProfile.coinsBalance} coins`;

  // Draw current hat preview
  const ctx = currentHatPreview.getContext('2d');
  ctx.clearRect(0, 0, 40, 50);
  drawHatPreview(ctx, userProfile.equippedHat || 'cap', 40, 50);
}

// --- Check if user meets an achievement requirement ---
function meetsAchievement(hat) {
  if (!hat.achievement || !userProfile) return true;
  if (hat.achievement.type === 'wins') return userProfile.wins >= hat.achievement.value;
  if (hat.achievement.type === 'coins') return userProfile.coinsTotal >= hat.achievement.value;
  return false;
}

// --- Hat grid rendering ---
function renderHatGrid() {
  hatGrid.innerHTML = '';

  for (const hat of HAT_CATALOG) {
    const isOwned = ownedHats.includes(hat.id);
    const isEquipped = userProfile && userProfile.equippedHat === hat.id;
    const achievementMet = meetsAchievement(hat);
    const canAfford = userProfile && userProfile.coinsBalance >= hat.cost;
    const canBuy = !isOwned && achievementMet && canAfford;
    const isLocked = !isOwned && (!achievementMet || !canAfford);

    // Card
    const card = document.createElement('div');
    card.className = 'hat-card';
    if (isEquipped) card.classList.add('equipped');
    else if (isOwned) card.classList.add('owned');
    else if (canBuy) card.classList.add('unlockable');
    else card.classList.add('locked');

    // Preview canvas
    const previewCanvas = document.createElement('canvas');
    previewCanvas.width = 80;
    previewCanvas.height = 100;
    previewCanvas.className = 'hat-preview';
    card.appendChild(previewCanvas);

    // Draw preview
    const previewCtx = previewCanvas.getContext('2d');
    drawHatPreview(previewCtx, hat.id, 80, 100);

    // Name
    const nameEl = document.createElement('div');
    nameEl.className = 'hat-name';
    nameEl.textContent = hat.name;
    card.appendChild(nameEl);

    // Tier badge
    const tierEl = document.createElement('span');
    tierEl.className = `hat-tier tier-${hat.tier}`;
    tierEl.textContent = hat.tier;
    card.appendChild(tierEl);

    // Cost (if not free)
    if (hat.cost > 0) {
      const costEl = document.createElement('div');
      costEl.className = 'hat-cost';
      costEl.textContent = `${hat.cost} coins`;
      card.appendChild(costEl);
    }

    // Achievement requirement
    if (hat.achievement) {
      const achEl = document.createElement('div');
      achEl.className = 'hat-achievement';
      achEl.textContent = achievementMet ? `${hat.achievement.label} ✓` : hat.achievement.label;
      if (achievementMet) achEl.style.color = '#2ecc71';
      card.appendChild(achEl);
    }

    // Action button
    const btn = document.createElement('button');
    btn.className = 'hat-btn';
    if (isEquipped) {
      btn.className += ' btn-equipped';
      btn.textContent = 'Equipped';
      btn.disabled = true;
    } else if (isOwned) {
      btn.className += ' btn-equip';
      btn.textContent = 'Equip';
      btn.addEventListener('click', () => equipHat(hat.id));
    } else if (canBuy) {
      btn.className += ' btn-buy';
      btn.textContent = 'Buy';
      btn.addEventListener('click', () => buyHat(hat.id));
    } else {
      btn.className += ' btn-locked';
      if (!achievementMet) {
        btn.textContent = 'Locked';
      } else {
        btn.textContent = 'Need coins';
      }
      btn.disabled = true;
    }
    card.appendChild(btn);

    hatGrid.appendChild(card);
  }
}

// --- Init ---
fetchProfile().catch(() => {
  showToast('Could not load profile', 'error');
});
