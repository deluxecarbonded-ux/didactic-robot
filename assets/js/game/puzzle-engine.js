/* ==========================================================================
   Exotic — puzzle engine
   Owns the rules: how a run is built, how a digit is derived, how deduction
   narrows a slot, and what each power-up actually does to the state.

   Every slot carries a candidate set (all ten digits at the start). Answers,
   hints, Fifty-Fifty and Reveal all narrow that set. The vault code never
   changes once a run begins — swapping a puzzle keeps its digit.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var Bank = X.Puzzles;
  var CFG = X.config;

  var ALL_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  /* ------------------------------------------------------------ building -- */

  function rngFor(seed) { return util.seededRandom(String(seed)); }

  /**
   * Choose `count` puzzles that fit a difficulty band, with category variety
   * and a digit spread that keeps the vault from being trivial (0000).
   */
  function selectPuzzles(tier, seed, count, excludeIds) {
    var rnd = rngFor(seed);
    var exclude = {};
    (excludeIds || []).forEach(function (id) { exclude[id] = true; });

    var lo = tier.difficulty[0];
    var hi = tier.difficulty[1];
    var pool = Bank.inRange(lo, hi).filter(function (p) { return !exclude[p.id]; });
    if (pool.length < count * 4) pool = Bank.inRange(1, 5).filter(function (p) { return !exclude[p.id]; });

    /* shuffle with the seeded rng so a seed always rebuilds the same run */
    pool = pool.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }

    var picked = [];
    var usedCats = {};
    var usedDigits = {};

    /* pass one: distinct categories, distinct digits */
    for (var a = 0; a < pool.length && picked.length < count; a++) {
      var p = pool[a];
      if (usedCats[p.category] || usedDigits[p.digit]) continue;
      picked.push(p);
      usedCats[p.category] = true;
      usedDigits[p.digit] = true;
    }
    /* pass two: fill remaining slots with unused digits if we can */
    for (var b = 0; b < pool.length && picked.length < count; b++) {
      var q = pool[b];
      if (picked.indexOf(q) >= 0) continue;
      if (usedDigits[q.digit] && picked.length < count - 1) continue;
      picked.push(q);
      usedDigits[q.digit] = true;
    }
    /* pass three: whatever is left */
    for (var c = 0; c < pool.length && picked.length < count; c++) {
      if (picked.indexOf(pool[c]) < 0) picked.push(pool[c]);
    }

    /* guard against a flat code like 2222 */
    var digits = picked.map(function (x) { return x.digit; });
    var unique = digits.filter(function (d, idx) { return digits.indexOf(d) === idx; });
    if (unique.length === 1 && pool.length > count) {
      for (var d2 = 0; d2 < pool.length; d2++) {
        if (pool[d2].digit !== digits[0]) { picked[count - 1] = pool[d2]; break; }
      }
    }
    return picked.slice(0, count);
  }

  function makeSlot(puzzle, index) {
    return {
      index: index,
      puzzleId: puzzle.id,
      puzzle: puzzle,
      solved: false,
      digit: null,
      candidates: ALL_DIGITS.slice(),
      attempts: 0,
      wrongPicks: [],
      hintLevel: 0,
      hintText: null,
      committed: null,
      swapped: 0,
      revealedBy: null
    };
  }

  /**
   * @param {{realm:'single'|'multi', tier:string, mode?:string, seed?:string, count?:number, player?:object}} opts
   */
  function createRun(opts) {
    var o = opts || {};
    var realm = o.realm === "multi" ? "multi" : "single";
    var tier = CFG.tier(o.tier || CFG.get("defaultTier"));
    var mode = o.mode ? CFG.mode(o.mode) : null;
    var count = o.count || (mode ? mode.puzzles : tier.puzzles) || 4;
    var seed = o.seed || util.uid("run");
    var puzzles = selectPuzzles(tier, seed, count, o.exclude);

    var durationMs = (mode && mode.seconds ? mode.seconds : tier.seconds) * 1000;
    var slots = puzzles.map(makeSlot);

    var run = {
      id: util.uid("run"),
      realm: realm,
      tier: tier.id,
      mode: mode ? mode.id : null,
      ranked: mode ? !!mode.ranked : false,
      seed: seed,
      code: slots.map(function (s) { return s.puzzle.digit; }),
      slots: slots,
      guesses: [],
      attemptsLeft: tier.guesses,
      attemptsTotal: tier.guesses,
      durationMs: durationMs,
      elapsedMs: 0,
      startedAt: Date.now(),
      endsAt: Date.now() + durationMs,
      pausedUntil: 0,
      pausedTotalMs: 0,
      usedItems: [],
      modifiers: { timeBonus: 0, double: false, hintDiscount: 0, headStart: 0, shield: false },
      hintsUsed: 0,
      categoryTally: {},
      score: 0,
      xpEarned: 0,
      currencyEarned: 0,
      outcome: null,
      finishedAt: null,
      events: []
    };
    run.endsAt = run.startedAt + durationMs;
    logEvent(run, "run-created", { tier: run.tier, code: run.code.join("") });
    return run;
  }

  function logEvent(run, kind, data) {
    run.events.push({ at: Date.now(), kind: kind, data: data || null });
    if (run.events.length > 200) run.events.shift();
  }

  /* ------------------------------------------------------------- timing --- */

  function elapsed(run, now) {
    var t = now || Date.now();
    var raw = t - run.startedAt - run.pausedTotalMs;
    var nowPaused = run.pausedUntil > t ? t - run.pausedUntil : 0;
    return util.clamp(raw - (run.pausedUntil > t ? 0 : 0) + nowPaused, 0, run.durationMs + 300000);
  }

  function remaining(run, now) {
    var t = now || Date.now();
    if (run.pausedUntil > t) return util.clamp(run.endsAt - t, 0, run.durationMs * 2);
    return run.endsAt - t;
  }

  function isExpired(run, now) { return remaining(run, now) <= 0; }

  function addTime(run, ms) {
    run.endsAt += ms;
    run.durationMs += ms;
    run.modifiers.timeBonus += ms;
    return run;
  }

  function pauseFor(run, ms) {
    run.pausedUntil = Math.max(run.pausedUntil, Date.now()) + ms;
    run.pausedTotalMs += ms;
    run.endsAt += ms;
    return run;
  }

  /* -------------------------------------------------------- solving ------- */

  function normalize(input) {
    if (input == null) return null;
    var s = String(input).trim().toLowerCase();
    var words = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 0 };
    if (words[s] != null) return words[s];
    var m = s.match(/-?\d/);
    if (!m) return null;
    return Number(m[0]);
  }

  /**
   * Grade a free-text / choice answer against a slot.
   * @returns {{ok:boolean, digit:number|null, canonical:number}}
   */
  function grade(slot, input) {
    var canonical = slot.puzzle.digit;
    var parsed = normalize(input);
    return { ok: parsed === canonical, digit: parsed, canonical: canonical };
  }

  function solveSlot(run, index, meta) {
    var slot = run.slots[index];
    if (!slot || slot.solved) return false;
    slot.solved = true;
    slot.digit = slot.puzzle.digit;
    slot.candidates = [slot.digit];
    slot.revealedBy = (meta && meta.by) || "answer";
    run.categoryTally[slot.puzzle.category] = (run.categoryTally[slot.puzzle.category] || 0) + 1;
    logEvent(run, "slot-solved", { index: index, digit: slot.digit, by: slot.revealedBy });
    return true;
  }

  function failSlot(run, index, input) {
    var slot = run.slots[index];
    if (!slot) return;
    slot.attempts++;
    slot.wrongPicks.push(String(input));
    logEvent(run, "slot-wrong", { index: index, input: String(input) });
  }

  /** Player answers a puzzle in the puzzle panel. */
  function answer(run, index, input) {
    var slot = run.slots[index];
    if (!slot || slot.solved) return { ok: false, reason: "already-solved" };
    var result = grade(slot, input);
    if (result.ok) {
      solveSlot(run, index, { by: "answer" });
      return { ok: true, digit: slot.digit, slot: slot };
    }
    failSlot(run, index, input);
    return { ok: false, digit: result.digit, slot: slot };
  }

  function solvedCount(run) {
    return run.slots.filter(function (s) { return s.solved; }).length;
  }

  function progress(run) {
    return solvedCount(run) / run.slots.length;
  }

  /* -------------------------------------------------------- deduction ----- */

  /** Fifty-Fifty: strike out half of the remaining wrong candidates. */
  function narrow(slot, keep) {
    if (!slot || slot.solved) return { removed: 0 };
    var wrong = slot.candidates.filter(function (d) { return d !== slot.puzzle.digit; });
    if (!wrong.length) return { removed: 0 };
    var removeCount = Math.max(1, Math.ceil(wrong.length / 2));
    var shuffled = util.shuffle(wrong).slice(0, removeCount);
    var before = slot.candidates.length;
    slot.candidates = slot.candidates.filter(function (d) { return shuffled.indexOf(d) < 0; });
    slot.lastNarrowed = shuffled;
    void keep;
    return { removed: before - slot.candidates.length, removedDigits: shuffled };
  }

  function candidatesLeft(slot) {
    return slot.solved ? [slot.digit] : slot.candidates.slice();
  }

  /* ------------------------------------------------------------ hints ----- */

  /**
   * Progressive hints for a slot. Level 1 is a free-ish nudge, level 2 halves
   * the candidates, level 3 gives the digit outright.
   */
  function hintFor(slot, level) {
    var d = slot.puzzle.digit;
    var lvl = util.clamp(level || slot.hintLevel + 1, 1, 3);
    if (lvl === 1) {
      var parity = d % 2 === 0 ? "even" : "odd";
      var half = d <= 4 ? "the lower half" : "the upper half";
      var extra = d === 0 || d === 9 ? " It sits on the very edge of the number line." : "";
      return "The digit here is " + parity + " and lives in " + half + "." + extra;
    }
    if (lvl === 2) {
      var keep = util.shuffle(slot.candidates.filter(function (x) { return x !== d; })).slice(0, 1).concat([d]);
      var pool = util.sortBy(keep.concat(util.shuffle(ALL_DIGITS.filter(function (x) {
        return keep.indexOf(x) < 0 && x !== d;
      })).slice(0, 1)), function (x) { return x; });
      void pool;
      return "Cross out everything except one of these two: " + util.sortBy(keep, function (x) { return x; }).join(" or ") + ".";
    }
    return "The digit is " + d + ".";
  }

  function hintCost(run, level) {
    var tier = CFG.tier(run.tier);
    var base = tier.hintCost;
    var mult = [1, 1.8, 3][util.clamp(level, 1, 3) - 1];
    var discount = run.modifiers.hintDiscount || 0;
    return Math.max(10, Math.round(base * mult * (1 - discount)));
  }

  function takeHint(run, index) {
    var slot = run.slots[index];
    if (!slot) return null;
    var tier = CFG.tier(run.tier);
    if (tier.noHints) return { blocked: true, reason: "This tier allows no hints." };
    var next = Math.min(3, slot.hintLevel + 1);
    var cost = hintCost(run, next);
    slot.hintLevel = next;
    slot.hintText = hintFor(slot, next);
    if (next >= 2) {
      var d = slot.puzzle.digit;
      if (next === 3) {
        slot.candidates = [d];
      } else {
        slot.candidates = util.sortBy([d].concat(util.shuffle(slot.candidates.filter(function (x) { return x !== d; })).slice(0, 1)), function (x) { return x; });
      }
    }
    run.hintsUsed++;
    logEvent(run, "hint", { index: index, level: next, cost: cost });
    return { cost: cost, level: next, text: slot.hintText, candidates: slot.candidates.slice() };
  }

  /* -------------------------------------------------------- swaps --------- */

  /** Replace a slot's puzzle while preserving its digit. */
  function swapPuzzle(run, index, replacement) {
    var slot = run.slots[index];
    if (!slot) return null;
    var digit = slot.puzzle.digit;
    var usedIds = run.slots.map(function (s) { return s.puzzleId; });
    var next = replacement;

    if (!next) {
      var pool = Bank.all().filter(function (p) {
        return p.digit === digit && usedIds.indexOf(p.id) < 0 && p.id !== slot.puzzleId;
      });
      next = util.pick(pool.length ? pool : Bank.all().filter(function (p) { return p.id === slot.puzzleId; }));
    }
    if (!next) return null;
    slot.puzzleId = next.id;
    slot.puzzle = next;
    slot.swapped++;
    slot.attempts = 0;
    slot.wrongPicks = [];
    slot.hintLevel = 0;
    slot.hintText = null;
    slot.candidates = ALL_DIGITS.slice();
    logEvent(run, "swap", { index: index, puzzleId: next.id });
    return next;
  }

  /* ------------------------------------------------------- power-ups ------ */

  var ITEM_HANDLERS = {
    nudge: function (run, index, item) {
      var res = takeHint(run, index);
      void item;
      return res && res.blocked ? { ok: false, reason: res.reason } : { ok: true, hint: res };
    },
    fifty: function (run, index) {
      var slot = run.slots[index];
      if (!slot || slot.solved) return { ok: false, reason: "Already solved." };
      var res = narrow(slot);
      return { ok: true, narrowed: res };
    },
    time: function (run, index, item) {
      var ms = item.effect.value || 45000;
      addTime(run, ms);
      return { ok: true, addedMs: ms };
    },
    swap: function (run, index) {
      var slot = run.slots[index];
      if (!slot || slot.solved) return { ok: false, reason: "Already solved." };
      var next = swapPuzzle(run, index);
      return { ok: !!next, puzzle: next, index: index };
    },
    attempt: function (run) {
      run.attemptsLeft += 1;
      run.attemptsTotal += 1;
      return { ok: true, attemptsLeft: run.attemptsLeft };
    },
    pause: function (run, index, item) {
      var ms = item.effect.value || 20000;
      pauseFor(run, ms);
      return { ok: true, pausedMs: ms };
    },
    reveal: function (run, index) {
      var slot = run.slots[index];
      if (!slot) return { ok: false, reason: "No such slot." };
      if (slot.solved) return { ok: false, reason: "Already solved." };
      var d = slot.puzzle.digit;
      slot.candidates = [d];
      slot.hintLevel = 3;
      slot.hintText = "The digit is " + d + ".";
      slot.committed = d;
      logEvent(run, "reveal", { index: index, digit: d });
      return { ok: true, digit: d, index: index };
    },
    shield: function (run) {
      run.modifiers.shield = true;
      return { ok: true };
    },
    double: function (run) {
      run.modifiers.double = true;
      return { ok: true };
    },
    oracle: function (run, index) {
      var slot = run.slots[index];
      if (!slot) return { ok: false, reason: "No such slot." };
      var wasSolved = slot.solved;
      solveSlot(run, index, { by: "oracle" });
      return { ok: !wasSolved, digit: slot.digit, index: index };
    },
    solve: function (run, index) {
      return ITEM_HANDLERS.oracle(run, index);
    }
  };

  /**
   * Apply a purchased power-up.
   * @param {object} run
   * @param {string} itemId
   * @param {number} [slotIndex]
   */
  function applyItem(run, itemId, slotIndex) {
    var item = X.Shop.get(itemId);
    if (!item) return { ok: false, reason: "Unknown item." };
    if (item.realm === "multi" && run.realm !== "multi") return { ok: false, reason: "Wrong realm." };
    if (item.realm === "single" && run.realm !== "single") return { ok: false, reason: "Wrong realm." };
    var fn = ITEM_HANDLERS[item.effect.key];
    if (!fn) {
      /* perks and cosmetics are passive — record and move on */
      run.usedItems.push(itemId);
      return { ok: true, passive: true };
    }
    var index = slotIndex == null ? firstOpenSlot(run) : slotIndex;
    var result = fn(run, index, item) || { ok: true };
    if (result.ok) {
      run.usedItems.push(itemId);
      logEvent(run, "item-used", { itemId: itemId, index: index, key: item.effect.key });
    }
    return util.merge(result, { item: item, index: index });
  }

  function firstOpenSlot(run) {
    for (var i = 0; i < run.slots.length; i++) if (!run.slots[i].solved) return i;
    return 0;
  }

  /* --------------------------------------------------------- guessing ----- */

  /**
   * Submit a full four digit guess. Feedback is per position only — no
   * counts, no misplaced hints. This is a vault, not a code-breaking board.
   */
  function guess(run, value) {
    var digits = String(value || "").split("").map(function (c) { return Number(c); });
    if (digits.length !== run.slots.length || digits.some(isNaN)) {
      return { ok: false, reason: "Enter all " + run.slots.length + " digits." };
    }
    var marks = digits.map(function (d, i) {
      return { index: i, digit: d, hit: d === run.code[i] };
    });
    var correct = marks.every(function (m) { return m.hit; });
    var entry = { at: Date.now(), value: digits.join(""), marks: marks, correct: correct };
    run.guesses.push(entry);

    if (!correct) {
      run.attemptsLeft = Math.max(0, run.attemptsLeft - 1);
      /* a wrong guess costs time, scaled by tier */
      var penalty = Math.round(6000 * (1 + (CFG.tier(run.tier).difficulty[1] - 3) * 0.35));
      run.endsAt -= penalty;
      entry.penaltyMs = penalty;
      logEvent(run, "guess-wrong", { value: entry.value, penaltyMs: penalty });
    } else {
      logEvent(run, "guess-right", { value: entry.value });
    }
    return { ok: true, correct: correct, marks: marks, attemptsLeft: run.attemptsLeft, penaltyMs: entry.penaltyMs || 0 };
  }

  /** Commit a single digit to a slot. Wrong commits cost time, not attempts. */
  function commit(run, index, digit) {
    var slot = run.slots[index];
    if (!slot || slot.solved) return { ok: false, reason: "Solved." };
    var d = Number(digit);
    slot.committed = d;
    var hit = d === slot.puzzle.digit;
    if (hit) {
      solveSlot(run, index, { by: "commit" });
    } else {
      slot.candidates = slot.candidates.filter(function (c) { return c !== d; });
      run.endsAt -= 3000;
      logEvent(run, "commit-wrong", { index: index, digit: d });
    }
    return { ok: true, correct: hit, digit: d, slot: slot };
  }

  /* ---------------------------------------------------------- finish ------ */

  function remainingMs(run) { return Math.max(0, remaining(run)); }

  function serialise(run) {
    return {
      id: run.id,
      realm: run.realm,
      tier: run.tier,
      mode: run.mode,
      ranked: run.ranked,
      seed: run.seed,
      code: run.code,
      slots: run.slots.map(function (s) {
        return {
          index: s.index,
          puzzleId: s.puzzleId,
          solved: s.solved,
          digit: s.digit,
          candidates: s.candidates,
          attempts: s.attempts,
          wrongPicks: s.wrongPicks,
          hintLevel: s.hintLevel,
          hintText: s.hintText,
          committed: s.committed,
          swapped: s.swapped,
          revealedBy: s.revealedBy
        };
      }),
      guesses: run.guesses,
      attemptsLeft: run.attemptsLeft,
      attemptsTotal: run.attemptsTotal,
      durationMs: run.durationMs,
      elapsedMs: elapsed(run),
      remainingMs: remainingMs(run),
      usedItems: run.usedItems,
      modifiers: run.modifiers,
      hintsUsed: run.hintsUsed,
      categoryTally: run.categoryTally,
      outcome: run.outcome,
      savedAt: Date.now()
    };
  }

  function deserialise(snap) {
    if (!snap) return null;
    var tier = CFG.tier(snap.tier);
    var mode = snap.mode ? CFG.mode(snap.mode) : null;
    var run = {
      id: snap.id,
      realm: snap.realm,
      tier: tier.id,
      mode: snap.mode,
      ranked: snap.ranked,
      seed: snap.seed,
      code: snap.code.slice(),
      slots: snap.slots.map(function (s) {
        var puzzle = Bank.get(s.puzzleId);
        if (!puzzle) puzzle = { id: s.puzzleId, category: "logic", difficulty: 3, kind: "digit", prompt: "This puzzle has been retired from the vault.", digit: s.digit == null ? 0 : s.digit, explanation: "Recovered from a previous session.", choices: null, source: "recovered" };
        return util.merge(s, { puzzle: puzzle });
      }),
      guesses: snap.guesses || [],
      attemptsLeft: snap.attemptsLeft,
      attemptsTotal: snap.attemptsTotal || tier.guesses,
      durationMs: snap.durationMs,
      elapsedMs: snap.elapsedMs || 0,
      startedAt: Date.now() - (snap.elapsedMs || 0),
      endsAt: Date.now() + (snap.remainingMs != null ? snap.remainingMs : snap.durationMs),
      pausedUntil: 0,
      pausedTotalMs: 0,
      usedItems: snap.usedItems || [],
      modifiers: util.merge({ timeBonus: 0, double: false, hintDiscount: 0, headStart: 0, shield: false }, snap.modifiers),
      hintsUsed: snap.hintsUsed || 0,
      categoryTally: snap.categoryTally || {},
      score: 0,
      xpEarned: 0,
      currencyEarned: 0,
      outcome: null,
      finishedAt: null,
      events: [],
      restored: true
    };
    void mode;
    return run;
  }

  /** Pre-solve the first slot for the Head Start perk. */
  function applyHeadStart(run, slotsToSolve) {
    var n = util.clamp(slotsToSolve || 1, 0, run.slots.length - 1);
    for (var i = 0; i < n; i++) solveSlot(run, i, { by: "perk" });
    run.modifiers.headStart = n;
    return run;
  }

  X.Engine = {
    createRun: createRun,
    selectPuzzles: selectPuzzles,
    answer: answer,
    grade: grade,
    normalize: normalize,
    solveSlot: solveSlot,
    failSlot: failSlot,
    solvedCount: solvedCount,
    progress: progress,
    candidatesLeft: candidatesLeft,
    narrow: narrow,
    takeHint: takeHint,
    hintFor: hintFor,
    hintCost: hintCost,
    swapPuzzle: swapPuzzle,
    applyItem: applyItem,
    applyHeadStart: applyHeadStart,
    guess: guess,
    commit: commit,
    elapsed: elapsed,
    remaining: remaining,
    remainingMs: remainingMs,
    isExpired: isExpired,
    addTime: addTime,
    pauseFor: pauseFor,
    serialise: serialise,
    deserialise: deserialise,
    logEvent: logEvent,
    ALL_DIGITS: ALL_DIGITS,
    ITEM_HANDLERS: ITEM_HANDLERS
  };
})(window);
