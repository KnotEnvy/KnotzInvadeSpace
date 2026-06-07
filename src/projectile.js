/* =====================================================================
 * projectile.js — Pooled bullets for the player and enemies, plus the
 * player's continuous energy Beam. Bullets carry a glowing trail.
 * ===================================================================== */

class Bullet {
  constructor() { this.free = true; }
  start(x, y, vx, vy, opt = {}) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.width = opt.width || CONFIG.bullet.width;
    this.height = opt.height || CONFIG.bullet.height;
    this.damage = opt.damage ?? 1;
    this.color = opt.color || CONFIG.colors.gold;
    this.friendly = opt.friendly ?? true;
    this.trail = [];
    this.free = false;
  }
  update(dt) {
    if (this.free) return;
    const k = dt / CONFIG.STEP_MS;
    this.trail.unshift({ x: this.x + this.width / 2, y: this.y + this.height / 2 });
    if (this.trail.length > 6) this.trail.pop();
    this.x += this.vx * k;
    this.y += this.vy * k;
    if (this.y < -40 || this.y > CONFIG.HEIGHT + 40 ||
        this.x < -40 || this.x > CONFIG.WIDTH + 40) {
      this.free = true;
    }
  }
  draw(c) {
    if (this.free) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    // trail (skipped under reduced-motion for a calmer screen)
    if (!Meta.reducedMotion()) {
      for (let i = 0; i < this.trail.length; i++) {
        const t = 1 - i / this.trail.length;
        c.globalAlpha = t * 0.5;
        c.fillStyle = this.color;
        const r = this.width * 0.6 * t;
        c.beginPath();
        c.arc(this.trail[i].x, this.trail[i].y, r, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.globalAlpha = 1;

    if (!this.friendly && Meta.fx()) {
      // Enemy fire reads as a glowing energy orb (more menacing than a rect).
      const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
      const r = Math.max(this.width, this.height) * 0.62;
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.35, this.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.shadowColor = this.color;
      c.shadowBlur = 14;
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fill();
    } else {
      // Player/enemy bolt: bright white core inside a coloured glow.
      c.shadowColor = this.color;
      c.shadowBlur = 14;
      c.fillStyle = this.color;
      c.fillRect(this.x - 1.5, this.y - 2, this.width + 3, this.height + 4);
      c.fillStyle = '#fff';
      c.fillRect(this.x + this.width * 0.18, this.y + 1, this.width * 0.64, this.height - 2);
    }
    c.restore();
  }
}

// The player's chargeable energy beam: a vertical column that deals
// damage-over-time to anything it overlaps. Rendered as a glowing pillar.
class Beam {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.x = 0;
    this.width = CONFIG.player.beamWidth;
    this.flicker = 0;
  }
  update(dt) {
    this.flicker += dt * 0.02;
    const p = this.game.player;
    this.active = this.game.input.beam && p.energy > 1 && !p.cooldown && p.alive;
    if (!this.active) return;

    p.energy = Math.max(0, p.energy - CONFIG.player.beamDrain * dt / 1000);
    p.firePose = 'beam';
    this.x = p.x + p.width / 2 - this.width / 2;
    const dmg = CONFIG.player.beamDps * dt / 1000;

    const beamBox = { x: this.x, y: 0, width: this.width, height: p.y };
    // damage enemies
    for (const wave of this.game.waves)
      for (const e of wave.enemies)
        if (e.alive && Utils.aabb(beamBox, e)) {
          e.hit(dmg, this.game);
          if (Utils.chance(0.4))
            this.game.particles.sparks(e.x + e.width / 2, e.y + e.height, this.color, Math.PI / 2, 2);
        }
    // damage boss
    if (this.game.boss && this.game.boss.vulnerable && Utils.aabb(beamBox, this.game.boss)) {
      this.game.boss.hit(dmg, this.game);
    }
    // chew through asteroids
    for (const a of this.game.asteroids)
      if (!a.dead && Utils.aabb(beamBox, a)) a.hit(dmg);
    if (Utils.chance(0.5)) Sound.beam();

    // muzzle crackle + sparks climbing the column (fx tier)
    if (Meta.fx() && !Meta.reducedMotion()) {
      const mx = p.x + p.width / 2;
      if (Utils.chance(0.9)) this.game.particles.emit(mx + Utils.rand(-this.width, this.width), p.y,
        { vx: Utils.rand(-1.2, 1.2), vy: Utils.rand(-3, -6), life: Utils.rand(160, 320),
          size: Utils.rand(1.5, 3), color: '#bdf3ff', glow: 10, drag: 0.92 });
    }
  }
  get color() { return CONFIG.colors.accent; }
  draw(c) {
    if (!this.active) return;
    const p = this.game.player;
    const pulse = 0.85 + 0.15 * Math.sin(this.flicker);
    const w = this.width * pulse;
    const cx = p.x + p.width / 2;
    const x = cx - w / 2;
    const top = 0, bottom = p.y + 10;
    c.save();
    c.globalCompositeOperation = 'lighter';
    // soft outer halo
    const halo = c.createLinearGradient(x - w, 0, x + w * 2, 0);
    halo.addColorStop(0, 'rgba(70,224,255,0)');
    halo.addColorStop(0.5, 'rgba(70,224,255,0.28)');
    halo.addColorStop(1, 'rgba(70,224,255,0)');
    c.fillStyle = halo;
    c.fillRect(x - w, top, w * 3, bottom);
    // main column
    const grad = c.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(70,224,255,0)');
    grad.addColorStop(0.5, 'rgba(160,245,255,0.9)');
    grad.addColorStop(1, 'rgba(70,224,255,0)');
    c.fillStyle = grad;
    c.shadowColor = this.color;
    c.shadowBlur = 24;
    c.fillRect(x, top, w, bottom);
    // bright core
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.fillRect(x + w * 0.4, top, w * 0.2, bottom);
    // muzzle flare bloom at the ship
    const fr = w * (1.4 + 0.4 * Math.sin(this.flicker * 1.7));
    const mg = c.createRadialGradient(cx, p.y, 0, cx, p.y, fr);
    mg.addColorStop(0, 'rgba(255,255,255,0.95)');
    mg.addColorStop(0.4, 'rgba(160,245,255,0.7)');
    mg.addColorStop(1, 'rgba(70,224,255,0)');
    c.fillStyle = mg;
    c.beginPath();
    c.arc(cx, p.y, fr, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
