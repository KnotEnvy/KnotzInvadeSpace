/* =====================================================================
 * starfield.js — Multi-layer parallax background. Draws the level's space
 * image (slowly drifting) then three scrolling star layers for depth.
 * ===================================================================== */

class Starfield {
  constructor(images) {
    this.images = images;           // array of HTMLImageElements (level backdrops)
    this.bgIndex = 0;
    this.bgOffset = 0;
    this.layers = [];
    const counts = [60, 40, 24];
    const speeds = [0.25, 0.6, 1.2];
    const sizes = [1, 1.6, 2.4];
    for (let l = 0; l < 3; l++) {
      const stars = [];
      for (let i = 0; i < counts[l]; i++) {
        stars.push({
          x: Math.random() * CONFIG.WIDTH,
          y: Math.random() * CONFIG.HEIGHT,
          r: sizes[l] * Utils.rand(0.6, 1.2),
          tw: Math.random() * Math.PI * 2,
        });
      }
      this.layers.push({ stars, speed: speeds[l] });
    }
  }

  setBackground(index) {
    if (this.images.length) this.bgIndex = index % this.images.length;
  }

  update(dt) {
    const k = dt / CONFIG.STEP_MS;
    this.bgOffset += 0.08 * k;
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        s.y += layer.speed * k;
        s.tw += 0.05 * k;
        if (s.y > CONFIG.HEIGHT + 2) { s.y = -2; s.x = Math.random() * CONFIG.WIDTH; }
      }
    }
  }

  draw(c) {
    // Level backdrop (cover-fit, gently drifting downward, looping).
    const img = this.images[this.bgIndex];
    c.fillStyle = '#05060f';
    c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    if (img && img.complete && img.naturalWidth) {
      const scale = Math.max(CONFIG.WIDTH / img.width, CONFIG.HEIGHT / img.height) * 1.08;
      const w = img.width * scale, h = img.height * scale;
      const x = (CONFIG.WIDTH - w) / 2;
      const drift = (this.bgOffset % h);
      c.globalAlpha = 0.85;
      c.drawImage(img, x, drift - h, w, h);
      c.drawImage(img, x, drift, w, h);
      c.globalAlpha = 1;
      // darken for contrast with sprites/HUD
      c.fillStyle = 'rgba(5,6,18,0.35)';
      c.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    }

    // Parallax stars.
    c.save();
    c.fillStyle = CONFIG.colors.star;
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        const a = 0.5 + 0.5 * Math.sin(s.tw);
        c.globalAlpha = a * 0.9;
        c.beginPath();
        c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }
}
