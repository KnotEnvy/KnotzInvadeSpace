/* =====================================================================
 * enemy.js — Enemy base class plus Beetlemorph (fast/weak) and
 * Rhinomorph (armored, shows damage states). Enemies live in a formation
 * but can break off to dive-bomb the player (Galaga style), then loop
 * back around to rejoin their slot.
 * ===================================================================== */

class Enemy {
  constructor(game, slotX, slotY) {
    this.game = game;
    this.slotX = slotX;          // offset within the wave grid
    this.slotY = slotY;
    this.width = CONFIG.enemy.size;
    this.height = CONFIG.enemy.size;
    this.x = slotX;
    this.y = slotY;
    this.alive = true;
    this.state = 'formation';    // 'formation' | 'dive' | 'return' | 'dying'
    this.hitFlash = 0;
    this.frameY = Utils.randInt(0, 3); // colour variant row
    this.frameX = 0;
    this.anim = 0;
    this.diveT = 0;
    this.targetX = 0;
    this.vx = 0;
    this.vy = 0;
    this.deathTimer = 0;
    this.scale = 1;
    this.elite = false;
    this.diveUrge = 0;       // autonomous dive tendency (Stingers use this)
  }

  // Promote any enemy into a tougher, glowing "elite" worth more.
  makeElite() {
    this.elite = true;
    this.lives = Math.ceil(this.lives * CONFIG.elite.hpMul);
    this.maxLives = this.lives;
    this.score = Math.round(this.score * CONFIG.elite.scoreMul);
    this.width *= CONFIG.elite.scale;
    this.height *= CONFIG.elite.scale;
  }

  // Absolute formation slot in world space (wave position + grid offset).
  formationPos(waveX, waveY) {
    return { x: waveX + this.slotX, y: waveY + this.slotY };
  }

  startDive(player) {
    this.state = 'dive';
    this.diveT = 0;
    this.targetX = player.x + player.width / 2;
    this.vx = Utils.rand(-1, 1);
    this.vy = 1.5;
  }

  update(dt, waveX, waveY) {
    const k = dt / CONFIG.STEP_MS;
    this.anim += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;

    if (this.state === 'dying') {
      this.deathTimer -= dt;
      this.scale = Utils.lerp(this.scale, 1.8, 0.25);
      if (this.deathTimer <= 0) this.alive = false;
      return;
    }

    const slot = this.formationPos(waveX, waveY);

    if (this.state === 'formation') {
      this.x = slot.x;
      this.y = slot.y;
      // idle wing-flap animation (frames 0 <-> 1)
      this.frameX = (Math.floor(this.anim / 320) % 2 === 0) ? 0 : 1;
      if (this.diveUrge && this.game.player.alive &&
          Utils.chance(this.diveUrge * k)) this.startDive(this.game.player);

    } else if (this.state === 'dive') {
      this.diveT += dt;
      // steer horizontally toward the captured target with a sine wobble
      const wob = Math.sin(this.diveT / 200) * 2.2;
      const steer = Utils.clamp((this.targetX - (this.x + this.width / 2)) / 60, -1.5, 1.5);
      this.vx = Utils.lerp(this.vx, steer + wob, 0.05);
      this.vy = Math.min(this.vy + 0.05 * k, 6);
      this.x += this.vx * k;
      this.y += this.vy * k;
      this.frameX = (Math.floor(this.anim / 120) % 2 === 0) ? 0 : 1;
      // dive shooting
      if (Utils.chance(0.004 * k)) this.shoot(true);
      // looped off the bottom -> re-enter from the top heading for the slot
      if (this.y > CONFIG.HEIGHT + this.height) {
        this.y = -this.height;
        this.x = Utils.clamp(slot.x, 0, CONFIG.WIDTH - this.width);
        this.state = 'return';
      }

    } else if (this.state === 'return') {
      this.x = Utils.lerp(this.x, slot.x, 0.06 * k);
      this.y = Utils.lerp(this.y, slot.y, 0.06 * k);
      this.frameX = (Math.floor(this.anim / 200) % 2 === 0) ? 0 : 1;
      if (Utils.dist(this.x, this.y, slot.x, slot.y) < 6) this.state = 'formation';
    }

    // body collision with the player
    if (this.alive && this.state !== 'dying' &&
        this.game.player.alive && Utils.aabb(this, this.game.player)) {
      const absorbed = this.game.player.takeHit();
      this.kill(false);
      if (absorbed) { /* shield ate it */ }
    }
  }

  shoot() {
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height;
    this.game.spawnEnemyBullet(cx, cy, 0, CONFIG.enemyBullet.speed, {
      color: CONFIG.colors.danger,
    });
    Sound.enemyShoot();
  }

  hit(damage, game) {
    if (this.state === 'dying') return;
    this.lives -= damage;
    this.hitFlash = 90;
    this.onDamage();
    if (this.lives <= 0) this.kill(true, game);
  }

  onDamage() { /* overridden by Rhinomorph for damage frames */ }

  // dropped=true means it was destroyed by the player (awards score / loot)
  kill(dropped, game) {
    if (this.state === 'dying') return;
    this.state = 'dying';
    this.deathTimer = 220;
    const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
    this.game.particles.explosion(cx, cy, this.color, 20, 1);
    Sound.explode();
    this.game.shake(5, 120);
    if (dropped && game) {
      game.onEnemyKilled(this, cx, cy);
    }
  }

  draw(c) {
    if (!this.alive) return;
    // pulsing elite aura behind the sprite
    if (this.elite && this.state !== 'dying') {
      const t = 0.5 + 0.5 * Math.sin(this.anim / 180);
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.3 + 0.25 * t;
      c.fillStyle = this.color;
      c.shadowColor = this.color;
      c.shadowBlur = 22;
      c.beginPath();
      c.arc(this.x + this.width / 2, this.y + this.height / 2, this.width * 0.62, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    const s = CONFIG.sprites[this.spriteKey];
    c.save();
    if (this.state === 'dying') {
      c.globalAlpha = Utils.clamp(this.deathTimer / 220, 0, 1);
      const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
      c.translate(cx, cy);
      c.scale(this.scale, this.scale);
      c.translate(-cx, -cy);
    }
    if (this.image && this.image.complete) {
      c.drawImage(this.image, this.frameX * s.frameW, this.frameY * s.frameH,
        s.frameW, s.frameH, this.x, this.y, this.width, this.height);
    }
    // white hit-flash overlay
    if (this.hitFlash > 0 && this.image && this.image.complete) {
      c.globalAlpha = (this.hitFlash / 90) * 0.8;
      c.globalCompositeOperation = 'lighter';
      c.drawImage(this.image, this.frameX * s.frameW, this.frameY * s.frameH,
        s.frameW, s.frameH, this.x, this.y, this.width, this.height);
    }
    c.restore();
  }
}

class Beetlemorph extends Enemy {
  constructor(game, slotX, slotY) {
    super(game, slotX, slotY);
    this.spriteKey = 'beetlemorph';
    this.image = Assets.img.beetlemorph;
    this.lives = 1;
    this.maxLives = 1;
    this.score = 100;
    this.color = CONFIG.colors.beetle;
  }
}

class Rhinomorph extends Enemy {
  constructor(game, slotX, slotY) {
    super(game, slotX, slotY);
    this.spriteKey = 'rhinomorph';
    this.image = Assets.img.rhinomorph;
    this.lives = 4;
    this.maxLives = 4;
    this.score = 250;
    this.color = CONFIG.colors.rhino;
  }
  onDamage() {
    // Show progressive damage frames (0 = pristine ... toward cracked).
    const dmg = this.maxLives - Math.max(0, Math.floor(this.lives));
    this.frameX = Utils.clamp(dmg, 0, 3);
  }
  // Rhino keeps its damage frame instead of the wing-flap animation.
  update(dt, waveX, waveY) {
    super.update(dt, waveX, waveY);
    if (this.state !== 'dying' && this.maxLives - this.lives > 0) {
      this.frameX = Utils.clamp(this.maxLives - Math.floor(this.lives), 0, 3);
    }
  }
}

// Stinger — a small, fast, hyper-aggressive diver. Uses the Beetlemorph
// sheet (different colour row) but breaks formation on its own far more often.
class Stinger extends Beetlemorph {
  constructor(game, slotX, slotY) {
    super(game, slotX, slotY);
    const s = CONFIG.stinger;
    this.score = s.score;
    this.frameY = s.frameY;
    this.color = CONFIG.colors.good;
    this.width *= s.scale;
    this.height *= s.scale;
    this.speedMul = s.speedMul;
    this.diveUrge = CONFIG.enemy.diveChance * s.diveMul;
  }
  startDive(player) {
    super.startDive(player);
    this.vy *= this.speedMul;
  }
}

// Splitter — an armored alien that bursts into a pair of diving minions
// when destroyed. Uses the Rhinomorph sheet (distinct colour row).
class Splitter extends Enemy {
  constructor(game, slotX, slotY) {
    super(game, slotX, slotY);
    this.spriteKey = 'rhinomorph';
    this.image = Assets.img.rhinomorph;
    const s = CONFIG.splitter;
    this.lives = s.lives;
    this.maxLives = s.lives;
    this.score = s.score;
    this.frameY = s.frameY;
    this.minions = s.minions;
    this.color = CONFIG.colors.rhino;
  }
  onDamage() {
    const dmg = this.maxLives - Math.max(0, Math.floor(this.lives));
    this.frameX = Utils.clamp(dmg, 0, 3);
  }
  update(dt, waveX, waveY) {
    super.update(dt, waveX, waveY);
    if (this.state !== 'dying' && this.maxLives - this.lives > 0) {
      this.frameX = Utils.clamp(this.maxLives - Math.floor(this.lives), 0, 3);
    }
  }
  kill(dropped, game) {
    if (this.state === 'dying') return;
    // Queue minions (deferred so we don't mutate the list mid-collision).
    if (dropped && game) {
      for (let i = 0; i < this.minions; i++) {
        game.queueMinion(this.x + (i ? this.width * 0.4 : -this.width * 0.4),
          this.y, this.slotX, this.slotY);
      }
    }
    super.kill(dropped, game);
  }
}
