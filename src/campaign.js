/* =====================================================================
 * campaign.js — OPERATION HOMECOMING: the scripted story campaign.
 *
 * Unlike Endless/Daily (formula-driven waves), the campaign is hand-
 * authored data: five named sectors between the stargate and Earth, each
 * with its own backdrop, hazard profile, scripted wave compositions, a
 * sector boss, and story dialogue. Between sectors you DOCK with the
 * carrier (the Hangar, mid-run) to spend banked credits and refit.
 *
 * The cast:
 *   VEGA     — the advanced Hive warship you stole through the stargate;
 *              her AI woke up on the way out and decided she likes you.
 *   ORION    — UES Orion, Earth's last fleet carrier. She follows the
 *              corridor you clear, one jump behind, deck crews ready.
 *   COMMAND  — Earth Command, faint behind jamming, clearer every sector.
 *   HIVEMIND — the swarm itself. It built VEGA. It wants her back.
 *
 * Wave descriptor: { cols, rows, speed, mix:{armor,stinger,splitter,elite},
 *                    mini?, say? } — mix replaces the endless-mode formulas
 * (armor = Rhinomorph ratio; others are per-slot chances). `mini: true`
 * spawns a scripted mini-boss escort; `say` queues a comm line at start.
 * Sector fields: `dock` is the ORION line shown while docked BEFORE this
 * sector; `taunt` plays in the pre-boss beat; `clearSay` after the boss.
 * ===================================================================== */

// Speaker -> comm/briefing colour (resolved at draw time via SPEAKERS[who]).
const SPEAKERS = {
  VEGA:     { color: '#46e0ff' },
  ORION:    { color: '#3ff58b' },
  COMMAND:  { color: '#ffd23f' },
  HIVEMIND: { color: '#ff4d6d' },
};

const CAMPAIGN_SECTORS = [
  {
    id: 'gateway', name: 'GATEWAY REACH', sub: 'The far side of the stargate',
    bg: 0, hazardMul: 0, bigAsteroid: 0.3, aggro: 1.0,
    boss: 'overlord',
    threat: 'LIGHT — scout picket on patrol',
    dock: null,   // no dock before sector 1 — the run opens here
    brief: [
      { who: 'VEGA', text: 'Systems online. So you’re the thief. Good — I was tired of rusting.' },
      { who: 'COMMAND', text: '*static* —strike wing is gone. Anyone still out there... Earth is holding. Barely.' },
      { who: 'ORION', text: 'Carrier UES Orion, on your six. Clear the lane, pilot — we’ll follow you home, jump for jump.' },
      { who: 'VEGA', text: 'Five sectors. One swarm. Start shooting.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'THAT HULL BELONGS TO THE HIVE. SO WILL YOUR BONES.' },
    clearSay: { who: 'ORION', text: 'Picket’s ash. We’re jumping in behind you — come get refit, pilot.' },
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
    dock: { who: 'ORION', text: 'Deck’s yours. Patch the hull, feed the guns — the Belt chews up the sloppy.' },
    brief: [
      { who: 'VEGA', text: 'The Shattered Belt. A century of human mining — the Hive cracked it open in a day.' },
      { who: 'ORION', text: 'Their haulers nest deep in that rock. Watch the debris; we can’t refit a smear.' },
      { who: 'COMMAND', text: '*static* —signal’s stronger. Keep coming, pilot. Keep coming.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'THE WARDEN BURIED A THOUSAND MINERS HERE. THERE IS ROOM FOR ONE MORE.' },
    clearSay: { who: 'VEGA', text: 'Warden’s down. The Belt is quiet for the first time in years.' },
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
    dock: { who: 'ORION', text: 'Refit fast. That nebula spits stingers like rain — and we’re parked in it.' },
    brief: [
      { who: 'VEGA', text: 'Their nursery. Every stinger in the armada hatched in these clouds.' },
      { who: 'VEGA', text: 'They’ll come fast and angry. Don’t let them ring us.' },
      { who: 'HIVEMIND', text: 'TURN BACK, LITTLE THIEF. THE NURSERY IS NOT FOR YOUR KIND.' },
      { who: 'VEGA', text: '...It has never spoken to me before. Stay sharp.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'THE WEAVER SPUN YOUR SHIP’S CRADLE. NOW IT SPINS YOUR SHROUD.' },
    clearSay: { who: 'VEGA', text: 'Weaver’s unravelled. The brood is scattering — punch it.' },
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
    dock: { who: 'ORION', text: 'Spend it all, pilot. Nobody banks credits in a graveyard.' },
    brief: [
      { who: 'COMMAND', text: 'We can see you now, pilot. That blockade is everything they have left.' },
      { who: 'ORION', text: 'Elite guard. Grown for one job — killing ships like yours.' },
      { who: 'HIVEMIND', text: 'YOUR MACHINE BETRAYED US ONCE. IT WILL BURN BESIDE YOU.' },
      { who: 'VEGA', text: 'It remembers me. Good. Then it knows what’s coming.' },
    ],
    taunt: { who: 'HIVEMIND', text: 'HERALD — SOUND THE TRAITOR’S FUNERAL.' },
    clearSay: { who: 'ORION', text: 'The line is broken. Nothing between us and Earth... but her.' },
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
    dock: { who: 'ORION', text: 'Last stop. Whatever’s in the vault, bolt it to your ship. Earth remembers today.' },
    brief: [
      { who: 'COMMAND', text: 'They’re in orbit. Whatever you’re going to do, pilot — do it now.' },
      { who: 'VEGA', text: 'The Mothership. The mind of the swarm. The yard that built me. My mother, technically.' },
      { who: 'HIVEMIND', text: 'COME, TRAITOR. WITNESS THE END OF YOUR ADOPTED WORLD.' },
      { who: 'VEGA', text: 'All weapons free. Earth is watching, pilot.' },
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
        say: { who: 'VEGA', text: 'Last screen of escorts. She’s right behind them.' } },
    ],
  },
];

// Rolls on the victory screen once the Mothership falls.
const CAMPAIGN_EPILOGUE = [
  { who: 'HIVEMIND', text: '...IMPOSSIBLE...' },
  { who: 'VEGA', text: 'Mothership down. The swarm is breaking — they’re jumping blind.' },
  { who: 'COMMAND', text: 'Confirmed, they’re retreating! Pilot — Earth owes you everything.' },
  { who: 'ORION', text: 'All decks, light the bay. Our ghost ship is coming home.' },
  { who: 'VEGA', text: 'Take us in, partner. We’ve earned the view.' },
];

// Small read-only helper over the data (1-based sector numbers, like the HUD).
const Campaign = {
  codename: 'OPERATION HOMECOMING',
  carrier: 'UES ORION',
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
