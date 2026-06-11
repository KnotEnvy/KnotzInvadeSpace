/* =====================================================================
 * meta.js — Roguelite meta-progression. Persists a player profile
 * (credits, purchased upgrades, high score, mute pref) to localStorage,
 * defines the hangar upgrade catalog, and exposes the derived stat
 * modifiers a run reads at launch.
 * ===================================================================== */

const UPGRADES = [
  { id: 'hull',   name: 'Hull Plating', icon: '❖', desc: '+1 starting & max life',        max: 3, cost: (l) => 300 + l * 250 },
  { id: 'engine', name: 'Ion Engines',  icon: '➤', desc: '+8% move speed',                max: 3, cost: (l) => 250 + l * 200 },
  { id: 'beam',   name: 'Beam Core',    icon: '▭', desc: '+25% beam energy & regen',      max: 3, cost: (l) => 300 + l * 250 },
  { id: 'cannon', name: 'Auto-Cannons', icon: '»', desc: 'Faster fire; twin shot at Lv2', max: 3, cost: (l) => 400 + l * 350 },
  { id: 'magnet', name: 'Magnet Field', icon: '◉', desc: 'Pull power-ups toward you',     max: 2, cost: (l) => 350 + l * 300 },
  { id: 'drone',  name: 'Combat Drone', icon: '✦', desc: 'Auto-firing wingman',           max: 2, cost: (l) => 600 + l * 450 },
  { id: 'aegis',  name: 'Aegis Start',  icon: '○', desc: 'Begin each run with a shield',  max: 1, cost: () => 500 },
];

class MetaProfile {
  constructor() { this.data = this.load(); }

  load() {
    // Fresh profiles on touch hardware default to Medium graphics — phone
    // GPUs pay for High's bloom; players can always raise it in Settings.
    // (Existing saves keep whatever the player chose.)
    const touchDevice = (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0) ||
      (typeof window !== 'undefined' && 'ontouchstart' in window);
    const def = {
      version: CONFIG.saveVersion, hi: 0, credits: 0, upgrades: {}, muted: false,
      settings: { ...CONFIG.settings, ...(touchDevice ? { quality: 'medium' } : {}) },
      achievements: {}, daily: {},
      campaign: { best: 0, wins: 0 },
    };
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return def;
      const p = JSON.parse(raw);
      // Forward-compatible migration: older saves (v1, no `settings`) keep
      // their credits/upgrades and gain the new fields from defaults.
      return {
        version: CONFIG.saveVersion,
        hi: p.hi || 0,
        credits: p.credits || 0,
        upgrades: p.upgrades || {},
        muted: !!p.muted,
        settings: { ...CONFIG.settings, ...(p.settings || {}) },
        achievements: p.achievements || {},
        daily: p.daily || {},
        campaign: { best: 0, wins: 0, ...(p.campaign || {}) },
      };
    } catch { return def; }
  }
  save() { try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(this.data)); } catch {} }

  get credits() { return this.data.credits; }
  set credits(v) { this.data.credits = Math.max(0, Math.floor(v)); }
  get hi() { return this.data.hi; }
  set hi(v) { this.data.hi = Math.floor(v); }
  get muted() { return this.data.muted; }
  set muted(v) { this.data.muted = !!v; this.save(); }

  // --- player settings ---------------------------------------------------
  get settings() { return this.data.settings; }
  setSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
    this.applySettings();
  }
  // Push audio-affecting settings onto the live engine. Called at boot and
  // whenever a slider changes (other settings are read on demand). Also
  // re-runs the canvas layout so toggling touchControls adds/removes the
  // mobile control deck immediately.
  applySettings() {
    const s = this.data.settings;
    Sound.setVolumes({ master: s.master, music: s.music, sfx: s.sfx });
    if (typeof window !== 'undefined' && window.__kisLayout) window.__kisLayout();
  }
  shakeEnabled()  { return this.data.settings.shake !== false && !this.reducedMotion(); }
  reducedMotion() { return !!this.data.settings.reducedMotion; }
  // Graphics tier ('low'|'medium'|'high'); falls back to 'high' if invalid.
  quality()       { const q = this.data.settings.quality; return (CONFIG.quality && CONFIG.quality[q]) ? q : 'high'; }
  qualityMods()   { return CONFIG.quality[this.quality()] || CONFIG.quality.high; }
  // Mid-tier juice (med+high): hit-stop, shockwaves, textured explosions, orb
  // bullets, combo glow. extras() = high-only flourishes (ribbons, grade, ...).
  fx()            { return !!this.qualityMods().fx; }
  extras()        { return !!this.qualityMods().extras; }
  trailsOn()      { return !!this.qualityMods().trails; }
  difficulty()    { return this.data.settings.difficulty || 'normal'; }
  diffMods()      { return CONFIG.difficulty[this.difficulty()] || CONFIG.difficulty.normal; }

  // --- achievements ------------------------------------------------------
  get achievements() { return this.data.achievements; }
  isUnlocked(id) { return !!this.data.achievements[id]; }
  unlockAch(id) {
    if (this.data.achievements[id]) return false;   // already had it
    this.data.achievements[id] = Date.now();
    this.save();
    return true;
  }

  // --- campaign story progress (furthest sector secured + victories) ------
  campaignBest() { return this.data.campaign.best || 0; }
  setCampaignBest(sector) {
    if (sector <= this.campaignBest()) return;
    this.data.campaign.best = sector;
    this.save();
  }
  campaignWins() { return this.data.campaign.wins || 0; }
  addCampaignWin() { this.data.campaign.wins = this.campaignWins() + 1; this.save(); }

  // --- daily-challenge best scores (kept small: last ~10 days) -----------
  dailyBest(key) { return this.data.daily[key] || 0; }
  setDailyBest(key, score) {
    if (score <= (this.data.daily[key] || 0)) return false;
    this.data.daily[key] = Math.floor(score);
    const keys = Object.keys(this.data.daily).sort();
    while (keys.length > 10) delete this.data.daily[keys.shift()];
    this.save();
    return true;
  }

  // --- upgrade catalog access -------------------------------------------
  def(id) { return UPGRADES.find((u) => u.id === id); }
  level(id) { return this.data.upgrades[id] || 0; }
  isMax(id) { return this.level(id) >= this.def(id).max; }
  nextCost(id) { return this.isMax(id) ? null : this.def(id).cost(this.level(id)); }
  canAfford(id) { const c = this.nextCost(id); return c != null && this.credits >= c; }
  buy(id) {
    if (!this.canAfford(id)) return false;
    this.credits -= this.nextCost(id);
    this.data.upgrades[id] = this.level(id) + 1;
    this.save();
    return true;
  }

  // Award credits at the end of a run; returns the amount earned.
  award(score, waves, bosses, extraMul = 1) {
    const c = CONFIG.credits;
    const raw = score * c.perScore + waves * c.perWave + bosses * c.perBoss;
    const gain = Math.floor(raw * this.diffMods().creditMul * extraMul);
    this.credits += gain;
    this.save();
    return gain;
  }

  // --- derived run modifiers (read by player/game at launch) ------------
  startLives() { return CONFIG.player.startLives + this.level('hull') + this.diffMods().lifeBonus; }
  maxLives()   { return CONFIG.player.maxLives + this.level('hull'); }
  speedMul()   { return 1 + 0.08 * this.level('engine'); }
  energyMul()  { return 1 + 0.25 * this.level('beam'); }
  regenMul()   { return 1 + 0.20 * this.level('beam'); }
  fireMul()    { return [1, 0.85, 0.85, 0.70][this.level('cannon')]; }
  twin()       { return this.level('cannon') >= 2; }
  magnetRadius() { return [0, 150, 280][this.level('magnet')]; }
  droneCount() { return this.level('drone'); }
  startShield() { return this.level('aegis') > 0 ? CONFIG.powerup.shieldHits : 0; }
}

const Meta = new MetaProfile();
