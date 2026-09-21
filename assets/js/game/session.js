/* ==========================================================================
   Exotic — session
   The run state machine shared by both realms. It owns the clock, the ticker,
   answer/guess routing, power-up spending, persistence and the finish line.
   Single player and multiplayer differ only in who is watching and what gets
   written when the run ends; the mechanics live here once.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var CFG = X.config;
  var Emitter = X.Emitter;

  var TICK_MS = 250;

  function Session(opts) {
    Emitter.call(this);
    opts = opts || {};
    this.realm = opts.realm === "multi" ? "multi" : "single";
    this.run = opts.run || X.Engine.createRun({
      realm: this.realm,
      tier: opts.tier,
      mode: opts.mode,
      seed: opts.seed,
      count: opts.count,
      exclude: opts.exclude
    });
    this.ranked = !!this.run.ranked;
    this.perks = opts.perks || X.Profile.perks(this.realm);
    this.profileOpts = opts.profileOpts || {};
    this.active = false;
    this.finished = false;
    this.restored = !!opts.restored;
    /* hotseat turns are real matches but must not write to the device profile */
    this.noProfile = !!opts.noProfile;
    this.result = null;
    this.applied = null;
    this._prepared = false;
    this._interval = null;
    this._lastSecond = -1;
    this._finishPromise = null;
  }
  Session.prototype = Object.create(Emitter.prototype);
  Session.prototype.constructor = Session;

  /* ------------------------------------------------------------- lifecycle */

  /** Apply permanent perks exactly once, before the first tick. */
  Session.prototype.prepare = function () {
    if (this._prepared) return this;
    this._prepared = true;
    var p = this.perks || {};
    if (p.headStart) X.Engine.applyHeadStart(this.run, p.headStart);
    if (p.startBonusTime) X.Engine.addTime(this.run, p.startBonusTime);
    if (p.hintDiscount) {
      this.run.modifiers.hintDiscount = Math.max(this.run.modifiers.hintDiscount || 0, p.hintDiscount);
    }
    return this;
  };

  Session.prototype.start = function () {
    if (this.active) return this;
    this.prepare();
    var run = this.run;
    /* re-anchor the clock so any delay between build and start is free */
    run.startedAt = Date.now();
    run.endsAt = run.startedAt + run.durationMs;
    run.pausedUntil = 0;
    run.pausedTotalMs = 0;
    run.elapsedMs = 0;
    this.active = true;
    this.finished = false;
    this._lastSecond = -1;
    var self = this;
    this._interval = setInterval(function () { self.tick(); }, TICK_MS);
    this.emit("start", run);
    return this;
  };

  Session.prototype.stop = function () {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    return this;
  };

  Session.prototype.destroy = function () {
    this.stop();
    this.removeAllListeners && this.removeAllListeners();
    return this;
  };

  Session.prototype.tick = function () {
    if (!this.active || this.finished) return;
    var run = this.run;
    var now = Date.now();
    run.elapsedMs = X.Engine.elapsed(run, now);
    var remaining = X.Engine.remaining(run, now);
    var sec = Math.max(0, Math.ceil(remaining / 1000));
    if (sec !== this._lastSecond) {
      this._lastSecond = sec;
      this.emit("second", sec);
      if (sec > 0 && sec <= 10) X.audio.tick();
    }
    this.emit("tick", {
      remaining: Math.max(0, remaining),
      elapsed: run.elapsedMs,
      progress: X.Engine.progress(run),
      critical: remaining <= 15000
    });
    if (remaining <= 0) {
      this.emit("expire", run);
      this.end("expired");
    }
  };

  /* ---------------------------------------------------------------- input */

  Session.prototype.answer = function (index, input) {
    if (this.finished) return { ok: false, reason: "This run is over." };
    var res = X.Engine.answer(this.run, index, input);
    if (res.ok) {
      this.emit("solve", index, res.slot);
      this._checkReady();
    } else {
      this.emit("wrong", index, res);
    }
    return res;
  };

  Session.prototype.commit = function (index, digit) {
    if (this.finished) return { ok: false, reason: "This run is over." };
    var res = X.Engine.commit(this.run, index, digit);
    if (res.correct) {
      this.emit("solve", index, res.slot);
      this._checkReady();
    } else {
      this.emit("commit-wrong", index, res);
    }
    return res;
  };

  Session.prototype._checkReady = function () {
    if (X.Engine.solvedCount(this.run) === this.run.slots.length) {
      this.emit("ready", this.run.code.join(""));
    }
  };

  Session.prototype.guess = function (value) {
    if (this.finished) return { ok: false, reason: "This run is over." };
    var res = X.Engine.guess(this.run, value);
    this.emit("guess", res);
    if (res.correct) this.end("won");
    else if (this.run.attemptsLeft <= 0) this.end("lost");
    return res;
  };

  Session.prototype.unlock = function () {
    return this.guess(this.run.code.join(""));
  };

  Session.prototype.canUnlock = function () {
    return X.Engine.solvedCount(this.run) === this.run.slots.length;
  };

  Session.prototype.hint = function (index) {
    var self = this;
    var run = this.run;
    var slot = run.slots[index];
    if (!slot) return Promise.resolve({ ok: false, reason: "No such slot." });
    var tier = CFG.tier(run.tier);
    if (tier.noHints) return Promise.resolve({ ok: false, reason: "This tier allows no hints." });
    if (slot.solved) return Promise.resolve({ ok: false, reason: "Already solved." });
    var level = Math.min(3, slot.hintLevel + 1);
    var cost = X.Engine.hintCost(run, level);
    var R = X.Cloud.realm(this.realm);
    if (R.balance() < cost) {
      return Promise.resolve({ ok: false, reason: "Not enough " + (this.realm === "multi" ? "cores" : "shards") + " for that hint." });
    }
    return R.spend(cost, "hint").then(function () {
      var res = X.Engine.takeHint(run, index);
      self.emit("hint", index, res, cost);
      return util.merge(res || {}, { ok: true, cost: cost });
    });
  };

  Session.prototype.useItem = function (itemId, index) {
    var self = this;
    var R = X.Cloud.realm(this.realm);
    var item = X.Shop.get(itemId);
    if (!item) return Promise.resolve({ ok: false, reason: "Unknown item." });
    if (item.realm !== this.realm) return Promise.resolve({ ok: false, reason: "That item belongs to the other realm." });
    if (!R.hasItem(itemId)) return Promise.resolve({ ok: false, reason: "You do not own that." });
    return R.consume(itemId, 1).then(function () {
      var res = X.Engine.applyItem(self.run, itemId, index);
      self.emit("item", itemId, res);
      return res;
    }).catch(function (err) {
      return { ok: false, reason: err.message };
    });
  };

  /* ---------------------------------------------------------------- finish */

  Session.prototype.end = function (outcome) {
    if (this._finishPromise) return this._finishPromise;
    var self = this;
    var run = this.run;
    this.finished = true;
    this.active = false;
    this.stop();
    run.outcome = outcome || run.outcome || "abandoned";
    run.finishedAt = Date.now();
    run.elapsedMs = X.Engine.elapsed(run, run.finishedAt);

    var profile = X.Cloud.realm(this.realm).profile;
    var ctx = util.merge({}, this.profileOpts, {
      streak: profile ? (profile.streak || 0) : 0,
      perks: this.perks,
      firstClear: run.outcome === "won" ? X.Profile.claimDaily(this.realm) : false
    });
    var result = X.Scoring.evaluate(run, ctx);
    this.result = result;
    this.emit("before-end", run, result);

    if (this.noProfile) {
      this._finishPromise = Promise.resolve().then(function () {
        self.emit("end", run, result, null);
        return null;
      });
      return this._finishPromise;
    }

    this._finishPromise = Promise.resolve()
      .then(function () { return X.Profile.applyRun(self.realm, run, result, self.profileOpts); })
      .then(function (applied) {
        self.applied = applied;
        self.emit("end", run, result, applied);
        return applied;
      })
      .catch(function (err) {
        self.emit("error", err);
        self.emit("end", run, result, null);
        return null;
      });
    return this._finishPromise;
  };

  Session.prototype.abandon = function () {
    return this.end("abandoned");
  };

  /* ----------------------------------------------------------- persistence */

  Session.prototype.snapshot = function () {
    return X.Engine.serialise(this.run);
  };

  Session.prototype.save = function () {
    return X.Cloud.realm(this.realm).saveRun(this.snapshot());
  };

  Session.prototype.clearSaved = function () {
    return X.Cloud.realm(this.realm).clearRun();
  };

  /**
   * Rebuild a session from a saved snapshot, if one exists for the realm.
   * @returns {Promise<Session|null>}
   */
  Session.restore = function (realmName) {
    return X.Cloud.realm(realmName).loadRun().then(function (snap) {
      if (!snap || !snap.slots) return null;
      var run = X.Engine.deserialise(snap);
      if (!run || run.outcome) return null;
      var session = new Session({
        realm: realmName,
        run: run,
        perks: X.Profile.perks(realmName),
        restored: true
      });
      return session;
    });
  };

  Session.prototype.progress = function () {
    return X.Engine.progress(this.run);
  };

  X.Session = Session;
  X.Session.TICK_MS = TICK_MS;
})(window);
