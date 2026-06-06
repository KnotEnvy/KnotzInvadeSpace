/* =====================================================================
 * player.js — The player ship: movement with banking jets, primary fire
 * (with rapid/spread modifiers), energy for the beam, shield, lives and
 * invulnerability frames.
 * ===================================================================== */

class Player {
  constructor(game) {
    this.game = game;
    this.cfg = CONFIG.player;
    this.width = this.cfg.width;
    this.height = this.cfg.height;
    this.reset();
    this.image = Assets.img.player;
    this.jets = Assets.img.playerJets;
  }

  reset() {
    this.x = CONFIG.WIDTH / 2 - this.width / 2;
    this.y = CONFIG.HEIGHT - this.height - 24;
    // Apply persistent hangar upgrades for this run.
    this.maxLives = Meta.maxLives();
    this.lives = Meta.startLives();
    // Daily 'glass cannon' modifier can override starting lives.
    const dm = this.game.dailyMods;
    if (this.game.mode === 'daily' && dm && dm.startLives != null) this.lives = dm.startLives;
    this.speed = this.cfg.speed * Meta.speedMul();
    this.maxEnergy = this.cfg.maxEnergy * Meta.energyMul();
    this.energyRegen = this.cfg.energyRegen * Meta.regenMul();
    this.fireMul = Meta.fireMul();
    this.twin = Meta.twin();
    this.energy = this.maxEnergy;
    this.cooldown = false;
    this.fireTimer = 0;
    this.jetFrame = 1;
    this.firePose = 'idle';
    this.alive = true;
    this.invuln = 0;
    this.shield = Meta.startShield();
    this.rapidTimer = 0;
    this.spreadTimer = 0;
    this.bankVel = 0;
  }

  get rapid() { return this.rapidTimer > 0; }
  get spread() { return this.spreadTimer > 0; }

  update(dt) {
    if (!this.alive) return;
    const k = dt / CONFIG.STEP_MS;
    const input = this.game.input;

    // --- horizontal movement (keyboard, or follow pointer when dragging) ---
    let dir = 0;
    if (input.left) dir -= 1;
    if (input.right) dir += 1;
    if (input.pointer.active && !input.left && !input.right) {
      const target = input.pointer.x - this.width / 2;
      const diff = target - this.x;
      if (Math.abs(diff) > 4) dir = Utils.clamp(diff / 40, -1, 1);
    }
    this.x += dir * this.speed * k;
    this.bankVel = Utils.lerp(this.bankVel, dir, 0.2);

    // jet/banking frame
    if (dir < -0.1) this.jetFrame = 0;
    else if (dir > 0.1) this.jetFrame = 2;
    else this.jetFrame = 1;

    // keep on screen
    this.x = Utils.clamp(this.x, -this.width * 0.15, CONFIG.WIDTH - this.width * 0.85);

    // --- energy regen / cooldown gate for the beam ---
    if (this.energy < this.maxEnergy) this.energy += this.energyRegen * dt / 1000;
    this.energy = Math.min(this.energy, this.maxEnergy);
    if (this.energy < 1) this.cooldown = true;
    else if (this.energy > this.maxEnergy * 0.25) this.cooldown = false;

    // --- timers ---
    if (this.invuln > 0) this.invuln -= dt;
    if (this.rapidTimer > 0) this.rapidTimer -= dt;
    if (this.spreadTimer > 0) this.spreadTimer -= dt;
    if (this.fireTimer > 0) this.fireTimer -= dt;

    // --- firing ---
    this.firePose = 'idle';
    if (this.game.beam.active) {
      this.firePose = 'beam';
    } else if (input.fire && this.fireTimer <= 0) {
      this.shoot();
      this.fireTimer = (this.rapid ? this.cfg.rapidCooldown : this.cfg.fireCooldown) * this.fireMul;
    }

    // thruster particles
    if (Utils.chance(0.8)) {
      this.game.particles.thruster(
        this.x + this.width * 0.32 + Utils.rand(-4, 4), this.y + this.height - 6, '#7fd8ff');
      this.game.particles.thruster(
        this.x + this.width * 0.68 + Utils.rand(-4, 4), this.y + this.height - 6, '#7fd8ff');
    }
  }

  shoot() {
    const muzzleX = this.x + this.width / 2;
    const muzzleY = this.y + 6;
    const speed = CONFIG.bullet.speed;
    const dmg = CONFIG.bullet.damage * this.game.playerDamageMul();
    const col = this.rapid ? CONFIG.colors.accent : CONFIG.colors.gold;
    if (this.spread) {
      for (const ang of [-0.18, 0, 0.18]) {
        this.game.spawnBullet(muzzleX, muzzleY,
          Math.sin(ang) * speed, -Math.cos(ang) * speed,
          { friendly: true, color: CONFIG.colors.good, damage: dmg });
      }
    } else if (this.twin) {
      this.game.spawnBullet(muzzleX - 12, muzzleY, 0, -speed, { friendly: true, color: col, damage: dmg });
      this.game.spawnBullet(muzzleX + 12, muzzleY, 0, -speed, { friendly: true, color: col, damage: dmg });
    } else {
      this.game.spawnBullet(muzzleX, muzzleY, 0, -speed, { friendly: true, color: col, damage: dmg });
    }
    this.firePose = 'fire';
    this.game.particles.muzzle(muzzleX, muzzleY, this.rapid ? CONFIG.colors.accent : CONFIG.colors.gold);
    Sound.shoot();
  }

  // Returns true if the hit was absorbed (shield) / ignored (i-frames).
  takeHit() {
    if (this.invuln > 0 || !this.alive) return true;
    this.game.bossHitless = false;   // breaks the "Untouchable" boss streak
    if (this.shield > 0) {
      this.shield--;
      this.invuln = 600;
      this.game.particles.explosion(this.x + this.width / 2, this.y + this.height / 2,
        CONFIG.colors.accent2, 18);
      this.game.shake(8, 200);
      Sound.hit();
      return true;
    }
    this.lives--;
    this.invuln = this.cfg.invulnTime;
    this.energy = this.maxEnergy; // small mercy: refill beam on death
    this.game.particles.explosion(this.x + this.width / 2, this.y + this.height / 2,
      CONFIG.colors.danger, 30, 1.4);
    this.game.shake(16, 360);
    Sound.playerHit();
    if (this.lives <= 0) {
      this.alive = false;
      this.game.particles.explosion(this.x + this.width / 2, this.y + this.height / 2, '#fff', 40, 1.8);
    }
    return false;
  }

  applyPowerUp(type) {
    switch (type) {
      case 'rapid':  this.rapidTimer = CONFIG.powerup.duration; break;
      case 'spread': this.spreadTimer = CONFIG.powerup.duration; break;
      case 'shield': this.shield = CONFIG.powerup.shieldHits; break;
      case 'energy': this.energy = this.maxEnergy; break;
      case 'life':
        if (this.lives < this.maxLives) this.lives++;
        Sound.extraLife();
        return;
      case 'bomb':   this.game.smartBomb(); break;
    }
    Sound.powerup();
  }

  draw(c) {
    if (!this.alive) return;
    // Blink during invulnerability.
    if (this.invuln > 0 && Math.floor(this.invuln / 80) % 2 === 0) return;

    const sw = CONFIG.sprites.player.frameW;
    const sh = CONFIG.sprites.player.frameH;
    let frame = 0;
    if (this.firePose === 'fire') frame = 1;
    else if (this.firePose === 'beam') frame = 3;

    c.save();
    // subtle bank tilt based on movement
    const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
    c.translate(cx, cy);
    c.rotate(this.bankVel * 0.12);
    c.translate(-cx, -cy);

    if (this.jets && this.jets.complete)
      c.drawImage(this.jets, this.jetFrame * sw, 0, sw, sh, this.x, this.y, this.width, this.height);
    if (this.image && this.image.complete)
      c.drawImage(this.image, frame * sw, 0, sw, sh, this.x, this.y, this.width, this.height);
    c.restore();

    // shield bubble
    if (this.shield > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = CONFIG.colors.accent2;
      c.lineWidth = 2.5;
      c.globalAlpha = 0.5 + 0.3 * Math.sin(Date.now() / 120);
      c.shadowColor = CONFIG.colors.accent2;
      c.shadowBlur = 16;
      c.beginPath();
      c.arc(cx, cy, this.width * 0.62, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }
  }
}
