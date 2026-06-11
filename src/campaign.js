/* =====================================================================
 * campaign.js — OPERATION HOMECOMING: the scripted story campaign.
 *
 * Unlike Endless/Daily (formula-driven waves), the campaign is hand-
 * authored data: five named sectors between the stargate and Earth, each
 * with its own backdrop, hazard profile, scripted wave compositions, a
 * sector boss, and story dialogue. The cast:
 *   VEGA     — the advanced alien ship you stole through the stargate;
 *              her AI woke up on the way out and decided she likes you.
 *   COMMAND  — Earth Command, faint behind jamming, clearer every sector.
 *   HIVEMIND — the swarm itself. It built VEGA. It wants her back.
 *
 * Wave descriptor: { cols, rows, speed, mix:{armor,stinger,splitter,elite},
 *                    mini?, say? } — mix replaces the endless-mode formulas
 * (armor = Rhinomorph ratio; others are per-slot chances). `mini: true`
 * spawns a scripted mini-boss escort; `say` queues a comm line at start.
 * ===================================================================== */

// Speaker -> comm/briefing colour (resolved at draw time via SPEAKERS[who]).
const SPEAKERS = {
  VEGA:     { color: '#46e0ff' },
  COMMAND:  { color: '#ffd23f' },
  HIVEMIND: { color: '#ff4d6d' },
};

const CAMPAIGN_SECTORS = [
  {
    id: 'gateway', name: 'GATEWAY REACH', sub: 'The far side of the stargate',
    bg: 0, hazardMul: 0, bigAsteroid: 0.3, aggro: 1.0,
    boss: 'overlord',
    threat: 'LIGHT — scout picket on patrol',
    brief: [
      { who: 'VEGA', text: 'Systems online. Pilot vitals stable. So you’re the one who stole me from the boneyard.' },
      { who: 'COMMAND', text: '*static* ...strike wing is gone. If anyone reads this — you’re all that’s left.' },
      { who: 'VEGA', text: 'Five sectors between us and Earth. The Hive holds every one of them.' },
      { who: 'VEGA', text: 'Their scouts have already found us. Recommend we start shooting.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'WHO DARES FLY A SHIP OF THE HIVE?' },
    clearSay: { who: 'VEGA', text: 'Picket cleared. Spinning up the jump drive — next stop, the Belt.' },
    waves: [
      { cols: 4, rows: 2, speed: 1.0,  mix: { armor: 0,    stinger: 0,    splitter: 0,    elite: 0    },
        say: { who: 'VEGA', text: 'Scout picket ahead. Warming up the guns.' } },
      { cols: 5, rows: 2, speed: 1.15, mix: { armor: 0.20, stinger: 0.08, splitter: 0,    elite: 0.03 } },
      { cols: 5, rows: 3, speed: 1.3,  mix: { armor: 0.30, stinger: 0.12, splitter: 0,    elite: 0.05 } },
    ],
  },
  {
    id: 'belt', name: 'THE SHATTERED BELT', sub: 'A mining colony, ground to rubble',
    bg: 1, hazardMul: 1.7, bigAsteroid: 0.75, aggro: 1.05,
    boss: 'warden',
    threat: 'MODERATE — dense asteroid fields, armored hulls',
    brief: [
      { who: 'VEGA', text: 'Jump complete. The Shattered Belt — humanity mined it for a century. The Hive cracked it open in a day.' },
      { who: 'VEGA', text: 'Their armored haulers nest in the debris. Mind the rock — my hull is the only one we’ve got.' },
      { who: 'COMMAND', text: '*static* ...reading you better now. Keep coming, pilot. Keep coming.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'THE WARDEN BURIED A THOUSAND MINERS HERE. JOIN THEM.' },
    clearSay: { who: 'VEGA', text: 'Warden destroyed. The Belt is quiet again. Jumping.' },
    waves: [
      { cols: 4, rows: 2, speed: 1.2, mix: { armor: 0.45, stinger: 0,    splitter: 0.05, elite: 0.04 },
        say: { who: 'VEGA', text: 'Asteroids inbound. Shoot them or dodge them — your call.' } },
      { cols: 5, rows: 2, speed: 1.3, mix: { armor: 0.50, stinger: 0.08, splitter: 0.08, elite: 0.06 } },
      { cols: 5, rows: 3, speed: 1.4, mix: { armor: 0.55, stinger: 0,    splitter: 0.10, elite: 0.08 }, mini: true },
      { cols: 6, rows: 3, speed: 1.5, mix: { armor: 0.60, stinger: 0.10, splitter: 0.12, elite: 0.08 } },
    ],
  },
  {
    id: 'hive', name: 'THE HIVE NEBULA', sub: 'Where the swarm is born',
    bg: 2, hazardMul: 0.4, bigAsteroid: 0.4, aggro: 1.2,
    boss: 'weaver',
    threat: 'HIGH — stinger swarms, splitter broods',
    brief: [
      { who: 'VEGA', text: 'The Hive Nebula. Their spawning ground — every stinger in the armada hatched in these clouds.' },
      { who: 'VEGA', text: 'They’ll come fast and they’ll come angry. Don’t let them surround us.' },
      { who: 'HIVEMIND', text: 'TURN BACK, LITTLE THIEF. THE NURSERY IS NOT FOR YOUR KIND.' },
      { who: 'VEGA', text: '...It has never spoken to me before. Stay sharp.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'THE WEAVER SPUN YOUR SHIP’S CRADLE. NOW IT SPINS YOUR GRAVE.' },
    clearSay: { who: 'VEGA', text: 'Weaver unravelled. The brood is scattering. Punch it.' },
    waves: [
      { cols: 6, rows: 2, speed: 1.7, mix: { armor: 0.05, stinger: 0.35, splitter: 0,    elite: 0.05 },
        say: { who: 'VEGA', text: 'Contacts everywhere. Swarm incoming!' } },
      { cols: 6, rows: 3, speed: 1.8, mix: { armor: 0.10, stinger: 0.30, splitter: 0.18, elite: 0.07 } },
      { cols: 7, rows: 3, speed: 1.9, mix: { armor: 0.05, stinger: 0.40, splitter: 0.15, elite: 0.08 }, mini: true },
      { cols: 7, rows: 4, speed: 2.0, mix: { armor: 0.10, stinger: 0.45, splitter: 0.20, elite: 0.10 } },
    ],
  },
  {
    id: 'blockade', name: 'THE BLOCKADE', sub: 'The last wall before home',
    bg: 4, hazardMul: 0.8, bigAsteroid: 0.6, aggro: 1.3,
    boss: 'herald',
    threat: 'SEVERE — elite guard, fortified battle line',
    brief: [
      { who: 'COMMAND', text: 'Pilot, we have you on long-range. That blockade is everything they have left between you and Earth.' },
      { who: 'VEGA', text: 'Their elite guard. Every hull on that line was grown to kill ships like me.' },
      { who: 'HIVEMIND', text: 'YOUR MACHINE BETRAYED US ONCE. IT WILL BURN BESIDE YOU.' },
      { who: 'VEGA', text: 'It remembers me. Good. Then it knows exactly what’s coming.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'HERALD — SOUND THE TRAITOR’S FUNERAL.' },
    clearSay: { who: 'VEGA', text: 'The line is broken. Earth is on the other side of this jump. Go.' },
    waves: [
      { cols: 5, rows: 3, speed: 1.8, mix: { armor: 0.40, stinger: 0.15, splitter: 0.10, elite: 0.15 },
        say: { who: 'VEGA', text: 'Elite signatures across the line. They were waiting for us.' } },
      { cols: 6, rows: 3, speed: 1.9, mix: { armor: 0.45, stinger: 0.15, splitter: 0.12, elite: 0.18 }, mini: true },
      { cols: 6, rows: 4, speed: 2.0, mix: { armor: 0.50, stinger: 0.18, splitter: 0.15, elite: 0.20 } },
      { cols: 7, rows: 3, speed: 2.2, mix: { armor: 0.10, stinger: 0.30, splitter: 0.18, elite: 0.22 }, mini: true },
      { cols: 7, rows: 4, speed: 2.2, mix: { armor: 0.50, stinger: 0.20, splitter: 0.18, elite: 0.25 } },
    ],
  },
  {
    id: 'earth', name: 'EARTH’S DOORSTEP', sub: 'The final stand for home',
    bg: 8, hazardMul: 1.0, bigAsteroid: 0.6, aggro: 1.35,
    boss: 'mothership',
    threat: 'CRITICAL — the armada, and the Mothership itself',
    brief: [
      { who: 'COMMAND', text: 'They’re in orbit. Whatever you’re going to do, pilot — do it now.' },
      { who: 'VEGA', text: 'The Mothership. The mind of the swarm... and the yard that built me. My mother, technically.' },
      { who: 'HIVEMIND', text: 'COME, TRAITOR. WITNESS THE END OF YOUR ADOPTED WORLD.' },
      { who: 'VEGA', text: 'All weapons free. No reserves, no retreat. Earth is watching.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'I AM THE SWARM. I AM FOREVER.' },
    clearSay: null,   // the campaign ends here — see CAMPAIGN_EPILOGUE
    waves: [
      { cols: 6, rows: 3, speed: 2.0, mix: { armor: 0.40, stinger: 0.25, splitter: 0.15, elite: 0.15 },
        say: { who: 'COMMAND', text: 'All of Earth is watching, pilot. Give them hell.' } },
      { cols: 7, rows: 3, speed: 2.2, mix: { armor: 0.45, stinger: 0.30, splitter: 0.18, elite: 0.18 }, mini: true },
      { cols: 7, rows: 4, speed: 2.3, mix: { armor: 0.50, stinger: 0.30, splitter: 0.20, elite: 0.20 } },
      { cols: 8, rows: 3, speed: 2.5, mix: { armor: 0.10, stinger: 0.40, splitter: 0.25, elite: 0.22 }, mini: true },
      { cols: 8, rows: 4, speed: 2.6, mix: { armor: 0.50, stinger: 0.35, splitter: 0.25, elite: 0.25 },
        say: { who: 'VEGA', text: 'Last screen of escorts. The Mothership is right behind them.' } },
    ],
  },
];

// Rolls on the victory screen once the Mothership falls.
const CAMPAIGN_EPILOGUE = [
  { who: 'HIVEMIND', text: '...IMPOSSIBLE...' },
  { who: 'VEGA', text: 'Mothership down. The swarm is breaking — they’re jumping out of the system.' },
  { who: 'COMMAND', text: 'Confirmed — they’re retreating! Pilot... Earth owes you everything.' },
  { who: 'VEGA', text: 'Take us home, partner. We’ve earned the view.' },
];

// Small read-only helper over the data (1-based sector numbers, like the HUD).
const Campaign = {
  codename: 'OPERATION HOMECOMING',
  count() { return CAMPAIGN_SECTORS.length; },
  sector(n) { return CAMPAIGN_SECTORS[Utils.clamp(n, 1, this.count()) - 1]; },
  // Total combat beats in a sector (waves + the boss) for the HUD pips.
  beats(def) { return def.waves.length + 1; },
  // Resolve a sector's boss id to its data-driven def at call time (boss.js
  // load order doesn't matter; FINAL_BOSS is the campaign-only Mothership).
  bossFor(def) {
    if (def.boss === 'mothership') return FINAL_BOSS;
    return BOSS_TYPES.find(b => b.id === def.boss) || BOSS_TYPES[0];
  },
  speakerColor(who) { return (SPEAKERS[who] || {}).color || '#cfe6ff'; },
};
