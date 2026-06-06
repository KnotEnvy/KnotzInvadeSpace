/* =====================================================================
 * daily.js — The Daily Challenge. Each calendar day maps to a fixed seed
 * and a small set of run modifiers (chosen deterministically from the
 * date), so every player faces the same formations + twists that day and
 * competes on score. Per-day best is kept in the Meta profile.
 * ===================================================================== */

class DailyChallenge {
  // 'YYYY-MM-DD' for the local day (the identity of today's challenge).
  todayKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Deterministically choose pickCount distinct modifiers for a date key.
  modifiersFor(key) {
    const rng = Utils.makeRng(Utils.hashStr('mods:' + key));
    const pool = CONFIG.daily.modifiers.slice();
    const chosen = [];
    for (let i = 0; i < CONFIG.daily.pickCount && pool.length; i++) {
      chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    }
    return chosen;
  }

  // Neutral run-modifier aggregate; modifier patches override fields onto it.
  neutral() {
    return {
      eliteChanceAdd: 0, aggroMul: 1, hazardRateMul: 1, bigAsteroidChance: 0.6,
      bossEvery: CONFIG.wave.bossEvery, startLives: null, playerDamageMul: 1,
      extraCols: 0, extraRows: 0, creditMul: 1,
    };
  }
  aggregate(mods) {
    const agg = this.neutral();
    for (const m of mods) Object.assign(agg, m.patch); // patches touch disjoint fields
    return agg;
  }

  // Per-wave seed so formations are identical for everyone on a given day,
  // independent of how the run is played.
  waveSeed(key, waveCount) { return Utils.hashStr('wave:' + key + ':' + waveCount); }

  // Cached snapshot of today's challenge.
  today() {
    const key = this.todayKey();
    if (this._cache && this._cache.key === key) return this._cache;
    const mods = this.modifiersFor(key);
    this._cache = { key, mods, agg: this.aggregate(mods) };
    return this._cache;
  }

  best(key) { return Meta.dailyBest(key); }
}

const Daily = new DailyChallenge();
