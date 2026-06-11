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

  // Deterministic PRNG (mulberry32). makeRng(seed) returns a function that
  // yields the next float in [0,1) — used for the seeded Daily Challenge so
  // every player faces the same formations for a given day.
  makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },
  // Hash a string to a 32-bit int (seeds the daily RNG from a date key).
  hashStr(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  },

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

  // Drop entries where keep(item) is false, IN PLACE and order-preserving,
  // without allocating a new array (unlike Array.prototype.filter, which the
  // per-frame cull sites used to call every frame). Returns the same array.
  compact(arr, keep) {
    let w = 0;
    for (let r = 0; r < arr.length; r++) {
      const item = arr[r];
      if (keep(item)) { if (w !== r) arr[w] = item; w++; }
    }
    arr.length = w;
    return arr;
  },

  // Like compact(), but pushes the removed (dead) entries onto `pool` for
  // reuse instead of dropping them. isDead(item) -> true to recycle.
  compactRelease(arr, pool, isDead) {
    let w = 0;
    for (let r = 0; r < arr.length; r++) {
      const item = arr[r];
      if (isDead(item)) { if (pool.length < 256) pool.push(item); }
      else { if (w !== r) arr[w] = item; w++; }
    }
    arr.length = w;
    return arr;
  },

  // True when the AABB [x,y,w,h] is fully outside the design viewport,
  // expanded by margin m. Used to skip draw() for off-screen entities;
  // keep m larger than the max screen-shake so nothing pops at the edges.
  offscreen(x, y, w, h, m = 0) {
    return x + w + m < 0 || x - m > CONFIG.WIDTH ||
           y + h + m < 0 || y - m > CONFIG.HEIGHT;
  },

  // Draw text with a soft drop shadow — used everywhere in the HUD/menus.
  // `spacing` (px of letter-spacing) works on modern browsers and silently
  // no-ops on engines without ctx.letterSpacing.
  text(c, str, x, y, {
    size = 24, font = "'Orbitron', 'Trebuchet MS', sans-serif", color = '#fff',
    align = 'left', baseline = 'alphabetic', glow = 0, glowColor = '#46e0ff',
    weight = 700, alpha = 1, spacing = 0,
  } = {}) {
    c.save();
    c.globalAlpha = alpha;
    if (spacing) c.letterSpacing = spacing + 'px';
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

/* ---------------------------------------------------------------------
 * Trail — a fixed-capacity ring buffer of pre-allocated {x,y} points for
 * motion trails (bullets / power-ups / drones). The old code .unshift()'d a
 * fresh object every frame per entity (O(n) shift + GC churn); this reuses
 * the same point objects and just advances a head index (O(1), zero alloc).
 * forEach visits NEWEST -> OLDEST so callers fade the tail the same way.
 * ------------------------------------------------------------------- */
class Trail {
  constructor(len) {
    this.len = len;
    this.pts = new Array(len);
    for (let i = 0; i < len; i++) this.pts[i] = { x: 0, y: 0 };
    this.head = -1;   // index of the newest point
    this.count = 0;   // points currently stored (<= len)
  }
  clear() { this.head = -1; this.count = 0; }
  push(x, y) {
    this.head = this.head + 1 === this.len ? 0 : this.head + 1;
    const p = this.pts[this.head];
    p.x = x; p.y = y;
    if (this.count < this.len) this.count++;
  }
  // cb(point, i, count): i=0 is the newest point.
  forEach(cb) {
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - i + this.len) % this.len;
      cb(this.pts[idx], i, this.count);
    }
  }
}
