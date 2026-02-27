// ============================================================
// Hat Renderer — 15 canvas hat drawing functions.
//
// Shared by game.js (in-game rendering) and hats.js (shop previews).
// Each function receives (ctx, x, y, color) where:
//   x, y = top-center of the player's head
//   color = player's assigned color (for tinting where appropriate)
// ============================================================

const HAT_RENDERERS = {
  // --- Cap (free default) — simple forward-facing cap ---
  cap(ctx, x, y) {
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 18, 6, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 18, y + 1, 36, 4);
  },

  // --- Beanie — knit beanie with fold ---
  beanie(ctx, x, y) {
    // Main dome
    ctx.fillStyle = '#c0392b';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 16, 14, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Fold/cuff
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(x - 16, y - 1, 32, 6);
    // Pom on top
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y - 12, 4, 0, Math.PI * 2);
    ctx.fill();
  },

  // --- Headband — sporty headband ---
  headband(ctx, x, y) {
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(x - 16, y - 2, 32, 6);
    // Stripe
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 16, y, 32, 2);
  },

  // --- Baseball — baseball cap with brim ---
  baseball(ctx, x, y) {
    // Cap dome
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.ellipse(x, y + 2, 16, 12, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Brim (extends forward)
    ctx.fillStyle = '#1a5276';
    ctx.beginPath();
    ctx.ellipse(x + 8, y + 3, 16, 5, 0.2, -Math.PI * 0.3, Math.PI * 0.8);
    ctx.fill();
    // Button on top
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y - 9, 2, 0, Math.PI * 2);
    ctx.fill();
  },

  // --- Party — cone party hat with pom ---
  party(ctx, x, y) {
    // Cone
    ctx.fillStyle = '#9b59b6';
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 4);
    ctx.lineTo(x, y - 20);
    ctx.lineTo(x + 12, y + 4);
    ctx.closePath();
    ctx.fill();
    // Stripes
    ctx.strokeStyle = '#f1c40f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 2);
    ctx.lineTo(x + 8, y - 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 9);
    ctx.lineTo(x + 5, y - 9);
    ctx.stroke();
    // Pom on top
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(x, y - 20, 4, 0, Math.PI * 2);
    ctx.fill();
    // Elastic band
    ctx.strokeStyle = '#7d3c98';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 4);
    ctx.lineTo(x + 12, y + 4);
    ctx.stroke();
  },

  // --- Beret — French beret ---
  beret(ctx, x, y) {
    ctx.fillStyle = '#2c3e50';
    // Flat disk shape
    ctx.beginPath();
    ctx.ellipse(x - 2, y - 1, 18, 8, -0.15, 0, Math.PI * 2);
    ctx.fill();
    // Band
    ctx.fillStyle = '#1a252f';
    ctx.fillRect(x - 14, y + 2, 28, 3);
    // Nub on top
    ctx.fillStyle = '#2c3e50';
    ctx.beginPath();
    ctx.arc(x - 2, y - 6, 3, 0, Math.PI * 2);
    ctx.fill();
  },

  // --- Cowboy — wide-brim cowboy hat ---
  cowboy(ctx, x, y) {
    // Wide brim
    ctx.fillStyle = '#8B6914';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 24, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    // Crown (tall block)
    ctx.fillStyle = '#A07818';
    ctx.beginPath();
    ctx.moveTo(x - 12, y + 2);
    ctx.lineTo(x - 10, y - 14);
    ctx.lineTo(x - 4, y - 10);
    ctx.lineTo(x, y - 14);
    ctx.lineTo(x + 4, y - 10);
    ctx.lineTo(x + 10, y - 14);
    ctx.lineTo(x + 12, y + 2);
    ctx.closePath();
    ctx.fill();
    // Band
    ctx.fillStyle = '#5D4E37';
    ctx.fillRect(x - 12, y - 1, 24, 3);
  },

  // --- Top Hat — tall top hat ---
  tophat(ctx, x, y) {
    // Brim
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(x, y + 3, 20, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tall crown
    ctx.fillStyle = '#2c2c2c';
    ctx.fillRect(x - 12, y - 22, 24, 26);
    // Top of crown (ellipse)
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.ellipse(x, y - 22, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Band
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(x - 12, y - 2, 24, 4);
  },

  // --- Chef — puffy chef toque ---
  chef(ctx, x, y) {
    // Puffy top (multiple overlapping circles)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x - 6, y - 10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 6, y - 10, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - 15, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - 6, 10, 0, Math.PI * 2);
    ctx.fill();
    // Band at base
    ctx.fillStyle = '#ecf0f1';
    ctx.fillRect(x - 14, y + 0, 28, 5);
  },

  // --- Wizard — pointed wizard hat with stars ---
  wizard(ctx, x, y) {
    // Tall cone
    ctx.fillStyle = '#2c3e80';
    ctx.beginPath();
    ctx.moveTo(x - 16, y + 4);
    ctx.lineTo(x + 6, y - 30);
    ctx.lineTo(x + 16, y + 4);
    ctx.closePath();
    ctx.fill();
    // Brim
    ctx.fillStyle = '#1a2555';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 20, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Stars
    ctx.fillStyle = '#f1c40f';
    ctx.font = '8px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('★', x - 3, y - 8);
    ctx.fillText('★', x + 6, y - 18);
    // Moon
    ctx.font = '6px Arial';
    ctx.fillText('☾', x - 5, y - 18);
  },

  // --- Pirate — tricorn pirate hat ---
  pirate(ctx, x, y) {
    // Main hat body
    ctx.fillStyle = '#2c2c2c';
    ctx.beginPath();
    ctx.moveTo(x - 20, y + 4);
    ctx.lineTo(x - 14, y - 8);
    ctx.lineTo(x, y - 16);
    ctx.lineTo(x + 14, y - 8);
    ctx.lineTo(x + 20, y + 4);
    ctx.quadraticCurveTo(x, y + 8, x - 20, y + 4);
    ctx.fill();
    // Trim
    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.ellipse(x, y + 4, 20, 4, 0, 0, Math.PI);
    ctx.fill();
    // Skull and crossbones (simplified)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y - 6, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2c2c2c';
    ctx.beginPath();
    ctx.arc(x - 2, y - 7, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 2, y - 7, 1, 0, Math.PI * 2);
    ctx.fill();
    // Crossbones
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 1);
    ctx.lineTo(x + 5, y + 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 5, y - 1);
    ctx.lineTo(x - 5, y + 3);
    ctx.stroke();
  },

  // --- Viking — horned viking helmet ---
  viking(ctx, x, y) {
    // Helmet dome
    ctx.fillStyle = '#7f8c8d';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 16, 12, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    // Nose guard
    ctx.fillStyle = '#95a5a6';
    ctx.fillRect(x - 2, y - 2, 4, 10);
    // Rim
    ctx.fillStyle = '#5d6d7e';
    ctx.fillRect(x - 16, y + 1, 32, 4);
    // Left horn
    ctx.fillStyle = '#f5deb3';
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 2);
    ctx.quadraticCurveTo(x - 22, y - 18, x - 16, y - 22);
    ctx.lineTo(x - 12, y - 4);
    ctx.closePath();
    ctx.fill();
    // Right horn
    ctx.beginPath();
    ctx.moveTo(x + 14, y - 2);
    ctx.quadraticCurveTo(x + 22, y - 18, x + 16, y - 22);
    ctx.lineTo(x + 12, y - 4);
    ctx.closePath();
    ctx.fill();
  },

  // --- Crown — golden crown with gems ---
  crown(ctx, x, y) {
    // Crown base
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(x - 14, y - 2, 28, 10);
    // Crown points
    ctx.beginPath();
    ctx.moveTo(x - 14, y - 2);
    ctx.lineTo(x - 12, y - 14);
    ctx.lineTo(x - 6, y - 5);
    ctx.lineTo(x, y - 16);
    ctx.lineTo(x + 6, y - 5);
    ctx.lineTo(x + 12, y - 14);
    ctx.lineTo(x + 14, y - 2);
    ctx.closePath();
    ctx.fill();
    // Gems
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(x, y + 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(x - 8, y + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath();
    ctx.arc(x + 8, y + 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  },

  // --- Astronaut — space helmet with visor ---
  astronaut(ctx, x, y) {
    // Outer helmet (larger circle encompassing the head)
    ctx.fillStyle = '#ecf0f1';
    ctx.beginPath();
    ctx.arc(x, y + 4, 18, 0, Math.PI * 2);
    ctx.fill();
    // Dark ring
    ctx.strokeStyle = '#bdc3c7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + 4, 18, 0, Math.PI * 2);
    ctx.stroke();
    // Visor (reflective blue-gold gradient feel)
    ctx.fillStyle = '#2980b9';
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 13, 11, 0, 0, Math.PI * 2);
    ctx.fill();
    // Visor reflection
    ctx.fillStyle = 'rgba(255, 215, 0, 0.3)';
    ctx.beginPath();
    ctx.ellipse(x - 4, y + 2, 6, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();
    // Antenna
    ctx.strokeStyle = '#95a5a6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 12, y - 8);
    ctx.lineTo(x + 16, y - 16);
    ctx.stroke();
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(x + 16, y - 17, 3, 0, Math.PI * 2);
    ctx.fill();
  },

  // --- Halo — floating golden halo ---
  halo(ctx, x, y) {
    ctx.save();
    // Halo floats above the head
    const haloY = y - 12;
    // Outer glow
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 8;
    // Golden ring
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(x, haloY, 16, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Inner highlight
    ctx.strokeStyle = '#ffec80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, haloY, 14, 4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  },
};

// Main entry point — draws the specified hat on a canvas context.
// Falls back to 'cap' if hatId is unknown.
function drawHat(ctx, hatId, x, y, color) {
  (HAT_RENDERERS[hatId] || HAT_RENDERERS.cap)(ctx, x, y, color);
}

// Draw a preview character with a hat (used by hat shop).
// Renders a simplified player silhouette + the hat on a small canvas.
function drawHatPreview(ctx, hatId, width, height) {
  const centerX = width / 2;
  const groundY = height - 10;
  const bodyH = 40;
  const headRadius = 10;

  // Legs
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(centerX - 5, groundY - 12);
  ctx.lineTo(centerX - 8, groundY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerX + 5, groundY - 12);
  ctx.lineTo(centerX + 8, groundY);
  ctx.stroke();

  // Body
  ctx.fillStyle = '#3498db';
  ctx.beginPath();
  ctx.ellipse(centerX, groundY - 22, 11, 15, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.fillStyle = '#f0c8a0';
  ctx.beginPath();
  ctx.arc(centerX, groundY - bodyH, headRadius, 0, Math.PI * 2);
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#2c3e50';
  ctx.beginPath();
  ctx.arc(centerX + 3, groundY - bodyH - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(centerX - 2, groundY - bodyH - 1, 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Smile
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(centerX + 1, groundY - bodyH + 3, 3, 0.1, Math.PI - 0.1);
  ctx.stroke();

  // Hat
  const hatX = centerX;
  const hatY = groundY - bodyH - headRadius + 2;
  drawHat(ctx, hatId, hatX, hatY, '#3498db');
}
