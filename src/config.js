/* =====================================================================
 * config.js — Central tunables, palette and asset manifest.
 * Everything balance- or look-related lives here so it's easy to tweak.
 * ===================================================================== */

const CONFIG = {
  // Internal render resolution (the game is drawn at this size, then the
  // canvas element is scaled with CSS to fit the viewport, preserving ratio).
  WIDTH: 720,
  HEIGHT: 960,

  // Fixed-timestep simulation. We update logic in 60Hz steps for determinism
  // and render as fast as the browser allows.
  STEP_MS: 1000 / 60,
  MAX_FRAME_MS: 250, // clamp huge dt spikes (e.g. tab was backgrounded)

  player: {
    width: 120,
    height: 103,
    speed: 7.2,
    maxLives: 6,
    startLives: 3,
    fireCooldown: 230,      // ms between primary shots (base)
    rapidCooldown: 95,      // ms between shots while Rapid Fire is active
    invulnTime: 1500,       // ms of i-frames after taking a hit
    maxEnergy: 100,
    energyRegen: 12,        // energy per second
    beamDrain: 55,          // energy per second while beaming
    beamDps: 70,            // damage per second the beam deals
    beamWidth: 26,
  },

  bullet: {
    width: 6,
    height: 22,
    speed: 13,
    damage: 1,
  },

  enemyBullet: {
    width: 8,
    height: 18,
    speed: 4.6,
    damage: 1,
  },

  enemy: {
    size: 66,
    gapX: 18,
    gapY: 14,
    fireChance: 0.0016,     // per enemy per step chance to shoot
    diveChance: 0.0010,     // per enemy per step chance to break formation
  },

  wave: {
    baseCols: 4,
    baseRows: 2,
    maxCols: 8,
    maxRows: 5,
    descendStep: 22,        // pixels dropped at each edge bounce
    baseSpeed: 0.9,
    speedPerWave: 0.12,
    bossEvery: 5,           // every Nth wave is a boss wave
  },

  boss: {
    width: 200,
    height: 200,
    baseLives: 60,
    livesPerTier: 35,
    speed: 1.8,
  },

  powerup: {
    size: 34,
    fallSpeed: 2.2,
    dropChance: 0.14,       // chance an enemy drops a power-up on death
    duration: 8000,         // ms for timed power-ups (rapid / spread)
    shieldHits: 3,
  },

  combo: {
    window: 2200,           // ms before the combo counter resets
    max: 8,                 // max multiplier
  },

  // Palette (used by particles, UI, beams, etc.)
  colors: {
    accent: '#46e0ff',
    accent2: '#7c5cff',
    gold: '#ffd23f',
    danger: '#ff4d6d',
    good: '#3ff58b',
    beetle: '#ffb03a',
    rhino: '#c14bff',
    boss: '#ff5a3c',
    star: '#bfe9ff',
  },

  // Background images cycled per level (drawn behind the parallax starfield).
  backgrounds: [
    'assets/background.png',
    'assets/background2.png',
    'assets/background4.png',
    'assets/background5.png',
    'assets/background6.png',
    'assets/background7.png',
    'assets/background8.png',
    'assets/background10.png',
    'assets/backgroundEarth.png',
    'assets/background3.png',
  ],

  // Sprite sheets. frameW/frameH describe a single cell; cols/rows the grid.
  sprites: {
    player:      { src: 'player.png',       frameW: 140, frameH: 120, cols: 4, rows: 1 },
    playerJets:  { src: 'player_jets.png',  frameW: 140, frameH: 120, cols: 3, rows: 1 },
    beetlemorph: { src: 'beetlemorph.png',  frameW: 80,  frameH: 80,  cols: 3, rows: 4 },
    rhinomorph:  { src: 'rhinomorph.png',   frameW: 80,  frameH: 80,  cols: 6, rows: 4 },
    boss:        { src: 'boss.png',         frameW: 200, frameH: 200, cols: 11, rows: 4 },
  },

  // New enemy variants (use existing sprite sheets with distinct rows/stats).
  stinger: { lives: 1, score: 130, scale: 0.82, frameY: 1, diveMul: 4, speedMul: 1.6 },
  splitter:{ lives: 3, score: 300, frameY: 2, minions: 2 },
  elite:   { chance: 0.06, hpMul: 3, scale: 1.22, scoreMul: 3 },

  // Drifting asteroid hazards. Big ones split into mediums, mediums into smalls.
  hazard: {
    spawnBase: 5200,         // ms between spawns at level 1
    spawnMin: 1500,          // fastest spawn cadence at high levels
    speedMin: 1.0, speedMax: 2.6,
    big:   { r: 42, hp: 6, score: 150, split: 'med', count: 2 },
    med:   { r: 27, hp: 3, score: 90,  split: 'small', count: 2 },
    small: { r: 15, hp: 1, score: 50,  split: null, count: 0 },
    color: '#9a8c7a',
  },

  // Auto-firing wingman granted by the Combat Drone upgrade.
  drone: { fireCooldown: 520, orbitRadius: 62, bulletSpeed: 12, color: '#46e0ff' },

  // Run-end credit payout that funds the hangar.
  credits: { perScore: 0.012, perWave: 8, perBoss: 60 },

  storageKey: 'knotz_invade_space_save_v1',
};
