/* ==========================================================================
   Exotic — badges
   Earned, never bought. Each badge exposes a predicate over a stats snapshot
   so the same definitions work for single player and multiplayer realms.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});

  /* ctx = {
       realm, level, xp, wins, losses, matches, streak, bestStreak,
       perfects, noHintWins, fastestMs, puzzlesSolved, hintsUsed,
       accuracy, elo, categories: { math: n, ... }, tiers: { exotic: n }, currencies
     } */

  var BADGES = [
    { id: "first-blood", name: "First Crack", desc: "Win your very first cipher.", icon: "key", tier: "bronze",
      check: function (c) { return c.wins >= 1; } },
    { id: "opener", name: "Opener", desc: "Crack 5 ciphers.", icon: "unlock", tier: "bronze",
      check: function (c) { return c.wins >= 5; } },
    { id: "locksmith", name: "Locksmith", desc: "Crack 25 ciphers.", icon: "lock", tier: "silver",
      check: function (c) { return c.wins >= 25; } },
    { id: "vaultbreaker", name: "Vaultbreaker", desc: "Crack 100 ciphers.", icon: "database", tier: "gold",
      check: function (c) { return c.wins >= 100; } },

    { id: "no-hints", name: "Bare Hands", desc: "Win a run without spending a single hint.", icon: "feather", tier: "silver",
      check: function (c) { return c.noHintWins >= 1; } },
    { id: "flawless", name: "Flawless", desc: "Win without a single wrong guess.", icon: "target", tier: "gold",
      check: function (c) { return c.perfects >= 1; } },
    { id: "flawless-five", name: "Immaculate", desc: "Five flawless wins.", icon: "sparkles", tier: "gold",
      check: function (c) { return c.perfects >= 5; } },

    { id: "streak-3", name: "Warm", desc: "Three wins in a row.", icon: "flame", tier: "bronze",
      check: function (c) { return c.bestStreak >= 3; } },
    { id: "streak-7", name: "Ablaze", desc: "Seven wins in a row.", icon: "flame", tier: "silver",
      check: function (c) { return c.bestStreak >= 7; } },
    { id: "streak-15", name: "Inferno", desc: "Fifteen wins in a row.", icon: "flame", tier: "gold",
      check: function (c) { return c.bestStreak >= 15; } },

    { id: "speed-60", name: "Quick Wrist", desc: "Crack a cipher in under 60 seconds.", icon: "zap", tier: "silver",
      check: function (c) { return c.fastestMs > 0 && c.fastestMs < 60000; } },
    { id: "speed-30", name: "Blink", desc: "Crack a cipher in under 30 seconds.", icon: "zap", tier: "gold",
      check: function (c) { return c.fastestMs > 0 && c.fastestMs < 30000; } },

    { id: "savant", name: "Savant", desc: "Clear a Savant-tier run.", icon: "brain", tier: "gold",
      check: function (c) { return (c.tiers.savant || 0) >= 1; } },
    { id: "exotic-tier", name: "Exotic", desc: "Clear an Exotic-tier run. No hints allowed in there.", icon: "crown", tier: "platinum",
      check: function (c) { return (c.tiers.exotic || 0) >= 1; } },

    { id: "polymath", name: "Polymath", desc: "Solve puzzles in all eight categories.", icon: "graduationCap", tier: "gold",
      check: function (c) {
        var keys = ["math", "science", "logic", "riddle", "pattern", "trivia", "wordplay", "cipher"];
        return keys.every(function (k) { return (c.categories[k] || 0) >= 3; });
      } },
    { id: "scholar", name: "Scholar", desc: "Solve 250 puzzles.", icon: "bookOpen", tier: "silver",
      check: function (c) { return c.puzzlesSolved >= 250; } },
    { id: "encyclopedia", name: "Encyclopedia", desc: "Solve 1000 puzzles.", icon: "layers", tier: "platinum",
      check: function (c) { return c.puzzlesSolved >= 1000; } },

    { id: "sharp-eye", name: "Sharp Eye", desc: "Hold 80% answer accuracy over 50+ puzzles.", icon: "eye", tier: "silver",
      check: function (c) { return c.puzzlesSolved >= 50 && c.accuracy >= 0.8; } },
    { id: "surgical", name: "Surgical", desc: "Hold 95% answer accuracy over 100+ puzzles.", icon: "crosshair", tier: "platinum",
      check: function (c) { return c.puzzlesSolved >= 100 && c.accuracy >= 0.95; } },

    { id: "level-10", name: "Seasoned", desc: "Reach level 10.", icon: "trending", tier: "bronze",
      check: function (c) { return c.level >= 10; } },
    { id: "level-30", name: "Veteran", desc: "Reach level 30.", icon: "medal", tier: "silver",
      check: function (c) { return c.level >= 30; } },
    { id: "level-60", name: "Ascendant", desc: "Reach level 60.", icon: "award", tier: "platinum",
      check: function (c) { return c.level >= 60; } },

    { id: "duelist", name: "Duelist", desc: "Win 10 ranked duels.", icon: "swords", tier: "silver",
      check: function (c) { return c.realm === "multi" && c.rankedWins >= 10; } },
    { id: "cipher-rank", name: "Cipher Rank", desc: "Reach the Cipher rank.", icon: "hash", tier: "silver",
      check: function (c) { return c.realm === "multi" && c.elo >= 1100; } },
    { id: "oracle-rank", name: "Oracle Rank", desc: "Reach the Oracle rank.", icon: "telescope", tier: "platinum",
      check: function (c) { return c.realm === "multi" && c.elo >= 1700; } },
    { id: "host", name: "Good Host", desc: "Win a match you created.", icon: "crown", tier: "bronze",
      check: function (c) { return c.realm === "multi" && c.hostWins >= 1; } },
    { id: "collector", name: "Collector", desc: "Own 10 items from the shop.", icon: "package", tier: "silver",
      check: function (c) { return (c.owned || 0) >= 10; } },
    { id: "patron", name: "Patron", desc: "Spend 5,000 across the shop.", icon: "coins", tier: "gold",
      check: function (c) { return (c.spent || 0) >= 5000; } },
    { id: "oracle-ai", name: "Consulted the Oracle", desc: "Ask the Oracle to forge a custom puzzle.", icon: "bot", tier: "bronze",
      check: function (c) { return (c.aiUses || 0) >= 1; } },
    { id: "daily", name: "Ritual", desc: "Complete 7 daily ciphers.", icon: "calendar", tier: "silver",
      check: function (c) { return (c.dailies || 0) >= 7; } }
  ];

  var TIER_ORDER = { bronze: 1, silver: 2, gold: 3, platinum: 4 };

  function evaluate(ctx) {
    var snapshot = {
      realm: ctx.realm || "single",
      level: ctx.level || 1,
      xp: ctx.xp || 0,
      wins: ctx.wins || 0,
      losses: ctx.losses || 0,
      matches: ctx.matches || ((ctx.wins || 0) + (ctx.losses || 0)),
      streak: ctx.streak || 0,
      bestStreak: ctx.bestStreak || 0,
      perfects: ctx.perfects || 0,
      noHintWins: ctx.noHintWins || 0,
      fastestMs: ctx.fastestMs || 0,
      puzzlesSolved: ctx.puzzlesSolved || 0,
      hintsUsed: ctx.hintsUsed || 0,
      accuracy: ctx.accuracy == null ? 1 : ctx.accuracy,
      elo: ctx.elo || 1000,
      rankedWins: ctx.rankedWins || 0,
      hostWins: ctx.hostWins || 0,
      categories: ctx.categories || {},
      tiers: ctx.tiers || {},
      owned: ctx.owned || 0,
      spent: ctx.spent || 0,
      aiUses: ctx.aiUses || 0,
      dailies: ctx.dailies || 0
    };
    var earned = [];
    BADGES.forEach(function (b) {
      var ok = false;
      try { ok = !!b.check(snapshot); } catch (e) { ok = false; }
      if (ok) earned.push(b.id);
    });
    return earned;
  }

  X.Badges = {
    all: function () { return BADGES.slice(); },
    get: function (id) {
      for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) return BADGES[i];
      return null;
    },
    evaluate: evaluate,
    tierOrder: TIER_ORDER,
    count: BADGES.length
  };
})(window);
