/* =====================================================================
 * ui.js — All on-screen UI: the in-game HUD, plus the menu / pause /
 * game-over / level-transition overlays. Pure drawing; the Game owns the
 * state machine and tells the UI which screen to render.
 * ===================================================================== */

class UI {
  constructor(game) {
    this.game = game;
    this.menuPulse = 0;
    this.starAngle = 0;
  }

  // --- small reusable pieces ---------------------------------------------
  panel(c, x, y, w, h, alpha = 0.72) {
    c.save();
    Utils.roundRect(c, x, y, w, h, 16);
    c.fillStyle = `rgba(8,10,24,${alpha})`;
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(70,224,255,0.5)';
    c.shadowColor = CONFIG.colors.accent;
    c.shadowBlur = 16;
    c.stroke();
    c.restore();
  }

  shipIcon(c, x, y, scale, color) {
    c.save();
    c.translate(x, y);
    c.scale(scale, scale);
    c.fillStyle = color;
    c.shadowColor = color;
    c.shadowBlur = 6;
    c.beginPath();
    c.moveTo(0, -8);
    c.lineTo(9, 8);
    c.lineTo(0, 4);
    c.lineTo(-9, 8);
    c.closePath();
    c.fill();
    c.restore();
  }

  vignette(c) {
    const g = c.createRadialGradient(
      CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2, CONFIG.HEIGHT * 0.3,
      CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2, CONFIG.HEIGHT * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = g;
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  }

  // --- in-game HUD --------------------------------------------------------
  drawHUD(c) {
    const g = this.game;

    // score + hi-score (top-left)
    Utils.text(c, 'SCORE', 22, 30, { size: 12, color: '#9fb3d1', glow: 0 });
    Utils.text(c, Utils.commas(g.score), 22, 56, { size: 26, color: '#fff', glow: 8 });
    Utils.text(c, 'HI ' + Utils.commas(g.hiScore), 22, 78, { size: 12, color: CONFIG.colors.gold });

    // wave / level (top-right)
    Utils.text(c, 'WAVE ' + g.waveCount, CONFIG.WIDTH - 22, 30,
      { size: 16, color: '#fff', align: 'right', glow: 6 });
    Utils.text(c, 'LEVEL ' + g.level, CONFIG.WIDTH - 22, 52,
      { size: 12, color: CONFIG.colors.accent, align: 'right' });

    // boss bar overrides the top strip
    if (g.boss && g.boss.alive) g.boss.drawHealthBar(c);

    // combo
    if (g.combo > 1) {
      const t = Utils.clamp(g.comboTimer / CONFIG.combo.window, 0, 1);
      Utils.text(c, `x${g.combo}  COMBO`, CONFIG.WIDTH / 2, 96,
        { size: 22, color: CONFIG.colors.gold, align: 'center', glow: 12 });
      c.save();
      c.fillStyle = CONFIG.colors.gold;
      c.globalAlpha = 0.8;
      c.fillRect(CONFIG.WIDTH / 2 - 60, 104, 120 * t, 3);
      c.restore();
    }

    // --- bottom HUD strip ---
    const baseY = CONFIG.HEIGHT - 30;

    // lives
    for (let i = 0; i < g.player.maxLives; i++) {
      const filled = i < g.player.lives;
      this.shipIcon(c, 30 + i * 22, baseY, 1.1,
        filled ? CONFIG.colors.accent : 'rgba(255,255,255,0.15)');
    }

    // energy bar (bottom-right)
    const ew = 200, eh = 12, ex = CONFIG.WIDTH - ew - 24, ey = baseY - 6;
    c.save();
    Utils.roundRect(c, ex, ey, ew, eh, 6);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fill();
    const pct = g.player.energy / g.player.maxEnergy;
    const col = g.player.cooldown ? CONFIG.colors.danger : CONFIG.colors.gold;
    Utils.roundRect(c, ex, ey, ew * pct, eh, 6);
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 10;
    c.fill();
    c.restore();
    Utils.text(c, 'BEAM', ex - 8, ey + 11, { size: 11, color: '#9fb3d1', align: 'right' });

    // active power-up chips (above the lives)
    const chips = [];
    if (g.player.rapid) chips.push(['RAPID', g.player.rapidTimer, CONFIG.colors.accent]);
    if (g.player.spread) chips.push(['SPREAD', g.player.spreadTimer, CONFIG.colors.good]);
    if (g.player.shield > 0) chips.push(['SHIELD x' + g.player.shield, 1, CONFIG.colors.accent2]);
    chips.forEach((ch, i) => {
      const x = 30, y = baseY - 34 - i * 18;
      Utils.text(c, ch[0], x, y, { size: 12, color: ch[2], glow: 6 });
    });
  }

  // On-screen touch buttons (move / fire / beam). Lit when pressed.
  drawTouchControls(c, input) {
    const btns = [
      ['left',  '◀',    input.left,  '#cfe6ff'],
      ['right', '▶',    input.right, '#cfe6ff'],
      ['beam',  'BEAM', input.beam,  CONFIG.colors.accent],
      ['fire',  'FIRE', input.fire,  CONFIG.colors.gold],
    ];
    c.save();
    for (const [kind, glyph, on, col] of btns) {
      const r = input.buttonRect(kind);
      const radius = (kind === 'left' || kind === 'right') ? r.w / 2 : 16;
      c.globalAlpha = on ? 0.55 : 0.26;
      Utils.roundRect(c, r.x, r.y, r.w, r.h, radius);
      c.fillStyle = on ? col : 'rgba(20,28,48,0.82)';
      c.lineWidth = 2.5;
      c.strokeStyle = col;
      if (on) { c.shadowColor = col; c.shadowBlur = 16; }
      c.fill();
      c.stroke();
      c.shadowBlur = 0;
      const multi = glyph.length > 1;
      Utils.text(c, glyph, r.x + r.w / 2, r.y + r.h / 2 + (multi ? 5 : 11), {
        size: multi ? 16 : 34, color: '#fff', align: 'center', alpha: on ? 1 : 0.8,
      });
    }
    c.restore();
  }

  // --- title / menu -------------------------------------------------------
  // A small clickable button helper used across the menu. Pushes a hit-rect
  // into menuRects and returns it.
  _menuButton(c, x, y, w, h, label, kind, index, opt = {}) {
    const hot = opt.selected;
    c.save();
    Utils.roundRect(c, x, y, w, h, 10);
    c.fillStyle = hot ? 'rgba(70,224,255,0.18)' : 'rgba(10,14,30,0.78)';
    c.fill();
    c.lineWidth = hot ? 2.5 : 1.5;
    c.strokeStyle = hot ? CONFIG.colors.accent : 'rgba(70,224,255,0.32)';
    if (hot) { c.shadowColor = CONFIG.colors.accent; c.shadowBlur = 14; }
    c.stroke();
    c.restore();
    Utils.text(c, label, x + w / 2, y + h / 2 + (opt.size ? opt.size / 3 : 6),
      { size: opt.size || 15, color: opt.color || '#fff', align: 'center', glow: hot ? 8 : 0 });
    const rect = { x, y, w, h, kind };
    if (index != null) rect.index = index;
    this.menuRects.push(rect);
    return rect;
  }

  drawMenu(c) {
    this.menuPulse += 0.05;
    this.vignette(c);
    this.menuRects = [];
    const cx = CONFIG.WIDTH / 2;

    Utils.text(c, 'KNOTZ', cx, 188, {
      size: 88, color: '#fff', align: 'center', glow: 24, glowColor: CONFIG.colors.accent,
    });
    Utils.text(c, 'INVADE SPACE', cx, 250, {
      size: 44, color: CONFIG.colors.accent, align: 'center', glow: 18, glowColor: CONFIG.colors.accent2,
    });
    Utils.text(c, 'A MODERN ARCADE ROGUELITE', cx, 282, {
      size: 13, color: '#9fb3d1', align: 'center',
    });

    // --- mode selector (chips) ---
    const modes = CONFIG.modes;
    const chipW = 150, chipH = 50, gap = 12;
    const totalW = modes.length * chipW + (modes.length - 1) * gap;
    let mx = cx - totalW / 2;
    modes.forEach((m, i) => {
      const selected = this.game.menuMode === i;
      this._menuButton(c, mx, 322, chipW, chipH, m.label, 'mode', i,
        { selected, size: 16, color: selected ? '#fff' : '#9fb3d1' });
      mx += chipW + gap;
    });
    const mode = modes[this.game.menuMode];
    Utils.text(c, mode.desc, cx, 398, { size: 14, color: CONFIG.colors.accent, align: 'center' });

    // Daily challenge detail line under the description.
    if (mode.id === 'daily') {
      const d = Daily.today();
      const mods = d.mods.map(m => m.label).join('  ·  ');
      Utils.text(c, mods || 'NO MODIFIERS', cx, 422, { size: 12, color: CONFIG.colors.gold, align: 'center', glow: 4 });
      const best = Daily.best(d.key);
      Utils.text(c, best ? "TODAY'S BEST  " + Utils.commas(best) : "BE THE FIRST TODAY", cx, 442,
        { size: 12, color: '#9fb3d1', align: 'center' });
    }

    // --- launch ---
    const a = 0.6 + 0.4 * Math.sin(this.menuPulse);
    const lw = 300, lh = 56, lx = cx - lw / 2, ly = 470;
    this._menuButton(c, lx, ly, lw, lh, '▶  LAUNCH', 'launch', null, { selected: true, size: 22 });
    Utils.text(c, 'ENTER / TAP', cx, ly + lh + 18, { size: 12, color: '#9fb3d1', align: 'center', alpha: a });

    // --- secondary buttons: hangar / settings / achievements ---
    const bw = 176, bh = 46, bgap = 12;
    const brow = 3 * bw + 2 * bgap;
    let bx = cx - brow / 2;
    const by = 556;
    this._menuButton(c, bx, by, bw, bh, 'HANGAR  (H)', 'hangar', null, { size: 14, color: CONFIG.colors.accent });
    bx += bw + bgap;
    this._menuButton(c, bx, by, bw, bh, 'SETTINGS  (O)', 'settings', null, { size: 14, color: CONFIG.colors.accent });
    bx += bw + bgap;
    const ach = Ach.unlockedCount() + '/' + Ach.total();
    this._menuButton(c, bx, by, bw, bh, 'AWARDS ' + ach + '  (A)', 'achievements', null, { size: 14, color: CONFIG.colors.gold });

    // --- controls reference (compact) ---
    Utils.text(c, 'MOVE  ◀ ▶ / A D / DRAG      FIRE  SPACE / HOLD      BEAM  SHIFT / X', cx, 648,
      { size: 12, color: '#9fb3d1', align: 'center' });
    Utils.text(c, 'PAUSE  ESC / P      MUTE  M', cx, 670, { size: 12, color: '#9fb3d1', align: 'center' });

    // --- stats footer ---
    Utils.text(c, 'HI-SCORE  ' + Utils.commas(this.game.hiScore), cx, 740, {
      size: 18, color: CONFIG.colors.gold, align: 'center', glow: 8,
    });
    Utils.text(c, '◈ ' + Utils.commas(Meta.credits) + ' CREDITS', cx, 770, {
      size: 15, color: CONFIG.colors.accent, align: 'center', glow: 6,
    });
    Utils.text(c, Sound.muted ? '🔇 SOUND OFF  (M)' : '🔊 SOUND ON  (M)', cx, 840, {
      size: 13, color: '#9fb3d1', align: 'center',
    });
  }

  drawPause(c) {
    c.save();
    c.fillStyle = 'rgba(4,6,16,0.7)';
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    c.restore();
    const cx = CONFIG.WIDTH / 2, cy = CONFIG.HEIGHT / 2;
    Utils.text(c, 'PAUSED', cx, cy - 20, { size: 64, color: '#fff', align: 'center', glow: 20 });
    Utils.text(c, 'ESC / P  to resume   ·   M  toggle sound', cx, cy + 30,
      { size: 16, color: '#9fb3d1', align: 'center' });
    Utils.text(c, 'O  settings   ·   Q  quit to menu', cx, cy + 58,
      { size: 14, color: '#9fb3d1', align: 'center' });
  }

  drawGameOver(c) {
    c.save();
    c.fillStyle = 'rgba(4,6,16,0.78)';
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    c.restore();
    const cx = CONFIG.WIDTH / 2;
    const g = this.game;
    Utils.text(c, g.victory ? 'VICTORY' : 'GAME OVER', cx, 300, {
      size: 76, color: g.victory ? CONFIG.colors.gold : CONFIG.colors.danger,
      align: 'center', glow: 22,
    });
    const modeLabel = (CONFIG.modes.find(m => m.id === g.mode) || {}).label || '';
    Utils.text(c, g.victory ? 'CAMPAIGN COMPLETE · EARTH SECURED' : modeLabel + ' RUN', cx, 332, {
      size: 13, color: g.victory ? CONFIG.colors.good : '#9fb3d1', align: 'center', glow: g.victory ? 6 : 0,
    });

    this.panel(c, cx - 200, 360, 400, 230);
    const stats = [
      ['SCORE', Utils.commas(g.score)],
      ['BEST', Utils.commas(g.hiScore)],
      ['WAVE REACHED', String(g.waveCount)],
      ['BOSSES SLAIN', String(g.bossesSlain)],
      ['BEST COMBO', 'x' + g.bestCombo],
    ];
    stats.forEach((s, i) => {
      const y = 402 + i * 40;
      Utils.text(c, s[0], cx - 170, y, { size: 16, color: '#9fb3d1' });
      Utils.text(c, s[1], cx + 170, y, { size: 18, color: '#fff', align: 'right', glow: 6 });
    });
    if (g.newHiScore) {
      Utils.text(c, '★ NEW HIGH SCORE ★', cx, 360 - 16, {
        size: 18, color: CONFIG.colors.gold, align: 'center', glow: 12,
        alpha: 0.6 + 0.4 * Math.sin(this.menuPulse * 2),
      });
    }
    this.menuPulse += 0.05;
    Utils.text(c, '◈ +' + Utils.commas(g.creditsEarned) + ' CR    ·    BALANCE  ' + Utils.commas(Meta.credits), cx, 610, {
      size: 17, color: CONFIG.colors.gold, align: 'center', glow: 8,
    });
    if (g.mode === 'daily' && g.newDailyBest) {
      Utils.text(c, '★ NEW DAILY BEST ★', cx, 634, {
        size: 15, color: CONFIG.colors.good, align: 'center', glow: 10,
        alpha: 0.6 + 0.4 * Math.sin(this.menuPulse * 2),
      });
    }
    Utils.text(c, '▶  ENTER / TAP  play again       H  hangar', cx, 660, {
      size: 19, color: '#fff', align: 'center', glow: 12,
      alpha: 0.6 + 0.4 * Math.sin(this.menuPulse),
    });
    Utils.text(c, 'O  settings   ·   A  awards   ·   Q  return to menu', cx, 690, {
      size: 14, color: '#9fb3d1', align: 'center',
    });
  }

  // Big banner shown at the start of a wave / when a boss appears.
  drawBanner(c, title, sub, t, color) {
    // t in [0,1]; fade in, hold, fade out handled by caller via alpha
    const cx = CONFIG.WIDTH / 2, cy = CONFIG.HEIGHT / 2 - 40;
    const a = t;
    Utils.text(c, title, cx, cy, {
      size: 56, color: color || '#fff', align: 'center', glow: 20, alpha: a,
    });
    if (sub) Utils.text(c, sub, cx, cy + 40, {
      size: 18, color: '#cfe6ff', align: 'center', alpha: a,
    });
  }
}
