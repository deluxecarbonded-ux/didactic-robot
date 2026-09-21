/* ==========================================================================
   Exotic — single player
   The Shard realm. A thin conductor around Session: it decides whether to
   resume a saved cipher, start a fresh one, or run the daily challenge, and
   it keeps the saved-run slot tidy once a run is over.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var CFG = X.config;
  var Emitter = X.Emitter;

  function SinglePlayer() {
    Emitter.call(this);
    this.session = null;
    this.lastResult = null;
  }
  SinglePlayer.prototype = Object.create(Emitter.prototype);
  SinglePlayer.prototype.constructor = SinglePlayer;

  SinglePlayer.prototype.realm = "single";

  SinglePlayer.prototype.active = function () {
    return !!(this.session && this.session.active && !this.session.finished);
  };

  /**
   * Build (but do not start) a run.
   * @param {{tier?:string, seed?:string, count?:number, daily?:boolean}} [opts]
   */
  SinglePlayer.prototype.build = function (opts) {
    var o = opts || {};
    var session = new X.Session({
      realm: "single",
      tier: o.tier || CFG.get("defaultTier"),
      seed: o.seed,
      count: o.count,
      perks: X.Profile.perks("single"),
      profileOpts: o.daily ? { daily: true } : {}
    });
    session.daily = !!o.daily;
    return session;
  };

  /** Fresh run, clock already moving. */
  SinglePlayer.prototype.create = function (opts) {
    var session = this.build(opts);
    this._adopt(session);
    session.start();
    return session;
  };

  /** The daily cipher: one seeded run per calendar day, same for everyone. */
  SinglePlayer.prototype.daily = function () {
    var seed = "daily-" + X.Profile.todayKey();
    var existing = util.storage.get("dailyRun", null);
    var session;
    if (existing && existing.seed === seed && !existing.done) {
      session = this.build({ tier: existing.tier || "standard", seed: seed, daily: true });
    } else {
      session = this.build({ tier: "standard", seed: seed, daily: true });
    }
    this._adopt(session);
    session.start();
    return session;
  };

  SinglePlayer.prototype.dailyDone = function () {
    var st = X.Profile.dailyStatus();
    return !!st.single;
  };

  SinglePlayer.prototype._adopt = function (session) {
    var self = this;
    this.session = session;
    session.on("end", function (run, result, applied) {
      self.lastResult = { run: run, result: result, applied: applied };
      session.clearSaved();
      util.storage.set("dailyRun", { seed: run.seed, tier: run.tier, done: true, at: Date.now() });
      self.emit("end", run, result, applied);
    });
    session.on("tick", function (t) { self.emit("tick", t); });
    session.on("solve", function (i, slot) { self.emit("solve", i, slot); });
    session.on("wrong", function (i, res) { self.emit("wrong", i, res); });
    session.on("ready", function (code) { self.emit("ready", code); });
    return session;
  };

  /** Continue an interrupted run, if the vault kept one. */
  SinglePlayer.prototype.resume = function () {
    var self = this;
    return X.Session.restore("single").then(function (session) {
      if (!session) return null;
      self._adopt(session);
      session.start();
      return session;
    });
  };

  SinglePlayer.prototype.hasSaved = function () {
    return X.Cloud.realm("single").loadRun().then(function (snap) {
      return !!(snap && snap.slots && !snap.outcome);
    });
  };

  SinglePlayer.prototype.save = function () {
    return this.session ? this.session.save() : Promise.resolve(null);
  };

  SinglePlayer.prototype.abandon = function () {
    var self = this;
    if (!this.session) return Promise.resolve(null);
    return this.session.end("abandoned").then(function (applied) {
      self.session = null;
      return applied;
    });
  };

  SinglePlayer.prototype.wallet = function () {
    return X.Cloud.realm("single").balance();
  };

  X.SinglePlayer = new SinglePlayer();
})(window);
