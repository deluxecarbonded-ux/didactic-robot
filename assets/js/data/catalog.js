/* ==========================================================================
   Exotic — shop catalogue
   Two strictly separated shelves. Single-player wares are paid for with
   Shards (⬡) and never appear in the multiplayer shop; multiplayer wares are
   paid for with Cores (◈) and never appear in the single-player shop.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;

  var RARITY = {
    common: { id: "common", name: "Common", rank: 1 },
    rare: { id: "rare", name: "Rare", rank: 2 },
    epic: { id: "epic", name: "Epic", rank: 3 },
    mythic: { id: "mythic", name: "Mythic", rank: 4 }
  };

  var TYPES = {
    power: { id: "power", name: "Power-up", blurb: "Burned during a cipher." },
    perk: { id: "perk", name: "Perk", blurb: "Permanent, always on." },
    cosmetic: { id: "cosmetic", name: "Cosmetic", blurb: "Look the part." }
  };

  /* ------------------------------------------------------ single player -- */

  var SINGLE = [
    { id: "sp-nudge", type: "power", rarity: "common", name: "Nudge", icon: "lightbulb", price: 120,
      desc: "Reveals a guiding nudge for the puzzle you are staring at.", stack: 9,
      effect: { key: "nudge", value: 1 } },

    { id: "sp-fifty", type: "power", rarity: "common", name: "Fifty-Fifty", icon: "split", price: 180,
      desc: "Strikes out half the wrong digits on one slot.", stack: 9,
      effect: { key: "fifty", value: 1 } },

    { id: "sp-time", type: "power", rarity: "common", name: "Extra Time", icon: "timer", price: 220,
      desc: "Adds 45 seconds to the running clock.", stack: 9,
      effect: { key: "time", value: 45000 } },

    { id: "sp-skip", type: "power", rarity: "rare", name: "Swap Puzzle", icon: "refresh", price: 240,
      desc: "Retires the current puzzle and deals a fresh one from the same shelf.", stack: 9,
      effect: { key: "swap", value: 1 } },

    { id: "sp-attempt", type: "power", rarity: "rare", name: "Spare Attempt", icon: "plus", price: 260,
      desc: "One more guess against the vault.", stack: 9,
      effect: { key: "attempt", value: 1 } },

    { id: "sp-pause", type: "power", rarity: "rare", name: "Hold The Clock", icon: "snowflake", price: 300,
      desc: "Freezes the timer for twenty seconds.", stack: 9,
      effect: { key: "pause", value: 20000 } },

    { id: "sp-reveal", type: "power", rarity: "epic", name: "Reveal A Digit", icon: "eye", price: 340,
      desc: "Straight-up hands you one digit of the cipher.", stack: 9,
      effect: { key: "reveal", value: 1 } },

    { id: "sp-shield", type: "power", rarity: "epic", name: "Streak Shield", icon: "shield", price: 450,
      desc: "Survives one loss without breaking your win streak.", stack: 5,
      effect: { key: "shield", value: 1 } },

    { id: "sp-double", type: "power", rarity: "epic", name: "Double Yield", icon: "trending", price: 520,
      desc: "Doubles every shard you earn for the rest of the run.", stack: 5,
      effect: { key: "double", value: 1 } },

    { id: "sp-oracle", type: "power", rarity: "mythic", name: "Oracle Solve", icon: "bot", price: 680,
      desc: "The Oracle reads the puzzle and answers it outright.", stack: 3,
      effect: { key: "oracle", value: 1 } },

    { id: "sp-perk-secondwind", type: "perk", rarity: "rare", name: "Second Wind", icon: "hourglass", price: 1400,
      desc: "Every run begins with 15 bonus seconds.", stack: 1,
      effect: { key: "startBonusTime", value: 15000 } },

    { id: "sp-perk-cheaphints", type: "perk", rarity: "rare", name: "Frugal Mind", icon: "coins", price: 1200,
      desc: "Hints cost 40% less in every run.", stack: 1,
      effect: { key: "hintDiscount", value: 0.4 } },

    { id: "sp-perk-scholar", type: "perk", rarity: "epic", name: "Scholar's Path", icon: "graduationCap", price: 1800,
      desc: "Permanently earn 15% more experience.", stack: 1,
      effect: { key: "xpBonus", value: 0.15 } },

    { id: "sp-perk-dividend", type: "perk", rarity: "epic", name: "Shard Dividend", icon: "gem", price: 2000,
      desc: "Permanently earn 20% more shards.", stack: 1,
      effect: { key: "currencyBonus", value: 0.2 } },

    { id: "sp-perk-precision", type: "perk", rarity: "mythic", name: "Precision Instinct", icon: "crosshair", price: 3200,
      desc: "Every run starts with the first puzzle already cracked.", stack: 1,
      effect: { key: "headStart", value: 1 } },

    { id: "sp-skin-obsidian", type: "cosmetic", rarity: "rare", name: "Board Skin — Obsidian", icon: "layers", price: 900,
      desc: "A deeper, quieter vault board with heavier shadows.", stack: 1,
      effect: { key: "boardSkin", value: "obsidian" } },

    { id: "sp-trail-comet", type: "cosmetic", rarity: "rare", name: "Trail — Comet", icon: "orbit", price: 700,
      desc: "Pixel dust follows every correct answer.", stack: 1,
      effect: { key: "trail", value: "comet" } },

    { id: "sp-frame-cipher", type: "cosmetic", rarity: "common", name: "Frame — Cipher", icon: "hash", price: 650,
      desc: "An engraved frame around your avatar.", stack: 1,
      effect: { key: "frame", value: "cipher" } },

    { id: "sp-title-locksmith", type: "cosmetic", rarity: "epic", name: "Title — Locksmith", icon: "award", price: 1100,
      desc: "Wear the word above your name.", stack: 1,
      effect: { key: "title", value: "Locksmith" } },

    { id: "sp-title-polymath", type: "cosmetic", rarity: "mythic", name: "Title — Polymath", icon: "crown", price: 2600,
      desc: "For the ones who never specialise.", stack: 1,
      effect: { key: "title", value: "Polymath" } }
  ];

  /* -------------------------------------------------------- multiplayer -- */

  var MULTI = [
    { id: "mp-scan", type: "power", rarity: "common", name: "Scan", icon: "radar", price: 240,
      desc: "Reveals how many puzzles each rival has cracked.", stack: 9,
      effect: { key: "scan", value: 1 } },

    { id: "mp-ward", type: "power", rarity: "common", name: "Ward", icon: "shield", price: 280,
      desc: "Blocks the next sabotage thrown at you.", stack: 9,
      effect: { key: "ward", value: 1 } },

    { id: "mp-cloak", type: "power", rarity: "rare", name: "Cloak", icon: "ghost", price: 320,
      desc: "Hides your progress bar from everyone for 12 seconds.", stack: 9,
      effect: { key: "cloak", value: 12000 } },

    { id: "mp-fog", type: "power", rarity: "rare", name: "Fog", icon: "cloudOff", price: 380,
      desc: "Blurs one rival's keypad for five seconds.", stack: 9,
      effect: { key: "fog", value: 5000 } },

    { id: "mp-freeze", type: "power", rarity: "epic", name: "Freeze", icon: "snowflake", price: 440,
      desc: "Stops a rival's clock dead for three seconds.", stack: 9,
      effect: { key: "freeze", value: 3000 } },

    { id: "mp-thief", type: "power", rarity: "epic", name: "Time Thief", icon: "hourglass", price: 520,
      desc: "Takes 10 seconds for you and 5 from a rival.", stack: 9,
      effect: { key: "thief", value: 10000 } },

    { id: "mp-solve", type: "power", rarity: "epic", name: "Instant Solve", icon: "wand", price: 660,
      desc: "The Oracle cracks one of your puzzles mid-match.", stack: 5,
      effect: { key: "solve", value: 1 } },

    { id: "mp-double", type: "power", rarity: "mythic", name: "Double Cores", icon: "orbit", price: 760,
      desc: "Doubles the cores this match pays out.", stack: 5,
      effect: { key: "double", value: 1 } },

    { id: "mp-perk-rankshield", type: "perk", rarity: "rare", name: "Rank Shield", icon: "shieldCheck", price: 1500,
      desc: "Your next ranked defeat costs no rating.", stack: 3,
      effect: { key: "rankShield", value: 1 } },

    { id: "mp-perk-study", type: "perk", rarity: "rare", name: "Rival's Study", icon: "brain", price: 1900,
      desc: "Permanently earn 20% more multiplayer experience.", stack: 1,
      effect: { key: "xpBonus", value: 0.2 } },

    { id: "mp-perk-dividend", type: "perk", rarity: "epic", name: "Core Dividend", icon: "coins", price: 2400,
      desc: "Permanently earn 25% more cores.", stack: 1,
      effect: { key: "currencyBonus", value: 0.25 } },

    { id: "mp-perk-headstart", type: "perk", rarity: "mythic", name: "Head Start", icon: "rocket", price: 2800,
      desc: "Every match opens with one puzzle already solved.", stack: 1,
      effect: { key: "headStart", value: 1 } },

    { id: "mp-perk-recon", type: "perk", rarity: "mythic", name: "Recon Suite", icon: "satellite", price: 3400,
      desc: "Rival progress is always visible to you — cloaks do not work.", stack: 1,
      effect: { key: "recon", value: 1 } },

    { id: "mp-emote-respect", type: "cosmetic", rarity: "common", name: "Emote Pack — Respect", icon: "heart", price: 400,
      desc: "Four in-match emotes that say more than words.", stack: 1,
      effect: { key: "emotes", value: "respect" } },

    { id: "mp-trail-glitch", type: "cosmetic", rarity: "rare", name: "Trail — Glitch", icon: "zap", price: 820,
      desc: "Corrupted pixels spill from every correct answer.", stack: 1,
      effect: { key: "trail", value: "glitch" } },

    { id: "mp-title-cipherbreaker", type: "cosmetic", rarity: "epic", name: "Title — Cipherbreaker", icon: "crown", price: 980,
      desc: "Wear it in the lobby. Earn the fear.", stack: 1,
      effect: { key: "title", value: "Cipherbreaker" } },

    { id: "mp-frame-vault", type: "cosmetic", rarity: "epic", name: "Frame — Vault", icon: "lock", price: 950,
      desc: "A reinforced frame for a reinforced record.", stack: 1,
      effect: { key: "frame", value: "vault" } },

    { id: "mp-title-oracle", type: "cosmetic", rarity: "mythic", name: "Title — Oracle", icon: "telescope", price: 2900,
      desc: "Reserved for those who see the answer early.", stack: 1,
      effect: { key: "title", value: "Oracle" } }
  ];

  function decorate(list, realm, currency) {
    return list.map(function (item) {
      return util.merge({}, item, {
        realm: realm,
        currency: currency,
        typeName: TYPES[item.type] ? TYPES[item.type].name : item.type,
        rarityName: RARITY[item.rarity] ? RARITY[item.rarity].name : item.rarity,
        stack: item.stack || 1
      });
    });
  }

  var ALL = decorate(SINGLE, "single", "sp").concat(decorate(MULTI, "multi", "mp"));
  var INDEX = {};
  ALL.forEach(function (i) { INDEX[i.id] = i; });

  var Shop = {
    rarity: RARITY,
    types: TYPES,

    all: function () { return ALL.slice(); },
    items: function (realm) {
      return ALL.filter(function (i) { return i.realm === realm; });
    },
    get: function (id) { return INDEX[id] || null; },
    type: function (id) { return TYPES[id] || null; },
    byType: function (realm, type) {
      return Shop.items(realm).filter(function (i) { return i.type === type; });
    },
    typeCounts: function (realm) {
      var out = {};
      Shop.items(realm).forEach(function (i) { out[i.type] = (out[i.type] || 0) + 1; });
      return out;
    },
    /** The starting balance each realm hands a brand-new cipher hunter. */
    startingBalance: { sp: 500, mp: 250 },
    /** Items granted free on first login so nothing feels empty. */
    welcomeBundle: { sp: ["sp-nudge", "sp-time"], mp: ["mp-scan"] }
  };

  X.Shop = Shop;
})(window);
