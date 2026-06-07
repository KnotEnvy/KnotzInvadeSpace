/* =====================================================================
 * drone.js — Combat Drone wingman granted by the hangar upgrade. Hovers
 * beside the player with a little lag/bob and auto-fires friendly bolts
 * from the shared bullet pool.
 * ===================================================================== */

class Drone {
  constructor(game, index, total) {
    this.game = game;
    this.index = index;
    this.total = total;
    this.size = 18;
    this.x = CONFIG.WIDTH / 2;
    this.y = CONFIG.HEIGHT - 140;
    this.bob = index * Math.PI;
    this.spin = 0;
    this.hist = [];
    // stagger fire so multiple drones don't shoot on the same frame
    this.fireTimer = CONFIG.drone.fireCooldown * (index / Math.max(1, total));
  }

  update(dt) {
    const k = dt / CONFIG.STEP_MS;
    const p = this.game.player;
    const side = this.total > 1 ? (this.index === 0 ? -1 : 1) : 1;
    this.bob += 0.06 * k;
    this.spin += 0.12 * k;
    const tx = p.x + p.width / 2 + side * CONFIG.drone.orbitRadius - this.size / 2;
    const ty = p.y + 4 + Math.sin(this.bob) * 8;
    this.x = Utils.lerp(this.x, tx, 0.14 * k);
    this.y = Utils.lerp(this.y, ty, 0.14 * k);

    if (Meta.trailsOn()) {
      this.hist.unshift({ x: this.x + this.size / 2, y: this.y + this.size / 2 });
      if (this.hist.length > 7) this.hist.pop();
    }

    if (!p.alive) return;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = CONFIG.drone.fireCooldown;
      this.game.spawnBullet(this.x + this.size / 2, this.y, 0, -CONFIG.drone.bulletSpeed,
        { friendly: true, color: CONFIG.drone.color, width: 4, height: 16, damage: 1 });
      this.game.particles.muzzle(this.x + this.size / 2, this.y, CONFIG.drone.color);
    }
  }

  draw(c) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    // motion trail
    for (let i = 1; i < this.hist.length; i++) {
      const t = 1 - i / this.hist.length;
      c.globalAlpha = t * 0.4;
      c.fillStyle = CONFIG.drone.color;
      c.beginPath();
      c.arc(this.hist[i].x, this.hist[i].y, this.size * 0.32 * t, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
    c.translate(this.x + this.size / 2, this.y + this.size / 2);
    c.rotate(this.spin);
    c.fillStyle = CONFIG.drone.color;
    c.shadowColor = CONFIG.drone.color;
    c.shadowBlur = 12;
    c.beginPath();
    c.moveTo(0, -this.size * 0.6);
    c.lineTo(this.size * 0.5, 0);
    c.lineTo(0, this.size * 0.6);
    c.lineTo(-this.size * 0.5, 0);
    c.closePath();
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(0, 0, this.size * 0.18, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}
