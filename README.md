# 🚀 Knotz: Invade Space

A modern, juiced-up reimagining of the classic *Space Invaders* — built with the
HTML5 Canvas and vanilla JavaScript, **no build step and no dependencies**.
Blast through escalating waves of alien **Beetlemorphs**, armored **Rhinomorphs**,
fast **Stingers** and bursting **Splitters**, dodge Galaga-style dive-bombers and
drifting **asteroids**, grab power-ups, and topple a multi-phase **Overlord** boss
at the end of every sector. Bank your earnings into permanent upgrades in the
**Hangar** — it's a roguelite, so every run makes you stronger.

![arcade](https://img.shields.io/badge/genre-arcade%20shooter-46e0ff) ![tech](https://img.shields.io/badge/built%20with-vanilla%20JS-ffd23f) ![deps](https://img.shields.io/badge/dependencies-none-3ff58b)

## ✨ Features

- **Roguelite meta-progression** — earn **credits** every run and spend them in the
  **Hangar** on 7 permanent upgrades (hull, engines, beam, twin auto-cannons, magnet
  field, combat drone, start-shield). Progress is saved locally between sessions.
- **Juicy game feel** — screen shake, particle explosions, hit-flashes, bullet
  trails, muzzle flashes, floating score popups and a combo multiplier system.
- **Varied enemies & elites** — Beetlemorphs, armored Rhinomorphs, fast aggressive
  **Stingers**, and **Splitters** that burst into diving minions — any of which can
  spawn as a glowing **elite** with more health and guaranteed loot.
- **Smart enemies** — formations that march and descend, plus enemies that break
  off to dive-bomb you and re-join from the top.
- **Combat Drone wingman** & **Magnet Field** upgrades that auto-fire and vacuum up
  power-ups, plus **twin cannons** for double the firepower.
- **Environmental hazards** — rotating **asteroids** drift in, shatter into smaller
  chunks when shot, and wreck your ship on contact.
- **Energy beam** — hold a key to unleash a continuous damage beam that drains
  (and regenerates) your ship's energy.
- **Power-ups** — Rapid Fire, Spread Shot, Shield, Energy refill, Smart Bomb and
  Extra Life drop from destroyed enemies.
- **Boss battles** — a three-phase Overlord every 5th wave with aimed shots,
  spread fire and radial bullet storms. Each tier is tougher.
- **Endless progression** — difficulty, formation size and armor scale up; each
  cleared sector swaps in a new space backdrop.
- **Parallax starfields** drifting over your space background art.
- **Procedural audio** — every sound effect and the background music are
  synthesized at runtime with the Web Audio API (no audio files needed).
- **Plays everywhere** — keyboard *and* mouse/touch controls; the canvas scales
  to fit any screen. High score is saved locally.

## 🎮 Controls

| Action       | Keys                          | Touch / Mouse        |
|--------------|-------------------------------|----------------------|
| Move         | `←` `→` or `A` `D`            | Drag                 |
| Fire         | `Space`                       | Tap & hold           |
| Energy Beam  | `Shift` or `X`                | —                    |
| Pause        | `Esc` or `P`                  | —                    |
| Mute sound   | `M`                           | —                    |
| Start / Retry| `Enter`                       | Tap                  |
| Hangar       | `H` (menu / game over)        | Tap rows to buy      |
| Quit to menu | `Q` (when paused / game over) | —                    |

**Tip:** chain kills quickly to build a combo multiplier (up to ×8) for huge scores,
and grab the guaranteed power-up shower after each boss.

## 🛰️ The Hangar (roguelite loop)

Every run pays out **credits** based on your score, waves cleared and bosses slain.
Press **H** from the title or game-over screen to enter the **Hangar** and invest them:

| Upgrade | Effect |
|---------|--------|
| **Hull Plating** | +1 starting & max life per level |
| **Ion Engines** | +8% move speed per level |
| **Beam Core** | +25% beam energy & regen per level |
| **Auto-Cannons** | Faster fire; **twin shot** at Lv2 |
| **Magnet Field** | Pulls power-ups toward your ship |
| **Combat Drone** | Adds an auto-firing wingman (up to 2) |
| **Aegis Start** | Begin every run with a shield |

Upgrades are permanent and saved locally, so each run leaves you a little stronger —
push deeper, earn more, unlock more.

## ▶️ Getting Started

No install, no server, no build:

1. Clone or download this repository.
2. Open **`index.html`** in any modern browser (Chrome, Edge, Firefox, Safari).

That's it. *(Music/SFX start on your first key press or tap, per browser autoplay rules.)*

## 🗂️ Project Structure

The game is organized into small, single-responsibility modules loaded as plain
scripts (so it runs straight from the file system — no bundler required):

| File | Responsibility |
|------|----------------|
| `index.html` / `styles.css` | Page shell + canvas; everything else renders to canvas |
| `src/config.js`   | All tunables, palette and the asset manifest |
| `src/utils.js`    | Math, collision (AABB) and text/draw helpers |
| `src/audio.js`    | Web Audio synthesized SFX + procedural music |
| `src/input.js`    | Unified keyboard + pointer/touch input |
| `src/particles.js`| Pooled particles, explosions, score popups |
| `src/starfield.js`| Parallax background + scrolling star layers |
| `src/projectile.js`| Pooled bullets (trails) and the player energy beam |
| `src/powerup.js`  | Falling collectibles and their effects |
| `src/meta.js`     | Roguelite profile (credits/upgrades/hi-score) + upgrade catalog |
| `src/player.js`   | Player ship: movement, banking, weapons, shield, lives, upgrades |
| `src/enemy.js`    | Enemy base + Beetlemorph / Rhinomorph / Stinger / Splitter + elites |
| `src/boss.js`     | Multi-phase boss with attack patterns + health bar |
| `src/wave.js`     | Formation movement, edge bouncing, diver/fire scheduling, composition |
| `src/drone.js`    | Combat Drone wingman that auto-fires |
| `src/hazard.js`   | Drifting, splitting asteroids |
| `src/ui.js`       | HUD, menu, pause, game-over and banner screens |
| `src/hangar.js`   | Between-runs upgrade shop (the roguelite meta layer) |
| `src/game.js`     | Orchestrator: state machine, collisions, scoring, progression |
| `src/main.js`     | Asset preloader, responsive canvas, fixed-timestep loop |

### Assets
`player.png`, `player_jets.png`, `beetlemorph.png`, `rhinomorph.png`, `boss.png`
are sprite sheets; `assets/background*.png` are the per-sector backdrops.

## 🛠️ Tweaking the Game

Almost everything balance- or look-related lives in **`src/config.js`** — ship
speed, fire rates, enemy health, drop chances, boss health scaling, the color
palette and which backgrounds map to which sectors. Tune away.

## 📜 License

MIT License — see [LICENSE.md](LICENSE.md).
