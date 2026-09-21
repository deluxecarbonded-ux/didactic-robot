/* ==========================================================================
   Exotic — profile
   Progression glue. A run finishes, scoring hands back numbers, and this file
   folds them into the right realm's profile: experience, streak, category
   mastery, badges and history. Single and multiplayer never touch each other.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var CFG = X.config;
  var SK = CFG.STORAGE_KEYS;

  /* --------------------------------------------------------------- perks -- */

  /**
   * Everything the player permanently owns in a realm, flattened into one
   * effect bag. Power-ups are not included — only perks and cosmetics.
   */
  function perks(realmName) {
    var R = X.Cloud.realm(realmName);
    var out = {
      xpBonus: 0,
      currencyBonus: 0,
      hintDiscount: 0,
      startBonusTime: 0,
      headStart: 0,
      shield: false,
      rankShield: 0,
      recon: false,
      titles: [],
      frames: [],
      trails: [],
      skins: [],
      emotes: []
    };
    (R.inventory || []).forEach(function (row) {
      if (!row || !row.quantity) return;
      var item = X.Shop.get(row.item_id);
      if (!item || !item.effect) return;
      var key = item.effect.key;
      var value = item.effect.value;
      switch (key) {
        case "xpBonus": out.xpBonus += Number(value) || 0; break;
        case "currencyBonus": out.currencyBonus += Number(value) || 0; break;
        case "hintDiscount": out.hintDiscount = Math.max(out.hintDiscount, Number(value) || 0); break;
        case "startBonusTime": out.startBonusTime = Math.max(out.startBonusTime, Number(value) || 0); break;
        case "headStart": out.headStart = Math.max(out.headStart, Number(value) || 0); break;
        case "shield": out.shield = true; break;
        case "rankShield": out.rankShield += row.quantity; break;
        case "recon": out.recon = true; break;
        case "title": out.titles.push(value); break;
        case "frame": out.frames.push(value); break;
        case "trail": out.trails.push(value); break;
        case "boardSkin": out.skins.push(value); break;
        case "emotes": out.emotes.push(value); break;
        default: break;
      }
    });
    return out;
  }

  /* --------------------------------------------------------------- daily -- */

  function todayKey() {
    var d = new Date();
    return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  }

  function dailyState() {
    var saved = util.storage.get(SK.daily, null);
    if (!saved || saved.date !== todayKey()) return { date: todayKey(), single: false, multi: false };
    return saved;
  }

  /** True only the first time a realm is cleared on the current day. */
  function claimDaily(realmName) {
    var st = dailyState();
    var key = realmName === "multi" ? "multi" : "single";
    if (st[key]) return false;
    st[key] = true;
    util.storage.set(SK.daily, st);
    return true;
  }

  function dailyStatus() {
    var st = dailyState();
    return { date: st.date, single: !!st.single, multi: !!st.multi };
  }

  /* -------------------------------------------------------------- badges -- */

  function badgeContext(realmName, profile) {
    var p = profile || (X.Cloud.realm(realmName).profile) || {};
    var solved = p.puzzles_solved || 0;
    var failed = p.puzzles_failed || 0;
    var attempts = solved + failed;
    var elo = p.elo == null ? 1000 : p.elo;
    var ctx = {
      realm: realmName,
      level: p.level || 1,
      xp: p.xp || 0,
      streak: p.streak || 0,
      bestStreak: p.best_streak || 0,
      perfects: p.perfects || 0,
      noHintWins: p.no_hint_wins || 0,
      fastestMs: p.best_time_ms || 0,
      puzzlesSolved: solved,
      hintsUsed: p.hints_used || 0,
      accuracy: attempts ? solved / attempts : 1,
      categories: p.category_stats || {},
      tiers: p.tier_clears || {},
      owned: p.owned || 0,
      spent: p.spent || 0,
      aiUses: p.ai_uses || 0,
      dailies: p.dailies_done || 0,
      elo: elo
    };
    if (realmName === "multi") {
      ctx.wins = p.wins || 0;
      ctx.losses = p.losses || 0;
      ctx.matches = p.matches || ((p.wins || 0) + (p.losses || 0));
      ctx.rankedWins = p.ranked_wins || 0;
      ctx.hostWins = p.host_wins || 0;
    } else {
      ctx.wins = p.runs_won || 0;
      ctx.losses = Math.max(0, (p.runs_played || 0) - (p.runs_won || 0));
      ctx.matches = p.runs_played || 0;
      ctx.rankedWins = 0;
      ctx.hostWins = 0;
    }
    return ctx;
  }

  /**
   * Compare the badge predicates against the profile, append anything new.
   * @returns {Array<object>} the badge definitions earned just now
   */
  function evaluateBadges(realmName, profile) {
    var p = profile || X.Cloud.realm(realmName).profile;
    if (!p) return [];
    var owned = p.badges || [];
    var earned = X.Badges.evaluate(badgeContext(realmName, p));
    var fresh = [];
    earned.forEach(function (id) {
      if (owned.indexOf(id) < 0) {
        owned.push(id);
        var def = X.Badges.get(id);
        if (def) fresh.push(def);
      }
    });
    p.badges = owned;
    return fresh;
  }

  /* ------------------------------------------------------------ run fold -- */

  function bumpCategory(p, tally) {
    var stats = p.category_stats || (p.category_stats = {});
    Object.keys(tally || {}).forEach(function (cat) {
      stats[cat] = (stats[cat] || 0) + tally[cat];
    });
  }

  function historyEntry(run, result) {
    return {
      realm: run.realm,
      tier: run.tier,
      mode: run.mode,
      outcome: run.outcome,
      score: result.score,
      xp: result.xp,
      currency: result.currency,
      solved: result.solved,
      total: result.total,
      hints: run.hintsUsed || 0,
      elapsed_ms: Math.round(run.elapsedMs || 0),
      code: (run.code || []).join("")
    };
  }

  /**
   * Fold a finished run into a realm's profile, grant its currency, refresh
   * badges and write history. Mutates the profile in place then persists.
   * @returns {Promise<{profile:object, earned:Array, levelUp:object|null, currency:number, result:object}>}
   */
  function applyRun(realmName, run, result, opts) {
    var R = X.Cloud.realm(realmName);
    var p = R.profile;
    opts = opts || {};
    if (!p) return Promise.resolve(null);

    var beforeLevel = CFG.XP.levelFor(p.xp || 0).level;
    var solved = result.solved;
    var win = result.win;

    p.runs_played = (p.runs_played || 0) + 1;
    if (win) p.runs_won = (p.runs_won || 0) + 1;
    p.puzzles_solved = (p.puzzles_solved || 0) + solved;
    p.puzzles_failed = (p.puzzles_failed || 0) + Math.max(0, run.slots.length - solved);
    p.hints_used = (p.hints_used || 0) + (run.hintsUsed || 0);
    if (result.perfect) p.perfects = (p.perfects || 0) + 1;
    if (win && !run.hintsUsed) p.no_hint_wins = (p.no_hint_wins || 0) + 1;

    var shieldHeld = false;
    if (win) {
      p.streak = (p.streak || 0) + 1;
      p.best_streak = Math.max(p.best_streak || 0, p.streak);
    } else if (realmName === "single" && run.modifiers && run.modifiers.shield) {
      shieldHeld = true; /* the shield eats the loss, streak survives */
    } else {
      p.streak = 0;
    }

    if (win) {
      var ms = Math.round(run.elapsedMs || 0);
      if (!p.best_time_ms || ms < p.best_time_ms) p.best_time_ms = ms;
    }

    p.total_score = (p.total_score || 0) + result.score;
    p.xp = (p.xp || 0) + result.xp;
    var after = CFG.XP.levelFor(p.xp);
    p.level = after.level;

    bumpCategory(p, run.categoryTally);
    var clears = p.tier_clears || (p.tier_clears = {});
    if (win) clears[run.tier] = (clears[run.tier] || 0) + 1;

    if (realmName === "multi") {
      p.matches = (p.matches || 0) + 1;
      if (win) p.wins = (p.wins || 0) + 1; else p.losses = (p.losses || 0) + 1;
      if (win && run.ranked) p.ranked_wins = (p.ranked_wins || 0) + 1;
      if (win && opts.hosted) p.host_wins = (p.host_wins || 0) + 1;
      if (opts.eloDelta) {
        p.elo = (p.elo || 1000) + opts.eloDelta;
        p.rank_id = CFG.rankFor(p.elo).id;
      }
    }

    if (opts.aiUse) p.ai_uses = (p.ai_uses || 0) + 1;
    if (opts.daily) {
      p.dailies_done = (p.dailies_done || 0) + 1;
      p.daily_streak = (p.daily_streak || 0) + 1;
    }

    var fresh = evaluateBadges(realmName, p);

    return Promise.all([
      R.grant(result.currency, win ? "run-won" : "run-played"),
      R.patch({}),
      R.record(historyEntry(run, result))
    ]).then(function () {
      return {
        profile: p,
        earned: fresh,
        levelUp: after.level > beforeLevel ? { from: beforeLevel, to: after.level } : null,
        shieldHeld: shieldHeld,
        currency: result.currency,
        result: result
      };
    });
  }

  /* --------------------------------------------------------------- misc --- */

  function equipped(profile) {
    return util.merge({ frame: null, trail: null, boardSkin: null, title: null }, (profile && profile.equipped) || {});
  }

  /** Title chosen in the shop, if any, else the realm rank name. */
  function displayTitle(realmName, profile) {
    var eq = equipped(profile);
    if (eq.title) return eq.title;
    if (realmName === "multi" && profile) return CFG.rankFor(profile.elo || 1000).name;
    return "";
  }

  function summary(realmName, profile) {
    var p = profile || (X.Cloud.realm(realmName).profile) || {};
    var solved = p.puzzles_solved || 0;
    var failed = p.puzzles_failed || 0;
    var attempts = solved + failed;
    return {
      level: CFG.XP.levelFor(p.xp || 0),
      accuracy: attempts ? solved / attempts : 0,
      played: realmName === "multi" ? (p.matches || 0) : (p.runs_played || 0),
      won: realmName === "multi" ? (p.wins || 0) : (p.runs_won || 0),
      streak: p.streak || 0,
      bestStreak: p.best_streak || 0,
      badges: (p.badges || []).length,
      categories: p.category_stats || {},
      tiers: p.tier_clears || {},
      elo: p.elo == null ? 1000 : p.elo,
      rank: CFG.rankFor(p.elo == null ? 1000 : p.elo)
    };
  }

  X.Profile = {
    perks: perks,
    badgeContext: badgeContext,
    evaluateBadges: evaluateBadges,
    applyRun: applyRun,
    claimDaily: claimDaily,
    dailyStatus: dailyStatus,
    todayKey: todayKey,
    equipped: equipped,
    displayTitle: displayTitle,
    summary: summary
  };
})(window);
