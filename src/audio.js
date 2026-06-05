/* =====================================================================
 * audio.js — Fully synthesized retro SFX + music via the Web Audio API.
 * No audio files needed; everything is generated from oscillators/noise.
 * The context is created lazily on the first user gesture (autoplay rules).
 * ===================================================================== */

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxGain = null;
    this.musicGain = null;
    this.muted = false;
    this.sfxVolume = 0.6;
    this.musicVolume = 0.32;
    this._musicTimer = null;
    this._noiseBuffer = null;
    this._step = 0;
  }

  // Must be called from within a user-gesture handler at least once.
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicGain.connect(this.master);

    // Pre-bake a short white-noise buffer for explosions / hits.
    const len = this.ctx.sampleRate * 1;
    this._noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  // --- low-level voice helpers -------------------------------------------
  _tone({ freq = 440, type = 'square', dur = 0.15, vol = 0.5, attack = 0.005,
          decay = null, slideTo = null, dest = null }) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (decay ?? dur));
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(now);
    osc.stop(now + (decay ?? dur) + 0.02);
  }

  _noise({ dur = 0.3, vol = 0.5, freq = 1200, q = 1, type = 'lowpass' }) {
    if (!this.ctx || !this._noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, now);
    filt.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + dur);
  }

  // --- named sound effects ------------------------------------------------
  shoot()    { this._tone({ freq: 880, slideTo: 320, type: 'square', dur: 0.12, vol: 0.22 }); }
  beam()     { this._tone({ freq: 140, type: 'sawtooth', dur: 0.08, vol: 0.16 }); }
  enemyShoot(){ this._tone({ freq: 240, slideTo: 90, type: 'sawtooth', dur: 0.18, vol: 0.14 }); }
  hit()      { this._noise({ dur: 0.12, vol: 0.3, freq: 2200, type: 'bandpass', q: 2 }); }
  explode()  {
    this._noise({ dur: 0.45, vol: 0.5, freq: 900, type: 'lowpass' });
    this._tone({ freq: 180, slideTo: 40, type: 'square', dur: 0.4, vol: 0.25 });
  }
  bigExplode() {
    this._noise({ dur: 0.9, vol: 0.7, freq: 600, type: 'lowpass' });
    this._tone({ freq: 110, slideTo: 28, type: 'sawtooth', dur: 0.8, vol: 0.35 });
  }
  powerup()  {
    [523, 659, 784, 1046].forEach((f, i) =>
      setTimeout(() => this._tone({ freq: f, type: 'triangle', dur: 0.12, vol: 0.25 }), i * 60));
  }
  extraLife() {
    [523, 784, 1046, 1318].forEach((f, i) =>
      setTimeout(() => this._tone({ freq: f, type: 'square', dur: 0.16, vol: 0.22 }), i * 90));
  }
  playerHit() {
    this._noise({ dur: 0.5, vol: 0.55, freq: 500, type: 'lowpass' });
    this._tone({ freq: 300, slideTo: 60, type: 'sawtooth', dur: 0.5, vol: 0.3 });
  }
  uiMove()   { this._tone({ freq: 520, type: 'square', dur: 0.05, vol: 0.12 }); }
  uiSelect() { this._tone({ freq: 660, slideTo: 990, type: 'square', dur: 0.12, vol: 0.18 }); }
  waveStart(){ this._tone({ freq: 330, slideTo: 660, type: 'triangle', dur: 0.3, vol: 0.2 }); }
  bossAlarm(){
    [0, 1, 2].forEach(i =>
      setTimeout(() => this._tone({ freq: 220, slideTo: 110, type: 'sawtooth', dur: 0.3, vol: 0.28 }), i * 320));
  }
  gameOver() {
    [440, 392, 349, 262].forEach((f, i) =>
      setTimeout(() => this._tone({ freq: f, type: 'triangle', dur: 0.35, vol: 0.25 }), i * 240));
  }

  // --- procedural background music ---------------------------------------
  // A simple driving arpeggio + bass in a minor key. Tempo scales with level.
  startMusic(tempo = 1) {
    if (!this.ctx || this._musicTimer) return;
    const root = [220, 261.63, 329.63, 174.61, 196]; // Am-ish progression roots
    const scale = [0, 3, 5, 7, 10, 12];
    const beat = 250 / tempo;
    let chord = 0;
    const tick = () => {
      const base = root[chord % root.length];
      // bass
      this._tone({ freq: base / 2, type: 'triangle', dur: beat / 1000 * 1.8,
        vol: 0.2, dest: this.musicGain });
      // arpeggio note
      const semi = Utils.pick(scale);
      const f = base * Math.pow(2, semi / 12);
      this._tone({ freq: f, type: 'square', dur: beat / 1000 * 0.9,
        vol: 0.1, dest: this.musicGain });
      this._step++;
      if (this._step % 8 === 0) chord++;
      this._musicTimer = setTimeout(tick, beat);
    };
    tick();
  }

  stopMusic() {
    if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; }
  }
}

const Sound = new AudioEngine();
