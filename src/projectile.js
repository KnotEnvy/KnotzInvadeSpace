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
    c.shadowColor = this.color;
    c.shadowBlur = 12;
    c.fillStyle = '#fff';
    c.fillRect(this.x, this.y, this.width, this.height);
    c.fillStyle = this.color;
    c.fillRect(this.x - 1, this.y + 2, this.width + 2, this.height - 4);
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
  }
  get color() { return CONFIG.colors.accent; }
  draw(c) {
    if (!this.active) return;
    const p = this.game.player;
    const w = this.width * (0.85 + 0.15 * Math.sin(this.flicker));
    const x = p.x + p.width / 2 - w / 2;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const grad = c.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(70,224,255,0)');
    grad.addColorStop(0.5, 'rgba(160,245,255,0.9)');
    grad.addColorStop(1, 'rgba(70,224,255,0)');
    c.fillStyle = grad;
    c.shadowColor = this.color;
    c.shadowBlur = 24;
    c.fillRect(x, 0, w, p.y + 10);
    // bright core
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillRect(x + w * 0.4, 0, w * 0.2, p.y + 10);
    c.restore();
  }
}
