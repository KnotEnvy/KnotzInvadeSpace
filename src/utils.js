/* =====================================================================
 * utils.js — Small math / helper toolbox used across the engine.
 * ===================================================================== */

const Utils = {
  clamp(v, min, max) { return v < min ? min : v > max ? max : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  rand(min, max) { return min + Math.random() * (max - min); },
  randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },
  pick(arr) { return arr[(Math.random() * arr.length) | 0]; },
  chance(p) { return Math.random() < p; },
  dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); },

  // Axis-aligned bounding-box overlap. Objects expose {x, y, width, height}.
  aabb(a, b) {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  },

  // Ease helpers for snappy UI / motion.
  easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },
  easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; },

  // Format a number with thousands separators (score readouts).
  commas(n) { return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); },

  // Draw text with a soft drop shadow — used everywhere in the HUD/menus.
  text(c, str, x, y, {
    size = 24, font = "'Orbitron', 'Trebuchet MS', sans-serif", color = '#fff',
    align = 'left', baseline = 'alphabetic', glow = 0, glowColor = '#46e0ff',
    weight = 700, alpha = 1,
  } = {}) {
    c.save();
    c.globalAlpha = alpha;
    c.font = `${weight} ${size}px ${font}`;
    c.textAlign = align;
    c.textBaseline = baseline;
    if (glow > 0) {
      c.shadowColor = glowColor;
      c.shadowBlur = glow;
    }
    c.fillStyle = color;
    c.fillText(str, x, y);
    c.restore();
  },

  // Rounded-rectangle path helper.
  roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  },
};
