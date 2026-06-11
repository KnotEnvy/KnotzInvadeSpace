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
  const stage = document.getElementById('stage');
  const ctx = canvas.getContext('2d');
  canvas.width = CONFIG.WIDTH;
  canvas.height = CONFIG.HEIGHT;
  ctx.imageSmoothingEnabled = true;

  const hasTouch = ('ontouchstart' in window) ||
    (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

  // Size + place the canvas. The world is always 720x960; on touch devices
  // whose viewport is taller than 3:4 (phones) the canvas gains a CONTROL
  // DECK below the world (CONFIG.DECK_H design-px) so the touch clusters and
  // bottom HUD live in the letterbox space instead of over the playfield.
  // Driven by visualViewport so dynamic browser toolbars never cover the
  // controls (the old 100vh sizing clipped the bottom of the canvas).
  function layout() {
    // available CSS box: stage minus its safe-area padding, never taller
    // than the *visual* viewport (mobile toolbars shrink that first)
    const cs = getComputedStyle(stage);
    const sr = stage.getBoundingClientRect();
    let vw = sr.width - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
    let vh = sr.height - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (window.visualViewport) {
      vw = Math.min(vw, window.visualViewport.width);
      vh = Math.min(vh, window.visualViewport.height);
    }
    const scale = Math.min(vw / CONFIG.WIDTH, vh / CONFIG.HEIGHT);

    let deck = 0;
    const tc = (Meta.settings && Meta.settings.touchControls) || 'auto';
    const touchOn = tc === 'on' || (tc === 'auto' && hasTouch);
    if (touchOn && scale > 0) {
      const leftover = vh / scale - CONFIG.HEIGHT;   // spare height, design-px
      if (leftover >= CONFIG.deck.minH)
        deck = Math.min(CONFIG.deck.maxH, Math.floor(leftover));
    }
    CONFIG.DECK_H = deck;
    const H = CONFIG.HEIGHT + deck;
    if (canvas.height !== H) {
      canvas.height = H;                 // resets ctx state
      ctx.imageSmoothingEnabled = true;
    }
    canvas.style.width = Math.round(CONFIG.WIDTH * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
  }
  window.__kisLayout = layout;           // re-run when touchControls changes
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);
  if (window.visualViewport)
    window.visualViewport.addEventListener('resize', layout);
  layout();

  // --- loading screen ---
  let progress = 0;
  let game = null;
  // a few drifting stars so the loader isn't a dead screen
  const loadStars = Array.from({ length: 60 }, () => ({
    x: Math.random() * CONFIG.WIDTH, y: Math.random() * CONFIG.HEIGHT,
    r: Math.random() * 1.6 + 0.4, s: Math.random() * 0.5 + 0.15, tw: Math.random() * 6.28,
  }));
  function loadingFrame() {
    const g = ctx.createRadialGradient(CONFIG.WIDTH / 2, CONFIG.HEIGHT * 0.42, 60, CONFIG.WIDTH / 2, CONFIG.HEIGHT * 0.42, CONFIG.HEIGHT * 0.7);
    g.addColorStop(0, '#0c1230'); g.addColorStop(1, '#05060f');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height); // incl. the control deck
    const now = performance.now();
    ctx.save();
    ctx.fillStyle = '#bfe9ff';
    for (const st of loadStars) {
      st.y += st.s; if (st.y > CONFIG.HEIGHT) { st.y = 0; st.x = Math.random() * CONFIG.WIDTH; }
      ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(st.tw + now / 700));
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    const titleGlow = 14 + 10 * (0.5 + 0.5 * Math.sin(now / 400));
    Utils.text(ctx, 'KNOTZ: INVADE SPACE', CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 40,
      { size: 34, color: '#fff', align: 'center', glow: titleGlow, glowColor: CONFIG.colors.accent });
    const bw = 360, bx = (CONFIG.WIDTH - bw) / 2, by = CONFIG.HEIGHT / 2;
    ctx.strokeStyle = 'rgba(70,224,255,0.6)';
    ctx.lineWidth = 2;
    Utils.roundRect(ctx, bx, by, bw, 16, 8); ctx.stroke();
    ctx.save();
    ctx.fillStyle = CONFIG.colors.accent;
    ctx.shadowColor = CONFIG.colors.accent; ctx.shadowBlur = 12;
    Utils.roundRect(ctx, bx + 2, by + 2, (bw - 4) * progress, 12, 6); ctx.fill();
    // travelling shimmer on the fill
    if (progress > 0.04) {
      Utils.roundRect(ctx, bx + 2, by + 2, (bw - 4) * progress, 12, 6); ctx.clip();
      const sx = bx + ((now / 4) % (bw + 60)) - 30;
      const sg = ctx.createLinearGradient(sx - 26, 0, sx + 26, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.7)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = sg;
      ctx.fillRect(sx - 26, by, 52, 16);
    }
    ctx.restore();
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
        ctx.clearRect(0, 0, canvas.width, canvas.height);
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
