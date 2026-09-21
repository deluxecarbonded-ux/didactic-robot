/* ==========================================================================
   Exotic — audio
   Every sound is synthesised at runtime through the Web Audio API, so the
   game ships with zero binary assets and still feels physical.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var Emitter = X.Emitter;

  function Audio() {
    Emitter.call(this);
    this.ctx = null;
    this.master = null;
    this.enabled = util.storage.get("audio.enabled", true);
    this.volume = util.storage.get("audio.volume", 0.55);
    this._unlocked = false;
  }
  Audio.prototype = Object.create(Emitter.prototype);
  Audio.prototype.constructor = Audio;

  Audio.prototype._ensure = function () {
    if (this.ctx) return this.ctx;
    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.enabled ? this.volume : 0;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  };

  Audio.prototype.unlock = function () {
    var ctx = this._ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    this._unlocked = true;
    this.emit("unlocked");
  };

  Audio.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    util.storage.set("audio.enabled", this.enabled);
    if (this.master) {
      this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, this.ctx.currentTime, 0.02);
    }
    this.emit("enabled", this.enabled);
  };

  Audio.prototype.setVolume = function (v) {
    this.volume = util.clamp(Number(v) || 0, 0, 1);
    util.storage.set("audio.volume", this.volume);
    if (this.master) this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    this.emit("volume", this.volume);
  };

  /* Core voice: one oscillator + shaped gain envelope. */
  Audio.prototype._voice = function (opts) {
    if (!this.enabled) return;
    var ctx = this._ensure();
    if (!ctx) return;
    var o = opts || {};
    var t0 = ctx.currentTime + (o.delay || 0);
    var dur = o.duration || 0.14;

    var osc = ctx.createOscillator();
    osc.type = o.type || "sine";
    osc.frequency.setValueAtTime(o.from || 440, t0);
    if (o.to && o.to !== o.from) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);

    var gain = ctx.createGain();
    var peak = (o.gain == null ? 0.5 : o.gain);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + Math.min(0.02, dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    var node = osc;
    if (o.filter) {
      var f = ctx.createBiquadFilter();
      f.type = o.filter;
      f.frequency.value = o.filterFreq || 1200;
      f.Q.value = o.q || 1;
      osc.connect(f);
      node = f;
    }
    node.connect(gain);
    gain.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  Audio.prototype._noise = function (opts) {
    if (!this.enabled) return;
    var ctx = this._ensure();
    if (!ctx) return;
    var o = opts || {};
    var dur = o.duration || 0.2;
    var t0 = ctx.currentTime + (o.delay || 0);
    var frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var f = ctx.createBiquadFilter();
    f.type = o.filter || "bandpass";
    f.frequency.value = o.freq || 1600;
    f.Q.value = o.q || 0.9;
    var g = ctx.createGain();
    g.gain.value = o.gain == null ? 0.28 : o.gain;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t0);
  };

  /* ---------- named cues ---------- */

  Audio.prototype.key = function () { this._voice({ from: 880, to: 1180, duration: 0.06, gain: 0.2, type: "square", filter: "lowpass", filterFreq: 2400 }); };
  Audio.prototype.erase = function () { this._voice({ from: 520, to: 300, duration: 0.08, gain: 0.18, type: "square", filter: "lowpass", filterFreq: 1600 }); };
  Audio.prototype.hover = function () { this._voice({ from: 1400, duration: 0.03, gain: 0.06, type: "sine" }); };

  Audio.prototype.correct = function () {
    var self = this;
    [659.25, 830.61, 987.77].forEach(function (f, i) {
      self._voice({ from: f, to: f * 1.01, duration: 0.16, gain: 0.3, type: "triangle", delay: i * 0.055 });
    });
  };

  Audio.prototype.wrong = function () {
    this._voice({ from: 220, to: 96, duration: 0.32, gain: 0.28, type: "sawtooth", filter: "lowpass", filterFreq: 700 });
    this._noise({ freq: 320, duration: 0.14, gain: 0.14 });
  };

  Audio.prototype.unlockCue = function () {
    this._voice({ from: 180, to: 720, duration: 0.36, gain: 0.24, type: "sine" });
    this._noise({ freq: 2800, duration: 0.1, gain: 0.1, filter: "highpass" });
  };

  Audio.prototype.crack = function () {
    var self = this;
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach(function (f, i) {
      self._voice({ from: f, duration: 0.4, gain: 0.3, type: "triangle", delay: i * 0.075 });
    });
    this._noise({ freq: 5200, duration: 0.5, gain: 0.12, filter: "highpass" });
  };

  Audio.prototype.fail = function () {
    var self = this;
    [392, 329.63, 261.63].forEach(function (f, i) {
      self._voice({ from: f, to: f * 0.96, duration: 0.34, gain: 0.26, type: "sine", delay: i * 0.12 });
    });
  };

  Audio.prototype.tick = function () { this._voice({ from: 1500, duration: 0.035, gain: 0.12, type: "square" }); };
  Audio.prototype.warn = function () { this._voice({ from: 320, duration: 0.1, gain: 0.2, type: "square", delay: 0 }); };
  Audio.prototype.coin = function () {
    this._voice({ from: 1318, duration: 0.08, gain: 0.22, type: "square" });
    this._voice({ from: 1975, duration: 0.14, gain: 0.18, type: "square", delay: 0.06 });
  };
  Audio.prototype.purchase = function () {
    var self = this;
    [1046, 1318, 1567].forEach(function (f, i) {
      self._voice({ from: f, duration: 0.22, gain: 0.24, type: "triangle", delay: i * 0.07 });
    });
  };
  Audio.prototype.denied = function () { this._voice({ from: 200, to: 150, duration: 0.16, gain: 0.24, type: "square", filter: "lowpass", filterFreq: 900 }); };
  Audio.prototype.whoosh = function () { this._noise({ freq: 900, duration: 0.34, gain: 0.14, filter: "bandpass", q: 0.6 }); };
  Audio.prototype.reveal = function () { this._voice({ from: 300, to: 900, duration: 0.24, gain: 0.2, type: "sine", filter: "lowpass", filterFreq: 2600 }); };
  Audio.prototype.power = function () { this._voice({ from: 120, to: 1400, duration: 0.44, gain: 0.26, type: "sawtooth", filter: "lowpass", filterFreq: 1800 }); };
  Audio.prototype.message = function () { this._voice({ from: 880, duration: 0.09, gain: 0.16, type: "sine" }); };
  Audio.prototype.join = function () {
    this._voice({ from: 440, to: 880, duration: 0.18, gain: 0.22, type: "sine" });
  };
  Audio.prototype.leave = function () { this._voice({ from: 660, to: 220, duration: 0.2, gain: 0.2, type: "sine" }); };

  X.audio = new Audio();
})(window);
