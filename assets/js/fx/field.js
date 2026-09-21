/* ==========================================================================
   Exotic — ambient field
   A single <canvas> paints the living background: drifting motes, faint
   constellation links, glyph drifters that occasionally form digits, and a
   cursor that bends the field around it. Monochrome, theme aware.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;

  var GLYPHS = "0123456789◈◇⬡△○□⌘∑π∆√∞§¶".split("");

  function Field(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.dpr = 1;
    this.w = 0;
    this.h = 0;
    this.motes = [];
    this.glyphs = [];
    this.links = [];
    this.pointer = { x: -9999, y: -9999, active: false, radius: 170 };
    this.ink = "#ffffff";
    this.intensity = 1;
    this.running = false;
    this.raf = 0;
    this._last = 0;
    this._moodLinks = 0.55;
    this._moodSpeed = 1;
    this._onResize = this._onResize.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onLeave = this._onLeave.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._frame = this._frame.bind(this);
  }

  Field.prototype.init = function () {
    if (!this.ctx) return this;
    var tier = util.deviceTier();
    this.tier = tier;
    this.density = tier === "low" ? 0.00007 : tier === "mid" ? 0.00011 : 0.00015;
    this.maxMotes = tier === "low" ? 46 : tier === "mid" ? 84 : 128;
    this.linkDist = tier === "low" ? 110 : 148;
    this.glyphCount = tier === "low" ? 6 : tier === "mid" ? 11 : 17;

    this._readInk();
    this._onResize();

    global.addEventListener("resize", this._onResize, { passive: true });
    global.addEventListener("pointermove", this._onMove, { passive: true });
    global.addEventListener("pointerdown", this._onMove, { passive: true });
    global.addEventListener("pointerleave", this._onLeave, { passive: true });
    document.addEventListener("visibilitychange", this._onVisibility);
    global.addEventListener("exotic:theme", this._readInk.bind(this));

    this.running = true;
    this._last = performance.now();
    this.raf = requestAnimationFrame(this._frame);
    return this;
  };

  Field.prototype._readInk = function () {
    var styles = getComputedStyle(document.documentElement);
    var ink = styles.getPropertyValue("--ink").trim();
    this.ink = ink || "#ffffff";
  };

  Field.prototype._onResize = util.throttle(function () {
    var w = global.innerWidth;
    var h = global.innerHeight;
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this._seed();
  }, 140);

  Field.prototype._seed = function () {
    var count = util.clamp(Math.round(this.w * this.h * this.density), 18, this.maxMotes);
    this.motes = [];
    for (var i = 0; i < count; i++) {
      this.motes.push({
        x: Math.random() * this.w,
        y: Math.random() * this.h,
        vx: (Math.random() - 0.5) * 0.22,
        vy: (Math.random() - 0.5) * 0.22,
        r: util.lerp(0.7, 2.1, Math.random()),
        a: util.lerp(0.1, 0.42, Math.random()),
        tw: Math.random() * Math.PI * 2,
        tvs: util.lerp(0.006, 0.02, Math.random())
      });
    }
    this.glyphs = [];
    for (var j = 0; j < this.glyphCount; j++) {
      this.glyphs.push(this._makeGlyph());
    }
  };

  Field.prototype._makeGlyph = function () {
    return {
      x: Math.random() * this.w,
      y: Math.random() * this.h,
      vy: util.lerp(0.08, 0.34, Math.random()),
      vx: util.lerp(-0.08, 0.08, Math.random()),
      ch: GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
      size: util.lerp(11, 26, Math.random()),
      a: util.lerp(0.05, 0.14, Math.random()),
      life: util.randInt(160, 520),
      age: 0,
      swapAt: util.randInt(30, 90)
    };
  };

  Field.prototype._onMove = function (e) {
    var p = e.touches ? e.touches[0] : e;
    if (!p) return;
    this.pointer.x = p.clientX;
    this.pointer.y = p.clientY;
    this.pointer.active = true;
  };

  Field.prototype._onLeave = function () {
    this.pointer.active = false;
    this.pointer.x = -9999;
    this.pointer.y = -9999;
  };

  Field.prototype._onVisibility = function () {
    if (document.hidden) {
      this.running = false;
      cancelAnimationFrame(this.raf);
    } else if (!this.running) {
      this.running = true;
      this._last = performance.now();
      this.raf = requestAnimationFrame(this._frame);
    }
  };

  /** Nudge the field's temperament. mood: 'calm' | 'play' | 'tense' | 'triumph' */
  Field.prototype.mood = function (mood) {
    var map = {
      calm: { links: 0.5, speed: 0.8, glyph: 0.7 },
      play: { links: 0.75, speed: 1.15, glyph: 1 },
      tense: { links: 0.95, speed: 2.1, glyph: 1.5 },
      triumph: { links: 0.9, speed: 1.8, glyph: 1.9 }
    };
    var m = map[mood] || map.calm;
    this._moodLinks = m.links;
    this._moodSpeed = m.speed;
    this._moodGlyph = m.glyph;
  };

  /** One-off pulse from a point — used on correct answers. */
  Field.prototype.pulse = function (x, y, power) {
    var p = power || 1;
    for (var i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      var dx = m.x - x;
      var dy = m.y - y;
      var d = Math.hypot(dx, dy) || 1;
      if (d > 340) continue;
      var f = (1 - d / 340) * p * 1.9;
      m.vx += (dx / d) * f;
      m.vy += (dy / d) * f;
    }
  };

  Field.prototype._frame = function (ts) {
    if (!this.running) return;
    var dt = Math.min(48, ts - this._last) || 16;
    this._last = ts;
    var step = dt / 16.667;
    this._update(step);
    this._draw();
    this.raf = requestAnimationFrame(this._frame);
  };

  Field.prototype._update = function (step) {
    var speed = this._moodSpeed;
    var p = this.pointer;
    for (var i = 0; i < this.motes.length; i++) {
      var m = this.motes[i];
      m.x += m.vx * step * speed;
      m.y += m.vy * step * speed;
      m.tw += m.tvs * step * 3;

      if (p.active) {
        var dx = m.x - p.x;
        var dy = m.y - p.y;
        var d2 = dx * dx + dy * dy;
        var rr = p.radius * p.radius;
        if (d2 < rr && d2 > 1) {
          var d = Math.sqrt(d2);
          var force = (1 - d / p.radius) * 0.11;
          m.vx += (dx / d) * force;
          m.vy += (dy / d) * force;
        }
      }

      m.vx *= 0.994;
      m.vy *= 0.994;
      var cap = 1.5;
      if (m.vx > cap) m.vx = cap; else if (m.vx < -cap) m.vx = -cap;
      if (m.vy > cap) m.vy = cap; else if (m.vy < -cap) m.vy = -cap;

      if (m.x < -24) m.x = this.w + 24; else if (m.x > this.w + 24) m.x = -24;
      if (m.y < -24) m.y = this.h + 24; else if (m.y > this.h + 24) m.y = -24;
    }

    if (!this.glyphs) return;
    var gMul = this._moodGlyph || 1;
    for (var j = 0; j < this.glyphs.length; j++) {
      var g = this.glyphs[j];
      g.y += g.vy * step * speed * gMul;
      g.x += g.vx * step;
      g.age += step;
      if (g.age % g.swapAt < step) g.ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      if (g.y > this.h + 40 || g.age > g.life) {
        var fresh = this._makeGlyph();
        fresh.y = -30;
        fresh.x = Math.random() * this.w;
        this.glyphs[j] = fresh;
      }
      if (p.active) {
        var gdx = g.x - p.x;
        var gdy = g.y - p.y;
        var gd = Math.hypot(gdx, gdy) || 1;
        if (gd < 150) {
          g.x += (gdx / gd) * 0.6;
          g.y += (gdy / gd) * 0.6;
        }
      }
    }
  };

  Field.prototype._draw = function () {
    var ctx = this.ctx;
    var ink = this.ink;
    ctx.clearRect(0, 0, this.w, this.h);

    /* constellation links */
    var dist = this.linkDist;
    var maxD2 = dist * dist;
    ctx.lineWidth = 0.6;
    for (var i = 0; i < this.motes.length; i++) {
      var a = this.motes[i];
      for (var k = i + 1; k < this.motes.length; k++) {
        var b = this.motes[k];
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        var d2 = dx * dx + dy * dy;
        if (d2 > maxD2) continue;
        var t = 1 - d2 / maxD2;
        ctx.globalAlpha = t * 0.16 * this._moodLinks;
        ctx.strokeStyle = ink;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    /* motes */
    ctx.globalAlpha = 1;
    for (var m = 0; m < this.motes.length; m++) {
      var mo = this.motes[m];
      var tw = 0.72 + Math.sin(mo.tw) * 0.28;
      ctx.globalAlpha = mo.a * tw;
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(mo.x, mo.y, mo.r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* glyph drifters */
    if (this.glyphs) {
      for (var g = 0; g < this.glyphs.length; g++) {
        var gl = this.glyphs[g];
        var life = gl.age / gl.life;
        var fade = life < 0.1 ? life / 0.1 : life > 0.82 ? (1 - life) / 0.18 : 1;
        ctx.globalAlpha = gl.a * util.clamp(fade, 0, 1) * (this._moodGlyph || 1) * 0.9;
        ctx.fillStyle = ink;
        ctx.font = "500 " + gl.size + "px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(gl.ch, gl.x, gl.y);
      }
    }

    /* pointer halo */
    var p = this.pointer;
    if (p.active) {
      var grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
      var hex = this.ink === "#ffffff" ? "255,255,255" : "0,0,0";
      grad.addColorStop(0, "rgba(" + hex + ",0.055)");
      grad.addColorStop(1, "rgba(" + hex + ",0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
  };

  Field.prototype.setOpacity = function (v) {
    if (this.canvas) this.canvas.style.opacity = String(v);
  };

  Field.prototype.destroy = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
    global.removeEventListener("resize", this._onResize);
    global.removeEventListener("pointermove", this._onMove);
    global.removeEventListener("pointerdown", this._onMove);
    global.removeEventListener("pointerleave", this._onLeave);
    document.removeEventListener("visibilitychange", this._onVisibility);
  };

  X.Field = Field;
})(window);
