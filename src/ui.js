/* =====================================================================
 * ui.js — All on-screen UI: the in-game HUD, plus the menu / pause /
 * game-over / level-transition overlays. Pure drawing; the Game owns the
 * state machine and tells the UI which screen to render.
 * ===================================================================== */

// Story/dialogue typeface — condensed and readable next to Orbitron's
// display-heavy HUD voice. Loaded non-blocking alongside Orbitron; the
// system fallback keeps everything legible offline.
const DIALOGUE_FONT = "'Rajdhani', 'Segoe UI', 'Trebuchet MS', sans-serif";

class UI {
  constructor(game) {
    this.game = game;
    this.menuPulse = 0;
    this.starAngle = 0;
    this.dispScore = 0;     // animated score read-out (rolls up to game.score)
  }

  // Is the mouse/touch pointer currently over this rect? (menu hover state)
  _hover(r) {
    const p = this.game.input.pointer;
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  // Word-wrap `text` to maxW at the given size; returns the lines. Cheap
  // enough for the briefing/comm panels (a handful of measureText calls).
  _wrap(c, text, maxW, sizePx, font = DIALOGUE_FONT) {
    c.save();
    c.font = `600 ${sizePx}px ${font}`;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const probe = cur ? cur + ' ' + w : w;
      if (cur && c.measureText(probe).width > maxW) { lines.push(cur); cur = w; }
      else cur = probe;
    }
    c.restore();
    if (cur) lines.push(cur);
    return lines;
  }

  // One centred dialogue line: "WHO  text" with the speaker in their colour
  // (name in the HUD voice, the line itself in the dialogue face).
  _dialogueLine(c, who, text, cx, y, size, alpha) {
    c.save();
    c.font = `700 ${size - 2}px 'Orbitron', 'Trebuchet MS', sans-serif`;
    const whoStr = who + '  ';
    const w1 = c.measureText(whoStr).width;
    c.font = `600 ${size}px ${DIALOGUE_FONT}`;
    const x0 = cx - (w1 + c.measureText(text).width) / 2;
    c.restore();
    Utils.text(c, whoStr, x0, y, { size: size - 2, color: Campaign.speakerColor(who), alpha, glow: 5 });
    Utils.text(c, text, x0 + w1, y, { size, color: '#dfe9ff', alpha, font: DIALOGUE_FONT, weight: 600 });
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

  // Subtler frame for live gameplay — focuses the eye without dimming the HUD.
  drawWorldVignette(c) {
    const g = c.createRadialGradient(
      CONFIG.WIDTH / 2, CONFIG.HEIGHT * 0.5, CONFIG.HEIGHT * 0.36,
      CONFIG.WIDTH / 2, CONFIG.HEIGHT * 0.5, CONFIG.HEIGHT * 0.74);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.34)');
    c.fillStyle = g;
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  }

  // --- in-game HUD --------------------------------------------------------
  drawHUD(c) {
    const g = this.game;

    // score + hi-score (top-left) — the read-out rolls up toward the real score
    if (g.score < this.dispScore) this.dispScore = g.score;        // snap on reset
    else this.dispScore = Math.min(g.score, this.dispScore + Math.max(1, (g.score - this.dispScore) * 0.18));
    const rolling = g.score - this.dispScore > 1;
    Utils.text(c, 'SCORE', 22, 30, { size: 12, color: '#9fb3d1', glow: 0 });
    Utils.text(c, Utils.commas(this.dispScore), 22, 56,
      { size: 26, color: '#fff', glow: rolling ? 16 : 8, glowColor: CONFIG.colors.gold });
    Utils.text(c, 'HI ' + Utils.commas(g.hiScore), 22, 78, { size: 12, color: CONFIG.colors.gold });

    // top-right: campaign sector readout + wave pips, or the endless counters
    if (g.mode === 'campaign') {
      const def = Campaign.sector(g.sector);
      Utils.text(c, 'SECTOR ' + g.sector + ' / ' + Campaign.count(), CONFIG.WIDTH - 22, 30,
        { size: 16, color: '#fff', align: 'right', glow: 6 });
      Utils.text(c, def.name, CONFIG.WIDTH - 22, 52,
        { size: 12, color: CONFIG.colors.accent, align: 'right' });
      // progress pips: a dot per wave, a diamond for the sector boss
      const total = def.waves.length;
      const py = 66, pulse = 0.55 + 0.45 * Math.sin(Date.now() / 180);
      c.save();
      for (let i = 0; i < total; i++) {
        const px = CONFIG.WIDTH - 27 - (total - i) * 16;
        const done = g.sectorWave > total || i < g.sectorWave - 1;
        const cur = g.sectorWave <= total && i === g.sectorWave - 1;
        c.beginPath();
        c.arc(px, py, 4, 0, Math.PI * 2);
        if (done) { c.fillStyle = CONFIG.colors.good; c.globalAlpha = 0.9; c.fill(); }
        else if (cur) {
          c.fillStyle = CONFIG.colors.accent; c.globalAlpha = pulse;
          c.shadowColor = CONFIG.colors.accent; c.shadowBlur = 8; c.fill();
          c.shadowBlur = 0;
        } else {
          c.globalAlpha = 0.45; c.lineWidth = 1.5;
          c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke();
        }
      }
      // boss diamond
      const bx = CONFIG.WIDTH - 27, bossUp = g.sectorWave > total;
      c.globalAlpha = bossUp ? pulse : 0.5;
      c.translate(bx, py);
      c.rotate(Math.PI / 4);
      if (bossUp) {
        c.fillStyle = CONFIG.colors.danger;
        c.shadowColor = CONFIG.colors.danger; c.shadowBlur = 10;
        c.fillRect(-4.5, -4.5, 9, 9);
      } else {
        c.lineWidth = 1.5; c.strokeStyle = CONFIG.colors.danger;
        c.strokeRect(-4.5, -4.5, 9, 9);
      }
      c.restore();
    } else {
      Utils.text(c, 'WAVE ' + g.waveCount, CONFIG.WIDTH - 22, 30,
        { size: 16, color: '#fff', align: 'right', glow: 6 });
      Utils.text(c, 'LEVEL ' + g.level, CONFIG.WIDTH - 22, 52,
        { size: 12, color: CONFIG.colors.accent, align: 'right' });
    }

    // boss bar overrides the top strip
    if (g.boss && g.boss.alive) g.boss.drawHealthBar(c);

    // combo — the count grows and a screen-edge glow builds as it climbs
    if (g.combo > 1) {
      const t = Utils.clamp(g.comboTimer / CONFIG.combo.window, 0, 1);
      const lvl = g.combo / CONFIG.combo.max;            // 0..1
      const pulse = 0.85 + 0.15 * Math.sin(Date.now() / 110);
      if (Meta.fx() && g.combo >= 4) {
        const a = Utils.clamp((g.combo - 3) / (CONFIG.combo.max - 3), 0, 1) * 0.55 * pulse;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = a;
        c.strokeStyle = CONFIG.colors.gold;
        c.lineWidth = 6;
        c.shadowColor = CONFIG.colors.gold;
        c.shadowBlur = 42;
        Utils.roundRect(c, 7, 7, CONFIG.WIDTH - 14, CONFIG.HEIGHT - 14, 16);
        c.stroke();
        c.restore();
      }
      Utils.text(c, `x${g.combo}  COMBO`, CONFIG.WIDTH / 2, 96,
        { size: 20 + 14 * lvl, color: CONFIG.colors.gold, align: 'center', glow: 10 + 14 * lvl });
      c.save();
      c.fillStyle = CONFIG.colors.gold;
      c.globalAlpha = 0.8;
      c.fillRect(CONFIG.WIDTH / 2 - 60, 108, 120 * t, 3);
      c.restore();
    }

    // --- bottom HUD strip ---
    // With a control deck (phones) the lives / energy / pause readouts live
    // in the deck (drawDeck) so the playfield stays clear; without one they
    // overlay the bottom of the world as before.
    const deck = CONFIG.DECK_H > 0;
    const baseY = CONFIG.HEIGHT - 30;

    if (!deck) {
      this._drawLives(c, 30, baseY, 22, 1.1, 'left');
      const ew = 200, ex = CONFIG.WIDTH - ew - 24, ey = baseY - 6;
      this._energyBar(c, ex, ey, ew, 12);
      Utils.text(c, 'BEAM', ex - 8, ey + 11, { size: 11, color: '#9fb3d1', align: 'right' });
      // on-playfield pause chip (touch overlay mode only)
      if (g.state === 'playing' && g.input.buttonsActive())
        this._pauseChip(c, g.input.buttonRect('pause'), false);
    }

    // active power-up chips (bottom-left)
    const chips = [];
    if (g.player.rapid) chips.push(['RAPID', g.player.rapidTimer, CONFIG.colors.accent]);
    if (g.player.spread) chips.push(['SPREAD', g.player.spreadTimer, CONFIG.colors.good]);
    if (g.player.shield > 0) chips.push(['SHIELD x' + g.player.shield, 1, CONFIG.colors.accent2]);
    chips.forEach((ch, i) => {
      const x = 30, y = deck ? baseY - i * 18 : baseY - 34 - i * 18;
      Utils.text(c, ch[0], x, y, { size: 12, color: ch[2], glow: 6 });
    });

    // story comms (campaign chatter) float above the bottom strip
    this.drawComms(c);
  }

  // Lives row — the last life pulses red as a danger tell. align 'left'
  // anchors at x; 'center' centres the row of maxLives icons on x.
  _drawLives(c, x, y, step, scale, align = 'left') {
    const p = this.game.player;
    const x0 = align === 'center' ? x - (p.maxLives - 1) * step / 2 : x;
    const lowLife = p.alive && p.lives <= 1;
    const lifePulse = 0.6 + 0.4 * Math.sin(Date.now() / 140);
    for (let i = 0; i < p.maxLives; i++) {
      const filled = i < p.lives;
      let col = filled ? CONFIG.colors.accent : 'rgba(255,255,255,0.15)';
      if (filled && lowLife) col = CONFIG.colors.danger;
      c.save();
      if (filled && lowLife) c.globalAlpha = lifePulse;
      this.shipIcon(c, x0 + i * step, y, scale, col);
      c.restore();
    }
  }

  // Beam-energy bar with a travelling shimmer (HUD strip + control deck).
  _energyBar(c, ex, ey, ew, eh) {
    const g = this.game;
    c.save();
    Utils.roundRect(c, ex, ey, ew, eh, eh / 2);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    c.fill();
    const pct = g.player.energy / g.player.maxEnergy;
    const col = g.player.cooldown ? CONFIG.colors.danger : CONFIG.colors.gold;
    Utils.roundRect(c, ex, ey, ew * pct, eh, eh / 2);
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 10;
    c.fill();
    if (pct > 0.02 && !g.player.cooldown) {
      // shimmer sweep
      Utils.roundRect(c, ex, ey, ew * pct, eh, eh / 2);
      c.clip();
      const sx = ex + ((Date.now() / 7) % (ew + 60)) - 30;
      const sh = c.createLinearGradient(sx - 24, 0, sx + 24, 0);
      sh.addColorStop(0, 'rgba(255,255,255,0)');
      sh.addColorStop(0.5, 'rgba(255,255,255,0.55)');
      sh.addColorStop(1, 'rgba(255,255,255,0)');
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = sh;
      c.fillRect(sx - 24, ey, 48, eh);
    }
    c.restore();
  }

  // Small pause/resume chip (vector icon — emoji glyphs render inconsistently
  // across mobile browsers). Geometry comes from Input.buttonRect('pause').
  _pauseChip(c, r, paused) {
    c.save();
    c.globalAlpha = 0.85;
    Utils.roundRect(c, r.x, r.y, r.w, r.h, 12);
    c.fillStyle = 'rgba(20,28,48,0.85)';
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(70,224,255,0.55)';
    c.stroke();
    c.fillStyle = '#cfe6ff';
    const mx = r.x + r.w / 2, my = r.y + r.h / 2;
    if (paused) {
      c.beginPath();
      c.moveTo(mx - 5, my - 9); c.lineTo(mx + 9, my); c.lineTo(mx - 5, my + 9);
      c.closePath(); c.fill();
    } else {
      c.fillRect(mx - 9, my - 9, 6, 18);
      c.fillRect(mx + 3, my - 9, 6, 18);
    }
    c.restore();
  }

  // The mobile CONTROL DECK — the band below the 720x960 world (height
  // CONFIG.DECK_H, sized by main.js layout()). In play states it holds the
  // touch clusters plus pause / lives / energy so controls and thumbs stay
  // OFF the playfield; in other states it's a quiet cabinet panel. Drawn in
  // EVERY state so the band never reads as dead pixels.
  drawDeck(c) {
    const g = this.game, d = CONFIG.DECK_H;
    if (d <= 0) return;
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    c.save();
    const bg = c.createLinearGradient(0, H, 0, H + d);
    bg.addColorStop(0, '#0b1024');
    bg.addColorStop(1, '#04050d');
    c.fillStyle = bg;
    c.fillRect(0, H, W, d);
    c.fillStyle = 'rgba(70,224,255,0.35)';
    c.fillRect(0, H, W, 1.5);
    c.restore();

    const inPlay = g.state === 'playing' || g.state === 'paused';
    if (!inPlay) {
      Utils.text(c, 'KNOTZ : INVADE SPACE', W / 2, H + d / 2 + 5, {
        size: 12, color: 'rgba(159,179,209,0.5)', align: 'center', spacing: 4 });
      return;
    }

    if (g.input.buttonsActive()) this.drawTouchControls(c, g.input);

    // centre column between the thumb clusters: pause chip, lives, energy
    const pr = g.input.buttonRect('pause');
    this._pauseChip(c, pr, g.state === 'paused');
    const ly = pr.y + pr.h + 18;
    this._drawLives(c, W / 2, ly, 20, 1.0, 'center');
    this._energyBar(c, W / 2 - 70, ly + 14, 140, 10);
  }

  // The active comm line: a small transmission card with the speaker's name
  // and a typewriter reveal. Sits bottom-centre; lifts clear of the on-screen
  // touch buttons when they're active.
  drawComms(c) {
    const m = this.game.comms[0];
    if (!m || this.game.state === 'gameover') return;
    const a = m.t > m.dur - 350 ? Math.max(0, (m.dur - m.t) / 350)
      : Math.min(1, m.t / 180);
    const shown = Math.min(m.text.length, Math.floor(m.t / 16));
    const col = Campaign.speakerColor(m.who);
    const w = 480, x = (CONFIG.WIDTH - w) / 2;
    const lines = this._wrap(c, m.text, w - 30, 14.5);
    const h = 34 + lines.length * 18;
    // lift clear of the on-screen buttons only when they OVERLAY the world
    // (with a control deck the buttons live below the playfield)
    const overlayBtns = this.game.input.buttonsActive() && CONFIG.DECK_H === 0;
    const y = CONFIG.HEIGHT - (overlayBtns ? 286 : 184) - h;
    c.save();
    c.globalAlpha = 0.85 * a;
    Utils.roundRect(c, x, y, w, h, 9);
    c.fillStyle = 'rgba(6,10,24,0.86)';
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 10;
    c.stroke();
    c.restore();
    Utils.text(c, '▸ ' + m.who, x + 15, y + 19, { size: 11, color: col, glow: 6, alpha: a });
    let budget = shown;
    lines.forEach((ln, i) => {
      if (budget <= 0) return;
      Utils.text(c, ln.slice(0, budget), x + 15, y + 38 + i * 18,
        { size: 14.5, color: '#dfe9ff', alpha: a, font: DIALOGUE_FONT, weight: 600 });
      budget -= ln.length + 1;
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
    const deck = CONFIG.DECK_H > 0;   // deck buttons sit off-field: bigger, bolder
    c.save();
    for (const [kind, glyph, on, col] of btns) {
      const r = input.buttonRect(kind);
      const radius = (kind === 'left' || kind === 'right') ? r.w / 2 : (deck ? 22 : 16);
      c.globalAlpha = on ? 0.62 : (deck ? 0.42 : 0.26);
      Utils.roundRect(c, r.x, r.y, r.w, r.h, radius);
      c.fillStyle = on ? col : 'rgba(20,28,48,0.82)';
      c.lineWidth = 2.5;
      c.strokeStyle = col;
      if (on) { c.shadowColor = col; c.shadowBlur = 16; }
      c.fill();
      c.stroke();
      c.shadowBlur = 0;
      const multi = glyph.length > 1;
      const gs = multi ? (deck ? 19 : 16) : (deck ? 42 : 34);
      Utils.text(c, glyph, r.x + r.w / 2, r.y + r.h / 2 + (multi ? gs * 0.32 : gs * 0.33), {
        size: gs, color: '#fff', align: 'center', alpha: on ? 1 : 0.85,
      });
    }
    c.restore();
  }

  // --- title / menu -------------------------------------------------------
  // A small clickable button helper used across the menu. Pushes a hit-rect
  // into menuRects and returns it.
  _menuButton(c, x, y, w, h, label, kind, index, opt = {}) {
    const hover = this._hover({ x, y, w, h });
    const hot = opt.selected || hover;
    c.save();
    Utils.roundRect(c, x, y, w, h, 10);
    c.fillStyle = hot ? (hover && !opt.selected ? 'rgba(70,224,255,0.12)' : 'rgba(70,224,255,0.18)') : 'rgba(10,14,30,0.78)';
    c.fill();
    c.lineWidth = hot ? 2.5 : 1.5;
    c.strokeStyle = hot ? CONFIG.colors.accent : 'rgba(70,224,255,0.32)';
    if (hot) { c.shadowColor = CONFIG.colors.accent; c.shadowBlur = hover ? 18 : 14; }
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

    // Campaign detail: the operation codename + persistent story progress.
    if (mode.id === 'campaign') {
      Utils.text(c, Campaign.codename + '  ·  ' + Campaign.count() + ' SECTORS', cx, 422,
        { size: 12, color: CONFIG.colors.gold, align: 'center', glow: 4 });
      const wins = Meta.campaignWins(), best = Meta.campaignBest();
      const line = wins > 0 ? '★ EARTH SAVED ×' + wins + ' ★'
        : best > 0 ? 'FURTHEST: SECTOR ' + best + ' — ' + Campaign.sector(best).name + ' SECURED'
        : 'FIRST FLIGHT — NO SECTORS SECURED YET';
      Utils.text(c, line, cx, 442,
        { size: 12, color: (wins || best) ? CONFIG.colors.good : '#9fb3d1', align: 'center' });
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
    // sound toggle is a real button now (M was keyboard-only — touch players
    // had no way to mute)
    this._menuButton(c, cx - 120, 818, 240, 36,
      Sound.muted ? '🔇 SOUND OFF  (M)' : '🔊 SOUND ON  (M)', 'mute', null,
      { size: 13, color: '#9fb3d1' });
    // fullscreen for touch devices (hidden where the API is unavailable, e.g.
    // iOS Safari — there, "Add to Home Screen" installs the PWA instead)
    if (this.game.input.hasTouch && typeof document !== 'undefined' && document.fullscreenEnabled) {
      this._menuButton(c, cx - 120, 864, 240, 36, '⛶  FULLSCREEN', 'fullscreen', null,
        { size: 13, color: CONFIG.colors.accent });
    }
  }

  // --- campaign sector briefing (the 'briefing' state) ---------------------
  // Shown on arrival in every sector while the starfield streaks past in
  // warp. Sector title card, typewriter story dialogue, a threat readout,
  // and the engage prompt. Sets game.briefRevealed once all text is out so
  // the Game knows whether FIRE should fast-forward or launch.
  drawBriefing(c) {
    const g = this.game;
    const def = Campaign.sector(g.sector);
    const cx = CONFIG.WIDTH / 2;
    this.menuPulse += 0.05;
    this.vignette(c);
    this.menuRects = [];
    this._menuButton(c, 18, 16, 150, 40, '◀  COMMAND', 'abort', null, { size: 12, color: '#9fb3d1' });

    Utils.text(c, Campaign.codename, cx, 124, {
      size: 13, color: CONFIG.colors.gold, align: 'center', glow: 6, spacing: 3 });
    Utils.text(c, 'SECTOR ' + g.sector + ' / ' + Campaign.count(), cx, 160, {
      size: 16, color: CONFIG.colors.accent, align: 'center', spacing: 2 });
    Utils.text(c, def.name, cx, 210, {
      size: 44, color: '#fff', align: 'center', glow: 22, glowColor: CONFIG.colors.accent, spacing: 3 });
    Utils.text(c, def.sub, cx, 240, {
      size: 16, color: '#9fb3d1', align: 'center', font: DIALOGUE_FONT, weight: 600 });

    // --- sector progress map: the corridor home, Earth at the end ---
    const mapY = 276, span = 400, x0 = cx - span / 2 - 14;
    const step = span / Campaign.count();
    const pulse = 0.55 + 0.45 * Math.sin(this.menuPulse * 1.6);
    c.save();
    for (let i = 1; i <= Campaign.count(); i++) {     // connecting segments
      const nx = x0 + (i - 1) * step;
      c.strokeStyle = i < g.sector ? 'rgba(63,245,139,0.75)' : 'rgba(255,255,255,0.18)';
      c.lineWidth = 2;
      c.beginPath(); c.moveTo(nx + 10, mapY); c.lineTo(nx + step - 10, mapY); c.stroke();
    }
    for (let i = 1; i <= Campaign.count(); i++) {     // sector nodes
      const nx = x0 + (i - 1) * step;
      const cleared = i < g.sector, cur = i === g.sector;
      c.beginPath(); c.arc(nx, mapY, cur ? 7 : 5.5, 0, Math.PI * 2);
      if (cleared) { c.globalAlpha = 0.95; c.fillStyle = CONFIG.colors.good; c.fill(); }
      else if (cur) {
        c.globalAlpha = 1; c.fillStyle = CONFIG.colors.accent;
        c.shadowColor = CONFIG.colors.accent; c.shadowBlur = 16 * pulse; c.fill();
        c.shadowBlur = 0;
        c.globalAlpha = pulse; c.lineWidth = 2; c.strokeStyle = '#fff';
        c.beginPath(); c.arc(nx, mapY, 11, 0, Math.PI * 2); c.stroke();
      } else {
        c.globalAlpha = 0.5; c.lineWidth = 1.5; c.strokeStyle = '#9fb3d1'; c.stroke();
      }
      c.globalAlpha = 1;
    }
    // Earth — the little blue marble at the end of the corridor
    const ex = x0 + Campaign.count() * step;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = '#3fa2f5';
    c.shadowColor = CONFIG.colors.accent;
    c.shadowBlur = 16;
    c.beginPath(); c.arc(ex, mapY, 8, 0, Math.PI * 2); c.fill();
    c.restore();
    Utils.text(c, 'EARTH', ex, mapY + 28, { size: 10, color: CONFIG.colors.accent, align: 'center' });

    // --- story dialogue (typewriter across the entries in order) ---
    const size = 15.5, lh = 21, entryGap = 13, textX = 84, maxW = 552;
    const blocks = def.brief.map(b => ({ who: b.who, lines: this._wrap(c, b.text, maxW, size) }));
    let panelH = 26, totalChars = 0;
    for (const b of blocks) {
      panelH += 16 + b.lines.length * lh + entryGap;
      for (const ln of b.lines) totalChars += ln.length + 1;
    }
    const py = 316;
    this.panel(c, 56, py, 608, panelH, 0.62);

    let budget = Math.floor(g.briefT / 15);    // chars revealed so far
    g.briefRevealed = budget >= totalChars;
    let y = py + 34;
    for (const b of blocks) {
      if (budget <= 0) break;
      Utils.text(c, '▸ ' + b.who, textX, y, {
        size: 11.5, color: Campaign.speakerColor(b.who), glow: 6, spacing: 1.5 });
      y += 16;
      for (const ln of b.lines) {
        if (budget <= 0) break;
        Utils.text(c, ln.slice(0, budget), textX, y,
          { size, color: '#dfe9ff', font: DIALOGUE_FONT, weight: 600 });
        budget -= ln.length + 1;
        y += lh;
      }
      y += entryGap;
    }

    // --- threat readout (intel is always visible) ---
    const ty = py + panelH + 16;
    this.panel(c, 56, ty, 608, 98, 0.62);
    Utils.text(c, 'THREAT ASSESSMENT', textX, ty + 28, {
      size: 11.5, color: CONFIG.colors.danger, glow: 6, spacing: 1.5 });
    Utils.text(c, def.threat, textX, ty + 52, {
      size: 15, color: '#dfe9ff', font: DIALOGUE_FONT, weight: 600 });
    Utils.text(c, 'COMBAT WAVES ' + def.waves.length +
      '   ·   HOSTILE COMMAND: ' + Campaign.bossFor(def).name, textX, ty + 76, {
      size: 12, color: '#9fb3d1' });

    // --- engage prompt --- (clamped: long wrapped briefs — e.g. wider
    // fallback fonts — must never push the prompt off the bottom)
    const a = 0.6 + 0.4 * Math.sin(this.menuPulse);
    const promptY = Math.min(ty + 152, CONFIG.HEIGHT - 58);
    Utils.text(c, g.briefRevealed ? '▶  TAP / FIRE — ENGAGE' : 'TAP / FIRE — SKIP',
      cx, promptY, { size: 18, color: '#fff', align: 'center', glow: 12, alpha: a });
    Utils.text(c, 'Q — RETURN TO COMMAND', cx, promptY + 28, {
      size: 12, color: '#9fb3d1', align: 'center' });
  }

  drawPause(c) {
    c.save();
    c.fillStyle = 'rgba(4,6,16,0.7)';
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    c.restore();
    this.menuRects = [];
    const cx = CONFIG.WIDTH / 2, cy = CONFIG.HEIGHT / 2;
    Utils.text(c, 'PAUSED', cx, cy - 64, { size: 64, color: '#fff', align: 'center', glow: 20 });
    this._menuButton(c, cx - 150, cy - 14, 300, 56, '▶  RESUME', 'resume', null, { selected: true, size: 20 });
    this._menuButton(c, cx - 150, cy + 56, 144, 48, 'SETTINGS', 'settings', null, { size: 14, color: CONFIG.colors.accent });
    this._menuButton(c, cx + 6, cy + 56, 144, 48, 'QUIT', 'quitmenu', null, { size: 14, color: CONFIG.colors.danger });
    Utils.text(c, 'ESC / P  resume   ·   O  settings   ·   Q  quit   ·   M  mute', cx, cy + 142,
      { size: 13, color: '#9fb3d1', align: 'center' });
  }

  drawGameOver(c) {
    const g = this.game;
    c.save();
    if (g.victory) {
      // lighter wash so the Earth finale + fireworks show through
      c.fillStyle = 'rgba(6,10,26,0.5)';
      c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
      const hg = c.createLinearGradient(0, CONFIG.HEIGHT, 0, CONFIG.HEIGHT * 0.55);
      hg.addColorStop(0, 'rgba(255,212,96,0.5)');
      hg.addColorStop(1, 'rgba(255,212,96,0)');
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = hg;
      c.fillRect(0, CONFIG.HEIGHT * 0.55, CONFIG.WIDTH, CONFIG.HEIGHT * 0.45);
    } else {
      c.fillStyle = 'rgba(4,6,16,0.78)';
      c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    }
    c.restore();
    const cx = CONFIG.WIDTH / 2;
    Utils.text(c, g.victory ? 'VICTORY' : 'GAME OVER', cx, 300, {
      size: 76, color: g.victory ? CONFIG.colors.gold : CONFIG.colors.danger,
      align: 'center', glow: 22,
    });
    const modeLabel = (CONFIG.modes.find(m => m.id === g.mode) || {}).label || '';
    const sub = g.victory ? 'CAMPAIGN COMPLETE · EARTH SECURED'
      : g.mode === 'campaign'
        ? 'FELL IN SECTOR ' + g.sector + ' — ' + Campaign.sector(g.sector).name
        : modeLabel + ' RUN';
    Utils.text(c, sub, cx, 332, {
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
    // Tappable navigation (replaces the old "any tap restarts" — which a
    // still-held FIRE finger used to trigger before the stats were readable).
    this.menuRects = [];
    this._menuButton(c, cx - 160, 652, 320, 54, '▶  PLAY AGAIN', 'again', null, { selected: true, size: 20 });
    const navW = 160, navGap = 10, navY = 718;
    let nx = cx - (4 * navW + 3 * navGap) / 2;
    this._menuButton(c, nx, navY, navW, 44, 'HANGAR  (H)', 'hangar', null, { size: 13, color: CONFIG.colors.accent });
    nx += navW + navGap;
    this._menuButton(c, nx, navY, navW, 44, 'AWARDS  (A)', 'achievements', null, { size: 13, color: CONFIG.colors.gold });
    nx += navW + navGap;
    this._menuButton(c, nx, navY, navW, 44, 'SETTINGS  (O)', 'settings', null, { size: 13, color: CONFIG.colors.accent });
    nx += navW + navGap;
    this._menuButton(c, nx, navY, navW, 44, 'MENU  (Q)', 'menu', null, { size: 13, color: '#9fb3d1' });

    // Victory epilogue: the final comm exchange fades in line by line over
    // the Earth horizon (goT is reset by Game.endGame).
    if (g.victory) {
      this.goT = (this.goT || 0) + 16.7;
      CAMPAIGN_EPILOGUE.forEach((l, i) => {
        const a = Utils.clamp((this.goT - 600 - i * 900) / 500, 0, 1);
        if (a > 0) this._dialogueLine(c, l.who, l.text, cx, 798 + i * 26, 14.5, a);
      });
    } else {
      Utils.text(c, 'ENTER  play again', cx, 796, {
        size: 13, color: '#9fb3d1', align: 'center',
        alpha: 0.6 + 0.4 * Math.sin(this.menuPulse),
      });
    }
  }

  // Big banner shown at the start of a wave / when a boss appears. Sweeps in
  // with a scale-pop + slide and a glowing underline, then fades out.
  drawBanner(c, title, sub, time, duration, color) {
    const cx = CONFIG.WIDTH / 2, cy = CONFIG.HEIGHT / 2 - 40;
    const col = color || '#fff';
    let a = 1, sc = 1, slide = 0;
    const outStart = duration - 450;
    if (time < 320) {
      const inT = Utils.easeOutCubic(Utils.clamp(time / 320, 0, 1));
      a = inT; sc = 0.7 + 0.3 * inT; slide = (1 - inT) * -26;
    } else if (time > outStart) {
      a = Utils.clamp((duration - time) / 450, 0, 1);
      sc = 1 + (1 - a) * 0.06;
    }
    // cinematic band behind the text so banners read over any battlefield
    c.save();
    c.globalAlpha = a * 0.6;
    const band = c.createLinearGradient(0, cy - 56, 0, cy + 60);
    band.addColorStop(0, 'rgba(4,6,16,0)');
    band.addColorStop(0.32, 'rgba(4,6,16,0.85)');
    band.addColorStop(0.68, 'rgba(4,6,16,0.85)');
    band.addColorStop(1, 'rgba(4,6,16,0)');
    c.fillStyle = band;
    c.fillRect(0, cy - 56, CONFIG.WIDTH, 116);
    c.restore();
    // glowing underline that sweeps open
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = a;
    c.fillStyle = col;
    c.shadowColor = col;
    c.shadowBlur = 16;
    const lw = 210 * a * sc;
    c.fillRect(cx - lw, cy + 18, lw * 2, 2.5);
    c.restore();
    // title + subtitle (scaled/slid)
    c.save();
    c.translate(cx, cy + slide);
    c.scale(sc, sc);
    Utils.text(c, title, 0, 0, { size: 56, color: col, align: 'center', glow: 22, alpha: a, spacing: 4 });
    c.restore();
    if (sub) Utils.text(c, sub, cx, cy + 42, { size: 17, color: '#cfe6ff', align: 'center', alpha: a, spacing: 2 });
  }
}
