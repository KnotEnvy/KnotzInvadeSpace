/* =====================================================================
 * hangar.js — The upgrade shop, in two guises:
 *  - between runs ('hangar' state): spend credits, then LAUNCH a new run.
 *  - DOCKED mid-campaign ('dock' state): between sectors you land on the
 *    carrier UES Orion — same catalog, but credits were just banked, field
 *    repairs run on arrival, and DEPART resumes the run (no quit-to-menu).
 * Navigable with keyboard (↑/↓ + Enter) or mouse/touch.
 * ===================================================================== */

class Hangar {
  constructor(game) {
    this.game = game;
    this.sel = 0;            // 0..UPGRADES.length (last index = LAUNCH/DEPART)
    this.docked = false;     // mid-campaign refit (the 'dock' state)
    this.flash = 0;
    this.flashColor = '#fff';
    this.rects = [];         // clickable hit areas, rebuilt each draw
    this.rowH = 58;
    this.gap = 7;
    this.x = 100;
    this.w = CONFIG.WIDTH - 200;
    this.y0 = 188;
    this.t = 0;              // dock ambience clock (sparks/scan)
  }

  get launchIndex() { return UPGRADES.length; }
  open(opts = {}) { this.sel = 0; this.docked = !!opts.docked; this.t = 0; }
  update(dt) { if (this.flash > 0) this.flash -= dt; this.t += dt; }

  handleInput(input) {
    const n = UPGRADES.length + 1; // upgrades + launch
    if (input.wasPressed('ArrowUp', 'w')) { this.sel = (this.sel - 1 + n) % n; Sound.uiMove(); }
    if (input.wasPressed('ArrowDown', 's')) { this.sel = (this.sel + 1) % n; Sound.uiMove(); }
    if (input.wasPressed('Escape', 'q')) {
      Sound.uiSelect();
      // Docked = mid-run: there's no menu to fall back to, only the fight.
      if (this.docked) this.game.departDock();
      else this.game.toMenu();
      return;
    }

    if (input.pointer.clicked) {
      const hit = this.rects.find(r =>
        input.pointer.x >= r.x && input.pointer.x <= r.x + r.w &&
        input.pointer.y >= r.y && input.pointer.y <= r.y + r.h);
      if (hit) {
        // the back chip — touch players used to have NO way out of the shop
        if (hit.back) { Sound.uiSelect(); this.game.toMenu(); return; }
        this.sel = hit.index; this.activate(); return;
      }
    }
    if (input.wasPressed('Enter', ' ', 'b')) this.activate();
  }

  activate() {
    if (this.sel === this.launchIndex) {
      Sound.uiSelect();
      if (this.docked) this.game.departDock();
      else this.game.newGame();
      return;
    }
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
    if (this.docked) {
      const g = this.game;
      Utils.text(c, 'DOCKED — ' + Campaign.carrier, cx, 92, {
        size: 42, color: '#fff', align: 'center', glow: 18, glowColor: CONFIG.colors.good });
      Utils.text(c, 'REFIT & REARM  ·  SECTOR ' + g.pendingSector + ' ASSAULT PENDING', cx, 122, {
        size: 12, color: CONFIG.colors.good, align: 'center', glow: 4 });
      const bank = g.lastBank > 0 ? '   ·   +' + Utils.commas(g.lastBank) + ' CR BANKED' : '';
      const credCol = this.flash > 0 && this.flashColor === CONFIG.colors.good ? CONFIG.colors.good : CONFIG.colors.gold;
      Utils.text(c, '◈ ' + Utils.commas(Meta.credits) + ' CR' + bank, cx, 158,
        { size: 22, color: credCol, align: 'center', glow: 10, glowColor: credCol });
    } else {
      // tappable way back to the menu (Esc/Q are keyboard-only)
      const br = { x: 18, y: 18, w: 132, h: 40, back: true };
      c.save();
      Utils.roundRect(c, br.x, br.y, br.w, br.h, 10);
      c.fillStyle = 'rgba(10,14,30,0.78)';
      c.fill();
      c.lineWidth = 1.5;
      c.strokeStyle = 'rgba(70,224,255,0.32)';
      c.stroke();
      c.restore();
      Utils.text(c, '◀  MENU', br.x + br.w / 2, br.y + 26, { size: 13, color: '#9fb3d1', align: 'center' });
      this.rects.push(br);

      Utils.text(c, 'HANGAR', cx, 96, { size: 56, color: '#fff', align: 'center', glow: 18, glowColor: CONFIG.colors.accent });
      Utils.text(c, 'SPEND CREDITS ON PERMANENT UPGRADES', cx, 124, { size: 12, color: '#9fb3d1', align: 'center' });
      const credCol = this.flash > 0 && this.flashColor === CONFIG.colors.good ? CONFIG.colors.good : CONFIG.colors.gold;
      Utils.text(c, '◈ ' + Utils.commas(Meta.credits) + ' CR', cx, 158,
        { size: 24, color: credCol, align: 'center', glow: 10, glowColor: credCol });
    }

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
    Utils.text(c, this.docked ? '▶  DEPART — SECTOR ' + this.game.pendingSector : '▶  LAUNCH RUN',
      cx, ly + 35, { size: 22, color: '#fff', align: 'center', glow: 10 });
    this.rects.push({ x: lx, y: ly, w: lw, h: lh, index: this.launchIndex });

    if (this.docked) this._dockDeck(c, ly + lh);
    Utils.text(c, this.docked
      ? '↑ ↓  select    ENTER  buy / depart    ESC  depart'
      : '↑ ↓  select    ENTER  buy / launch    Q  back to menu', cx, CONFIG.HEIGHT - 30,
      { size: 13, color: '#9fb3d1', align: 'center' });
  }

  // The flight deck under the shop while docked: the Orion's deck chief on
  // comms, your ship under repair (welding sparks + a slow scanline), and
  // the field-repairs confirmation. Pure ambience — nothing interactive.
  _dockDeck(c, topY) {
    const g = this.game;
    const cx = CONFIG.WIDTH / 2;
    const line = Campaign.sector(g.pendingSector).dock;
    if (line) g.ui._dialogueLine(c, line.who, line.text, cx, topY + 38, 14, 1);

    // deck floor glow
    const shipY = topY + 70, shipW = 116, shipH = 100;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const fg = c.createRadialGradient(cx, shipY + shipH + 8, 8, cx, shipY + shipH + 8, 150);
    fg.addColorStop(0, 'rgba(63,245,139,0.22)');
    fg.addColorStop(1, 'rgba(63,245,139,0)');
    c.fillStyle = fg;
    c.fillRect(cx - 160, shipY + 30, 320, shipH + 40);
    c.restore();

    // the ship, engines cold, nose up on the deck
    const img = Assets.img.player;
    const s = CONFIG.sprites.player;
    if (img && img.complete)
      c.drawImage(img, 0, 0, s.frameW, s.frameH, cx - shipW / 2, shipY, shipW, shipH);

    // welding sparks crawling the hull + a slow repair scanline
    if (!Meta.reducedMotion()) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        if (Math.random() < 0.55) continue;
        const px = cx + Utils.rand(-shipW * 0.36, shipW * 0.36);
        const py = shipY + Utils.rand(shipH * 0.25, shipH * 0.9);
        c.fillStyle = Math.random() < 0.3 ? '#fff' : CONFIG.colors.gold;
        c.shadowColor = CONFIG.colors.gold;
        c.shadowBlur = 12;
        c.beginPath();
        c.arc(px, py, Utils.rand(1, 2.4), 0, Math.PI * 2);
        c.fill();
      }
      const scanY = shipY + ((this.t / 14) % (shipH + 20)) - 10;
      c.globalAlpha = 0.3;
      c.fillStyle = CONFIG.colors.good;
      c.fillRect(cx - shipW / 2 - 10, scanY, shipW + 20, 2);
      c.restore();
    }

    Utils.text(c, '✓ FIELD REPAIRS COMPLETE', cx, shipY + shipH + 34, {
      size: 12, color: CONFIG.colors.good, align: 'center', glow: 6 });
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
