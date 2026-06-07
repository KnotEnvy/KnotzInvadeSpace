/* =====================================================================
 * postfx.js — Offscreen threshold-bloom post-processing pass.
 *
 * The whole game is bright glowing sprites/particles on near-black, so a
 * luminance-thresholded bloom amplifies what's already there with ZERO
 * changes to any entity's draw(). The bloomable scene (starfield + world)
 * is rendered into an offscreen canvas; we extract the bright areas, blur
 * them small, then composite them back additively. Crisp UI draws on the
 * real canvas afterwards so text/HUD stay sharp.
 *
 * Hard constraints honoured:
 *  - drawImage + ctx.filter ONLY (never getImageData) so file:// images
 *    never taint the canvas.
 *  - Feature-detected once; on any failure it disables itself and the game
 *    renders exactly as before (also covers the Node-VM smoke harness and
 *    browsers without ctx.filter).
 *  - Pure render — no coupling to the fixed-timestep simulation.
 * ===================================================================== */

const PostFX = {
  ready: false,     // init() has run
  ok: false,        // offscreen pipeline usable
  active: false,    // currently capturing the scene this frame
  filterOK: false,  // ctx.filter (blur) supported — else we fake blur by scaling
  scene: null, sctx: null,
  bufA: null, actx: null,
  bufB: null, bctx: null,
  bw: 0, bh: 0,

  init() {
    if (this.ready) return;
    this.ready = true;
    try {
      if (typeof document === 'undefined' || !document.createElement) return;
      const mk = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
      this.scene = mk(CONFIG.WIDTH, CONFIG.HEIGHT);
      this.sctx = this.scene.getContext('2d');
      if (!this.sctx || typeof this.sctx.drawImage !== 'function') { this.sctx = null; return; }
      this.bufA = mk(2, 2); this.actx = this.bufA.getContext('2d');
      this.bufB = mk(2, 2); this.bctx = this.bufB.getContext('2d');
      if (!this.actx || !this.bctx) return;
      // Probe ctx.filter (blur) support; we can still bloom without it
      // (a hard downscale/upscale is a serviceable box blur).
      try { this.actx.filter = 'blur(2px)'; this.filterOK = ('' + this.actx.filter).indexOf('blur') === 0; this.actx.filter = 'none'; }
      catch (_) { this.filterOK = false; }
      this.ok = true;
    } catch (_) { this.ok = false; }
  },

  // Active quality params (falls back to High if anything is missing).
  q() {
    const tier = (typeof Meta !== 'undefined' && Meta.quality) ? Meta.quality() : 'high';
    return (CONFIG.quality && CONFIG.quality[tier]) || (CONFIG.quality && CONFIG.quality.high) || {};
  },

  bloomOn() { return this.ok && !!this.q().bloom; },

  // Begin capturing the bloomable scene. Returns the ctx callers should draw
  // into: the offscreen scene ctx when bloom is on, else the real ctx.
  begin(realCtx) {
    this.init();
    this.active = this.bloomOn();
    if (!this.active) return realCtx;
    const s = this.sctx;
    s.setTransform(1, 0, 0, 1, 0, 0);
    s.globalAlpha = 1;
    s.globalCompositeOperation = 'source-over';
    s.imageSmoothingEnabled = true;
    s.filter = 'none';
    s.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    return s;
  },

  // Composite the captured scene (+ bloom) onto the real canvas.
  end(realCtx) {
    if (!this.active) return;
    this.active = false;
    const p = this.q();
    try {
      const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
      // 1) base scene
      realCtx.setTransform(1, 0, 0, 1, 0, 0);
      realCtx.globalAlpha = 1;
      realCtx.globalCompositeOperation = 'source-over';
      realCtx.filter = 'none';
      realCtx.drawImage(this.scene, 0, 0, W, H);

      // size the small bloom buffers for the current tier
      const scale = p.bloomScale || 0.25;
      const bw = Math.max(2, Math.round(W * scale));
      const bh = Math.max(2, Math.round(H * scale));
      if (bw !== this.bw || bh !== this.bh) {
        this.bw = bw; this.bh = bh;
        this.bufA.width = bw; this.bufA.height = bh;
        this.bufB.width = bw; this.bufB.height = bh;
      }
      const A = this.actx, B = this.bctx;

      // 2) downsample scene -> A
      A.setTransform(1, 0, 0, 1, 0, 0); A.globalAlpha = 1; A.filter = 'none';
      A.globalCompositeOperation = 'source-over';
      A.imageSmoothingEnabled = true;
      A.clearRect(0, 0, bw, bh);
      A.drawImage(this.scene, 0, 0, bw, bh);

      // 3) threshold: multiply A by itself into B (squares channels, crushing
      //    midtones toward black while leaving bright neon cores intact).
      B.setTransform(1, 0, 0, 1, 0, 0); B.globalAlpha = 1; B.filter = 'none';
      B.imageSmoothingEnabled = true;
      B.globalCompositeOperation = 'source-over';
      B.clearRect(0, 0, bw, bh);
      B.drawImage(this.bufA, 0, 0);
      B.globalCompositeOperation = 'multiply';
      B.drawImage(this.bufA, 0, 0);
      B.globalCompositeOperation = 'source-over';

      // 4) blur passes (ping-pong A<->B), starting from the threshold in B.
      const passes = Math.max(0, p.blurPasses || 0);
      const px = p.blurPx || 3;
      let fromCv = this.bufB, toCv = this.bufA, toCtx = A;
      for (let i = 0; i < passes; i++) {
        toCtx.setTransform(1, 0, 0, 1, 0, 0); toCtx.globalAlpha = 1;
        toCtx.globalCompositeOperation = 'source-over';
        toCtx.imageSmoothingEnabled = true;
        toCtx.clearRect(0, 0, bw, bh);
        toCtx.filter = this.filterOK ? ('blur(' + px + 'px)') : 'none';
        toCtx.drawImage(fromCv, 0, 0);
        toCtx.filter = 'none';
        const t = fromCv; fromCv = toCv; toCv = t;
        toCtx = (toCv === this.bufA) ? A : B;
      }

      // 5) composite the blurred bright buffer back, additively.
      realCtx.save();
      realCtx.globalCompositeOperation = 'lighter';
      realCtx.globalAlpha = Utils.clamp(p.bloomStrength != null ? p.bloomStrength : 0.7, 0, 1);
      realCtx.imageSmoothingEnabled = true;
      realCtx.drawImage(fromCv, 0, 0, bw, bh, 0, 0, W, H);
      realCtx.restore();
    } catch (_) {
      // Offscreen pipeline failed — disable permanently and best-effort blit.
      this.ok = false;
      try {
        realCtx.globalCompositeOperation = 'source-over';
        realCtx.globalAlpha = 1; realCtx.filter = 'none';
        realCtx.drawImage(this.scene, 0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
      } catch (__) { /* nothing more we can do */ }
    }
  },
};
