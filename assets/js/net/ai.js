/* ==========================================================================
   Exotic — Oracle (AI)
   OpenRouter with an aggressive free-model ladder: if a model is rate limited
   or slow, the very next request rolls onto a different free model instead of
   making the player wait. Models that fail get parked on a cooldown.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var Emitter = X.Emitter;
  var CFG = X.config;

  var CACHE_KEY = "ai.cache";
  var COOLDOWN_KEY = "ai.cooldowns";
  var MAX_CACHE = 60;

  var SYSTEM = [
    "You are the Oracle, the puzzle master inside a game called Exotic.",
    "Exotic is a brain-teaser where a four digit vault code is assembled from four puzzles.",
    "RULE: every puzzle you write must resolve to exactly ONE digit from 0 to 9.",
    "Be precise. Be elegant. Never be wordy. Never mention that you are an AI model.",
    "Facts must be correct — if you are unsure of a fact, pick a different one you are certain about."
  ].join(" ");

  function Oracle() {
    Emitter.call(this);
    this.cache = util.storage.get(CACHE_KEY, {});
    this.cooldowns = util.storage.get(COOLDOWN_KEY, {});
    this.cursor = 0;
    this.stats = { calls: 0, successes: 0, failures: 0, rotations: 0, lastModel: null };
  }
  Oracle.prototype = Object.create(Emitter.prototype);
  Oracle.prototype.constructor = Oracle;

  Oracle.prototype.enabled = function () { return CFG.isAiReady(); };

  Oracle.prototype._persistCache = util.debounce(function () {
    var keys = Object.keys(this.cache);
    if (keys.length > MAX_CACHE) {
      keys.slice(0, keys.length - MAX_CACHE).forEach(function (k) { delete this.cache[k]; }, this);
    }
    util.storage.set(CACHE_KEY, this.cache);
  }, 400);

  Oracle.prototype._persistCooldowns = util.debounce(function () {
    util.storage.set(COOLDOWN_KEY, this.cooldowns);
  }, 400);

  Oracle.prototype._available = function () {
    var now = Date.now();
    var self = this;
    var list = X.AI_MODELS.filter(function (m) { return !self.cooldowns[m] || self.cooldowns[m] < now; });
    if (!list.length) {
      /* everything is cooling — release the one that thaws soonest */
      var soonest = null;
      Object.keys(this.cooldowns).forEach(function (m) {
        if (!soonest || self.cooldowns[m] < self.cooldowns[soonest]) soonest = m;
      });
      if (soonest) { delete this.cooldowns[soonest]; return [soonest]; }
      return X.AI_MODELS.slice();
    }
    /* rotate the starting point so load spreads across providers */
    var out = list.slice(this.cursor % list.length).concat(list.slice(0, this.cursor % list.length));
    this.cursor++;
    return out;
  };

  Oracle.prototype._cool = function (model, ms) {
    this.cooldowns[model] = Date.now() + (ms || 60000);
    this._persistCooldowns();
    this.emit("cooldown", model, ms);
  };

  /* --------------------------------------------------------------- ask ---- */

  /**
   * @param {Array<{role:string, content:string}>} messages
   * @param {{json?:boolean, temperature?:number, maxTokens?:number, timeout?:number, models?:string[]}} [opts]
   */
  Oracle.prototype.ask = function (messages, opts) {
    var self = this;
    if (!this.enabled()) {
      return Promise.reject(new Error("The Oracle is offline. Add an OpenRouter key or connect Supabase in Settings."));
    }
    var o = opts || {};
    var ladder = o.models && o.models.length ? o.models : this._available();
    var payload = {
      messages: [{ role: "system", content: SYSTEM }].concat(messages),
      temperature: o.temperature == null ? 0.7 : o.temperature,
      max_tokens: o.maxTokens || 700
    };
    if (o.json) payload.response_format = { type: "json_object" };

    var attempt = 0;
    var errors = [];

    function next() {
      if (attempt >= ladder.length) {
        self.stats.failures++;
        var err = new Error("Every free model is cooling down right now. Try again in a moment.");
        err.causes = errors;
        self.emit("exhausted", errors);
        throw err;
      }
      var model = ladder[attempt++];
      payload.model = model;
      return self._request(payload, o).then(function (out) {
        self.stats.successes++;
        self.stats.lastModel = model;
        self.emit("model", model);
        return util.merge(out, { attempts: attempt });
      }).catch(function (err) {
        errors.push({ model: model, status: err.status, message: err.message });
        var status = err.status;
        if (status === 429) self._cool(model, 90000);
        else if (status === 402 || status === 401) self._cool(model, 600000);
        else if (status >= 500) self._cool(model, 45000);
        else if (!status) self._cool(model, 30000);
        self.stats.rotations++;
        self.emit("rotate", model, err);
        return next();
      });
    }

    this.stats.calls++;
    return Promise.resolve().then(next);
  };

  Oracle.prototype._request = function (payload, o) {
    var self = this;
    var timeout = o.timeout || 26000;

    var run = function () {
      var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (controller) controller.abort(); }, timeout);
      var url, headers;
      if (CFG.get("useAiProxy") && CFG.isCloudReady()) {
        url = CFG.get("supabaseUrl") + "/functions/v1/oracle";
        headers = { "Content-Type": "application/json", apikey: CFG.get("supabaseAnonKey") };
        if (X.SB.session) headers.Authorization = "Bearer " + X.SB.session.access_token;
      } else {
        url = "https://openrouter.ai/api/v1/chat/completions";
        headers = {
          "Content-Type": "application/json",
          Authorization: "Bearer " + CFG.get("openrouterKey"),
          "HTTP-Referer": global.location.origin || "https://exotic.game",
          "X-Title": "Exotic"
        };
      }
      return fetch(url, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        clearTimeout(timer);
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          if (!res.ok) {
            var msg = (data && data.error && (data.error.message || data.error.code)) || ("Model error " + res.status);
            var err = new Error(msg);
            err.status = res.status;
            err.body = data;
            throw err;
          }
          if (data && data.error) {
            var e2 = new Error(data.error.message || "Model returned an error");
            e2.status = data.error.code === 429 ? 429 : 502;
            throw e2;
          }
          var choice = data && data.choices && data.choices[0];
          var content = choice && choice.message ? choice.message.content : "";
          if (!content) {
            var e3 = new Error("Empty completion");
            e3.status = 502;
            throw e3;
          }
          return {
            text: typeof content === "string" ? content : JSON.stringify(content),
            model: data.model || payload.model,
            usage: data.usage || null
          };
        });
      }).catch(function (err) {
        clearTimeout(timer);
        if (err.name === "AbortError") {
          var to = new Error("Model timed out");
          to.status = 504;
          throw to;
        }
        throw err;
      });
    };

    /* proxy responses come back pre-wrapped { text, model } */
    return util.retry(run, {
      attempts: 2,
      baseDelay: 400,
      shouldRetry: function (err) { return err.status === 502 || err.status === 504 || err.name === "TypeError"; }
    });
  };

  /* ----------------------------------------------------------- helpers ---- */

  function extractJson(text) {
    if (!text) return null;
    var clean = String(text).trim();
    clean = clean.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try { return JSON.parse(clean); } catch (e) { /* keep digging */ }
    var firstObj = clean.indexOf("{");
    var lastObj = clean.lastIndexOf("}");
    if (firstObj >= 0 && lastObj > firstObj) {
      try { return JSON.parse(clean.slice(firstObj, lastObj + 1)); } catch (e2) { /* noop */ }
    }
    var firstArr = clean.indexOf("[");
    var lastArr = clean.lastIndexOf("]");
    if (firstArr >= 0 && lastArr > firstArr) {
      try { return JSON.parse(clean.slice(firstArr, lastArr + 1)); } catch (e3) { /* noop */ }
    }
    return null;
  }

  function hashKey(obj) {
    return util.slug(JSON.stringify(obj)).slice(0, 80);
  }

  var DIGIT_RE = /\b([0-9])\b/;

  /* ---------------------------------------------------------- features ---- */

  /**
   * Ask the Oracle for a brand new puzzle.
   * @param {{category?:string, difficulty?:number, seedText?:string, avoid?:string[]}} req
   * @returns {Promise<object|null>} puzzle shaped exactly like the local bank
   */
  Oracle.prototype.forgePuzzle = function (req) {
    var self = this;
    var r = req || {};
    var cat = r.category || util.pick(["math", "science", "logic", "riddle", "pattern", "trivia", "wordplay", "cipher"]);
    var diff = util.clamp(r.difficulty || 3, 1, 5);
    var cacheId = hashKey({ c: cat, d: diff, s: r.seedText || "", v: 2 });
    if (this.cache[cacheId]) return Promise.resolve(util.clone(this.cache[cacheId]));

    var avoid = (r.avoid || []).slice(0, 8);
    var prompt = [
      "Forge ONE new Exotic puzzle.",
      "Category: " + cat + ".",
      "Difficulty: " + diff + " out of 5.",
      r.seedText ? "Theme or flavour to weave in: " + r.seedText + "." : "",
      avoid.length ? "Do not reuse these already-used prompts: " + avoid.join(" | ") : "",
      "",
      'Reply with JSON only: {"prompt":"...","digit":0-9,"explanation":"one or two sentences proving the answer","kind":"digit"}',
      "The digit must be a single character 0-9. The prompt must end by making clear which single digit is wanted."
    ].filter(Boolean).join("\n");

    return this.ask([{ role: "user", content: prompt }], { json: true, temperature: 0.95, maxTokens: 420 })
      .then(function (out) {
        var parsed = extractJson(out.text);
        if (!parsed || !parsed.prompt) throw new Error("The Oracle spoke in riddles we could not parse.");
        var digit = parsed.digit;
        if (typeof digit !== "number") {
          var m = DIGIT_RE.exec(String(digit || out.text));
          digit = m ? Number(m[1]) : null;
        }
        if (digit == null || isNaN(digit)) throw new Error("The Oracle forgot the digit.");
        var puzzle = {
          id: "OR-" + cacheId.slice(-6).toUpperCase(),
          category: cat,
          difficulty: diff,
          kind: "digit",
          prompt: String(parsed.prompt).slice(0, 400),
          digit: util.clamp(Math.round(digit), 0, 9),
          explanation: String(parsed.explanation || "The Oracle declines to explain.").slice(0, 400),
          choices: null,
          source: "oracle",
          model: out.model
        };
        self.cache[cacheId] = puzzle;
        self._persistCache();
        return puzzle;
      });
  };

  /**
   * Explain a puzzle the player just met, in the Oracle's voice.
   */
  Oracle.prototype.explain = function (puzzle, playerAnswer) {
    var self = this;
    var cacheId = hashKey({ e: puzzle.id, a: playerAnswer });
    if (this.cache[cacheId]) return Promise.resolve(this.cache[cacheId]);
    var prompt = [
      "Puzzle: " + puzzle.prompt,
      "Correct digit: " + puzzle.digit,
      "Player answered: " + (playerAnswer == null ? "nothing" : playerAnswer),
      "",
      "Write ONE short paragraph (max 45 words) explaining the reasoning so the player learns it.",
      "No greeting, no bullet points, no mention of models or AI."
    ].join("\n");
    return this.ask([{ role: "user", content: prompt }], { temperature: 0.6, maxTokens: 200 })
      .then(function (out) {
        var text = String(out.text).trim();
        self.cache[cacheId] = text;
        self._persistCache();
        return text;
      });
  };

  /**
   * Personalised coaching from a run summary.
   * @returns {Promise<{headline:string, notes:string[], drill:string}>}
   */
  Oracle.prototype.coach = function (summary) {
    var self = this;
    var cacheId = hashKey({ c: summary });
    if (this.cache[cacheId]) return Promise.resolve(util.clone(this.cache[cacheId]));
    var prompt = [
      "A player just finished an Exotic run. Here is the data:",
      JSON.stringify(summary),
      "",
      "Reply with JSON only:",
      '{"headline":"max 8 words","notes":["max 3 short observations"],"drill":"one concrete practice suggestion, max 24 words"}',
      "Be specific to the numbers. No praise padding."
    ].join("\n");
    return this.ask([{ role: "user", content: prompt }], { json: true, temperature: 0.65, maxTokens: 320 })
      .then(function (out) {
        var parsed = extractJson(out.text);
        if (!parsed || !parsed.headline) throw new Error("No coaching returned");
        var result = {
          headline: String(parsed.headline).slice(0, 90),
          notes: (parsed.notes || []).slice(0, 3).map(function (n) { return String(n).slice(0, 140); }),
          drill: String(parsed.drill || "").slice(0, 200)
        };
        self.cache[cacheId] = result;
        self._persistCache();
        return result;
      });
  };

  /** Session summary the coach consumes. */
  Oracle.prototype.summarise = function (run) {
    if (!run) return null;
    var spent = 0;
    (run.usedItems || []).forEach(function () { spent++; });
    return {
      tier: run.tier,
      outcome: run.outcome,
      secondsUsed: Math.round((run.elapsedMs || 0) / 1000),
      secondsAllowed: Math.round((run.durationMs || 0) / 1000),
      puzzlesSolved: (run.solved || []).filter(Boolean).length,
      wrongGuesses: (run.guesses || []).filter(function (g) { return !g.correct; }).length,
      hintsUsed: (run.hintsUsed || 0),
      itemsBurned: spent,
      categories: run.categoryTally || {},
      score: run.score || 0
    };
  };

  Oracle.prototype.clearCache = function () {
    this.cache = {};
    util.storage.remove(CACHE_KEY);
    return this;
  };

  Oracle.prototype.clearCooldowns = function () {
    this.cooldowns = {};
    util.storage.remove(COOLDOWN_KEY);
    this.emit("cooldowns-cleared");
    return this;
  };

  Oracle.prototype.status = function () {
    var now = Date.now();
    var self = this;
    var cooling = Object.keys(this.cooldowns).filter(function (m) { return self.cooldowns[m] > now; });
    return {
      enabled: this.enabled(),
      mode: CFG.get("useAiProxy") ? "edge-proxy" : "direct",
      models: X.AI_MODELS.length,
      cooling: cooling.length,
      coolingList: cooling,
      cursor: this.cursor,
      stats: this.stats,
      cached: Object.keys(this.cache).length
    };
  };

  X.Oracle = new Oracle();
  X.extractJson = extractJson;
})(window);
