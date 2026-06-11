/* =====================================================================
 * boss.js — Data-driven bosses & mini-bosses. A boss sweeps across the
 * top of the arena and escalates its attack pattern as its health drops.
 * Three full-boss archetypes (Overlord / Weaver / Warden) rotate per
 * encounter; smaller mini-bosses can escort ordinary waves.
 *
 * Each boss is described by an entry in BOSS_TYPES / MINIBOSS_TYPES:
 *   name, frameY (sprite row), color (its bullets + bar), move (sweep
 *   style), scale / hpMul / scoreMul, fire cadence (fireBase/fireMin),
 *   and a `phases` list — one array of attack "steps" per phase.
 * runStep() turns a step into bullets, so adding a pattern is data, not
 * new wiring. Phases are driven by remaining HP (full -> phase 1).
 * ===================================================================== */

const BOSS_TYPES = [
  {
    // The original all-rounder: aimed pressure -> spread -> radial storms.
    id: 'overlord', name: 'OVERLORD', frameY: 0, color: CONFIG.colors.boss,
    move: 'sine', scale: 1, hpMul: 1, scoreMul: 1, fireBase: 1500, fireMin: 450,
    phases: [
      [{ type: 'aimed', count: 3, spread: 0.12 }],
      [{ type: 'spread', count: 5, spread: 0.16 }],
      [{ type: 'ring', count: 14, spin: 0.001, aimed: true }],
    ],
  },
  {
    // Glass-cannon weaver: constant rotating spiral streams, dances in a
    // figure-8 so the gaps in its spray keep moving. Reward dodging.
    id: 'weaver', name: 'THE WEAVER', frameY: 1, color: CONFIG.colors.rhino,
    move: 'figure8', scale: 0.95, hpMul: 0.92, scoreMul: 1.1,
    fireBase: 340, fireMin: 150, bulletSpeedMul: 0.95,
    phases: [
      [{ type: 'spiral', arms: 2, spin: 0.07 }],
      [{ type: 'spiral', arms: 3, spin: 0.085 }],
      [{ type: 'spiral', arms: 4, spin: 0.1 }, { type: 'aimed', count: 1 }],
    ],
  },
  {
    // Heavy artillery: tanky, lumbers slowly, lays shotgun bursts and
    // descending bullet curtains with a single moving gap to thread.
    id: 'warden', name: 'THE WARDEN', frameY: 2, color: CONFIG.colors.danger,
    move: 'lumber', scale: 1.12, hpMul: 1.3, scoreMul: 1.25, fireBase: 1300, fireMin: 560,
    phases: [
      [{ type: 'shotgun', count: 6, spread: 0.5 }],
      [{ type: 'shotgun', count: 7, spread: 0.55 }, { type: 'aimed', count: 2, spread: 0.5 }],
      [{ type: 'curtain', count: 11, gap: 2 }, { type: 'aimed', count: 3, spread: 0.2 }],
    ],
  },
  {
    // Ring fortress: guards the campaign Blockade (sector 4) and joins the
    // endless rotation as the 4th archetype. Pulsing rings whose rotation
    // flips direction between phases, so safe lanes never stay safe.
    id: 'herald', name: 'VOID HERALD', frameY: 3, color: CONFIG.colors.accent2,
    move: 'figure8', scale: 1.05, hpMul: 1.15, scoreMul: 1.3, fireBase: 950, fireMin: 380,
    phases: [
      [{ type: 'ring', count: 12, spin: 0.0014 }],
      [{ type: 'ring', count: 14, spin: -0.0018, aimed: true }, { type: 'aimed', count: 2, spread: 0.3 }],
      [{ type: 'spiral', arms: 3, spin: -0.09 }, { type: 'shotgun', count: 5, spread: 0.4 }],
    ],
  },
];

// The campaign finale only (never in the endless rotation): the mind of the
// swarm. Four phases that audition every pattern in the book, a huge hull,
// and `final: true` so the Game/UI treat the kill as the campaign victory.
const FINAL_BOSS = {
  id: 'mothership', name: 'THE MOTHERSHIP', frameY: 0, color: CONFIG.colors.gold,
  move: 'lumber', scale: 1.45, hpMul: 1.8, scoreMul: 2.5, fireBase: 1150, fireMin: 380,
  final: true,
  phases: [
    [{ type: 'spread', count: 6, spread: 0.2 }, { type: 'aimed', count: 1 }],
    [{ type: 'ring', count: 16, spin: 0.0012, aimed: true }],
    [{ type: 'curtain', count: 12, gap: 2 }, { type: 'shotgun', count: 5, spread: 0.45 }],
    [{ type: 'spiral', arms: 4, spin: 0.08 }, { type: 'aimed', count: 3, spread: 0.18 }],
  ],
};

const MINIBOSS_TYPES = [
  {
    id: 'sentinel', name: 'SENTINEL', frameY: 3, color: CONFIG.colors.beetle,
    move: 'sine', fireBase: 1100, fireMin: 520,
    phases: [
      [{ type: 'aimed', count: 3, spread: 0.18 }],
      [{ type: 'shotgun', count: 6, spread: 0.45 }],
    ],
  },
  {
    id: 'lancer', name: 'LANCER', frameY: 3, color: CONFIG.colors.accent2,
    move: 'figure8', fireBase: 320, fireMin: 160, bulletSpeedMul: 0.95,
    phases: [
      [{ type: 'spiral', arms: 2, spin: 0.08 }],
      [{ type: 'spiral', arms: 3, spin: 0.1 }],
    ],
  },
];

class Boss {
  constructor(game, tier, opts = {}) {
    this.game = game;
    this.tier = tier;                 // scales health, bullet speed, score
    this.mini = !!opts.mini;
    const pool = this.mini ? MINIBOSS_TYPES : BOSS_TYPES;
    // Full bosses rotate deterministically so each encounter feels fresh;
    // mini-bosses are picked at random.
    this.def = opts.def || (this.mini ? Utils.pick(pool) : pool[(tier - 1) % pool.length]);

    this.scale = (this.def.scale || 1) * (this.mini ? CONFIG.boss.miniScale : 1);
    this.width = CONFIG.boss.width * this.scale;
    this.height = CONFIG.boss.height * this.scale;

    const base = CONFIG.boss.baseLives + (tier - 1) * CONFIG.boss.livesPerTier;
    this.maxLives = Math.max(1, Math.round(
      base * (this.def.hpMul || 1) * (this.mini ? CONFIG.boss.miniHpMul : 1) * Meta.diffMods().bossHpMul));
    this.lives = this.maxLives;

    this.centerX = CONFIG.WIDTH / 2 - this.width / 2;
    this.x = this.centerX;
    this.y = -this.height;
    this.entryY = this.mini ? CONFIG.boss.miniEntryY : 74;
    this.amp = (CONFIG.WIDTH - this.width) / 2 - 8;

    this.entered = false;
    this.vulnerable = false;
    this.alive = true;
    this.dead = false;
    this.t = 0;
    this.fireTimer = this.mini ? 700 : 1000;
    this.hitFlash = 0;
    this.frameY = this.def.frameY % CONFIG.sprites.boss.rows;
    this.frameX = 0;
    this.image = Assets.img.boss;
    this.deathTimer = 0;
    this.spinAngle = 0;        // persistent angle for spiral attacks
    this.curtainGap = 0;       // moving gap column for curtain attacks
    this.score = Math.round((this.mini ? 600 : 2000) * tier * (this.def.scoreMul || 1));
  }

  // Phase is driven by remaining health: full HP -> phase 1, near death
  // -> the last phase. Works for any number of phases the def declares.
  get phase() {
    const n = this.def.phases.length;
    const p = this.lives / this.maxLives;          // 1 (full) .. 0 (dead)
    return Utils.clamp(Math.floor((1 - p) * n), 0, n - 1) + 1;
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
          Utils.pick([this.def.color, CONFIG.colors.gold, '#fff']), 14, 1.2);
      }
      if (Utils.chance(0.2))
        this.game.particles.spriteBurst(this.x + Utils.rand(0, this.width), this.y + Utils.rand(0, this.height),
          this.mini ? 'energy' : 'fire', Utils.rand(80, 150));
      if (Utils.chance(0.25))
        this.game.particles.shockwave(this.x + Utils.rand(0, this.width), this.y + Utils.rand(0, this.height),
          this.def.color, { r0: 6, r1: Utils.rand(60, 120), life: 360 });
      if (this.deathTimer <= 0) this.finishDeath();
      return;
    }

    if (!this.entered) {
      this.y += 1.4 * k;
      if (this.y >= this.entryY) { this.y = this.entryY; this.entered = true; this.vulnerable = true; }
      return;
    }

    this.move(k);

    // idle animation (slow breathing between two frames)
    this.frameX = (Math.floor(this.t / 400) % 2 === 0) ? 0 : 1;

    // attacks — cadence tightens with phase
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.attack();
      const base = (this.def.fireBase ?? 1500) - this.tier * 40;
      this.fireTimer = Math.max(this.def.fireMin ?? 450, base / this.phase) * Meta.diffMods().bossFireMul;
    }

    // body contact = player hit
    if (this.game.player.alive && Utils.aabb(this, this.game.player)) {
      this.game.player.takeHit();
    }
  }

  // Sweep styles. Phase ramps the speed so late fights feel frantic.
  move(k) {
    switch (this.def.move) {
      case 'figure8': {
        const sp = 0.0016 + this.phase * 0.0006;
        this.x = this.centerX + Math.sin(this.t * sp) * this.amp;
        this.y = this.entryY + Math.sin(this.t * sp * 2) * 36;
        break;
      }
      case 'lumber': {
        const sp = 0.0008 + this.phase * 0.0004;
        this.x = this.centerX + Math.sin(this.t * sp) * this.amp;
        break;
      }
      default: { // 'sine'
        const sp = 0.0013 + this.phase * 0.0006;
        this.x = this.centerX + Math.sin(this.t * sp) * this.amp;
      }
    }
  }

  attack() {
    // muzzle telegraph — a bright flash + sparks as the volley leaves (purely
    // cosmetic; bullet spawn timing is unchanged).
    const mx = this.x + this.width / 2, my = this.y + this.height - 18 * this.scale;
    this.game.particles.emit(mx, my, { vx: 0, vy: 1, life: 130, size: 16 * this.scale, color: this.def.color, glow: 26, drag: 0.82 });
    if (Meta.fx()) this.game.particles.sparks(mx, my, this.def.color, Math.PI / 2, 6);
    for (const step of this.def.phases[this.phase - 1]) this.runStep(step);
    Sound.enemyShoot();
  }

  fire(x, y, ang, spd, size = 12) {
    this.game.spawnEnemyBullet(x, y, Math.cos(ang) * spd, Math.sin(ang) * spd,
      { color: this.def.color, width: size, height: size });
  }

  // Turn one attack "step" descriptor into bullets. New pattern = new case.
  runStep(step) {
    const TAU = Math.PI * 2;
    const player = this.game.player;
    const mx = this.x + this.width / 2;
    const my = this.y + this.height - 18 * this.scale;
    const spd = (CONFIG.enemyBullet.speed + this.tier * 0.18) *
      (step.speedMul || this.def.bulletSpeedMul || 1);
    const aim = Math.atan2(player.y - my, (player.x + player.width / 2) - mx);
    const DOWN = Math.PI / 2;

    switch (step.type) {
      case 'aimed': {                 // a fan centred on the player
        const n = step.count || 3, s = step.spread || 0.12;
        for (let i = 0; i < n; i++) this.fire(mx, my, aim + (i - (n - 1) / 2) * s, spd, step.size || 12);
        break;
      }
      case 'spread': {                // a fixed fan pointing downward
        const n = step.count || 5, s = step.spread || 0.16;
        for (let i = 0; i < n; i++) this.fire(mx, my, DOWN + (i - (n - 1) / 2) * s, spd, step.size || 12);
        break;
      }
      case 'ring': {                  // a full radial ring, slowly rotating
        const n = step.count || 12, base = this.t * (step.spin || 0.001);
        for (let i = 0; i < n; i++) this.fire(mx, my, (i / n) * TAU + base, spd, step.size || 11);
        if (step.aimed) this.fire(mx, my, aim, spd, step.size || 11);
        break;
      }
      case 'spiral': {                // rotating arms -> sweeping streams
        const arms = step.arms || 3;
        for (let i = 0; i < arms; i++) this.fire(mx, my, this.spinAngle + i * (TAU / arms), spd, step.size || 10);
        this.spinAngle += step.spin || 0.06;
        break;
      }
      case 'shotgun': {               // a noisy burst toward the player
        const n = step.count || 6, s = step.spread || 0.5;
        for (let i = 0; i < n; i++)
          this.fire(mx, my, aim + Utils.rand(-s, s), spd * Utils.rand(0.82, 1.18), step.size || 12);
        break;
      }
      case 'curtain': {               // a wall of falling bullets with a gap
        const n = step.count || 11, gap = step.gap ?? 2, start = this.curtainGap;
        for (let i = 0; i < n; i++) {
          if (i >= start && i < start + gap) continue;
          const x = 40 + (CONFIG.WIDTH - 80) * (i / (n - 1));
          this.fire(x, my, DOWN, spd * 0.9, step.size || 12);
        }
        this.curtainGap = Utils.randInt(0, Math.max(0, n - gap)); // move the gap
        break;
      }
    }
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
    this.deathTimer = this.mini ? 800 : 1400;
    this.game.shake(this.mini ? 12 : 20, this.mini ? 400 : 600);
    this.game.freeze(this.mini ? 70 : 120);
    if (!this.mini) this.game.punchZoom(0.045);
    Sound.bigExplode();
  }

  finishDeath() {
    this.alive = false;
    const cx = this.x + this.width / 2, cy = this.y + this.height / 2;
    const theme = this.mini ? 'energy' : 'fire';
    this.game.particles.explosionBig(cx, cy, '#fff', theme, this.mini ? 1.8 : 2.6);
    this.game.particles.explosion(cx, cy, this.def.color, this.mini ? 24 : 40, 2);
    this.game.particles.spriteBurst(cx, cy, theme, this.mini ? 200 : 340);
    this.game.particles.shockwave(cx, cy, this.def.color, { r0: 10, r1: this.mini ? 160 : 300, life: 520, lw: 5 });
    this.game.particles.shockwave(cx, cy, '#fff', { r0: 4, r1: this.mini ? 110 : 210, life: 420, lw: 3 });
    if (!this.mini) this.game.freeze(90);
    this.game.onBossDefeated(this);
  }

  draw(c) {
    if (!this.alive) return;
    const s = CONFIG.sprites.boss;
    c.save();
    if (this.dead) c.globalAlpha = Utils.clamp(this.deathTimer / (this.mini ? 800 : 1400) + 0.2, 0, 1);
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

  // Drawn by the HUD. Full bosses get the top-of-screen bar; mini-bosses
  // get a compact bar floating above their body so the top HUD stays.
  drawHealthBar(c) {
    if (this.dead) return;
    if (this.mini) { this.drawMiniBar(c); return; }
    const w = CONFIG.WIDTH - 80;
    const x = 40, y = 86, h = 14;
    const pct = Utils.clamp(this.lives / this.maxLives, 0, 1);
    c.save();
    Utils.roundRect(c, x, y, w, h, 7);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fill();
    const grad = c.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, this.def.color);
    grad.addColorStop(1, CONFIG.colors.gold);
    Utils.roundRect(c, x, y, w * pct, h, 7);
    c.fillStyle = grad;
    c.shadowColor = this.def.color;
    c.shadowBlur = 12;
    c.fill();
    c.restore();
    Utils.text(c, `${this.def.name}  ·  TIER ${this.tier}`, CONFIG.WIDTH / 2, y + 11, {
      size: 12, align: 'center', baseline: 'middle', color: '#fff', glow: 6,
    });
  }

  drawMiniBar(c) {
    const w = this.width * 0.92, x = this.x + this.width / 2 - w / 2, y = this.y - 14, h = 6;
    const pct = Utils.clamp(this.lives / this.maxLives, 0, 1);
    c.save();
    Utils.roundRect(c, x, y, w, h, 3);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fill();
    Utils.roundRect(c, x, y, w * pct, h, 3);
    c.fillStyle = this.def.color;
    c.shadowColor = this.def.color;
    c.shadowBlur = 8;
    c.fill();
    c.restore();
    Utils.text(c, this.def.name, this.x + this.width / 2, y - 5, {
      size: 11, align: 'center', color: '#fff', glow: 6,
    });
  }
}
