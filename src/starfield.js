/* =====================================================================
 * starfield.js — Multi-layer parallax background. Draws the level's space
 * image (slowly drifting) then several scrolling star layers for depth,
 * with twinkle, the occasional shooting star, and bright "hero" stars that
 * flare with a soft cross. setBackground(index) swaps the sector backdrop.
 * ===================================================================== */

class Starfield {
  constructor(images) {
    this.images = images;           // array of HTMLImageElements (level backdrops)
    this.bgIndex = 0;
    this.bgOffset = 0;
    this.layers = [];
    const counts = [70, 44, 26];
    const speeds = [0.22, 0.55, 1.15];
    const sizes = [1, 1.7, 2.6];
    for (let l = 0; l < 3; l++) {
      const stars = [];
      for (let i = 0; i < counts[l]; i++) {
        stars.push({
          x: Math.random() * CONFIG.WIDTH,
          y: Math.random() * CONFIG.HEIGHT,
          r: sizes[l] * Utils.rand(0.6, 1.2),
          tw: Math.random() * Math.PI * 2,
          tws: Utils.rand(0.03, 0.07),
          // a few of the nearest, biggest stars get a flare
          hero: l === 2 && Math.random() < 0.32,
          hue: Utils.pick(['#bfe9ff', '#dfeaff', '#fff4d6', '#cfe0ff']),
        });
      }
      this.layers.push({ stars, speed: speeds[l] });
    }
    this.shooting = [];
    this.shootTimer = Utils.rand(2200, 5200);
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
        s.tw += s.tws * k;
        if (s.y > CONFIG.HEIGHT + 2) { s.y = -2; s.x = Math.random() * CONFIG.WIDTH; }
      }
    }

    // shooting stars — a high-tier flourish; calm under reduced-motion.
    if (Meta.extras() && !Meta.reducedMotion()) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = Utils.rand(2600, 6000);
        const fromLeft = Utils.chance(0.5);
        this.shooting.push({
          x: fromLeft ? Utils.rand(-40, CONFIG.WIDTH * 0.4) : Utils.rand(CONFIG.WIDTH * 0.6, CONFIG.WIDTH + 40),
          y: Utils.rand(40, CONFIG.HEIGHT * 0.5),
          vx: (fromLeft ? 1 : -1) * Utils.rand(6, 10), vy: Utils.rand(3, 6),
          life: 0, max: Utils.rand(360, 620),
        });
      }
    }
    for (const sh of this.shooting) { sh.x += sh.vx * k; sh.y += sh.vy * k; sh.life += dt; }
    Utils.compact(this.shooting, sh => sh.life < sh.max);
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
    for (const layer of this.layers) {
      for (const s of layer.stars) {
        const a = 0.5 + 0.5 * Math.sin(s.tw);
        if (s.hero && Meta.fx()) {
          // soft additive cross-flare on the brightest near stars
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = a * 0.5;
          c.strokeStyle = s.hue;
          c.shadowColor = s.hue;
          c.shadowBlur = 6;
          c.lineWidth = 1;
          const fl = s.r * (2.4 + a * 1.6);
          c.beginPath();
          c.moveTo(s.x - fl, s.y); c.lineTo(s.x + fl, s.y);
          c.moveTo(s.x, s.y - fl); c.lineTo(s.x, s.y + fl);
          c.stroke();
          c.shadowBlur = 0;
          c.globalCompositeOperation = 'source-over';
        }
        c.globalAlpha = a * 0.9;
        c.fillStyle = s.hue;
        c.beginPath();
        c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();

    // Shooting stars (additive streaks with a fading tail).
    if (this.shooting.length) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      for (const sh of this.shooting) {
        const t = sh.life / sh.max;
        const a = Math.sin(Math.PI * t);     // fade in + out
        const len = 18 + 26 * a;
        const nx = sh.vx, ny = sh.vy, mag = Math.hypot(nx, ny) || 1;
        const tx = sh.x - (nx / mag) * len, ty = sh.y - (ny / mag) * len;
        const g = c.createLinearGradient(sh.x, sh.y, tx, ty);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.9 * a) + ')');
        g.addColorStop(1, 'rgba(120,200,255,0)');
        c.strokeStyle = g;
        c.lineWidth = 2;
        c.shadowColor = '#bfe9ff';
        c.shadowBlur = 10;
        c.beginPath();
        c.moveTo(sh.x, sh.y); c.lineTo(tx, ty);
        c.stroke();
      }
      c.restore();
    }
  }
}
