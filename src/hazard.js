/* =====================================================================
 * hazard.js — Drifting asteroids. They rotate as they fall, take damage,
 * and large ones shatter into smaller pieces. They hurt the player on
 * contact and reward score when shot. Rendered procedurally (no sprite).
 * Internally tracks a center (cx, cy); exposes x/y/width/height as a
 * slightly-tightened AABB so the shared collision helper just works.
 * ===================================================================== */

class Asteroid {
  constructor(game, cx, cy, sizeKey) {
    this.game = game;
    this.sizeKey = sizeKey;
    const cfg = CONFIG.hazard[sizeKey];
    this.r = cfg.r;
    this.hp = cfg.hp;
    this.score = cfg.score;
    this.cx = cx;
    this.cy = cy;
    this.vx = Utils.rand(-0.6, 0.6);
    const sm = sizeKey === 'small' ? 1.35 : sizeKey === 'med' ? 1.12 : 1;
    this.vy = Utils.rand(CONFIG.hazard.speedMin, CONFIG.hazard.speedMax) * sm;
    this.rot = Utils.rand(0, Math.PI * 2);
    this.spin = Utils.rand(-0.03, 0.03);
    this.hitFlash = 0;
    this.dead = false;
    // lumpy procedural silhouette
    this.verts = [];
    const n = Utils.randInt(8, 11);
    for (let i = 0; i < n; i++) this.verts.push({ a: (i / n) * Math.PI * 2, rr: this.r * Utils.rand(0.78, 1.15) });
  }

  // AABB interface (tightened to ~0.82r so grazes feel fair)
  get x() { return this.cx - this.r * 0.82; }
  get y() { return this.cy - this.r * 0.82; }
  get width() { return this.r * 1.64; }
  get height() { return this.r * 1.64; }

  update(dt) {
    const k = dt / CONFIG.STEP_MS;
    this.cx += this.vx * k;
    this.cy += this.vy * k;
    this.rot += this.spin * k;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    // faint dust drifting off the rock (high tier only)
    if (Meta.extras() && !Meta.reducedMotion() && Utils.chance(0.12 * k)) {
      this.game.particles.emit(this.cx + Utils.rand(-this.r * 0.4, this.r * 0.4), this.cy - this.r * 0.4, {
        vx: Utils.rand(-0.3, 0.3), vy: Utils.rand(-0.8, -0.2), life: Utils.rand(200, 420),
        size: Utils.rand(1, 2.2), color: '#8a7c68', glow: 3, drag: 0.96,
      });
    }
    if (this.cy - this.r > CONFIG.HEIGHT + 30) this.dead = true;
    // wrap horizontally
    if (this.cx < -this.r - 40) this.cx = CONFIG.WIDTH + this.r + 38;
    else if (this.cx > CONFIG.WIDTH + this.r + 40) this.cx = -this.r - 38;
  }

  hit(dmg) {
    if (this.dead) return;
    this.hp -= dmg;
    this.hitFlash = 80;
    this.game.particles.sparks(this.cx, this.cy, '#e8dcc8', -Math.PI / 2, 4);
    if (this.hp <= 0) this.shatter(true);
  }

  shatter(byPlayer) {
    if (this.dead) return;
    this.dead = true;
    this.game.particles.explosion(this.cx, this.cy, '#cdbfae', Math.floor(this.r * 0.6), this.r / 30);
    Sound.explode();
    this.game.shake(this.r * 0.16, 160);
    const cfg = CONFIG.hazard[this.sizeKey];
    if (cfg.split) {
      for (let i = 0; i < cfg.count; i++) {
        const child = new Asteroid(this.game, this.cx, this.cy, cfg.split);
        const a = Utils.rand(0, Math.PI * 2);
        child.vx += Math.cos(a) * 1.3;
        child.vy = Math.abs(child.vy) * 0.7 + Math.abs(Math.sin(a)) * 0.6;
        this.game.asteroids.push(child);
      }
    }
    if (byPlayer) this.game.addScore(this.score, this.cx, this.cy);
  }

  _path(c) {
    c.beginPath();
    this.verts.forEach((v, i) => {
      const px = Math.cos(v.a) * v.rr, py = Math.sin(v.a) * v.rr;
      i ? c.lineTo(px, py) : c.moveTo(px, py);
    });
    c.closePath();
  }

  // The static body (silhouette + gradient + craters + rim) in LOCAL space
  // (origin = asteroid centre). Used to bake the sprite once, and as the
  // no-canvas fallback path.
  _drawBody(c) {
    this._path(c);
    const g = c.createRadialGradient(-this.r * 0.3, -this.r * 0.3, this.r * 0.2, 0, 0, this.r);
    g.addColorStop(0, '#b6a690');
    g.addColorStop(1, '#5f5343');
    c.fillStyle = g;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = '#3f372d';
    c.stroke();
    // craters
    c.fillStyle = 'rgba(55,48,40,0.55)';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc((i - 1) * this.r * 0.32, ((i % 2) - 0.5) * this.r * 0.45, this.r * 0.12, 0, Math.PI * 2);
      c.fill();
    }
    // rim light — a soft specular toward the upper-left light source
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.28;
    c.fillStyle = '#efe6d4';
    c.beginPath();
    c.arc(-this.r * 0.32, -this.r * 0.36, this.r * 0.2, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.18;
    c.lineWidth = 1.5;
    c.strokeStyle = '#d8cab2';
    this._path(c);
    c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
  }

  // Bake the static body to a small offscreen canvas ONCE. Only rotation
  // changes at runtime (applied by the caller), so per-frame cost drops from a
  // gradient + several paths to a single drawImage. null -> use _drawBody
  // (covers environments without an offscreen canvas).
  _buildSprite() {
    if (typeof document === 'undefined' || !document.createElement) return null;
    try {
      const R = this.r * 1.25 + 4;          // local half-extent (verts <= 1.15r)
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(R * 2); cv.height = Math.ceil(R * 2);
      const cx = cv.getContext('2d');
      if (!cx || typeof cx.createRadialGradient !== 'function') return null;
      cx.translate(R, R);
      this._drawBody(cx);
      this._spriteR = R;
      return cv;
    } catch (_) { return null; }
  }

  draw(c) {
    if (this._sprite === undefined) this._sprite = this._buildSprite();
    c.save();
    c.translate(this.cx, this.cy);
    c.rotate(this.rot);
    if (this._sprite) {
      const R = this._spriteR;
      c.drawImage(this._sprite, -R, -R, R * 2, R * 2);
    } else {
      this._drawBody(c);
    }
    if (this.hitFlash > 0) {
      c.globalAlpha = (this.hitFlash / 80) * 0.7;
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#fff';
      this._path(c);
      c.fill();
    }
    c.restore();
  }
}
