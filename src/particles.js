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
    const size = this.size * (this.fade ? (0.4 + 0.6 * t) : 1);
    // Soft additive glow via a pre-rendered blob sprite (no runtime shadowBlur
    // — the single biggest per-frame cost during explosions). Falls back to
    // shadowBlur when offscreen canvases aren't available.
    if (this.glow) {
      const blob = GlowSprites.blob(this.color);
      if (blob) {
        const gsz = size * 2 + this.glow * 2;
        c.drawImage(blob, this.x - gsz / 2, this.y - gsz / 2, gsz, gsz);
      } else {
        c.shadowColor = this.color; c.shadowBlur = this.glow;
      }
    }
    c.fillStyle = this.color;
    if (this.shape === 'circle') {
      c.beginPath();
      c.arc(this.x, this.y, size, 0, Math.PI * 2);
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

// Expanding additive ring — the classic "shockwave" punch on big impacts.
class Shockwave {
  constructor() { this.dead = true; }
  spawn(x, y, opt) {
    this.x = x; this.y = y;
    this.r0 = opt.r0 != null ? opt.r0 : 4;
    this.r1 = opt.r1 != null ? opt.r1 : 90;
    this.life = opt.life || 360; this.maxLife = this.life;
    this.color = opt.color || '#fff';
    this.lw = opt.lw != null ? opt.lw : 3;
    this.dead = false;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(c) {
    const t = Utils.clamp(1 - this.life / this.maxLife, 0, 1);
    const r = Utils.lerp(this.r0, this.r1, Utils.easeOutCubic(t));
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = (1 - t) * 0.9;
    c.strokeStyle = this.color;
    c.lineWidth = this.lw * (1 - t) + 0.6;
    c.shadowColor = this.color;
    c.shadowBlur = 14;
    c.beginPath();
    c.arc(this.x, this.y, Math.max(0.5, r), 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}

// A high-res textured explosion that plays a frame sequence from a sprite
// sheet (we reuse the unused VFX columns baked into boss.png). Drawn
// additively, it layers over the particle burst for a meatier blast.
class SpriteBurst {
  constructor() { this.dead = true; }
  spawn(x, y, opt) {
    this.x = x; this.y = y;
    this.image = opt.image;
    this.frames = opt.frames;          // [{sx,sy,sw,sh}, ...]
    this.size = opt.size || 120;
    this.life = opt.life || 460; this.maxLife = this.life;
    this.rot = opt.rot || 0;
    this.dead = !this.image || !this.frames || !this.frames.length;
  }
  update(dt) { this.life -= dt; if (this.life <= 0) this.dead = true; }
  draw(c) {
    if (!this.image || !this.image.complete) return;
    const t = Utils.clamp(1 - this.life / this.maxLife, 0, 1);
    const idx = Utils.clamp(Math.floor(t * this.frames.length), 0, this.frames.length - 1);
    const f = this.frames[idx];
    const sz = this.size * (0.7 + 0.45 * t);     // bloom outward as it plays
    const a = t < 0.15 ? t / 0.15 : (1 - t) / 0.85;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = Utils.clamp(a, 0, 1);
    c.translate(this.x, this.y);
    c.rotate(this.rot);
    c.drawImage(this.image, f.sx, f.sy, f.sw, f.sh, -sz / 2, -sz / 2, sz, sz);
    c.restore();
  }
}

// VFX frame tables — the unused orb→burst→fade columns (6–10) of boss.png,
// one themed sequence per sheet row. See the sheet analysis in the GFX pass.
const VFX_THEMES = { gold: 0, energy: 1, crimson: 2, fire: 3 };
function bossVfxFrames(theme) {
  const row = VFX_THEMES[theme] != null ? VFX_THEMES[theme] : 3;
  const y = row * 200;
  return [1200, 1400, 1600, 1800, 2000].map(x => ({ sx: x, sy: y, sw: 200, sh: 200 }));
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
    // Pool sized for the High tier; lower tiers simply emit fewer (see _count).
    const cap = (CONFIG.quality && CONFIG.quality.high.maxParticles) || 600;
    this.pool = Array.from({ length: cap }, () => new Particle());
    this.popups = Array.from({ length: 40 }, () => new Popup());
    this.shockwaves = Array.from({ length: 24 }, () => new Shockwave());
    this.bursts = Array.from({ length: 24 }, () => new SpriteBurst());
    // O(1) acquisition: a stack of dead-slot indices per pool. Particles only
    // ever die in their own update()/clear(), so we reclaim freed indices in
    // _age() and pop them on emit — no linear scan even with ~1200 live.
    this.poolFree = this._indices(this.pool.length);
    this.popupFree = this._indices(this.popups.length);
    this.shockFree = this._indices(this.shockwaves.length);
    this.burstFree = this._indices(this.bursts.length);
  }
  _indices(n) { const a = new Array(n); for (let i = 0; i < n; i++) a[i] = n - 1 - i; return a; }
  // Pop a free slot; when exhausted, recycle the oldest (index 0) like before.
  _acquire(pool, free) { return free.length ? pool[free.pop()] : pool[0]; }
  _get()      { return this._acquire(this.pool, this.poolFree); }
  _getPopup() { return this._acquire(this.popups, this.popupFree); }
  _getShock() { return this._acquire(this.shockwaves, this.shockFree); }
  _getBurst() { return this._acquire(this.bursts, this.burstFree); }

  emit(x, y, opt) { this._get().spawn(x, y, opt); }

  // Scale emitter counts by the accessibility (reduced-motion) and graphics
  // (quality tier) settings, which compose. Popups/score text always survive.
  _count(n) {
    let m = 1;
    if (Meta.reducedMotion()) m *= 0.3;
    const q = CONFIG.quality && CONFIG.quality[Meta.quality()];
    if (q && q.particleMul != null) m *= q.particleMul;
    return Math.max(1, Math.round(n * m));
  }

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

  // Expanding ring punch (fx tier only — keeps Low ≈ baseline; the expanding
  // motion is suppressed under reduced-motion for accessibility).
  shockwave(x, y, color = '#fff', opt = {}) {
    if (!Meta.fx() || Meta.reducedMotion()) return;
    this._getShock().spawn(x, y, { color, ...opt });
  }

  // High-res textured explosion frames from boss.png (fx tier; the flashing
  // burst is suppressed under reduced-motion).
  spriteBurst(x, y, theme = 'fire', size = 140, rot = null) {
    if (!Meta.fx() || Meta.reducedMotion()) return;
    const img = (typeof Assets !== 'undefined') && Assets.img && Assets.img.boss;
    if (!img) return;
    this._getBurst().spawn(x, y, {
      image: img, frames: bossVfxFrames(theme), size,
      rot: rot == null ? Utils.rand(0, Math.PI * 2) : rot,
      life: 420 + size,
    });
  }

  // A meatier blast: particle burst + shockwave ring + textured sprite flash.
  explosionBig(x, y, color, theme = 'fire', power = 1.6) {
    this.explosion(x, y, color, Math.round(30 * power), power);
    this.shockwave(x, y, color, { r0: 6 * power, r1: 70 * power, life: 360 + 120 * power, lw: 3 + power });
    this.spriteBurst(x, y, theme, 130 * power);
  }

  // Update each pool, reclaiming the index of anything that just died into its
  // free-stack (keeps the invariant: an index is in *Free iff that slot is dead).
  _age(pool, free, dt) {
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (!p.dead) { p.update(dt); if (p.dead) free.push(i); }
    }
  }
  update(dt) {
    this._age(this.pool, this.poolFree, dt);
    this._age(this.popups, this.popupFree, dt);
    this._age(this.shockwaves, this.shockFree, dt);
    this._age(this.bursts, this.burstFree, dt);
  }
  draw(c) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const p of this.pool) if (!p.dead) p.draw(c);
    c.restore();
    for (const s of this.shockwaves) if (!s.dead) s.draw(c);
    for (const b of this.bursts) if (!b.dead) b.draw(c);
    for (const p of this.popups) if (!p.dead) p.draw(c);
  }
  clear() {
    for (const p of this.pool) p.dead = true;
    for (const p of this.popups) p.dead = true;
    for (const s of this.shockwaves) s.dead = true;
    for (const b of this.bursts) b.dead = true;
    this.poolFree = this._indices(this.pool.length);
    this.popupFree = this._indices(this.popups.length);
    this.shockFree = this._indices(this.shockwaves.length);
    this.burstFree = this._indices(this.bursts.length);
  }
}
