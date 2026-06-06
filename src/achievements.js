/* =====================================================================
 * achievements.js — Unlockable goals beyond the high score. The catalog
 * is data; the game calls semantic hooks (onKill / onWave / onBossKill…)
 * at the right moments and the Ach singleton decides what to unlock,
 * persisting via Meta and queuing a slide-in "unlocked" toast. Also draws
 * the read-only achievements viewer ('achievements' state).
 * ===================================================================== */

const ACHIEVEMENTS = [
  { id: 'firstBlood',   name: 'First Blood',    desc: 'Destroy your first alien' },
  { id: 'combo8',       name: 'Chain Reaction', desc: 'Reach an x8 combo' },
  { id: 'wave10',       name: 'Hold the Line',  desc: 'Reach wave 10' },
  { id: 'wave20',       name: 'Deep Space',     desc: 'Reach wave 20' },
  { id: 'bossOverlord', name: 'Overlord Down',  desc: 'Defeat the Overlord' },
  { id: 'bossWeaver',   name: 'Unravel',        desc: 'Defeat the Weaver' },
  { id: 'bossWarden',   name: 'Breach',         desc: 'Defeat the Warden' },
  { id: 'apex',         name: 'Apex Predator',  desc: 'Defeat all three boss archetypes' },
  { id: 'flawless',     name: 'Untouchable',    desc: 'Defeat a boss without taking a hit' },
  { id: 'highScore',    name: 'High Roller',    desc: 'Score 50,000 in a single run' },
  { id: 'tycoon',       name: 'Tycoon',         desc: 'Bank 5,000 credits' },
  { id: 'fullyArmed',   name: 'Fully Armed',    desc: 'Max out an upgrade in the Hangar' },
  { id: 'champion',     name: 'Champion',       desc: 'Win Campaign mode' },
  { id: 'dailyDone',    name: 'Daily Grind',    desc: 'Complete a Daily Challenge' },
];

const BOSS_ACH = { overlord: 'bossOverlord', weaver: 'bossWeaver', warden: 'bossWarden' };

class Achievements {
  constructor() { this.toasts = []; }

  def(id) { return ACHIEVEMENTS.find(a => a.id === id); }
  total() { return ACHIEVEMENTS.length; }
  unlockedCount() { return ACHIEVEMENTS.reduce((n, a) => n + (Meta.isUnlocked(a.id) ? 1 : 0), 0); }

  // Core unlock: persists, queues a toast, and rolls up the "apex" meta one.
  unlock(id) {
    const def = this.def(id);
    if (!def) return;
    if (Meta.unlockAch(id)) {
      this.toasts.push({ name: def.name, t: 0, dur: 3400 });
      Sound.extraLife();
      if (BOSS_ACH[id] === undefined && id.startsWith('boss')) { /* noop */ }
      if (['bossOverlord', 'bossWeaver', 'bossWarden'].every(b => Meta.isUnlocked(b)))
        this.unlock('apex');
    }
  }

  // --- semantic hooks called by the game ---------------------------------
  onKill()          { this.unlock('firstBlood'); }
  onCombo(c)        { if (c >= CONFIG.combo.max) this.unlock('combo8'); }
  onWave(n)         { if (n >= 10) this.unlock('wave10'); if (n >= 20) this.unlock('wave20'); }
  onBossKill(bdef, flawless) {
    if (BOSS_ACH[bdef.id]) this.unlock(BOSS_ACH[bdef.id]);
    if (flawless) this.unlock('flawless');
  }
  onScore(s)        { if (s >= 50000) this.unlock('highScore'); }
  onCredits()       { if (Meta.credits >= 5000) this.unlock('tycoon'); }
  onUpgrade()       { if (UPGRADES.some(u => Meta.isMax(u.id))) this.unlock('fullyArmed'); }
  onVictory()       { this.unlock('champion'); }
  onDailyComplete() { this.unlock('dailyDone'); }

  update(dt) {
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter(t => t.t < t.dur);
  }

  // Slide-in "unlocked" cards at the top of the screen (shown in any state).
  drawToasts(c) {
    this.toasts.forEach((toast, i) => {
      const d = toast.dur;
      let a = 1, slide = 0;
      if (toast.t < 300) { a = toast.t / 300; slide = (1 - a) * -30; }
      else if (toast.t > d - 500) a = Math.max(0, (d - toast.t) / 500);
      const w = 320, h = 52, x = (CONFIG.WIDTH - w) / 2, y = 120 + i * (h + 8) + slide;
      c.save();
      c.globalAlpha = a;
      Utils.roundRect(c, x, y, w, h, 10);
      c.fillStyle = 'rgba(8,10,24,0.92)';
      c.fill();
      c.lineWidth = 2;
      c.strokeStyle = CONFIG.colors.gold;
      c.shadowColor = CONFIG.colors.gold;
      c.shadowBlur = 14;
      c.stroke();
      c.restore();
      Utils.text(c, '★ ACHIEVEMENT UNLOCKED', x + w / 2, y + 20, {
        size: 11, color: CONFIG.colors.gold, align: 'center', alpha: a, glow: 6,
      });
      Utils.text(c, toast.name, x + w / 2, y + 40, {
        size: 18, color: '#fff', align: 'center', alpha: a, glow: 6,
      });
    });
  }

  // The full read-only grid ('achievements' state).
  drawScreen(c) {
    c.save();
    c.fillStyle = 'rgba(4,6,16,0.9)';
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    c.restore();
    const cx = CONFIG.WIDTH / 2;
    Utils.text(c, 'ACHIEVEMENTS', cx, 92, { size: 48, color: '#fff', align: 'center', glow: 16, glowColor: CONFIG.colors.accent });
    Utils.text(c, this.unlockedCount() + ' / ' + this.total() + ' UNLOCKED', cx, 122,
      { size: 14, color: CONFIG.colors.gold, align: 'center', glow: 6 });

    const cols = 2, cellW = 300, cellH = 70, gapX = 16, gapY = 12;
    const gridW = cols * cellW + gapX;
    const x0 = (CONFIG.WIDTH - gridW) / 2;
    const y0 = 156;
    ACHIEVEMENTS.forEach((a, i) => {
      const col = i % cols, row = (i / cols) | 0;
      const x = x0 + col * (cellW + gapX);
      const y = y0 + row * (cellH + gapY);
      const got = Meta.isUnlocked(a.id);
      c.save();
      Utils.roundRect(c, x, y, cellW, cellH, 9);
      c.fillStyle = got ? 'rgba(255,210,63,0.12)' : 'rgba(10,14,30,0.72)';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = got ? CONFIG.colors.gold : 'rgba(255,255,255,0.16)';
      if (got) { c.shadowColor = CONFIG.colors.gold; c.shadowBlur = 10; }
      c.stroke();
      c.restore();
      Utils.text(c, got ? '★' : '🔒', x + 24, y + 42, {
        size: 22, color: got ? CONFIG.colors.gold : '#5b6678', align: 'center',
      });
      Utils.text(c, a.name, x + 46, y + 30, { size: 16, color: got ? '#fff' : '#7b8698' });
      Utils.text(c, a.desc, x + 46, y + 50, { size: 11, color: got ? '#9fb3d1' : '#5b6678' });
    });

    Utils.text(c, 'ENTER / TAP / Q  ·  back', cx, CONFIG.HEIGHT - 30,
      { size: 13, color: '#9fb3d1', align: 'center' });
  }
}

const Ach = new Achievements();
