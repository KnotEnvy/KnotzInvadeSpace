/* =====================================================================
 * particles.js — Pooled particle system for explosions, sparks, muzzle
 * flashes, debris and floating score popups. This is most of the "juice".
 * ===================================================================== */

class Particle {
  constructor() { this.dead = true; }
  spawn(x, y, opt) {
    this.x = x; this.y = y;
    this.vx = opt.vx; this.vy = opt.vy;
    this.life = opt.life; this.maxLife = opt.life;
    this.size = opt.size;
    this.color = opt.color;
    this.gravity = opt.gravity || 0;
    this.drag = opt.drag ?? 0.98;
    this.shape = opt.shape || 'circle';
    this.spin = opt.spin || 0;
    this.angle = opt.angle || 0;
    this.fade = opt.fade ?? true;
    this.glow = opt.glow || 0;
    this.dead = false;
  }
  update(dt) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vx *= this.drag;
    this.vy = this.vy * this.drag + this.gravity;
    this.x += this.vx;
    this.y += this.vy;
    this.angle += this.spin;
  }
  draw(c) {
    const t = this.fade ? this.life / this.maxLife : 1;
    c.save();
    c.globalAlpha = Utils.clamp(t, 0, 1);
    if (this.glow) { c.shadowColor = this.color; c.shadowBlur = this.glow; }
    c.fillStyle = this.color;
    if (this.shape === 'circle') {
      c.beginPath();
      c.arc(this.x, this.y, this.size * (this.fade ? (0.4 + 0.6 * t) : 1), 0, Math.PI * 2);
      c.fill();
    } else if (this.shape === 'spark') {
      c.translate(this.x, this.y);
      c.rotate(this.angle);
      c.fillRect(-this.size * 0.5, -this.size * 2, this.size, this.size * 4);
    } else { // square debris
      c.translate(this.x, this.y);
      c.rotate(this.angle);
      c.fillRect(-this.size, -this.size, this.size * 2, this.size * 2);
    }
    c.restore();
  }
}

// Floating "+score" / combo text that drifts up and fades.
class Popup {
  constructor() { this.dead = true; }
  spawn(x, y, text, color, size) {
    this.x = x; this.y = y; this.text = text; this.color = color;
    this.size = size || 22; this.life = 900; this.maxLife = 900; this.dead = false;
  }
  update(dt) { this.y -= dt * 0.03; this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(c) {
    const t = this.life / this.maxLife;
    Utils.text(c, this.text, this.x, this.y, {
      size: this.size, color: this.color, align: 'center', glow: 8,
      glowColor: this.color, alpha: Utils.clamp(t * 1.4, 0, 1),
    });
  }
}

class Particles {
  constructor() {
    this.pool = Array.from({ length: 600 }, () => new Particle());
    this.popups = Array.from({ length: 40 }, () => new Popup());
  }
  _get() {
    for (const p of this.pool) if (p.dead) return p;
    // Pool exhausted: recycle the oldest by replacing the first one.
    return this.pool[0];
  }
  _getPopup() {
    for (const p of this.popups) if (p.dead) return p;
    return this.popups[0];
  }

  emit(x, y, opt) { this._get().spawn(x, y, opt); }

  // Reduced-motion (accessibility) thins emitter counts so the screen is
  // calmer; popups/score text are always kept for readability.
  _count(n) { return Meta.reducedMotion() ? Math.max(1, Math.round(n * 0.3)) : n; }

  popup(x, y, text, color = '#fff', size = 22) {
    this._getPopup().spawn(x, y, text, color, size);
  }

  // A circular burst of glowing embers + a few debris chunks.
  explosion(x, y, color, count = 22, power = 1) {
    count = this._count(count);
    for (let i = 0; i < count; i++) {
      const a = Utils.rand(0, Math.PI * 2);
      const sp = Utils.rand(1, 6) * power;
      this.emit(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: Utils.rand(350, 750), size: Utils.rand(2, 5),
        color, drag: 0.92, glow: 12, gravity: 0.04,
        shape: Utils.chance(0.7) ? 'circle' : 'square', spin: Utils.rand(-0.3, 0.3),
      });
    }
    // bright core flash
    this.emit(x, y, { vx: 0, vy: 0, life: 140, size: 18 * power, color: '#fff', glow: 30, drag: 1 });
  }

  // Sparks that fly out in a cone — used for bullet impacts.
  sparks(x, y, color, dir = -Math.PI / 2, count = 8) {
    count = this._count(count);
    for (let i = 0; i < count; i++) {
      const a = dir + Utils.rand(-0.9, 0.9);
      const sp = Utils.rand(2, 6);
      this.emit(x, y, {
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: Utils.rand(180, 340), size: Utils.rand(1.5, 3),
        color, glow: 8, shape: 'spark', angle: a + Math.PI / 2, drag: 0.9,
      });
    }
  }

  muzzle(x, y, color) {
    this.emit(x, y, { vx: 0, vy: -1, life: 90, size: 9, color, glow: 16, drag: 0.8 });
    this.sparks(x, y, color, -Math.PI / 2, 4);
  }

  // Thruster trail behind the ship.
  thruster(x, y, color) {
    if (Meta.reducedMotion()) return;   // skip the constant exhaust stream
    this.emit(x, y, {
      vx: Utils.rand(-0.5, 0.5), vy: Utils.rand(1.5, 3),
      life: Utils.rand(160, 300), size: Utils.rand(2, 4), color, glow: 6, drag: 0.95,
    });
  }

  update(dt) {
    for (const p of this.pool) if (!p.dead) p.update(dt);
    for (const p of this.popups) if (!p.dead) p.update(dt);
  }
  draw(c) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of this.pool) if (!p.dead) p.draw(c);
    c.restore();
    for (const p of this.popups) if (!p.dead) p.draw(c);
  }
  clear() {
    for (const p of this.pool) p.dead = true;
    for (const p of this.popups) p.dead = true;
  }
}
