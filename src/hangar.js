/* =====================================================================
 * hangar.js — The between-runs upgrade shop. Spend credits earned from
 * runs on permanent upgrades, then launch the next run. Navigable with
 * keyboard (↑/↓ + Enter) or mouse/touch (click a row to buy, or LAUNCH).
 * ===================================================================== */

class Hangar {
  constructor(game) {
    this.game = game;
    this.sel = 0;            // 0..UPGRADES.length (last index = LAUNCH)
    this.flash = 0;
    this.flashColor = '#fff';
    this.rects = [];         // clickable hit areas, rebuilt each draw
    this.rowH = 58;
    this.gap = 7;
    this.x = 100;
    this.w = CONFIG.WIDTH - 200;
    this.y0 = 188;
  }

  get launchIndex() { return UPGRADES.length; }
  open() { this.sel = 0; }
  update(dt) { if (this.flash > 0) this.flash -= dt; }

  handleInput(input) {
    const n = UPGRADES.length + 1; // upgrades + launch
    if (input.wasPressed('ArrowUp', 'w')) { this.sel = (this.sel - 1 + n) % n; Sound.uiMove(); }
    if (input.wasPressed('ArrowDown', 's')) { this.sel = (this.sel + 1) % n; Sound.uiMove(); }
    if (input.wasPressed('Escape', 'q')) { Sound.uiSelect(); this.game.toMenu(); return; }

    if (input.pointer.clicked) {
      const hit = this.rects.find(r =>
        input.pointer.x >= r.x && input.pointer.x <= r.x + r.w &&
        input.pointer.y >= r.y && input.pointer.y <= r.y + r.h);
      if (hit) { this.sel = hit.index; this.activate(); return; }
    }
    if (input.wasPressed('Enter', ' ', 'b')) this.activate();
  }

  activate() {
    if (this.sel === this.launchIndex) { Sound.uiSelect(); this.game.newGame(); return; }
    const id = UPGRADES[this.sel].id;
    if (Meta.isMax(id)) { this.flash = 280; this.flashColor = CONFIG.colors.accent; Sound.uiMove(); return; }
    if (Meta.buy(id)) { this.flash = 280; this.flashColor = CONFIG.colors.good; Sound.powerup(); Ach.onUpgrade(); }
    else { this.flash = 280; this.flashColor = CONFIG.colors.danger; Sound.uiMove(); } // can't afford
  }

  draw(c) {
    this.rects = [];
    c.save();
    c.fillStyle = 'rgba(4,6,16,0.86)';
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    c.restore();

    const cx = CONFIG.WIDTH / 2;
    Utils.text(c, 'HANGAR', cx, 96, { size: 56, color: '#fff', align: 'center', glow: 18, glowColor: CONFIG.colors.accent });
    Utils.text(c, 'SPEND CREDITS ON PERMANENT UPGRADES', cx, 124, { size: 12, color: '#9fb3d1', align: 'center' });
    const credCol = this.flash > 0 && this.flashColor === CONFIG.colors.good ? CONFIG.colors.good : CONFIG.colors.gold;
    Utils.text(c, '◈ ' + Utils.commas(Meta.credits) + ' CR', cx, 158,
      { size: 24, color: credCol, align: 'center', glow: 10, glowColor: credCol });

    UPGRADES.forEach((u, i) => this._row(c, u, i));

    // LAUNCH button
    const ly = this.y0 + UPGRADES.length * (this.rowH + this.gap) + 12;
    const lw = 300, lx = cx - lw / 2, lh = 54;
    const launchSel = this.sel === this.launchIndex;
    c.save();
    Utils.roundRect(c, lx, ly, lw, lh, 12);
    c.fillStyle = launchSel ? 'rgba(63,245,139,0.22)' : 'rgba(10,14,30,0.8)';
    c.fill();
    c.lineWidth = launchSel ? 3 : 2;
    c.strokeStyle = CONFIG.colors.good;
    c.shadowColor = CONFIG.colors.good;
    c.shadowBlur = launchSel ? 20 : 8;
    c.stroke();
    c.restore();
    Utils.text(c, '▶  LAUNCH RUN', cx, ly + 35, { size: 22, color: '#fff', align: 'center', glow: 10 });
    this.rects.push({ x: lx, y: ly, w: lw, h: lh, index: this.launchIndex });

    Utils.text(c, '↑ ↓  select    ENTER  buy / launch    Q  back to menu', cx, CONFIG.HEIGHT - 30,
      { size: 13, color: '#9fb3d1', align: 'center' });
  }

  _row(c, u, i) {
    const y = this.y0 + i * (this.rowH + this.gap);
    const sel = this.sel === i;
    const lvl = Meta.level(u.id);
    const maxed = Meta.isMax(u.id);
    const cost = Meta.nextCost(u.id);
    const afford = Meta.canAfford(u.id);
    this.rects.push({ x: this.x, y, w: this.w, h: this.rowH, index: i });

    c.save();
    Utils.roundRect(c, this.x, y, this.w, this.rowH, 10);
    c.fillStyle = sel ? 'rgba(70,224,255,0.16)' : 'rgba(10,14,30,0.72)';
    c.fill();
    c.lineWidth = sel ? 2.5 : 1.5;
    c.strokeStyle = sel ? CONFIG.colors.accent : 'rgba(70,224,255,0.28)';
    if (sel) { c.shadowColor = CONFIG.colors.accent; c.shadowBlur = 14; }
    c.stroke();
    c.restore();

    // icon badge
    Utils.text(c, u.icon, this.x + 26, y + 38, { size: 26, color: CONFIG.colors.accent, align: 'center', glow: 8 });
    // name + desc
    Utils.text(c, u.name, this.x + 52, y + 25, { size: 18, color: '#fff' });
    Utils.text(c, u.desc, this.x + 52, y + 44, { size: 12, color: '#9fb3d1' });

    // level pips
    const pipX = this.x + this.w - 150;
    for (let p = 0; p < u.max; p++) {
      c.save();
      c.beginPath();
      c.arc(pipX + p * 16, y + this.rowH / 2, 5, 0, Math.PI * 2);
      if (p < lvl) { c.fillStyle = CONFIG.colors.good; c.shadowColor = CONFIG.colors.good; c.shadowBlur = 8; c.fill(); }
      else { c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 1.5; c.stroke(); }
      c.restore();
    }

    // cost / status
    const rx = this.x + this.w - 18;
    if (maxed) Utils.text(c, 'MAX', rx, y + 38, { size: 16, color: CONFIG.colors.accent, align: 'right', glow: 6 });
    else Utils.text(c, Utils.commas(cost) + ' CR', rx, y + 38,
      { size: 16, color: afford ? CONFIG.colors.gold : CONFIG.colors.danger, align: 'right' });
  }
}
