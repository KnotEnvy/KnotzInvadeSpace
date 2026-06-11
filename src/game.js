/* =====================================================================
 * game.js — The orchestrator. Owns the state machine (menu / hangar /
 * playing / paused / gameover), all entity pools, collision resolution,
 * scoring & combos, wave + boss progression, hazards, drones, screen
 * shake, and the meta-progression hooks (credits via the Meta profile).
 * ===================================================================== */

// Subtle per-sector colour grade (high tier only) — a translucent mood wash
// keyed to the active backdrop so each sector feels distinct.
const SECTOR_TINTS = [
  'rgba(40,80,165,0.10)',   'rgba(120,60,165,0.10)', 'rgba(165,95,45,0.10)',
  'rgba(40,150,125,0.10)',  'rgba(155,45,75,0.10)',  'rgba(55,105,185,0.10)',
  'rgba(120,140,45,0.10)',  'rgba(95,45,155,0.10)',  'rgba(40,130,160,0.12)',
  'rgba(150,70,125,0.10)',
];

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.input = new Input(canvas);
    this.particles = new Particles();
    this.starfield = new Starfield(Assets.backgrounds);
    this.ui = new UI(this);
    this.hangar = new Hangar(this);
    this.settings = new SettingsMenu(this);
    // Game mode + run modifiers (read by Player.reset / Wave / spawning).
    this.mode = 'campaign';
    this.menuMode = 0;             // highlighted mode chip on the menu
    this.dailyMods = Daily.neutral();
    this.dailyKey = null;
    this.bossHitless = false;
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
    this.asteroidPool = [];          // recycled (dead) Asteroid instances
    this.enemyPools = new Map();     // ctor -> array of recycled enemy instances
    this.hazardTimer = 0;
    this._minionQueue = [];

    this.state = 'menu';
    this.settingsReturn = 'menu';
    this.achReturn = 'menu';
    Sound.setMuted(Meta.muted);
    Meta.applySettings();          // push saved volume sliders onto the audio bus
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
    this.newDailyBest = false;
    this.gameOverPending = false;
    this.deathTimer = 0;
    this.creditsEarned = 0;
    this.freezeTimer = 0;   // hit-stop (real-time; skips sim steps, see update)
    this.punch = 0;         // brief zoom-in punch on big impacts
    // campaign (story mode) flow
    this.sector = 1;          // current campaign sector (1-based)
    this.sectorWave = 0;      // waves started within the sector (0 = none yet)
    this.warpTimer = 0;       // post-boss loot window before the next jump
    this.nextWaveTimer = 0;   // breather between waves / pre-boss beat
    this.pendingSector = 0;   // sector queued behind the dock screen
    this.briefT = 0;          // briefing typewriter clock
    this.briefRevealed = false; // set by UI.drawBriefing once all text is out
    this.comms = [];          // queued {who,text,t,dur} comm messages
    this.flashT = 0;          // warp-arrival screen flash
    this.flashDur = 1;
    // mid-run credit banking (campaign docks pay out per sector)
    this._bankScore = 0;
    this._bankWaves = 0;
    this._bankBosses = 0;
    this.lastBank = 0;        // most recent dock payout (shown on the dock)
  }

  _tempo() { return Math.min(1.6, 1 + this.level * 0.06); }

  // --- run-modifier helpers (mode/daily aware) ----------------------------
  aggroMul() {
    if (this.mode === 'daily') return this.dailyMods.aggroMul;
    if (this.mode === 'campaign') return Campaign.sector(this.sector).aggro || 1;
    return 1;
  }
  playerDamageMul() { return this.mode === 'daily' ? this.dailyMods.playerDamageMul : 1; }
  bossEvery()       { return this.mode === 'daily' ? this.dailyMods.bossEvery : CONFIG.wave.bossEvery; }
  // Seeded composition RNG for the Daily Challenge; plain random otherwise.
  waveRng() {
    if (this.mode !== 'daily' || !this.dailyKey) return Math.random;
    return Utils.makeRng(Daily.waveSeed(this.dailyKey, this.waveCount));
  }

  // --- lifecycle ----------------------------------------------------------
  newGame(mode) {
    if (mode) this.mode = mode;
    Sound.init();
    Sound.resume();
    this.resetStats();
    // Resolve run modifiers for the chosen mode.
    this.dailyMods = Daily.neutral();
    this.dailyKey = null;
    if (this.mode === 'daily') {
      const d = Daily.today();
      this.dailyKey = d.key;
      this.dailyMods = d.agg;
    }
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
    if (this.mode === 'campaign') {
      // The campaign opens on a sector briefing, not straight into combat.
      this.enterSector(1);
    } else {
      this.starfield.setBackground(0);
      this.state = 'playing';
      Sound.startMusic(1);
      this.startWaveOrBoss();
    }
  }

  // --- campaign (story mode) -----------------------------------------------
  // Arrive in sector n: clear the battlefield (nothing survives a jump), swap
  // the backdrop, and open the briefing interstitial. The starfield streaks
  // into warp while the briefing is up; launchSector() drops out of warp and
  // starts the sector's first scripted wave.
  enterSector(n) {
    this.sector = n;
    this.sectorWave = 0;
    this.warpTimer = 0;
    this.level = n;                       // music tempo + sector colour grade
    this.comms.length = 0;
    this.banner = null;
    this.bullets.forEach(b => b.free = true);
    this.enemyBullets.forEach(b => b.free = true);
    this.powerups.forEach(p => p.free = true);
    Utils.compactRelease(this.asteroids, this.asteroidPool, () => true);
    this.waves = [];
    this.boss = null;
    this._minionQueue.length = 0;
    this.nextWaveTimer = 0;
    this.hazardTimer = CONFIG.hazard.spawnBase;
    this.starfield.setBackground(Campaign.sector(n).bg);
    this.briefT = 0;
    this.briefRevealed = false;
    this.state = 'briefing';
    Sound.stopMusic();
  }

  launchSector() {
    this.state = 'playing';
    this.screenFlash(320);             // drop out of warp
    Sound.startMusic(this._tempo());
    this.startWaveOrBoss();
  }

  // Dock with the UES Orion between sectors: bank the sector's credit payout,
  // run field repairs, and open the Hangar as a mid-run refit bay. DEPART
  // hands off to the next sector's briefing.
  enterDock(nextSector) {
    this.pendingSector = nextSector;
    this.bankCampaignCredits();
    this.player.refit();               // field repairs on arrival
    this.comms.length = 0;
    this.banner = null;
    this.nextWaveTimer = 0;
    this.state = 'dock';
    this.hangar.open({ docked: true });
    Sound.stopMusic();
    Sound.uiSelect();
  }

  departDock() {
    this.player.refit();               // apply anything bought while docked
    const dn = Meta.droneCount();      // wingmen may have been purchased
    this.drones = Array.from({ length: dn }, (_, i) => new Drone(this, i, dn));
    this.enterSector(this.pendingSector);
  }

  // Pay out credits for everything earned since the last bank. Campaign docks
  // call this per sector (so there's something to SPEND mid-run); endGame
  // banks the remainder, so a run never pays the same stats twice.
  bankCampaignCredits() {
    this.lastBank = Meta.award(this.score - this._bankScore,
      this.waveCount - this._bankWaves, this.bossesSlain - this._bankBosses);
    this._bankScore = this.score;
    this._bankWaves = this.waveCount;
    this._bankBosses = this.bossesSlain;
    this.creditsEarned += this.lastBank;
    Ach.onCredits();
    return this.lastBank;
  }

  // Queue a story comm line ({who, text}); the HUD shows one at a time.
  say(line) {
    if (!line) return;
    this.comms.push({ who: line.who, text: line.text, t: 0,
      dur: 2600 + line.text.length * 28 });
  }

  openHangar() { this.state = 'hangar'; this.hangar.open(); Sound.uiSelect(); }
  toMenu() { this.state = 'menu'; Sound.stopMusic(); }

  // Settings can be opened from menu / pause / game-over; "back" returns there.
  openSettings(from) { this.settingsReturn = from || 'menu'; this.state = 'settings'; this.settings.open(); Sound.uiSelect(); }
  closeSettings() { this.state = this.settingsReturn || 'menu'; Sound.uiSelect(); }

  // Read-only achievements viewer, openable from menu / game-over.
  openAchievements(from) { this.achReturn = from || 'menu'; this.state = 'achievements'; Sound.uiSelect(); }
  closeAchievements() { this.state = this.achReturn || 'menu'; Sound.uiSelect(); }

  endGame() {
    this.state = 'gameover';
    this.ui.goT = 0;          // restart the victory-epilogue fade-in
    Sound.stopMusic();
    if (this.victory) Sound.extraLife(); else Sound.gameOver();
    if (this.score > Meta.hi) { Meta.hi = this.score; this.newHiScore = true; }
    // Campaign credits bank per sector at the docks; settle the remainder.
    if (this.mode === 'campaign') {
      this.bankCampaignCredits();
    } else {
      const creditMul = this.mode === 'daily' ? this.dailyMods.creditMul : 1;
      this.creditsEarned = Meta.award(this.score, this.waveCount, this.bossesSlain, creditMul);
    }
    this.hiScore = Meta.hi;
    // Daily-challenge bookkeeping + run-end achievements.
    if (this.mode === 'daily' && this.dailyKey) {
      this.newDailyBest = Meta.setDailyBest(this.dailyKey, this.score);
      Ach.onDailyComplete();
    }
    Ach.onScore(this.score);
    Ach.onCredits();
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
    Ach.onWave(this.waveCount);
    if (this.mode === 'campaign') { this.startCampaignWave(); return; }
    if (this.waveCount % this.bossEvery() === 0) {
      const tier = this.bossesSlain + 1;
      this.boss = new Boss(this, tier);
      this.bossHitless = true;     // track the "Untouchable" streak for this fight
      this.showBanner('WARNING', this.boss.def.name + ' APPROACHES', CONFIG.colors.danger);
      Sound.bossAlarm();
    } else {
      const w = CONFIG.wave;
      const cols = Utils.clamp(w.baseCols + Math.floor((this.waveCount - 1) / 2) + this.dailyMods.extraCols, w.baseCols, w.maxCols + 1);
      const rows = Utils.clamp(w.baseRows + Math.floor((this.waveCount - 1) / 4) + this.dailyMods.extraRows, w.baseRows, w.maxRows + 1);
      const baseSpeed = Math.min(w.baseSpeed + (this.waveCount - 1) * w.speedPerWave, w.maxSpeed);
      const speed = baseSpeed * Meta.diffMods().enemySpeedMul;
      const armor = Utils.clamp(0.12 + this.waveCount * 0.03, 0, 0.6);
      this.waves = [new Wave(this, cols, rows, speed, armor, this.waveRng())];
      this.showBanner('WAVE ' + this.waveCount, null, CONFIG.colors.accent);
      Sound.waveStart();
      this.maybeSpawnMiniBoss();
    }
  }

  // Campaign sectors are scripted, not formula-rolled: each wave comes from
  // the sector's authored descriptor list (composition, size, speed, optional
  // mini-boss escort + comm line), and the sector ends with its named boss.
  startCampaignWave() {
    const def = Campaign.sector(this.sector);
    this.sectorWave++;
    if (this.sectorWave > def.waves.length) {
      const bdef = Campaign.bossFor(def);
      this.boss = new Boss(this, this.sector, { def: bdef });
      this.bossHitless = true;
      this.showBanner(bdef.final ? 'FINAL BOSS' : 'SECTOR BOSS',
        bdef.name + ' APPROACHES', CONFIG.colors.danger, 2300);
      Sound.bossAlarm();
      return;
    }
    const wd = def.waves[this.sectorWave - 1];
    const speed = wd.speed * Meta.diffMods().enemySpeedMul;
    this.waves = [new Wave(this, wd.cols, wd.rows, speed, wd.mix.armor || 0,
      this.waveRng(), wd.mix)];
    this.showBanner('WAVE ' + this.sectorWave + ' / ' + def.waves.length,
      def.name, CONFIG.colors.accent);
    Sound.waveStart();
    this.say(wd.say);
    if (wd.mini) {
      this.boss = new Boss(this, this.sector, { mini: true });
      this.showBanner('MINI-BOSS', this.boss.def.name, CONFIG.colors.accent2);
      Sound.bossAlarm();
    }
  }

  // Some ordinary waves get a mini-boss escort: an optional, fast fight
  // that drops loot. The formation keeps marching, so it's added pressure
  // rather than a pause — and the sector won't clear until it's down.
  maybeSpawnMiniBoss() {
    if (this.boss || this.waveCount < CONFIG.boss.miniFromWave) return;
    if (!Utils.chance(CONFIG.boss.miniChance)) return;
    const tier = 1 + Math.floor(this.waveCount / (CONFIG.wave.bossEvery * 2));
    this.boss = new Boss(this, tier, { mini: true });
    this.showBanner('MINI-BOSS', this.boss.def.name, CONFIG.colors.accent2);
    Sound.bossAlarm();
  }

  onBossDefeated(boss) {
    const cx = boss.x + boss.width / 2, cy = boss.y + boss.height / 2;
    this.addScore(boss.score, cx, cy, true);
    this.boss = null;

    // Mini-bosses are a side reward: loot, but the sector isn't cleared —
    // the formation (if any still stands) must finish out the wave.
    if (boss.mini) {
      this.spawnPowerUp(cx, cy);
      if (Utils.chance(0.5)) this.spawnPowerUp(cx + Utils.rand(-30, 30), cy, Utils.chance(0.4) ? 'life' : undefined);
      this.showBanner('MINI-BOSS DOWN', '+' + Utils.commas(boss.score), CONFIG.colors.good);
      return;
    }

    this.bossesSlain++;
    Ach.onBossKill(boss.def, this.bossHitless);
    for (let i = 0; i < 4; i++)
      this.spawnPowerUp(boss.x + Utils.rand(0, boss.width), boss.y + Utils.rand(0, boss.height));
    this.spawnPowerUp(cx, cy, 'life');

    if (this.mode === 'campaign') {
      Meta.setCampaignBest(this.sector);     // sector cleared — persist progress
      if (boss.def.final || this.sector >= Campaign.count()) {
        this.victory = true;
        Meta.addCampaignWin();
        Ach.onVictory();
        this.endGame();
        return;
      }
      // Sector secured: bonus score, then a loot window before update() warps
      // us back to the Orion (the dock) and on to the next sector.
      const bonus = CONFIG.campaign.sectorBonus * this.sector;
      this.score += bonus;
      this.waveCount++;
      this.showBanner('SECTOR ' + this.sector + ' SECURED',
        '+' + Utils.commas(bonus) + ' BONUS', CONFIG.colors.good, 2600);
      this.say(Campaign.sector(this.sector).clearSay);
      this.warpTimer = CONFIG.campaign.warpWindow;
      return;
    }

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
    Ach.onKill();
    Ach.onCombo(this.combo);
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
      const e = this.acquireEnemy(Beetlemorph, m.slotX, m.slotY);
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

  // O(1)-amortised pool acquire: scan from a rotating cursor stored on the
  // array, so we don't re-scan filled slots from index 0 on every spawn.
  // (Bullets self-free at scattered points — collisions, smart-bomb, off-screen
  // — so a cursor is simpler and safe vs. a release-hook free-stack.)
  _acquireSlot(pool) {
    const n = pool.length;
    let c = pool._cur || 0;
    for (let s = 0; s < n; s++) {
      const e = pool[c];
      c = c + 1 === n ? 0 : c + 1;
      if (e.free) { pool._cur = c; return e; }
    }
    return null;
  }

  // --- entity object pools (Asteroid + enemy/minion classes) --------------
  // Enemies spawn in spiky bursts (a whole formation per wave, minions on
  // Splitter death) and asteroids burst on shatter — prime pooling candidates.
  // reset() reinitialises a recycled instance so no allocation/GC per spawn.
  spawnAsteroid(cx, cy, sizeKey) {
    let a = this.asteroidPool.pop();
    if (a) a.reset(this, cx, cy, sizeKey);
    else a = new Asteroid(this, cx, cy, sizeKey);
    this.asteroids.push(a);
    return a;
  }

  acquireEnemy(Cls, slotX, slotY) {
    let pool = this.enemyPools.get(Cls);
    if (!pool) { pool = []; this.enemyPools.set(Cls, pool); }
    const e = pool.pop();
    return e ? e.reset(this, slotX, slotY) : new Cls(this, slotX, slotY);
  }

  releaseEnemy(e) {
    let pool = this.enemyPools.get(e.constructor);
    if (!pool) { pool = []; this.enemyPools.set(e.constructor, pool); }
    if (pool.length < 128) pool.push(e);
  }

  // --- power-ups ----------------------------------------------------------
  spawnPowerUp(x, y, forced) {
    const p = this._acquireSlot(this.powerups);
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
    const cx = CONFIG.WIDTH / 2, cy = CONFIG.HEIGHT / 2;
    this.shake(20, 450);
    this.freeze(90);
    this.punchZoom(0.05);
    this.particles.explosionBig(cx, cy, '#fff', 'gold', 2.4);
    this.particles.spriteBurst(cx, cy, 'gold', 360);
    this.particles.shockwave(cx, cy, CONFIG.colors.gold, { r0: 20, r1: CONFIG.WIDTH * 0.9, life: 640, lw: 6 });
    this.particles.shockwave(cx, cy, '#fff', { r0: 8, r1: CONFIG.WIDTH * 0.6, life: 470, lw: 3 });
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
    const b = this._acquireSlot(this.bullets);
    if (!b) return;
    const w = opt.width || CONFIG.bullet.width;
    const h = opt.height || CONFIG.bullet.height;
    b.start(cx - w / 2, cy - h / 2, vx, vy, opt);
  }

  spawnEnemyBullet(cx, cy, vx, vy, opt = {}) {
    const b = this._acquireSlot(this.enemyBullets);
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
      const camp = this.mode === 'campaign' ? Campaign.sector(this.sector) : null;
      const rate = this.mode === 'daily' ? this.dailyMods.hazardRateMul
        : camp ? camp.hazardMul : 1;
      const interval = Math.max(CONFIG.hazard.spawnMin, CONFIG.hazard.spawnBase - this.level * 350) / (rate || 1);
      this.hazardTimer = interval * Utils.rand(0.7, 1.3);
      // a bit calmer while a boss is on screen; rate-0 sectors stay clear, and
      // nothing spawns during the post-boss warp window (loot collection).
      if (rate > 0 && this.warpTimer <= 0 && (!this.boss || Utils.chance(0.5))) {
        const bigChance = this.mode === 'daily' ? this.dailyMods.bigAsteroidChance
          : camp ? camp.bigAsteroid : 0.6;
        const sizeKey = Utils.chance(bigChance) ? 'big' : 'med';
        const x = Utils.rand(60, CONFIG.WIDTH - 60);
        this.spawnAsteroid(x, -50, sizeKey);
      }
    }
    this.asteroids.forEach(a => a.update(dt));
    Utils.compactRelease(this.asteroids, this.asteroidPool, a => a.dead);
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
    if (!Meta.shakeEnabled()) return;   // disabled via Settings / reduced-motion
    if (mag >= this.shakeMag || this.shakeTime <= 0) this.shakeMag = mag;
    this.shakeTime = Math.max(this.shakeTime, dur);
    this.shakeDur = Math.max(this.shakeDur, dur);
  }

  // Brief time-freeze (hit-stop) on big impacts. A real-time counter that
  // skips advancing the SIM for a few frames — the fixed-timestep contract is
  // untouched (update is still called with STEP_MS every frame). Gated like
  // shake so reduced-motion / Low tier stay smooth.
  freeze(ms) {
    if (!Meta.shakeEnabled() || !Meta.fx()) return;
    this.freezeTimer = Math.min(140, Math.max(this.freezeTimer, ms));
  }

  // Short zoom-in punch around the arena centre (gated like shake).
  punchZoom(a) {
    if (!Meta.shakeEnabled() || !Meta.fx()) return;
    this.punch = Math.max(this.punch, a);
  }

  showBanner(title, sub, color, duration = 1700) {
    this.banner = { title, sub, color, time: 0, duration };
  }

  // Brief additive white-out on warp arrival (skipped under reduced motion).
  screenFlash(ms = 260) {
    if (Meta.reducedMotion()) return;
    this.flashT = Math.max(this.flashT, ms);
    this.flashDur = Math.max(this.flashDur, ms);
  }

  // Occasional firework bursts over the Earth finale on the victory screen.
  _victoryFx() {
    if (!Utils.chance(0.05)) return;
    const x = Utils.rand(70, CONFIG.WIDTH - 70), y = Utils.rand(120, CONFIG.HEIGHT * 0.5);
    const col = Utils.pick([CONFIG.colors.gold, CONFIG.colors.accent, CONFIG.colors.good, '#fff']);
    this.particles.explosion(x, y, col, 26, 1.4);
    this.particles.shockwave(x, y, col, { r0: 4, r1: 84, life: 520 });
    this.particles.spriteBurst(x, y, Utils.pick(['gold', 'energy']), 120);
  }

  // --- main update --------------------------------------------------------
  update(dt) {
    this.handleInput();
    this.starfield.update(dt);
    this.particles.update(dt);
    this.updateShake(dt);
    Ach.update(dt);

    // Celebratory fireworks roll on while the campaign-victory screen is up.
    if (this.state === 'gameover' && this.victory) this._victoryFx();

    if (this.state === 'hangar' || this.state === 'dock') this.hangar.update(dt);
    if (this.state === 'settings') this.settings.update(dt);
    if (this.flashT > 0) this.flashT -= dt; else this.flashDur = 1;
    // Warp streaks while a campaign briefing is up, and as the post-boss
    // loot window winds down (the jump spooling up); settle back otherwise.
    const warping = this.state === 'briefing' ||
      (this.state === 'playing' && this.warpTimer > 0 &&
       this.warpTimer < CONFIG.campaign.warpRamp);
    this.starfield.setWarp(warping ? 1 : 0);
    if (this.state === 'briefing') this.briefT += dt;
    if (this.state !== 'playing') return;

    // Hit-stop: hold the simulation for a beat so big impacts land. Particles
    // and screen-shake (updated above) keep animating during the freeze.
    if (this.freezeTimer > 0) { this.freezeTimer -= dt; return; }

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

    // story comms tick one at a time
    if (this.comms.length) {
      const m = this.comms[0];
      m.t += dt;
      if (m.t > m.dur) this.comms.shift();
    }

    // post-boss warp window (campaign): scoop the loot, then fall back to
    // the Orion's deck (the dock) before the next sector's briefing.
    if (this.warpTimer > 0 && !this.gameOverPending) {
      this.warpTimer -= dt;
      if (this.warpTimer <= 0) { this.enterDock(this.sector + 1); return; }
    }

    if (!this.boss && this.waves.length && this.waves[0].complete) {
      this.waves = [];
      this.waveCount++;
      // Breathing room before the next beat. The campaign's pre-boss beat is
      // longer, and the HIVEMIND taunt plays over the emptied arena.
      if (this.mode === 'campaign') {
        const def = Campaign.sector(this.sector);
        const bossNext = this.sectorWave >= def.waves.length;
        this.nextWaveTimer = bossNext ? CONFIG.campaign.bossDelay : CONFIG.campaign.waveDelay;
        if (bossNext) this.say(def.taunt);
      } else {
        this.nextWaveTimer = CONFIG.wave.breather;
      }
    }
    if (this.nextWaveTimer > 0 && !this.boss && !this.waves.length &&
        this.warpTimer <= 0 && !this.gameOverPending) {
      this.nextWaveTimer -= dt;
      if (this.nextWaveTimer <= 0) this.startWaveOrBoss();
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
        this.particles.sparks(b.x + b.width / 2, b.y, this.boss.def.color, -Math.PI / 2, 5);
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
    if (this.punch > 0.0005) this.punch = Utils.lerp(this.punch, 0, Utils.clamp(0.12 * (dt / CONFIG.STEP_MS), 0, 1));
    else this.punch = 0;
  }

  // --- input / state transitions -----------------------------------------
  handleInput() {
    const i = this.input;
    const clicked = i.pointer.clicked;

    if (i.wasPressed('m')) { Sound.init(); Sound.setMuted(!Sound.muted); Meta.muted = Sound.muted; }

    switch (this.state) {
      case 'menu': {
        const modes = CONFIG.modes;
        if (i.wasPressed('ArrowLeft')) { this.menuMode = (this.menuMode - 1 + modes.length) % modes.length; Sound.uiMove(); }
        else if (i.wasPressed('ArrowRight')) { this.menuMode = (this.menuMode + 1) % modes.length; Sound.uiMove(); }
        if (i.wasPressed('h')) { Sound.init(); this.openHangar(); }
        else if (i.wasPressed('o')) { Sound.init(); this.openSettings('menu'); }
        else if (i.wasPressed('a')) { Sound.init(); this.openAchievements('menu'); }
        else if (clicked) {
          const hit = (this.ui.menuRects || []).find(r =>
            i.pointer.x >= r.x && i.pointer.x <= r.x + r.w && i.pointer.y >= r.y && i.pointer.y <= r.y + r.h);
          if (hit) {
            Sound.init();
            if (hit.kind === 'mode') { this.menuMode = hit.index; Sound.uiMove(); }
            else if (hit.kind === 'launch') { Sound.uiSelect(); this.newGame(modes[this.menuMode].id); }
            else if (hit.kind === 'hangar') this.openHangar();
            else if (hit.kind === 'settings') this.openSettings('menu');
            else if (hit.kind === 'achievements') this.openAchievements('menu');
          }
        } else if (i.wasPressed('Enter', ' ')) { Sound.init(); Sound.uiSelect(); this.newGame(modes[this.menuMode].id); }
        break;
      }
      case 'hangar':
      case 'dock':
        this.hangar.handleInput(i);
        break;
      case 'settings':
        this.settings.handleInput(i);
        break;
      case 'achievements':
        if (i.wasPressed('Enter', ' ', 'Escape', 'q') || clicked) this.closeAchievements();
        break;
      case 'briefing':
        if (i.wasPressed('Enter', ' ') || clicked) {
          Sound.init();
          // first press fast-forwards the typewriter, the next one launches
          if (!this.briefRevealed) this.briefT += 1e9;
          else { Sound.uiSelect(); this.launchSector(); }
        }
        else if (i.wasPressed('q', 'Escape')) this.toMenu();
        break;
      case 'playing':
        if (i.wasPressed('Escape', 'p')) { this.state = 'paused'; Sound.stopMusic(); Sound.uiSelect(); }
        break;
      case 'paused':
        if (i.wasPressed('Escape', 'p')) { this.state = 'playing'; Sound.startMusic(this._tempo()); }
        else if (i.wasPressed('o')) this.openSettings('paused');
        else if (i.wasPressed('q')) this.toMenu();
        break;
      case 'gameover':
        if (i.wasPressed('Enter') || clicked) { Sound.uiSelect(); this.newGame(); }
        else if (i.wasPressed('h')) this.openHangar();
        else if (i.wasPressed('o')) this.openSettings('gameover');
        else if (i.wasPressed('a')) this.openAchievements('gameover');
        else if (i.wasPressed('q')) this.toMenu();
        break;
    }

    this.input.consumePressed();
  }

  // --- rendering ----------------------------------------------------------
  draw(c) {
    // The bloomable scene (starfield + world) is captured by PostFX into an
    // offscreen buffer, post-processed, and composited back onto `c`. When
    // bloom is off (Low tier / unsupported), `sc` IS `c` and this is a no-op.
    const sc = PostFX.begin(c);
    this.starfield.draw(sc);

    const worldVisible = this.state !== 'menu' && this.state !== 'hangar' &&
      this.state !== 'settings' && this.state !== 'achievements' &&
      this.state !== 'briefing' && this.state !== 'dock';
    if (worldVisible) {
      sc.save();
      if (this.punch > 0.0005) {
        const z = 1 + this.punch;
        sc.translate(CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2);
        sc.scale(z, z);
        sc.translate(-CONFIG.WIDTH / 2, -CONFIG.HEIGHT / 2);
      }
      sc.translate(this.shakeX, this.shakeY);
      this.drawWorld(sc);
      sc.restore();
      // per-sector colour grade (drawn untransformed so shake can't reveal an
      // ungraded edge; high tier only).
      if (Meta.extras()) {
        sc.save();
        sc.fillStyle = SECTOR_TINTS[this.starfield.bgIndex % SECTOR_TINTS.length];
        sc.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
        sc.restore();
      }
    }
    PostFX.end(c);   // composite scene + bloom; UI below draws crisp on `c`
    if (worldVisible) this.ui.drawWorldVignette(c);

    if (this.state === 'menu') {
      this.ui.drawMenu(c);
    } else if (this.state === 'briefing') {
      this.ui.drawBriefing(c);
    } else if (this.state === 'dock') {
      this.hangar.draw(c);
    } else if (this.state === 'hangar') {
      this.hangar.draw(c);
    } else if (this.state === 'settings') {
      this.settings.draw(c);
    } else if (this.state === 'achievements') {
      Ach.drawScreen(c);
    } else {
      this.ui.drawHUD(c);
      if ((this.state === 'playing' || this.state === 'paused') && this.input.buttonsActive())
        this.ui.drawTouchControls(c, this.input);
      if (this.banner) {
        const b = this.banner;
        this.ui.drawBanner(c, b.title, b.sub, b.time, b.duration, b.color);
      }
      if (this.state === 'paused') this.ui.drawPause(c);
      if (this.state === 'gameover') this.ui.drawGameOver(c);
    }

    // Warp-arrival flash washes over everything for a few frames.
    if (this.flashT > 0) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = Utils.clamp(this.flashT / this.flashDur, 0, 1) * 0.7;
      c.fillStyle = '#cfeaff';
      c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
      c.restore();
    }

    // Achievement toasts float above everything, in every state.
    Ach.drawToasts(c);
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
