/* =====================================================================
 * powerup.js — Collectible drops that fall from destroyed enemies.
 * Each type applies an effect when the player catches it.
 * ===================================================================== */

const POWERUP_TYPES = {
  rapid:  { color: '#46e0ff', glyph: '»', label: 'RAPID FIRE' },
  spread: { color: '#3ff58b', glyph: 'W', label: 'SPREAD SHOT' },
  shield: { color: '#7c5cff', glyph: 'O', label: 'SHIELD' },
  energy: { color: '#ffd23f', glyph: 'E', label: 'ENERGY' },
  life:   { color: '#ff4d6d', glyph: '+', label: 'EXTRA LIFE' },
  bomb:   { color: '#ff8c2b', glyph: '*', label: 'SMART BOMB' },
};

class PowerUp {
  constructor() { this.free = true; }
  spawn(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.width = CONFIG.powerup.size;
    this.height = CONFIG.powerup.size;
    this.vy = CONFIG.powerup.fallSpeed;
    this.spin = 0;
    this.bob = Math.random() * Math.PI * 2;
    this.free = false;
  }
  update(dt) {
    if (this.free) return;
    const k = dt / CONFIG.STEP_MS;
    this.y += this.vy * k;
    this.spin += 0.04 * k;
    this.bob += 0.1 * k;
    if (this.y > CONFIG.HEIGHT + 40) this.free = true;
  }
  draw(c) {
    if (this.free) return;
    const def = POWERUP_TYPES[this.type];
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2 + Math.sin(this.bob) * 3;
    const r = this.width / 2;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.shadowColor = def.color;
    c.shadowBlur = 18;
    // rotating diamond capsule
    c.translate(cx, cy);
    c.rotate(Math.sin(this.spin) * 0.3);
    c.fillStyle = 'rgba(10,14,30,0.85)';
    c.strokeStyle = def.color;
    c.lineWidth = 3;
    Utils.roundRect(c, -r, -r, r * 2, r * 2, 8);
    c.fill();
    c.stroke();
    c.restore();
    // glyph
    Utils.text(c, def.glyph, cx, cy + 7, {
      size: 22, color: def.color, align: 'center', glow: 10, glowColor: def.color,
    });
  }
}
