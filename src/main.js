/* =====================================================================
 * main.js — Bootstrap: preload sprites + backgrounds, size the canvas
 * responsively, run a loading screen, then drive the fixed-timestep loop.
 * ===================================================================== */

const Assets = { img: {}, backgrounds: [], loaded: 0, total: 0 };

function loadAssets(onProgress, onDone) {
  const sprites = CONFIG.sprites;
  const bgs = CONFIG.backgrounds;
  Assets.total = Object.keys(sprites).length + bgs.length;
  Assets.loaded = 0;

  const tick = () => { Assets.loaded++; onProgress(Assets.loaded / Assets.total);
    if (Assets.loaded >= Assets.total) onDone(); };

  for (const key in sprites) {
    const img = new Image();
    img.onload = tick;
    img.onerror = tick; // don't hard-fail on a missing asset
    img.src = sprites[key].src;
    Assets.img[key] = img;
  }
  for (const path of bgs) {
    const img = new Image();
    img.onload = tick;
    img.onerror = tick;
    img.src = path;
    Assets.backgrounds.push(img);
  }
}

function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  canvas.width = CONFIG.WIDTH;
  canvas.height = CONFIG.HEIGHT;
  ctx.imageSmoothingEnabled = true;

  // Scale the canvas element to fit the viewport while preserving ratio.
  function resize() {
    const ar = CONFIG.WIDTH / CONFIG.HEIGHT;
    const vw = window.innerWidth, vh = window.innerHeight;
    let w = vw, h = vw / ar;
    if (h > vh) { h = vh; w = vh * ar; }
    canvas.style.width = Math.round(w) + 'px';
    canvas.style.height = Math.round(h) + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // --- loading screen ---
  let progress = 0;
  let game = null;
  function loadingFrame() {
    ctx.fillStyle = '#05060f';
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    Utils.text(ctx, 'KNOTZ: INVADE SPACE', CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 40,
      { size: 34, color: '#fff', align: 'center', glow: 16, glowColor: CONFIG.colors.accent });
    const bw = 360, bx = (CONFIG.WIDTH - bw) / 2, by = CONFIG.HEIGHT / 2;
    ctx.strokeStyle = 'rgba(70,224,255,0.6)';
    ctx.lineWidth = 2;
    Utils.roundRect(ctx, bx, by, bw, 16, 8); ctx.stroke();
    ctx.fillStyle = CONFIG.colors.accent;
    ctx.shadowColor = CONFIG.colors.accent; ctx.shadowBlur = 12;
    Utils.roundRect(ctx, bx + 2, by + 2, (bw - 4) * progress, 12, 6); ctx.fill();
    ctx.shadowBlur = 0;
    Utils.text(ctx, 'LOADING ' + Math.round(progress * 100) + '%', CONFIG.WIDTH / 2, by + 48,
      { size: 14, color: '#9fb3d1', align: 'center' });
    if (!game) requestAnimationFrame(loadingFrame);
  }
  loadingFrame();

  loadAssets(
    (p) => { progress = p; },
    () => {
      game = new Game(canvas);
      window.game = game; // handy for debugging in the console
      let last = performance.now();
      let acc = 0;
      function frame(now) {
        let dt = now - last;
        last = now;
        if (dt > CONFIG.MAX_FRAME_MS) dt = CONFIG.MAX_FRAME_MS;
        acc += dt;
        // fixed-timestep simulation for stable physics/feel
        let steps = 0;
        while (acc >= CONFIG.STEP_MS && steps < 5) {
          game.update(CONFIG.STEP_MS);
          acc -= CONFIG.STEP_MS;
          steps++;
        }
        if (steps === 5) acc = 0; // avoid spiral of death
        ctx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
        game.draw(ctx);
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
  );
}

// Start as soon as the DOM is parsed (don't wait on external fonts/images).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
