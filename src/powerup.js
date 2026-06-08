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
  constructor() { this.free = true; this.hist = new Trail(6); }
  spawn(x, y, type) {
    this.x = x; this.y = y;
    this.type = type;
    this.width = CONFIG.powerup.size;
    this.height = CONFIG.powerup.size;
    this.vy = CONFIG.powerup.fallSpeed;
    this.spin = 0;
    this.bob = Math.random() * Math.PI * 2;
    this.pulse = Math.random() * Math.PI * 2;
    this.hist.clear();
    this.free = false;
  }
  update(dt) {
    if (this.free) return;
    const k = dt / CONFIG.STEP_MS;
    this.y += this.vy * k;
    this.spin += 0.04 * k;
    this.bob += 0.1 * k;
    this.pulse += 0.12 * k;
    if (Meta.trailsOn()) this.hist.push(this.x + this.width / 2, this.y + this.height / 2);
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
    // soft falling trail (skip i=0, the current position)
    this.hist.forEach((p, i, n) => {
      if (i === 0) return;
      const t = 1 - i / n;
      c.globalAlpha = t * 0.32;
      c.fillStyle = def.color;
      c.beginPath();
      c.arc(p.x, p.y, r * 0.5 * t, 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;
    // pulsing halo — a pre-rendered blob scaled by the pulse (no per-frame
    // gradient allocation); falls back to a gradient if blobs are unavailable.
    const hp = 0.55 + 0.45 * Math.sin(this.pulse);
    const haloR = r * (1.9 + 0.4 * hp);
    c.globalAlpha = 0.4 + 0.3 * hp;
    const blob = GlowSprites.blob(def.color);
    if (blob) {
      c.drawImage(blob, cx - haloR, cy - haloR, haloR * 2, haloR * 2);
    } else {
      const halo = c.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * (1.5 + 0.4 * hp));
      halo.addColorStop(0, def.color);
      halo.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = halo;
      c.beginPath();
      c.arc(cx, cy, haloR, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;
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
