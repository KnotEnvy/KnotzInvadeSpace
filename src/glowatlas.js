/* =====================================================================
 * glowatlas.js — Pre-rendered glow sprite cache (perf pass).
 *
 * The phase-9 visual pass leaned on ctx.shadowBlur + per-frame radial
 * gradients for every glowing particle, bullet and enemy orb. shadowBlur is
 * among the most expensive Canvas-2D operations and was being paid up to
 * ~1200x per frame during explosions; createRadialGradient re-allocated a
 * gradient object per orb per frame (GC churn). This module bakes each glow
 * ONCE into a small offscreen canvas keyed by colour, and the hot draw()
 * paths blit it additively (drawImage) instead — zero runtime blur, zero
 * per-frame gradient allocation.
 *
 * Mirrors postfx.js's contract: feature-detected once; if an offscreen
 * canvas can't be created (old browser / Node-VM smoke harness) it returns
 * null and every caller falls back to its original shadowBlur path, so the
 * game still renders correctly everywhere. Pre-rendering only — no coupling
 * to the fixed-timestep simulation; uses drawImage only (never getImageData,
 * so file:// images never taint the canvas).
 * ===================================================================== */

const GlowSprites = {
  ready: false,
  ok: false,
  R: 32,                 // sprite radius (canvas is 2R x 2R)
  _blob: new Map(),      // colour -> soft radial glow canvas
  _orb: new Map(),       // colour -> white-cored energy orb canvas

  init() {
    if (this.ready) return;
    this.ready = true;
    try {
      if (typeof document === 'undefined' || !document.createElement) return;
      const cv = this._make(2, 2);
      const cx = cv && cv.getContext && cv.getContext('2d');
      this.ok = !!(cx && typeof cx.createRadialGradient === 'function' &&
                   typeof cx.drawImage === 'function');
    } catch (_) { this.ok = false; }
  },

  _make(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; },

  // Parse #rgb / #rrggbb -> [r,g,b]; null for anything else (named / rgba()).
  _rgb(hex) {
    if (typeof hex !== 'string' || hex[0] !== '#') return null;
    let h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    if (isNaN(n)) return null;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },

  // Soft round glow blob in `color` (opaque-ish core fading to transparent).
  // Used as the additive halo behind particles and player/enemy bolts; the
  // crisp core shape is then drawn on top by the caller (no shadowBlur).
  blob(color) {
    this.init();
    if (!this.ok) return null;
    if (this._blob.has(color)) return this._blob.get(color);
    const S = this.R * 2;
    let cv = null;
    try {
      cv = this._make(S, S);
      const cx = cv.getContext('2d');
      const g = cx.createRadialGradient(this.R, this.R, 0, this.R, this.R, this.R);
      const rgb = this._rgb(color);
      if (rgb) {
        const [r, gg, b] = rgb;
        g.addColorStop(0.00, 'rgba(' + r + ',' + gg + ',' + b + ',0.95)');
        g.addColorStop(0.30, 'rgba(' + r + ',' + gg + ',' + b + ',0.55)');
        g.addColorStop(0.65, 'rgba(' + r + ',' + gg + ',' + b + ',0.16)');
        g.addColorStop(1.00, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
      } else {
        g.addColorStop(0, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
      }
      cx.fillStyle = g;
      cx.fillRect(0, 0, S, S);
    } catch (_) { cv = null; }
    this._blob.set(color, cv);
    return cv;
  },

  // Bright-white-cored energy orb in `color` (replaces the enemy bullet's
  // per-frame white->colour->transparent gradient + shadowBlur halo).
  orb(color) {
    this.init();
    if (!this.ok) return null;
    if (this._orb.has(color)) return this._orb.get(color);
    const S = this.R * 2;
    let cv = null;
    try {
      cv = this._make(S, S);
      const cx = cv.getContext('2d');
      const g = cx.createRadialGradient(this.R, this.R, 0, this.R, this.R, this.R);
      const rgb = this._rgb(color);
      g.addColorStop(0.00, 'rgba(255,255,255,0.98)');
      if (rgb) {
        const [r, gg, b] = rgb;
        g.addColorStop(0.28, 'rgba(' + r + ',' + gg + ',' + b + ',0.95)');
        g.addColorStop(0.55, 'rgba(' + r + ',' + gg + ',' + b + ',0.42)');
        g.addColorStop(1.00, 'rgba(' + r + ',' + gg + ',' + b + ',0)');
      } else {
        g.addColorStop(0.35, color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
      }
      cx.fillStyle = g;
      cx.fillRect(0, 0, S, S);
    } catch (_) { cv = null; }
    this._orb.set(color, cv);
    return cv;
  },
};
