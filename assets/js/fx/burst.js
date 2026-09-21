/* ==========================================================================
   Exotic — burst
   Canvas particle overlay. One canvas, one RAF loop, and it stops itself the
   moment the last particle dies so an idle tab costs nothing.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;

  function Burst(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.parts = [];
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.raf = 0;
    this.running = false;
    this.ink = "#ffffff";
    this._last = 0;
    this._onResize = util.throttle(this._resize.bind(this), 140);
    this._frame = this._frame.bind(this);
    this._onInk = this._readInk.bind(this);
  }

  Burst.prototype.init = function () {
    if (!this.ctx) return this;
    this._readInk();
    this._resize();
    global.addEventListener("resize", this._onResize, { passive: true });
    global.addEventListener("exotic:theme", this._onInk);
    return this;
  };

  Burst.prototype._readInk = function () {
    var ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    this.ink = ink || "#ffffff";
  };

  Burst.prototype._resize = function () {
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.w = global.innerWidth;
    this.h = global.innerHeight;
    this.canvas.width = Math.floor(this.w * this.dpr);
    this.canvas.height = Math.floor(this.h * this.dpr);
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  Burst.prototype._spawn = function (p) {
    this.parts.push(util.merge({
      x: 0, y: 0, vx: 0, vy: 0, g: 0.16, drag: 0.988,
      size: 4, rot: 0, vr: 0, alpha: 1, decay: 0.012, shape: "rect",
      char: null, color: null, life: Infinity, born: performance.now()
    }, p));
    if (!this.running) {
      this.running = true;
      this._last = performance.now();
      this.raf = requestAnimationFrame(this._frame);
    }
  };

  Burst.prototype._frame = function (ts) {
    var dt = Math.min(50, ts - this._last) || 16;
    this._last = ts;
    var step = dt / 16.667;
    this._step(step);
    this._draw();
    if (this.parts.length) {
      this.raf = requestAnimationFrame(this._frame);
    } else {
      this.running = false;
      this.ctx.clearRect(0, 0, this.w, this.h);
    }
  };

  Burst.prototype._step = function (step) {
    var out = [];
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      p.vy += p.g * step;
      p.vx *= Math.pow(p.drag, step);
      p.vy *= Math.pow(p.drag, step);
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.rot += p.vr * step;
      p.alpha -= p.decay * step;
      var age = performance.now() - p.born;
      if (p.alpha > 0 && age < p.life && p.y < this.h + 160) out.push(p);
    }
    this.parts = out;
  };

  Burst.prototype._draw = function () {
    var ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.lineCap = "round";
    for (var i = 0; i < this.parts.length; i++) {
      var p = this.parts[i];
      ctx.save();
      ctx.globalAlpha = util.clamp(p.alpha, 0, 1);
      var color = p.color || this.ink;
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === "rect") {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.shape === "dot") {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "ring") {
        ctx.lineWidth = Math.max(1, p.size / 6);
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.shape === "glyph") {
        ctx.font = "700 " + p.size + "px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(p.char || "0", 0, 0);
      } else if (p.shape === "line") {
        ctx.lineWidth = Math.max(1, p.size / 5);
        ctx.beginPath();
        ctx.moveTo(-p.size, 0);
        ctx.lineTo(p.size, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };

  /* ---------------------------------------------------------------- cues -- */

  /** Wide monochrome confetti fall — victory. */
  Burst.prototype.confetti = function (opts) {
    if (util.prefersReducedMotion()) return this;
    var o = opts || {};
    var n = o.count || (util.deviceTier() === "low" ? 70 : 150);
    var originX = o.x == null ? this.w / 2 : o.x;
    var spread = o.spread || this.w * 0.55;
    for (var i = 0; i < n; i++) {
      this._spawn({
        x: originX + (Math.random() - 0.5) * spread,
        y: o.y == null ? -30 - Math.random() * 120 : o.y,
        vx: (Math.random() - 0.5) * 3.2,
        vy: util.lerp(1.6, 5.4, Math.random()),
        g: 0.1,
        drag: 0.995,
        size: util.lerp(6, 15, Math.random()),
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.24,
        alpha: util.lerp(0.55, 1, Math.random()),
        decay: util.lerp(0.004, 0.011, Math.random()),
        shape: Math.random() < 0.24 ? "glyph" : "rect",
        char: String(util.randInt(0, 9))
      });
    }
    return this;
  };

  /** Radial sparks from a point — correct answer. */
  Burst.prototype.sparks = function (x, y, opts) {
    if (util.prefersReducedMotion()) return this;
    var o = opts || {};
    var n = o.count || 34;
    for (var i = 0; i < n; i++) {
      var ang = (Math.PI * 2 * i) / n + Math.random() * 0.32;
      var speed = util.lerp(2.2, 8.4, Math.random());
      this._spawn({
        x: x, y: y,
        vx: Math.cos(ang) * speed,
        vy: Math.sin(ang) * speed,
        g: 0.05,
        drag: 0.94,
        size: util.lerp(2, 5.5, Math.random()),
        alpha: 1,
        decay: util.lerp(0.016, 0.036, Math.random()),
        shape: Math.random() < 0.35 ? "dot" : "line",
        rot: ang,
        vr: 0.02
      });
    }
    this.ring(x, y, o.ringSize || 90);
    return this;
  };

  /** Expanding shock ring. */
  Burst.prototype.ring = function (x, y, size) {
    this._spawn({
      x: x, y: y, vx: 0, vy: 0, g: 0, drag: 1,
      size: 6, alpha: 0.8, decay: 0.028, shape: "ring", rot: 0, vr: 0
    });
    var ring = this.parts[this.parts.length - 1];
    ring.grow = size || 80;
    var self = this;
    var grow = setInterval(function () {
      if (ring.alpha <= 0) { clearInterval(grow); return; }
      ring.size += (ring.grow - ring.size) * 0.16;
    }, 16);
    return this;
  };

  /** Shatter a DOM element into digits. */
  Burst.prototype.shatter = function (el, opts) {
    if (!el) return this;
    var o = opts || {};
    var r = el.getBoundingClientRect();
    var text = (el.textContent || "0").trim() || "0";
    var count = o.count || text.length;
    for (var i = 0; i < count; i++) {
      var ch = text[i % text.length];
      var px = r.left + (r.width / (count + 1)) * (i + 1);
      var py = r.top + r.height / 2;
      this._spawn({
        x: px, y: py,
        vx: (Math.random() - 0.5) * 6.5,
        vy: -util.lerp(2, 6, Math.random()),
        g: 0.34,
        drag: 0.992,
        size: util.lerp(16, 40, Math.random()),
        rot: (Math.random() - 0.5) * 0.5,
        vr: (Math.random() - 0.5) * 0.2,
        alpha: 1,
        decay: 0.014,
        shape: "glyph",
        char: ch
      });
    }
    return this;
  };

  /** Text that flies up from a point — score pops. */
  Burst.prototype.floatText = function (x, y, text, opts) {
    var o = opts || {};
    this._spawn({
      x: x, y: y,
      vx: 0, vy: o.vy == null ? -1.9 : o.vy,
      g: o.g == null ? 0.012 : o.g,
      drag: 0.996,
      size: o.size || 22,
      alpha: 1,
      decay: o.decay || 0.014,
      shape: "glyph",
      char: String(text),
      life: o.life || 1400
    });
    return this;
  };

  /** Full screen wipe of digits — used on route enter for game views. */
  Burst.prototype.rain = function (opts) {
    if (util.prefersReducedMotion()) return this;
    var o = opts || {};
    var n = o.count || 44;
    for (var i = 0; i < n; i++) {
      this._spawn({
        x: Math.random() * this.w,
        y: -40 - Math.random() * 300,
        vx: (Math.random() - 0.5) * 0.6,
        vy: util.lerp(3, 9, Math.random()),
        g: 0.02,
        drag: 1,
        size: util.lerp(12, 30, Math.random()),
        rot: 0,
        vr: 0,
        alpha: util.lerp(0.12, 0.5, Math.random()),
        decay: util.lerp(0.006, 0.02, Math.random()),
        shape: "glyph",
        char: String(util.randInt(0, 9))
      });
    }
    return this;
  };

  Burst.prototype.clear = function () {
    this.parts = [];
    if (this.ctx) this.ctx.clearRect(0, 0, this.w, this.h);
    return this;
  };

  Burst.prototype.destroy = function () {
    cancelAnimationFrame(this.raf);
    this.running = false;
    global.removeEventListener("resize", this._onResize);
    global.removeEventListener("exotic:theme", this._onInk);
  };

  /* ---- screen shake ------------------------------------------------------- */
  var shakeTimer = null;
  function shake(el, power) {
    if (!el || util.prefersReducedMotion()) return;
    var p = power || 6;
    clearTimeout(shakeTimer);
    var start = performance.now();
    var dur = 320;
    function step(ts) {
      var t = (ts - start) / dur;
      if (t >= 1) { el.style.transform = ""; return; }
      var damp = (1 - t) * p;
      var x = (Math.random() - 0.5) * damp * 2;
      var y = (Math.random() - 0.5) * damp * 2;
      el.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  X.Burst = Burst;
  X.fxShake = shake;
})(window);
