/* =====================================================================
 * settings.js — The Settings screen ('settings' state). Volume sliders
 * (master / music / SFX), screen-shake and reduced-motion toggles, and a
 * difficulty selector. Navigable with keyboard (↑/↓ select, ←/→ adjust)
 * or mouse/touch (drag/click a slider, click a toggle/selector). Values
 * persist immediately to the Meta profile. Reachable from the menu, pause
 * and game-over screens; "back" returns to wherever it was opened from.
 * ===================================================================== */

class SettingsMenu {
  constructor(game) {
    this.game = game;
    this.sel = 0;
    this.rects = [];          // clickable hit areas, rebuilt each draw
    this.rowH = 56;
    this.gap = 10;
    this.x = 110;
    this.w = CONFIG.WIDTH - 220;
    this.y0 = 210;
    this.items = [
      { key: 'master',        type: 'slider', label: 'MASTER VOLUME' },
      { key: 'music',         type: 'slider', label: 'MUSIC VOLUME' },
      { key: 'sfx',           type: 'slider', label: 'SFX VOLUME' },
      { key: 'shake',         type: 'toggle', label: 'SCREEN SHAKE' },
      { key: 'reducedMotion', type: 'toggle', label: 'REDUCED MOTION' },
      { key: 'quality',       type: 'cycle',  label: 'GRAPHICS', options: ['low', 'medium', 'high'] },
      { key: 'difficulty',    type: 'cycle',  label: 'DIFFICULTY', options: ['easy', 'normal', 'hard'] },
      { key: 'touchControls', type: 'cycle',  label: 'TOUCH CONTROLS', options: ['auto', 'on', 'off'] },
      { key: 'haptics',       type: 'toggle', label: 'HAPTICS (VIBRATION)' },
      { type: 'back', label: '◀  BACK' },
    ];
  }

  open() { this.sel = 0; }
  update() {}

  // --- input -------------------------------------------------------------
  handleInput(input) {
    const n = this.items.length;
    if (input.wasPressed('ArrowUp', 'w')) { this.sel = (this.sel - 1 + n) % n; Sound.uiMove(); }
    if (input.wasPressed('ArrowDown', 's')) { this.sel = (this.sel + 1) % n; Sound.uiMove(); }
    if (input.wasPressed('ArrowLeft', 'a')) this.adjust(-1);
    if (input.wasPressed('ArrowRight', 'd')) this.adjust(1);
    if (input.wasPressed('Escape', 'q')) { this.game.closeSettings(); return; }
    if (input.wasPressed('Enter', ' ', 'b')) this.activate();

    if (input.pointer.clicked) {
      const hit = this.rects.find(r =>
        input.pointer.x >= r.x && input.pointer.x <= r.x + r.w &&
        input.pointer.y >= r.y && input.pointer.y <= r.y + r.h);
      if (!hit) return;
      this.sel = hit.index;
      const item = this.items[hit.index];
      if (item.type === 'slider' && hit.barX != null) {
        const v = Utils.clamp((input.pointer.x - hit.barX) / hit.barW, 0, 1);
        Meta.setSetting(item.key, Math.round(v * 20) / 20); // snap to 5%
        Sound.uiMove();
      } else {
        this.activate();
      }
    }
  }

  // ←/→ on the selected row.
  adjust(dir) {
    const item = this.items[this.sel];
    if (!item) return;
    if (item.type === 'slider') {
      const v = Utils.clamp(Math.round((Meta.settings[item.key] + dir * 0.1) * 10) / 10, 0, 1);
      Meta.setSetting(item.key, v);
      Sound.uiMove();
    } else if (item.type === 'toggle') {
      Meta.setSetting(item.key, !Meta.settings[item.key]);
      Sound.uiSelect();
    } else if (item.type === 'cycle') {
      const i = item.options.indexOf(Meta.settings[item.key]);
      const next = (i + dir + item.options.length) % item.options.length;
      Meta.setSetting(item.key, item.options[next]);
      Sound.uiSelect();
    }
  }

  // Enter / click on the selected row.
  activate() {
    const item = this.items[this.sel];
    if (!item) return;
    if (item.type === 'back') { this.game.closeSettings(); return; }
    if (item.type === 'slider') this.adjust(1);   // Enter nudges a slider up
    else this.adjust(1);                          // toggle flips / cycle advances
  }

  // --- rendering ---------------------------------------------------------
  draw(c) {
    this.rects = [];
    c.save();
    c.fillStyle = 'rgba(4,6,16,0.88)';
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    c.restore();

    const cx = CONFIG.WIDTH / 2;
    Utils.text(c, 'SETTINGS', cx, 120, { size: 56, color: '#fff', align: 'center', glow: 18, glowColor: CONFIG.colors.accent });
    Utils.text(c, 'TUNE AUDIO, VISUALS, MOTION & DIFFICULTY', cx, 150, { size: 12, color: '#9fb3d1', align: 'center' });

    this.items.forEach((item, i) => this._row(c, item, i));

    Utils.text(c, '↑ ↓  select     ← →  adjust     ENTER  toggle     Q  back', cx, CONFIG.HEIGHT - 30,
      { size: 13, color: '#9fb3d1', align: 'center' });
  }

  _row(c, item, i) {
    const y = this.y0 + i * (this.rowH + this.gap);
    const sel = this.sel === i;
    const rect = { x: this.x, y, w: this.w, h: this.rowH, index: i };

    // frame
    c.save();
    Utils.roundRect(c, this.x, y, this.w, this.rowH, 10);
    c.fillStyle = sel ? 'rgba(70,224,255,0.16)' : 'rgba(10,14,30,0.72)';
    c.fill();
    c.lineWidth = sel ? 2.5 : 1.5;
    c.strokeStyle = sel ? CONFIG.colors.accent : 'rgba(70,224,255,0.28)';
    if (sel) { c.shadowColor = CONFIG.colors.accent; c.shadowBlur = 14; }
    c.stroke();
    c.restore();

    const midY = y + this.rowH / 2;

    if (item.type === 'back') {
      Utils.text(c, item.label, CONFIG.WIDTH / 2, midY + 7, { size: 20, color: '#fff', align: 'center', glow: sel ? 10 : 0 });
      this.rects.push(rect);
      return;
    }

    // label (left)
    Utils.text(c, item.label, this.x + 22, midY + 6, { size: 16, color: '#fff' });

    if (item.type === 'slider') {
      const barW = 220, barX = this.x + this.w - barW - 64, barY = midY - 5, barH = 10;
      const v = Meta.settings[item.key];
      c.save();
      Utils.roundRect(c, barX, barY, barW, barH, 5);
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.fill();
      Utils.roundRect(c, barX, barY, barW * v, barH, 5);
      c.fillStyle = CONFIG.colors.accent;
      c.shadowColor = CONFIG.colors.accent;
      c.shadowBlur = 10;
      c.fill();
      // knob
      c.beginPath();
      c.arc(barX + barW * v, barY + barH / 2, 8, 0, Math.PI * 2);
      c.fillStyle = '#fff';
      c.fill();
      c.restore();
      Utils.text(c, Math.round(v * 100) + '%', this.x + this.w - 18, midY + 6,
        { size: 15, color: CONFIG.colors.gold, align: 'right' });
      rect.barX = barX; rect.barW = barW;
    } else if (item.type === 'toggle') {
      const on = !!Meta.settings[item.key];
      const col = on ? CONFIG.colors.good : '#6b7a90';
      Utils.text(c, on ? 'ON' : 'OFF', this.x + this.w - 18, midY + 6,
        { size: 18, color: col, align: 'right', glow: on ? 8 : 0, glowColor: col });
    } else if (item.type === 'cycle') {
      const val = Meta.settings[item.key];
      const label = item.key === 'difficulty'
        ? (CONFIG.difficulty[val] || CONFIG.difficulty.normal).label
        : String(val).toUpperCase();
      Utils.text(c, '‹  ' + label + '  ›', this.x + this.w - 18, midY + 6,
        { size: 18, color: CONFIG.colors.gold, align: 'right', glow: 6 });
    }

    this.rects.push(rect);
  }
}
