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
    maxSpeed: 3.4,          // cap so very deep waves stay fair (balance pass)
    bossEvery: 5,           // every Nth wave is a boss wave
  },

  boss: {
    width: 200,
    height: 200,
    baseLives: 60,
    livesPerTier: 35,
    speed: 1.8,
    // Mini-boss escorts that can appear on ordinary (non-boss) waves.
    // They're a quick optional fight: smaller, lower HP, drop loot, but
    // do NOT clear the sector (the formation must still be beaten).
    miniScale: 0.56,        // body size vs a full boss
    miniHpMul: 0.34,        // health vs a same-tier full boss
    miniEntryY: 132,        // how far down a mini-boss hovers
    miniFromWave: 4,        // earliest wave a mini-boss may show up
    miniChance: 0.28,       // chance per eligible wave to spawn one
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

  // Run-end credit payout that funds the hangar. (Balance pass: nudged up so
  // the first upgrade lands after ~2 solid runs and bosses feel worth it.)
  credits: { perScore: 0.015, perWave: 8, perBoss: 75 },

  // Default player settings (persisted per-profile; tweakable in-game).
  // Volumes are 0..1 multipliers; shake/reducedMotion are toggles.
  settings: {
    master: 1, music: 1, sfx: 1,
    shake: true, reducedMotion: false, difficulty: 'normal',
    touchControls: 'auto',   // 'auto' (show on touch devices) | 'on' | 'off'
    quality: 'high',         // graphics tier: 'low' | 'medium' | 'high' (see CONFIG.quality)
  },

  // Graphics quality tiers. The render layer (post-processing bloom +
  // particle budgets) scales per tier so the game stays smooth on weak
  // devices while letting High go all-out. Read via Meta.quality().
  //   bloom*       — offscreen threshold-bloom pass (see postfx.js)
  //   particleMul  — multiplies emitter counts (composes with reduced-motion)
  //   maxParticles — particle pool size (sized for the High tier)
  //   trails       — long additive bullet/engine trails
  //   fx           — the mid-tier juice layer: hit-stop, shockwaves, textured
  //                  sprite explosions, orb bullets, combo glow (Meta.fx())
  //   extras       — high-only flourishes: shooting stars, rim lights, the
  //                  per-sector colour grade, engine ribbons (Meta.extras())
  quality: {
    low:    { bloom: false,                                                          particleMul: 0.6, maxParticles: 1200, trails: false, fx: false, extras: false },
    medium: { bloom: true,  bloomScale: 0.125, blurPx: 2.5, blurPasses: 1, bloomStrength: 0.55, particleMul: 1.0, maxParticles: 1200, trails: true,  fx: true,  extras: false },
    high:   { bloom: true,  bloomScale: 0.25,  blurPx: 3.5, blurPasses: 2, bloomStrength: 0.72, particleMul: 1.3, maxParticles: 1200, trails: true,  fx: true,  extras: true  },
  },

  // On-screen touch button layout (design-space rects, mirrored by Input + UI).
  touch: { pad: 22, gap: 16, size: 96, bottom: 152 },

  // Difficulty presets. Multipliers fan out across enemy aggression, speed,
  // boss durability/fire cadence, the credit payout and starting lives.
  // (bossFireMul scales the fire *interval*, so >1 = the boss fires slower.)
  difficulty: {
    easy:   { label: 'EASY',   enemyFireMul: 0.72, enemySpeedMul: 0.92, bossHpMul: 0.85, bossFireMul: 1.25, creditMul: 0.80, lifeBonus: 1 },
    normal: { label: 'NORMAL', enemyFireMul: 1.00, enemySpeedMul: 1.00, bossHpMul: 1.00, bossFireMul: 1.00, creditMul: 1.00, lifeBonus: 0 },
    hard:   { label: 'HARD',   enemyFireMul: 1.45, enemySpeedMul: 1.12, bossHpMul: 1.30, bossFireMul: 0.82, creditMul: 1.35, lifeBonus: 0 },
  },

  // Game modes selectable from the menu.
  modes: [
    { id: 'campaign', label: 'CAMPAIGN', desc: 'Fight home through 5 sectors to save Earth' },
    { id: 'endless',  label: 'ENDLESS',  desc: 'Survive as long as you can' },
    { id: 'daily',    label: 'DAILY',    desc: "Seeded run · today's modifiers" },
  ],

  // Campaign tunables. The story structure itself (sectors, scripted waves,
  // bosses, dialogue) is authored data in src/campaign.js.
  campaign: {
    sectorBonus: 500,      // score bonus per sector secured (x sector number)
  },

  // Daily Challenge: a date-seeded run with a couple of random modifiers.
  // The seed makes every player face the same formations on a given day.
  daily: {
    pickCount: 2,
    modifiers: [
      { id: 'eliteSwarm',    label: 'ELITE SWARM',    desc: 'Elites everywhere',          patch: { eliteChanceAdd: 0.30 } },
      { id: 'frenzy',        label: 'FRENZY',         desc: 'Hyper-aggressive aliens',    patch: { aggroMul: 1.8 } },
      { id: 'asteroidStorm', label: 'ASTEROID STORM', desc: 'Relentless hazards',         patch: { hazardRateMul: 2.2, bigAsteroidChance: 0.85 } },
      { id: 'bossRush',      label: 'BOSS RUSH',      desc: 'Bosses every 3rd wave',      patch: { bossEvery: 3 } },
      { id: 'glassCannon',   label: 'GLASS CANNON',   desc: '1 life, double damage',      patch: { startLives: 1, playerDamageMul: 2 } },
      { id: 'swarm',         label: 'SWARM',          desc: 'Bigger formations',          patch: { extraCols: 1, extraRows: 1 } },
      { id: 'bounty',        label: 'BOUNTY RUN',     desc: '+50% credits',               patch: { creditMul: 1.5 } },
    ],
  },

  // Save schema version (bumped when the persisted shape changes; see meta.js).
  // v3 adds `campaign: { best, wins }` (story progress).
  saveVersion: 3,

  storageKey: 'knotz_invade_space_save_v1',
};
