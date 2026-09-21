/* ==========================================================================
   Exotic — scoring
   One place that turns a finished run into numbers: score, experience and the
   realm's own currency. Both realms share the same skeleton, but the reward
   tables and the outcome rules live in config so nothing is hard-coded here.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var CFG = X.config;

  function solvedCount(run) {
    var n = 0;
    for (var i = 0; i < run.slots.length; i++) if (run.slots[i].solved) n++;
    return n;
  }

  function wrongGuesses(run) {
    var n = 0;
    var list = run.guesses || [];
    for (var i = 0; i < list.length; i++) if (!list[i].correct) n++;
    return n;
  }

  function isPerfect(run) {
    return solvedCount(run) === run.slots.length && wrongGuesses(run) === 0;
  }

  /** How much of the clock is left, 0..1. */
  function speedFraction(run) {
    var total = run.durationMs || 1;
    var used = run.elapsedMs;
    if (used == null) used = X.Engine.elapsed(run);
    return util.clamp(1 - used / total, 0, 1);
  }

  function streakMultiplier(realmKey, streak) {
    var R = CFG.REWARDS[realmKey];
    var step = R.streakStep || 0;
    var cap = R.streakCap == null ? 0 : R.streakCap;
    return 1 + Math.min(cap, Math.max(0, streak) * step);
  }

  function perkValue(ctx, key) {
    if (!ctx || !ctx.perks) return 0;
    var v = ctx.perks[key];
    return typeof v === "number" ? v : 0;
  }

  /**
   * Grade a finished run.
   * @param {object} run  a run whose outcome is set ("won" | "lost" | "expired" | "abandoned")
   * @param {{streak?:number, firstClear?:boolean, placement?:number, perks?:object}} [ctx]
   * @returns {{realm:string,win:boolean,perfect:boolean,solved:number,total:number,
   *            score:number,xp:number,currency:number,lines:Array,streakMult:number,
   *            tierMult:number,double:number,speed:number}}
   */
  function evaluate(run, ctx) {
    ctx = ctx || {};
    var realmKey = run.realm === "multi" ? "mp" : "sp";
    var R = CFG.REWARDS[realmKey];
    var tier = CFG.tier(run.tier);
    var solved = solvedCount(run);
    var total = run.slots.length || 1;
    var win = run.outcome === "won";
    var perfect = win && isPerfect(run);
    var speed = speedFraction(run);
    var lines = [];

    function add(label, amount) {
      amount = Math.round(amount || 0);
      if (amount) lines.push({ label: label, amount: amount });
      return amount;
    }

    var subtotal = 0;

    if (realmKey === "sp") {
      subtotal += add("Run cleared", win ? R.base : R.base * (solved / total) * 0.35);
      subtotal += add("Puzzles cracked", R.perPuzzleSolved * solved);
      if (win) subtotal += add("Attempts spared", R.perGuessSaved * Math.max(0, run.attemptsLeft || 0));
      if (win) subtotal += add("Time left", R.speedBonusMax * speed);
      if (perfect) subtotal += add("Flawless", R.perfectBonus);
      if (win && ctx.firstClear) subtotal += add("First clear today", R.firstClearOfDay);
    } else {
      var placement = ctx.placement;
      if (win) subtotal += add("Victory", R.win * (run.ranked ? R.rankedWinMult : 1));
      else if (placement && placement <= 3) subtotal += add("Podium", R.podium);
      else subtotal += add("Participation", R.participation);
      if (win) subtotal += add("Time left", R.speedBonusMax * speed);
      if (perfect) subtotal += add("Flawless", R.perfectBonus);
    }

    var streakMult = streakMultiplier(realmKey, ctx.streak || 0);
    var tierMult = tier.shardMult || 1;
    var double = run.modifiers && run.modifiers.double ? 2 : 1;
    var perkCurrency = perkValue(ctx, "currencyBonus");
    var perkXp = perkValue(ctx, "xpBonus");

    var score = Math.round(subtotal * streakMult * tierMult);
    var currency = Math.round(score * double * (1 + perkCurrency));
    var xp = Math.round(
      (solved * 45 + (win ? 150 : 0) + (perfect ? 90 : 0) + speed * 70) *
      (tier.xpMult || 1) * (1 + perkXp)
    );

    if (streakMult > 1) lines.push({ label: "Streak", mult: util.round(streakMult, 2) });
    if (tierMult !== 1) lines.push({ label: tier.name + " tier", mult: tierMult });
    if (double > 1) lines.push({ label: "Double yield", mult: 2 });
    if (perkCurrency > 0) lines.push({ label: "Dividend perk", mult: 1 + perkCurrency });

    var result = {
      realm: realmKey,
      win: win,
      perfect: perfect,
      solved: solved,
      total: total,
      score: score,
      xp: xp,
      currency: currency,
      lines: lines,
      streakMult: streakMult,
      tierMult: tierMult,
      double: double,
      speed: speed
    };

    run.score = score;
    run.xpEarned = xp;
    run.currencyEarned = currency;
    return result;
  }

  /**
   * Rating change for a head-to-head result.
   * @param {{playerElo?:number, opponentElo?:number, won?:boolean, ranked?:boolean}} opts
   */
  function elo(opts) {
    var o = opts || {};
    var mine = o.playerElo == null ? 1000 : o.playerElo;
    var opp = o.opponentElo == null ? 1000 : o.opponentElo;
    var k = o.ranked ? 32 : 14;
    var expected = 1 / (1 + Math.pow(10, (opp - mine) / 400));
    var delta = Math.round(k * ((o.won ? 1 : 0) - expected));
    if (o.won && delta < 6) delta = 6;
    if (!o.won && delta > -6) delta = -6;
    return delta;
  }

  /** Experience still needed for the next level, 0..1 progress. */
  function xpProgress(profile) {
    var info = CFG.XP.levelFor((profile && profile.xp) || 0);
    var span = Math.max(1, info.need);
    return util.merge(info, { pct: util.clamp(info.into / span, 0, 1) });
  }

  X.Scoring = {
    evaluate: evaluate,
    elo: elo,
    solvedCount: solvedCount,
    wrongGuesses: wrongGuesses,
    isPerfect: isPerfect,
    speedFraction: speedFraction,
    streakMultiplier: streakMultiplier,
    xpProgress: xpProgress,
    rankFor: function (rating) { return CFG.rankFor(rating); },
    rankProgress: function (rating) { return CFG.rankProgress(rating); }
  };
})(window);
