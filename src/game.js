/* =====================================================================
 * game.js — The orchestrator. Owns the state machine (menu / hangar /
 * playing / paused / gameover), all entity pools, collision resolution,
 * scoring & combos, wave + boss progression, hazards, drones, screen
 * shake, and the meta-progression hooks (credits via the Meta profile).
 * ===================================================================== */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.particles = new Particles();
    this.starfield = new Starfield(Assets.backgrounds);
    this.ui = new UI(this);
    this.hangar = new Hangar(this);
    this.player = new Player(this);
    this.beam = new Beam(this);

    // entity pools
    this.bullets = Array.from({ length: 72 }, () => new Bullet());
    this.enemyBullets = Array.from({ length: 160 }, () => new Bullet());
    this.powerups = Array.from({ length: 24 }, () => new PowerUp());

    this.waves = [];
    this.boss = null;
    this.drones = [];
    this.asteroids = [];
    this.hazardTimer = 0;
    this._minionQueue = [];

    this.state = 'menu';
    Sound.setMuted(Meta.muted);
    this.hiScore = Meta.hi;
    this.shakeX = 0; this.shakeY = 0; this.shakeMag = 0; this.shakeTime = 0; this.shakeDur = 1;

    this.banner = null;
    this.resetStats();
  }

  resetStats() {
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.bestCombo = 1;
    this.waveCount = 1;
    this.level = 1;
    this.bossesSlain = 0;
    this.victory = false;
    this.newHiScore = false;
    this.gameOverPending = false;
    this.deathTimer = 0;
    this.creditsEarned = 0;
  }

  _tempo() { return Math.min(1.6, 1 + this.level * 0.06); }

  // --- lifecycle ----------------------------------------------------------
  newGame() {
    Sound.init();
    Sound.resume();
    this.resetStats();
    this.particles.clear();
    this.waves = [];
    this.boss = null;
    this.asteroids = [];
    this._minionQueue = [];
    this.hazardTimer = CONFIG.hazard.spawnBase;
    this.bullets.forEach(b => b.free = true);
    this.enemyBullets.forEach(b => b.free = true);
    this.powerups.forEach(p => p.free = true);
    this.player.reset();
    // build drones granted by the hangar
    const dn = Meta.droneCount();
    this.drones = Array.from({ length: dn }, (_, i) => new Drone(this, i, dn));
    this.starfield.setBackground(0);
    this.state = 'playing';
    Sound.startMusic(1);
    this.startWaveOrBoss();
  }

  openHangar() { this.state = 'hangar'; this.hangar.open(); Sound.uiSelect(); }
  toMenu() { this.state = 'menu'; Sound.stopMusic(); }

  endGame() {
    this.state = 'gameover';
    Sound.stopMusic();
    Sound.gameOver();
    if (this.score > Meta.hi) { Meta.hi = this.score; this.newHiScore = true; }
    this.creditsEarned = Meta.award(this.score, this.waveCount, this.bossesSlain);
    this.hiScore = Meta.hi;
    Meta.save();
  }

  triggerGameOver() {
    if (this.gameOverPending) return;
    this.gameOverPending = true;
    this.deathTimer = 900;
    this.shake(18, 500);
  }

  loseByInvasion() {
    if (this.gameOverPending) return;
    this.player.alive = false;
    this.particles.explosion(this.player.x + this.player.width / 2,
      this.player.y + this.player.height / 2, CONFIG.colors.danger, 40, 1.8);
    Sound.playerHit();
    this.triggerGameOver();
  }

  // --- wave / boss spawning ----------------------------------------------
  startWaveOrBoss() {
    if (this.waveCount % CONFIG.wave.bossEvery === 0) {
      this.boss = new Boss(this, this.bossesSlain + 1);
      this.showBanner('WARNING', 'OVERLORD APPROACHES', CONFIG.colors.danger);
      Sound.bossAlarm();
    } else {
      const w = CONFIG.wave;
      const cols = Utils.clamp(w.baseCols + Math.floor((this.waveCount - 1) / 2), w.baseCols, w.maxCols);
      const rows = Utils.clamp(w.baseRows + Math.floor((this.waveCount - 1) / 4), w.baseRows, w.maxRows);
      const speed = w.baseSpeed + (this.waveCount - 1) * w.speedPerWave;
      const armor = Utils.clamp(0.12 + this.waveCount * 0.03, 0, 0.6);
      this.waves = [new Wave(this, cols, rows, speed, armor)];
      this.showBanner('WAVE ' + this.waveCount, null, CONFIG.colors.accent);
      Sound.waveStart();
    }
  }

  onBossDefeated(boss) {
    this.addScore(boss.score, boss.x + boss.width / 2, boss.y + boss.height / 2, true);
    this.bossesSlain++;
    this.boss = null;
    for (let i = 0; i < 4; i++)
      this.spawnPowerUp(boss.x + Utils.rand(0, boss.width), boss.y + Utils.rand(0, boss.height));
    this.spawnPowerUp(boss.x + boss.width / 2, boss.y + boss.height / 2, 'life');
    this.level++;
    this.starfield.setBackground(this.level - 1);
    Sound.startMusic(this._tempo());
    this.waveCount++;
    this.showBanner('LEVEL ' + this.level, 'SECTOR CLEARED', CONFIG.colors.good);
    this.startWaveOrBoss();
  }

  // --- scoring / combos ---------------------------------------------------
  addScore(base, x, y, big = false) {
    this.score += base;
    this.particles.popup(x, y - 12, '+' + Utils.commas(base),
      big ? CONFIG.colors.gold : '#fff', big ? 26 : 16);
  }

  onEnemyKilled(enemy, x, y) {
    this.combo = this.comboTimer > 0 ? Math.min(this.combo + 1, CONFIG.combo.max) : 1;
    this.comboTimer = CONFIG.combo.window;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    const gain = enemy.score * this.combo;
    this.score += gain;
    this.particles.popup(x, y - 10, '+' + gain,
      this.combo > 1 ? CONFIG.colors.gold : '#fff', this.combo > 1 ? 20 : 15);
    // elites always drop loot; everyone else rolls for it
    if (enemy.elite || Utils.chance(CONFIG.powerup.dropChance)) this.spawnPowerUp(x, y);
  }

  // Deferred minion spawn (Splitter death) — flushed after collisions.
  queueMinion(x, y, slotX, slotY) { this._minionQueue.push({ x, y, slotX, slotY }); }
  _flushMinions() {
    if (!this._minionQueue.length) return;
    const wave = this.waves[0];
    for (const m of this._minionQueue) {
      const e = new Beetlemorph(this, m.slotX, m.slotY);
      e.state = 'dive';
      e.x = m.x; e.y = m.y;
      e.diveT = 0;
      e.targetX = this.player.x + this.player.width / 2;
      e.vx = Utils.rand(-1.6, 1.6);
      e.vy = 1.3;
      if (wave) wave.enemies.push(e);
    }
    this._minionQueue.length = 0;
  }

  // --- power-ups ----------------------------------------------------------
  spawnPowerUp(x, y, forced) {
    const p = this.powerups.find(p => p.free);
    if (!p) return;
    let type = forced;
    if (!type) {
      const table = [
        ['rapid', 24], ['spread', 24], ['shield', 16],
        ['energy', 14], ['bomb', 12], ['life', 6],
      ];
      const total = table.reduce((s, t) => s + t[1], 0);
      let roll = Math.random() * total;
      for (const [t, w] of table) { roll -= w; if (roll <= 0) { type = t; break; } }
    }
    p.spawn(x - CONFIG.powerup.size / 2, y - CONFIG.powerup.size / 2, type);
  }

  smartBomb() {
    this.shake(18, 400);
    this.particles.explosion(CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2, '#fff', 50, 2.2);
    Sound.bigExplode();
    this.enemyBullets.forEach(b => b.free = true);
    for (const wave of this.waves)
      for (const e of wave.enemies)
        if (e.alive && e.state !== 'dying') e.hit(2, this);
    for (const a of this.asteroids) if (!a.dead) a.hit(2);
    if (this.boss && this.boss.vulnerable) this.boss.hit(15, this);
  }

  // --- bullet pools -------------------------------------------------------
  spawnBullet(cx, cy, vx, vy, opt = {}) {
    const b = this.bullets.find(b => b.free);
    if (!b) return;
    const w = opt.width || CONFIG.bullet.width;
    const h = opt.height || CONFIG.bullet.height;
    b.start(cx - w / 2, cy - h / 2, vx, vy, opt);
  }

  spawnEnemyBullet(cx, cy, vx, vy, opt = {}) {
    const b = this.enemyBullets.find(b => b.free);
    if (!b) return;
    const w = opt.width || CONFIG.enemyBullet.width;
    const h = opt.height || CONFIG.enemyBullet.height;
    b.start(cx - w / 2, cy - h / 2, vx, vy,
      { ...opt, width: w, height: h, friendly: false,
        damage: opt.damage ?? CONFIG.enemyBullet.damage });
  }

  // --- hazards ------------------------------------------------------------
  updateHazards(dt) {
    this.hazardTimer -= dt;
    if (this.hazardTimer <= 0) {
      const interval = Math.max(CONFIG.hazard.spawnMin, CONFIG.hazard.spawnBase - this.level * 350);
      this.hazardTimer = interval * Utils.rand(0.7, 1.3);
      // a bit calmer while a boss is on screen
      if (!this.boss || Utils.chance(0.5)) {
        const sizeKey = Utils.chance(0.6) ? 'big' : 'med';
        const x = Utils.rand(60, CONFIG.WIDTH - 60);
        this.asteroids.push(new Asteroid(this, x, -50, sizeKey));
      }
    }
    this.asteroids.forEach(a => a.update(dt));
    this.asteroids = this.asteroids.filter(a => !a.dead);
  }

  applyMagnet(dt) {
    const mr = Meta.magnetRadius();
    if (mr <= 0) return;
    const k = dt / CONFIG.STEP_MS;
    const px = this.player.x + this.player.width / 2;
    const py = this.player.y + this.player.height / 2;
    for (const p of this.powerups) {
      if (p.free) continue;
      const dx = px - (p.x + p.width / 2);
      const dy = py - (p.y + p.height / 2);
      const d = Math.hypot(dx, dy);
      if (d < mr && d > 1) {
        const sp = (5 * (1 - d / mr) + 1.5) * k;
        p.x += (dx / d) * sp;
        p.y += (dy / d) * sp;
      }
    }
  }

  // --- screen shake -------------------------------------------------------
  shake(mag, dur) {
    if (mag >= this.shakeMag || this.shakeTime <= 0) this.shakeMag = mag;
    this.shakeTime = Math.max(this.shakeTime, dur);
    this.shakeDur = Math.max(this.shakeDur, dur);
  }

  showBanner(title, sub, color) {
    this.banner = { title, sub, color, time: 0, duration: 1700 };
  }

  // --- main update --------------------------------------------------------
  update(dt) {
    this.handleInput();
    this.starfield.update(dt);
    this.particles.update(dt);
    this.updateShake(dt);

    if (this.state === 'hangar') this.hangar.update(dt);
    if (this.state !== 'playing') return;

    this.player.update(dt);
    this.beam.update(dt);
    this.drones.forEach(d => d.update(dt));
    this.bullets.forEach(b => b.update(dt));
    this.enemyBullets.forEach(b => b.update(dt));
    this.powerups.forEach(p => p.update(dt));
    this.applyMagnet(dt);
    this.waves.forEach(w => w.update(dt));
    if (this.boss) this.boss.update(dt);
    this.updateHazards(dt);

    this.resolveCollisions();
    this._flushMinions();

    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.combo = 0; }
    if (this.banner) { this.banner.time += dt; if (this.banner.time > this.banner.duration) this.banner = null; }

    if (!this.boss && this.waves.length && this.waves[0].complete) {
      this.waves = [];
      this.waveCount++;
      this.startWaveOrBoss();
    }

    if (!this.player.alive) this.triggerGameOver();
    if (this.gameOverPending) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.endGame();
    }
  }

  resolveCollisions() {
    // player/drone bullets -> enemies / boss / asteroids
    for (const b of this.bullets) {
      if (b.free || !b.friendly) continue;
      let hit = false;
      for (const wave of this.waves) {
        for (const e of wave.enemies) {
          if (e.alive && e.state !== 'dying' && Utils.aabb(b, e)) {
            e.hit(b.damage, this);
            this.particles.sparks(b.x + b.width / 2, b.y, e.color, -Math.PI / 2, 5);
            Sound.hit();
            b.free = true; hit = true; break;
          }
        }
        if (hit) break;
      }
      if (hit) continue;
      if (this.boss && this.boss.vulnerable && Utils.aabb(b, this.boss)) {
        this.boss.hit(b.damage, this);
        this.particles.sparks(b.x + b.width / 2, b.y, CONFIG.colors.boss, -Math.PI / 2, 5);
        Sound.hit();
        b.free = true;
        continue;
      }
      for (const a of this.asteroids) {
        if (!a.dead && Utils.aabb(b, a)) { a.hit(b.damage); b.free = true; break; }
      }
    }

    // enemy bullets -> player
    for (const b of this.enemyBullets) {
      if (b.free) continue;
      if (this.player.alive && Utils.aabb(b, this.player)) {
        b.free = true;
        this.player.takeHit();
      }
    }

    // asteroids -> player (ramming)
    if (this.player.alive) {
      for (const a of this.asteroids) {
        if (!a.dead && Utils.aabb(this.player, a)) {
          this.player.takeHit();
          a.shatter(false);
          break;
        }
      }
    }

    // power-ups -> player
    for (const p of this.powerups) {
      if (p.free) continue;
      if (this.player.alive && Utils.aabb(p, this.player)) {
        const def = POWERUP_TYPES[p.type];
        this.player.applyPowerUp(p.type);
        this.particles.popup(p.x + p.width / 2, p.y, def.label, def.color, 16);
        this.particles.explosion(p.x + p.width / 2, p.y + p.height / 2, def.color, 12, 0.8);
        p.free = true;
      }
    }
  }

  updateShake(dt) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const m = this.shakeMag * Utils.clamp(this.shakeTime / this.shakeDur, 0, 1);
      this.shakeX = Utils.rand(-1, 1) * m;
      this.shakeY = Utils.rand(-1, 1) * m;
    } else {
      this.shakeX = this.shakeY = 0;
      this.shakeMag = 0;
    }
  }

  // --- input / state transitions -----------------------------------------
  handleInput() {
    const i = this.input;
    const clicked = i.pointer.clicked;

    if (i.wasPressed('m')) { Sound.init(); Sound.setMuted(!Sound.muted); Meta.muted = Sound.muted; }

    switch (this.state) {
      case 'menu':
        if (i.wasPressed('Enter') || clicked) { Sound.init(); Sound.uiSelect(); this.newGame(); }
        else if (i.wasPressed('h')) { Sound.init(); this.openHangar(); }
        break;
      case 'hangar':
        this.hangar.handleInput(i);
        break;
      case 'playing':
        if (i.wasPressed('Escape', 'p')) { this.state = 'paused'; Sound.stopMusic(); Sound.uiSelect(); }
        break;
      case 'paused':
        if (i.wasPressed('Escape', 'p')) { this.state = 'playing'; Sound.startMusic(this._tempo()); }
        else if (i.wasPressed('q')) this.toMenu();
        break;
      case 'gameover':
        if (i.wasPressed('Enter') || clicked) { Sound.uiSelect(); this.newGame(); }
        else if (i.wasPressed('h')) this.openHangar();
        else if (i.wasPressed('q')) this.toMenu();
        break;
    }

    this.input.consumePressed();
  }

  // --- rendering ----------------------------------------------------------
  draw(c) {
    this.starfield.draw(c);

    const worldVisible = this.state !== 'menu' && this.state !== 'hangar';
    if (worldVisible) {
      c.save();
      c.translate(this.shakeX, this.shakeY);
      this.drawWorld(c);
      c.restore();
    }

    if (this.state === 'menu') {
      this.ui.drawMenu(c);
    } else if (this.state === 'hangar') {
      this.hangar.draw(c);
    } else {
      this.ui.drawHUD(c);
      if (this.banner) {
        const b = this.banner, d = b.duration;
        let a = 1;
        if (b.time < 300) a = b.time / 300;
        else if (b.time > d - 450) a = Math.max(0, (d - b.time) / 450);
        this.ui.drawBanner(c, b.title, b.sub, a, b.color);
      }
      if (this.state === 'paused') this.ui.drawPause(c);
      if (this.state === 'gameover') this.ui.drawGameOver(c);
    }
  }

  drawWorld(c) {
    this.powerups.forEach(p => p.draw(c));
    this.enemyBullets.forEach(b => b.draw(c));
    this.asteroids.forEach(a => a.draw(c));
    this.waves.forEach(w => w.draw(c));
    if (this.boss) this.boss.draw(c);
    this.bullets.forEach(b => b.draw(c));
    this.beam.draw(c);
    this.drones.forEach(d => d.draw(c));
    this.player.draw(c);
    this.particles.draw(c);
  }
}
