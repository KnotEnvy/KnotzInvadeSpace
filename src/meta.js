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
    const def = { hi: 0, credits: 0, upgrades: {}, muted: false };
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return def;
      const p = JSON.parse(raw);
      return {
        hi: p.hi || 0,
        credits: p.credits || 0,
        upgrades: p.upgrades || {},
        muted: !!p.muted,
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
  award(score, waves, bosses) {
    const c = CONFIG.credits;
    const gain = Math.floor(score * c.perScore + waves * c.perWave + bosses * c.perBoss);
    this.credits += gain;
    this.save();
    return gain;
  }

  // --- derived run modifiers (read by player/game at launch) ------------
  startLives() { return CONFIG.player.startLives + this.level('hull'); }
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
