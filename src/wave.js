/* =====================================================================
 * wave.js — A formation of enemies that marches side-to-side, drops down
 * at the edges, periodically sends divers at the player, and lets the
 * front line shoot. Cleared when all its enemies are gone.
 * ===================================================================== */

class Wave {
  constructor(game, cols, rows, speed, armorRatio, rng) {
    this.game = game;
    // Composition RNG: seeded for the Daily Challenge (so formations match
    // for everyone that day), plain Math.random otherwise.
    this.rng = rng || Math.random;
    this.cols = cols;
    this.rows = rows;
    this.cell = CONFIG.enemy.size + CONFIG.enemy.gapX;
    this.cellY = CONFIG.enemy.size + CONFIG.enemy.gapY;
    this.gridW = cols * this.cell - CONFIG.enemy.gapX;
    this.gridH = rows * this.cellY - CONFIG.enemy.gapY;
    this.margin = 14;

    this.x = (CONFIG.WIDTH - this.gridW) / 2;
    this.y = -this.gridH - 10;
    this.entryY = 100;           // formation settles here, then marches
    this.speedX = (Math.random() < 0.5 ? -1 : 1) * speed;
    this.baseSpeed = speed;
    this.descend = 0;
    this.entered = false;
    this.complete = false;

    this.enemies = [];
    this._formation = [];        // reused scratch (refilled each frame, no alloc)
    this.maxDivers = 1 + Math.floor(rows / 2);
    this.create(armorRatio);
  }

  create(armorRatio) {
    const wc = this.game.waveCount;
    const stingerChance = Utils.clamp(0.08 + wc * 0.015, 0, 0.30);
    const splitterChance = wc >= 3 ? Utils.clamp(0.04 + wc * 0.012, 0, 0.22) : 0;
    const extraElite = this.game.mode === 'daily' ? this.game.dailyMods.eliteChanceAdd : 0;
    const eliteChance = CONFIG.elite.chance + wc * 0.004 + extraElite;
    for (let r = 0; r < this.rows; r++) {
      for (let col = 0; col < this.cols; col++) {
        const sx = col * this.cell;
        const sy = r * this.cellY;
        const roll = this.rng();
        let e;
        if (roll < splitterChance) e = this.game.acquireEnemy(Splitter, sx, sy);
        else if (roll < splitterChance + stingerChance) e = this.game.acquireEnemy(Stinger, sx, sy);
        else if (this.rng() < armorRatio) e = this.game.acquireEnemy(Rhinomorph, sx, sy);
        else e = this.game.acquireEnemy(Beetlemorph, sx, sy);
        if (this.rng() < eliteChance) e.makeElite();
        this.enemies.push(e);
      }
    }
  }

  get diverCount() { return this.enemies.filter(e => e.state === 'dive' || e.state === 'return').length; }

  update(dt) {
    const k = dt / CONFIG.STEP_MS;

    if (!this.entered) {
      // descend the whole block into play
      this.y += 1.6 * k;
      if (this.y >= this.entryY) { this.y = this.entryY; this.entered = true; }
    } else {
      // side-to-side march, dropping at the edges
      this.x += this.speedX * k;
      const left = this.margin;
      const right = CONFIG.WIDTH - this.gridW - this.margin;
      if (this.x <= left || this.x >= right) {
        this.x = Utils.clamp(this.x, left, right);
        this.speedX *= -1;
        this.y += CONFIG.wave.descendStep;
      }

      // occasionally launch a diver and let someone shoot (difficulty and the
      // daily 'frenzy' modifier scale how aggressive the formation is).
      // Single pass: collect formation members (reused scratch) + count divers,
      // instead of three per-frame .filter allocations.
      const aggro = Meta.diffMods().enemyFireMul * this.game.aggroMul();
      const formation = this._formation;
      formation.length = 0;
      let divers = 0;
      for (const e of this.enemies) {
        if (e.state === 'formation') formation.push(e);
        else if (e.state === 'dive' || e.state === 'return') divers++;
      }
      if (formation.length && divers < this.maxDivers &&
          Utils.chance(CONFIG.enemy.diveChance * aggro * k * formation.length)) {
        Utils.pick(formation).startDive(this.game.player);
      }
      if (formation.length && Utils.chance(CONFIG.enemy.fireChance * aggro * k * formation.length)) {
        // prefer a front-line shooter (largest slotY in its column-ish)
        Utils.pick(formation).shoot();
      }
    }

    // update + cull enemies (compact in place; recycle the dead into the
    // Game's per-class enemy pool so the next wave/minions reuse them).
    for (const e of this.enemies) e.update(dt, this.x, this.y);
    const arr = this.enemies;
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.alive) { if (w !== i) arr[w] = e; w++; }
      else this.game.releaseEnemy(e);
    }
    arr.length = w;

    if (this.enemies.length === 0) this.complete = true;

    // invasion check: a formation enemy crossed the defense line
    const line = this.game.player.y + 10;
    for (const e of this.enemies) {
      if (e.state !== 'dying' && e.y + e.height >= line && e.state === 'formation') {
        this.game.loseByInvasion();
        break;
      }
    }
  }

  draw(c) {
    for (const e of this.enemies) e.draw(c);
  }
}
