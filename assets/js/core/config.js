/* ==========================================================================
   Exotic — configuration
   Fill in the two connection blocks below to switch from local play to the
   full cloud build. Everything else in the app degrades gracefully.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;

  var DEFAULTS = {
    /* ---- Supabase (project settings -> API) --------------------------- */
    supabaseUrl: "",
    supabaseAnonKey: "",

    /* ---- OpenRouter (used by the Oracle AI features) ------------------ */
    openrouterKey: "",
    /* When true, AI calls go through your Supabase edge function instead of
       straight from the browser. Recommended for anything public. */
    useAiProxy: true,

    /* ---- preferences --------------------------------------------------- */
    theme: "dark",
    sound: true,
    music: true,
    haptics: true,
    motion: "full",
    reducedFx: false,

    /* ---- game defaults ------------------------------------------------- */
    defaultTier: "standard",
    autoAdvance: true,
    showExplanations: true,
    keyboardCapture: true
  };

  var CONFIG = util.merge(DEFAULTS, util.storage.get("config", {}));

  /* ---- difficulty tiers -------------------------------------------------- */
  var TIERS = {
    warmup: {
      id: "warmup",
      name: "Warm Up",
      blurb: "Gentle riddles. Room to breathe.",
      seconds: 240,
      guesses: 8,
      puzzles: 4,
      difficulty: [1, 2],
      hintCost: 40,
      xpMult: 0.8,
      shardMult: 0.8,
      icon: "feather"
    },
    standard: {
      id: "standard",
      name: "Standard",
      blurb: "The intended Exotic experience.",
      seconds: 180,
      guesses: 6,
      puzzles: 4,
      difficulty: [2, 3],
      hintCost: 60,
      xpMult: 1,
      shardMult: 1,
      icon: "target"
    },
    sharp: {
      id: "sharp",
      name: "Sharp",
      blurb: "Trickier trivia, tighter clock.",
      seconds: 140,
      guesses: 5,
      puzzles: 4,
      difficulty: [3, 4],
      hintCost: 90,
      xpMult: 1.45,
      shardMult: 1.4,
      icon: "zap"
    },
    savant: {
      id: "savant",
      name: "Savant",
      blurb: "Lateral, layered, unforgiving.",
      seconds: 110,
      guesses: 4,
      puzzles: 4,
      difficulty: [4, 5],
      hintCost: 130,
      xpMult: 2.1,
      shardMult: 2,
      icon: "brain"
    },
    exotic: {
      id: "exotic",
      name: "Exotic",
      blurb: "Every digit fights back. No safety net.",
      seconds: 95,
      guesses: 3,
      puzzles: 4,
      difficulty: [5, 5],
      hintCost: 180,
      xpMult: 3,
      shardMult: 3,
      icon: "flame",
      noHints: true
    }
  };

  /* ---- multiplayer modes ------------------------------------------------- */
  var MP_MODES = {
    duel: {
      id: "duel",
      name: "Duel",
      blurb: "1v1 race to crack the same cipher.",
      minPlayers: 2,
      maxPlayers: 2,
      seconds: 150,
      puzzles: 4,
      ranked: true,
      icon: "swords"
    },
    squad: {
      id: "squad",
      name: "Squad",
      blurb: "Up to four. First to break it takes the cores.",
      minPlayers: 2,
      maxPlayers: 4,
      seconds: 170,
      puzzles: 4,
      ranked: false,
      icon: "users"
    },
    blitz: {
      id: "blitz",
      name: "Blitz",
      blurb: "Sixty seconds. Every second counts.",
      minPlayers: 2,
      maxPlayers: 4,
      seconds: 65,
      puzzles: 4,
      ranked: true,
      icon: "zap"
    },
    coop: {
      id: "coop",
      name: "Co-op",
      blurb: "Share one vault. Split the puzzles between you.",
      minPlayers: 2,
      maxPlayers: 3,
      seconds: 200,
      puzzles: 4,
      ranked: false,
      icon: "heart"
    }
  };

  /* ---- currencies -------------------------------------------------------- */
  var CURRENCY = {
    sp: { id: "sp", name: "Shards", short: "SH", glyph: "⬡", icon: "gem", realm: "single" },
    mp: { id: "mp", name: "Cores", short: "CO", glyph: "◈", icon: "orbit", realm: "multi" }
  };

  /* ---- OpenRouter free model ladder -------------------------------------- */
  /* Requests hit model 1; on 429/5xx/timeout the client walks the ladder.
     All entries are zero-cost :free endpoints so a rate limit never blocks
     a player for long. */
  var AI_MODELS = [
    "deepseek/deepseek-chat-v3-0324:free",
    "deepseek/deepseek-r1-0528:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "qwen/qwen3-235b-a22b:free",
    "qwen/qwen-2.5-72b-instruct:free",
    "mistralai/mistral-small-3.1-24b-instruct:free",
    "google/gemma-3-27b-it:free",
    "google/gemini-2.0-flash-exp:free",
    "microsoft/phi-3-medium-128k-instruct:free",
    "nousresearch/hermes-3-llama-3.1-405b:free",
    "meta-llama/llama-3.2-3b-instruct:free",
    "z-ai/glm-4.5-air:free",
    "moonshotai/kimi-k2:free",
    "tngtech/deepseek-r1t-chimera:free",
    "openrouter/horizon-beta"
  ];

  /* ---- reward curves ----------------------------------------------------- */
  var REWARDS = {
    sp: {
      base: 120,
      perPuzzleSolved: 55,
      perGuessSaved: 40,
      speedBonusMax: 240,
      perfectBonus: 300,
      streakStep: 0.1,
      streakCap: 1.0,
      firstClearOfDay: 150
    },
    mp: {
      win: 260,
      podium: 110,
      participation: 45,
      speedBonusMax: 180,
      perfectBonus: 200,
      rankedWinMult: 1.35
    }
  };

  /* ---- xp curve ---------------------------------------------------------- */
  var XP = {
    base: 400,
    growth: 1.22,
    perLevelSkill: 2,
    maxLevel: 120,
    levelFor: function (xp) {
      var lvl = 1, need = XP.base, acc = 0;
      while (acc + need <= xp && lvl < XP.maxLevel) {
        acc += need;
        lvl++;
        need = Math.round(XP.base * Math.pow(XP.growth, lvl - 1));
      }
      return { level: lvl, floor: acc, next: acc + need, need: need, into: xp - acc };
    }
  };

  /* ---- rank ladder (multiplayer) ----------------------------------------- */
  var RANKS = [
    { id: "iron", name: "Blank", min: 0, icon: "circle" },
    { id: "shard", name: "Shard", min: 900, icon: "gem" },
    { id: "cipher", name: "Cipher", min: 1100, icon: "hash" },
    { id: "node", name: "Node", min: 1300, icon: "orbit" },
    { id: "vault", name: "Vault", min: 1500, icon: "lock" },
    { id: "oracle", name: "Oracle", min: 1700, icon: "telescope" },
    { id: "exotic", name: "Exotic", min: 1900, icon: "crown" }
  ];

  var STORAGE_KEYS = {
    config: "config",
    prefs: "prefs",
    theme: "theme",
    spProfile: "profile.single",
    mpProfile: "profile.multi",
    spSession: "session.single",
    mpSession: "session.multi",
    spInventory: "inventory.single",
    mpInventory: "inventory.multi",
    spHistory: "history.single",
    mpHistory: "history.multi",
    spCurrent: "run.single",
    mpCurrent: "run.multi",
    seenIntro: "seen.intro",
    daily: "daily"
  };

  var PRACTICE_PUZZLES_PER_RUN = 4;

  var config = {
    DEFAULT: "unknown",
    STORAGE_KEYS: STORAGE_KEYS,
    TIERS: TIERS,
    MP_MODES: MP_MODES,
    CURRENCY: CURRENCY,
    REWARDS: REWARDS,
    XP: XP,
    RANKS: RANKS,
    PRACTICE_PUZZLES_PER_RUN: PRACTICE_PUZZLES_PER_RUN,

    get: function (key) { return key == null ? CONFIG : CONFIG[key]; },
    set: function (key, value) {
      CONFIG[key] = value;
      util.storage.set("config", CONFIG);
      return CONFIG[key];
    },
    update: function (patch) {
      for (var k in patch) if (Object.prototype.hasOwnProperty.call(patch, k)) CONFIG[k] = patch[k];
      util.storage.set("config", CONFIG);
      return CONFIG;
    },
    isCloudReady: function () {
      return !!(CONFIG.supabaseUrl && CONFIG.supabaseAnonKey &&
        /^https?:\/\//.test(CONFIG.supabaseUrl) && CONFIG.supabaseAnonKey.length > 20);
    },
    isAiReady: function () {
      return !!(CONFIG.useAiProxy ? this.isCloudReady() : CONFIG.openrouterKey);
    },
    tier: function (id) { return TIERS[id] || TIERS.standard; },
    mode: function (id) { return MP_MODES[id] || MP_MODES.duel; },
    rankFor: function (elo) {
      var out = RANKS[0];
      for (var i = 0; i < RANKS.length; i++) if (elo >= RANKS[i].min) out = RANKS[i];
      return out;
    },
    rankProgress: function (elo) {
      var cur = this.rankFor(elo);
      var idx = RANKS.indexOf(cur);
      var next = RANKS[idx + 1] || null;
      if (!next) return { rank: cur, next: null, pct: 1, toNext: 0 };
      var span = next.min - cur.min;
      var pct = util.clamp((elo - cur.min) / span, 0, 1);
      return { rank: cur, next: next, pct: pct, toNext: Math.max(0, next.min - elo) };
    }
  };

  X.config = config;
  X.TIERS = TIERS;
  X.AI_MODELS = AI_MODELS;
})(window);
