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

  // --- title / menu -------------------------------------------------------
  drawMenu(c) {
    this.menuPulse += 0.05;
    this.vignette(c);

    const cx = CONFIG.WIDTH / 2;
    // title
    Utils.text(c, 'KNOTZ', cx, 240, {
      size: 92, color: '#fff', align: 'center', glow: 24, glowColor: CONFIG.colors.accent,
    });
    Utils.text(c, 'INVADE SPACE', cx, 310, {
      size: 46, color: CONFIG.colors.accent, align: 'center', glow: 18, glowColor: CONFIG.colors.accent2,
    });
    Utils.text(c, 'A MODERN ARCADE SHOOTER', cx, 344, {
      size: 13, color: '#9fb3d1', align: 'center',
    });

    // start prompt
    const a = 0.55 + 0.45 * Math.sin(this.menuPulse);
    Utils.text(c, '▶  PRESS ENTER / TAP TO START', cx, 470, {
      size: 22, color: '#fff', align: 'center', glow: 14, alpha: a,
    });
    Utils.text(c, 'H  ·  HANGAR  (spend credits on upgrades)', cx, 500, {
      size: 14, color: CONFIG.colors.accent, align: 'center',
    });

    // controls panel
    this.panel(c, cx - 220, 520, 440, 200);
    const lines = [
      ['MOVE', '◀  ▶   /   A  D   /  DRAG'],
      ['FIRE', 'SPACE  /  TAP & HOLD'],
      ['ENERGY BEAM', 'SHIFT  /  X'],
      ['PAUSE', 'ESC  /  P'],
    ];
    lines.forEach((l, i) => {
      const y = 560 + i * 34;
      Utils.text(c, l[0], cx - 190, y, { size: 15, color: CONFIG.colors.accent });
      Utils.text(c, l[1], cx + 190, y, { size: 15, color: '#fff', align: 'right' });
    });
    Utils.text(c, 'TIP: chain kills for combo multipliers · collect power-ups', cx, 712, {
      size: 12, color: '#9fb3d1', align: 'center',
    });

    Utils.text(c, 'HI-SCORE  ' + Utils.commas(this.game.hiScore), cx, 768, {
      size: 18, color: CONFIG.colors.gold, align: 'center', glow: 8,
    });
    Utils.text(c, '◈ ' + Utils.commas(Meta.credits) + ' CREDITS', cx, 796, {
      size: 15, color: CONFIG.colors.accent, align: 'center', glow: 6,
    });
    Utils.text(c, Sound.muted ? '🔇 SOUND OFF  (M)' : '🔊 SOUND ON  (M)', cx, 872, {
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
    Utils.text(c, 'Q  to quit to menu', cx, cy + 58,
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
    Utils.text(c, '◈ +' + Utils.commas(g.creditsEarned) + ' CR    ·    BALANCE  ' + Utils.commas(Meta.credits), cx, 614, {
      size: 17, color: CONFIG.colors.gold, align: 'center', glow: 8,
    });
    Utils.text(c, '▶  ENTER / TAP  play again       H  hangar', cx, 656, {
      size: 19, color: '#fff', align: 'center', glow: 12,
      alpha: 0.6 + 0.4 * Math.sin(this.menuPulse),
    });
    Utils.text(c, 'Q  to return to menu', cx, 686, {
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
