/* =====================================================================
 * input.js — Unified keyboard + pointer/touch input.
 * Exposes high-level intents (left/right/fire/beam) plus edge-triggered
 * "pressed" queries for menus, so game code never touches raw events.
 * Multi-touch aware: tracks every active touch (and the mouse) so the
 * on-screen control overlay can drive movement + fire + beam at once.
 * ===================================================================== */

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();          // currently-held physical keys
    this.pressed = new Set();       // keys pressed since last consume()
    this.pointer = { active: false, x: 0, y: 0, fire: false, beam: false, clicked: false };
    this.touches = new Map();       // id -> {x,y} for every active touch / mouse
    this.hasTouch = ('ontouchstart' in window) ||
      (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    this._listeners();
  }

  // Should the on-screen buttons be live? (setting + device)
  buttonsActive() {
    const m = (Meta && Meta.settings && Meta.settings.touchControls) || 'auto';
    if (m === 'off') return false;
    if (m === 'on') return true;
    return this.hasTouch;
  }

  // Design-space rect for an on-screen button (shared by Input + UI).
  // Two layouts: with a control deck (CONFIG.DECK_H > 0, phones) the
  // clusters live in the band below the world with bigger thumb targets;
  // without one (tablets / landscape) they overlay the playfield as before.
  buttonRect(kind) {
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT, t = CONFIG.touch, d = CONFIG.DECK_H;
    if (d > 0) {
      // size bounded by the deck height AND the centre column (pause/lives/
      // energy) needing ~170px between the clusters.
      const s = Utils.clamp(d - 20, 88, 124);
      const by = H + (d - s) / 2;
      switch (kind) {
        case 'left':  return { x: 16, y: by, w: s, h: s };
        case 'right': return { x: 16 + s + 10, y: by, w: s, h: s };
        case 'fire':  return { x: W - 16 - s, y: by, w: s, h: s };
        case 'beam':  return { x: W - 16 - s - 10 - s, y: by, w: s, h: s };
        case 'pause': return { x: W / 2 - 30, y: H + (d - 110) / 2, w: 60, h: 46 };
      }
      return { x: 0, y: 0, w: 0, h: 0 };
    }
    const by = H - t.bottom;
    switch (kind) {
      case 'left':  return { x: t.pad, y: by, w: t.size, h: t.size };
      case 'right': return { x: t.pad + t.size + t.gap, y: by, w: t.size, h: t.size };
      case 'fire':  return { x: W - t.pad - t.size, y: by, w: t.size, h: t.size };
      case 'beam':  return { x: W - t.pad - t.size, y: by - t.size - t.gap, w: t.size, h: t.size };
      case 'pause': return { x: W / 2 - 30, y: 10, w: 60, h: 44 };
    }
    return { x: 0, y: 0, w: 0, h: 0 };
  }

  // Is the pointer's last position inside this design-space rect?
  pointerIn(r) {
    const p = this.pointer;
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }
  _touchOn(kind) {
    if (!this.buttonsActive()) return false;
    const r = this.buttonRect(kind);
    for (const p of this.touches.values())
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return true;
    return false;
  }

  _listeners() {
    window.addEventListener('keydown', (e) => {
      // Prevent the page from scrolling on arrows / space.
      if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
        e.preventDefault();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      this.keys.delete(k);
    });
    // A backgrounded / interrupted page can never come back with phantom
    // held keys or touches (stuck controls used to need a full refresh).
    const dropAll = () => {
      this.keys.clear();
      this.touches.clear();
      this.pointer.active = false; this.pointer.fire = false;
    };
    window.addEventListener('blur', dropAll);
    window.addEventListener('pagehide', dropAll);
    if (typeof document !== 'undefined' && document.addEventListener)
      document.addEventListener('visibilitychange', () => { if (document.hidden) dropAll(); });

    // Map client coords into the canvas's design space. Uses the canvas's
    // REAL pixel size (world + control deck), not CONFIG.HEIGHT, so deck
    // buttons below y=960 are reachable.
    const toCanvas = (clientX, clientY) => {
      const r = this.canvas.getBoundingClientRect();
      const dw = this.canvas.width || CONFIG.WIDTH;
      const dh = this.canvas.height || CONFIG.HEIGHT;
      return {
        x: (clientX - r.left) / r.width * dw,
        y: (clientY - r.top) / r.height * dh,
      };
    };

    // Unified press / move / release keyed by a pointer id ('mouse' or touch id).
    const press = (id, cx, cy) => {
      const p = toCanvas(cx, cy);
      this.touches.set(id, p);
      this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.clicked = true;
      // Legacy drag-to-move + tap-to-fire only when the button overlay is off.
      if (!this.buttonsActive()) { this.pointer.active = true; this.pointer.fire = true; }
    };
    const moveTo = (id, cx, cy) => {
      const p = toCanvas(cx, cy);
      if (this.touches.has(id)) this.touches.set(id, p);
      this.pointer.x = p.x; this.pointer.y = p.y;
    };
    const release = (id) => {
      this.touches.delete(id);
      if (this.touches.size === 0) { this.pointer.active = false; this.pointer.fire = false; }
    };

    // Mouse (single pointer).
    this.canvas.addEventListener('mousedown', (e) => press('mouse', e.clientX, e.clientY));
    this.canvas.addEventListener('mousemove', (e) => moveTo('mouse', e.clientX, e.clientY));
    window.addEventListener('mouseup', () => release('mouse'));

    // Touch (multi-pointer). The touch set is rebuilt from e.touches — the
    // browser's authoritative list of CURRENTLY-down touches — on every
    // event, instead of tracking changedTouches incrementally. A missed
    // touchend (system gesture, notification shade, dialog) therefore can
    // never strand a phantom "held" touch that freezes the controls.
    const syncTouches = (e) => {
      for (const id of this.touches.keys())
        if (id !== 'mouse') this.touches.delete(id);
      for (const t of e.touches)
        this.touches.set(t.identifier, toCanvas(t.clientX, t.clientY));
      if (this.touches.size === 0) { this.pointer.active = false; this.pointer.fire = false; }
    };
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      syncTouches(e);
      for (const t of e.changedTouches) {
        const p = toCanvas(t.clientX, t.clientY);
        this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.clicked = true;
        if (!this.buttonsActive()) { this.pointer.active = true; this.pointer.fire = true; }
      }
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      syncTouches(e);
      const t = e.changedTouches[e.changedTouches.length - 1];
      if (t) { const p = toCanvas(t.clientX, t.clientY); this.pointer.x = p.x; this.pointer.y = p.y; }
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      syncTouches(e);
    }, { passive: false });
    this.canvas.addEventListener('touchcancel', (e) => {
      syncTouches(e);
    }, { passive: false });
  }

  // --- high-level intents (held) -----------------------------------------
  get left()  { return this.keys.has('ArrowLeft') || this.keys.has('a') || this._touchOn('left'); }
  get right() { return this.keys.has('ArrowRight') || this.keys.has('d') || this._touchOn('right'); }
  get fire()  { return this.keys.has(' ') || this.pointer.fire || this._touchOn('fire'); }
  get beam()  { return this.keys.has('Shift') || this.keys.has('x') || this.pointer.beam || this._touchOn('beam'); }

  // --- edge-triggered (consume once) -------------------------------------
  wasPressed(...keys) {
    for (const k of keys) if (this.pressed.has(k)) return true;
    return false;
  }
  consumePressed() {
    const clicked = this.pointer.clicked;
    this.pointer.clicked = false;
    const snapshot = { clicked };
    this.pressed.clear();
    return snapshot;
  }
}
