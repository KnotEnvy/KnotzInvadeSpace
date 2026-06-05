/* =====================================================================
 * boss.js — A multi-phase boss. Sweeps across the top, and changes its
 * attack pattern as its health drops: aimed shots -> spread -> radial
 * bursts with a faster sweep. Big payoff on defeat.
 * ===================================================================== */

class Boss {
  constructor(game, tier) {
    this.game = game;
    this.tier = tier;                 // 1,2,3... scales health & aggression
    this.width = CONFIG.boss.width;
    this.height = CONFIG.boss.height;
    this.maxLives = CONFIG.boss.baseLives + (tier - 1) * CONFIG.boss.livesPerTier;
    this.lives = this.maxLives;
    this.x = CONFIG.WIDTH / 2 - this.width / 2;
    this.y = -this.height;
    this.entryY = 74;
    this.entered = false;
    this.vulnerable = false;
    this.alive = true;
    this.dead = false;
    this.t = 0;
    this.fireTimer = 1200;
    this.hitFlash = 0;
    this.frameY = (tier - 1) % CONFIG.sprites.boss.rows;
    this.frameX = 0;
    this.image = Assets.img.boss;
    this.amp = (CONFIG.WIDTH - this.width) / 2 - 8;
    this.centerX = CONFIG.WIDTH / 2 - this.width / 2;
    this.deathTimer = 0;
    this.score = 2000 * tier;
  }

  get phase() {
    const p = this.lives / this.maxLives;
    if (p > 0.66) return 1;
    if (p > 0.33) return 2;
    return 3;
  }

  update(dt) {
    const k = dt / CONFIG.STEP_MS;
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (this.dead) {
      this.deathTimer -= dt;
      // staggered explosions across the body during death throes
      if (Utils.chance(0.4)) {
        this.game.particles.explosion(
          this.x + Utils.rand(0, this.width), this.y + Utils.rand(0, this.height),
          Utils.pick([CONFIG.colors.boss, CONFIG.colors.gold, '#fff']), 14, 1.2);
      }
      if (this.deathTimer <= 0) this.finishDeath();
      return;
    }

    if (!this.entered) {
      this.y += 1.4 * k;
      if (this.y >= this.entryY) { this.y = this.entryY; this.entered = true; this.vulnerable = true; }
      return;
    }

    // sweep speed grows with phase
    const speed = 0.0013 + this.phase * 0.0006;
    this.x = this.centerX + Math.sin(this.t * speed) * this.amp;

    // idle animation (slow breathing between two frames)
    this.frameX = (Math.floor(this.t / 400) % 2 === 0) ? 0 : 1;

    // attacks
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.attack();
      const base = 1500 - this.tier * 120;
      this.fireTimer = Math.max(450, base / this.phase);
    }

    // body contact = player hit
    if (this.game.player.alive && Utils.aabb(this, this.game.player)) {
      this.game.player.takeHit();
    }
  }

  attack() {
    const mx = this.x + this.width / 2;
    const my = this.y + this.height - 20;
    const player = this.game.player;
    const aimAngle = Math.atan2((player.y) - my, (player.x + player.width / 2) - mx);
    const spd = CONFIG.enemyBullet.speed + this.tier * 0.2;
    const fire = (ang) => this.game.spawnEnemyBullet(
      mx, my, Math.cos(ang) * spd, Math.sin(ang) * spd,
      { color: CONFIG.colors.boss, width: 12, height: 12 });

    if (this.phase === 1) {
      fire(aimAngle);
      fire(aimAngle - 0.12); fire(aimAngle + 0.12);
    } else if (this.phase === 2) {
      for (let i = -2; i <= 2; i++) fire(aimAngle + i * 0.16);
    } else {
      const n = 12;
      for (let i = 0; i < n; i++) fire((i / n) * Math.PI * 2 + this.t * 0.001);
      fire(aimAngle); // plus an aimed shot
    }
    Sound.enemyShoot();
  }

  hit(damage, game) {
    if (this.dead || !this.vulnerable) return;
    this.lives -= damage;
    this.hitFlash = 60;
    if (this.lives <= 0) this.startDeath();
  }

  startDeath() {
    this.dead = true;
    this.vulnerable = false;
    this.deathTimer = 1400;
    this.game.shake(20, 600);
    Sound.bigExplode();
  }

  finishDeath() {
    this.alive = false;
    this.game.particles.explosion(this.x + this.width / 2, this.y + this.height / 2, '#fff', 60, 2.4);
    this.game.particles.explosion(this.x + this.width / 2, this.y + this.height / 2, CONFIG.colors.boss, 40, 2);
    this.game.onBossDefeated(this);
  }

  draw(c) {
    if (!this.alive) return;
    const s = CONFIG.sprites.boss;
    c.save();
    if (this.dead) c.globalAlpha = Utils.clamp(this.deathTimer / 1400 + 0.2, 0, 1);
    if (this.image && this.image.complete) {
      c.drawImage(this.image, this.frameX * s.frameW, this.frameY * s.frameH,
        s.frameW, s.frameH, this.x, this.y, this.width, this.height);
      if (this.hitFlash > 0) {
        c.globalAlpha = (this.hitFlash / 60) * 0.7;
        c.globalCompositeOperation = 'lighter';
        c.drawImage(this.image, this.frameX * s.frameW, this.frameY * s.frameH,
          s.frameW, s.frameH, this.x, this.y, this.width, this.height);
      }
    }
    c.restore();
  }

  // Drawn by the HUD: name + health bar pinned to the top of the screen.
  drawHealthBar(c) {
    if (this.dead) return;
    const w = CONFIG.WIDTH - 80;
    const x = 40, y = 86, h = 14;
    const pct = Utils.clamp(this.lives / this.maxLives, 0, 1);
    c.save();
    Utils.roundRect(c, x, y, w, h, 7);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fill();
    const grad = c.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, CONFIG.colors.boss);
    grad.addColorStop(1, CONFIG.colors.gold);
    Utils.roundRect(c, x, y, w * pct, h, 7);
    c.fillStyle = grad;
    c.shadowColor = CONFIG.colors.boss;
    c.shadowBlur = 12;
    c.fill();
    c.restore();
    Utils.text(c, `OVERLORD  ·  TIER ${this.tier}`, CONFIG.WIDTH / 2, y + 11, {
      size: 12, align: 'center', baseline: 'middle', color: '#fff', glow: 6,
    });
  }
}
