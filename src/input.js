/* =====================================================================
 * input.js — Unified keyboard + pointer/touch input.
 * Exposes high-level intents (left/right/fire/beam) plus edge-triggered
 * "pressed" queries for menus, so game code never touches raw events.
 * ===================================================================== */

class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();          // currently-held physical keys
    this.pressed = new Set();       // keys pressed since last consume()
    this.pointer = { active: false, x: 0, y: 0, fire: false, beam: false };
    this.touchLeft = false;
    this.touchRight = false;
    this._listeners();
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
    window.addEventListener('blur', () => this.keys.clear());

    // Pointer (mouse + touch unified). Used by both gameplay and menus.
    const toCanvas = (clientX, clientY) => {
      const r = this.canvas.getBoundingClientRect();
      return {
        x: (clientX - r.left) / r.width * CONFIG.WIDTH,
        y: (clientY - r.top) / r.height * CONFIG.HEIGHT,
      };
    };
    const down = (cx, cy) => {
      const p = toCanvas(cx, cy);
      this.pointer.active = true;
      this.pointer.x = p.x; this.pointer.y = p.y;
      this.pointer.fire = true;
      this.pointer.clicked = true;
    };
    const move = (cx, cy) => {
      const p = toCanvas(cx, cy);
      this.pointer.x = p.x; this.pointer.y = p.y;
    };
    const up = () => { this.pointer.active = false; this.pointer.fire = false; };

    this.canvas.addEventListener('mousedown', (e) => down(e.clientX, e.clientY));
    this.canvas.addEventListener('mousemove', (e) => move(e.clientX, e.clientY));
    window.addEventListener('mouseup', up);
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; down(t.clientX, t.clientY);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; move(t.clientX, t.clientY);
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
  }

  // --- high-level intents (held) -----------------------------------------
  get left()  { return this.keys.has('ArrowLeft') || this.keys.has('a') || this.touchLeft; }
  get right() { return this.keys.has('ArrowRight') || this.keys.has('d') || this.touchRight; }
  get fire()  { return this.keys.has(' ') || this.pointer.fire; }
  get beam()  { return this.keys.has('Shift') || this.keys.has('x') || this.pointer.beam; }

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
