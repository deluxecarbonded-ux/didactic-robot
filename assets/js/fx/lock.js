/* ==========================================================================
   Exotic — lock
   Canvas set pieces:
     • VaultDial  — four rotating dial rings that snap when a digit is cracked
     • cipherRain — the hero's falling-digit curtain
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;

  var TAU = Math.PI * 2;

  /* ------------------------------------------------------------ VaultDial -- */

  function VaultDial(canvas, opts) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.opts = util.merge({ size: 280, rings: 4, label: "" }, opts || {});
    this.state = { digits: [null, null, null, null], solved: [false, false, false, false] };
    this.rot = [0, 1.2, 2.4, 3.6];
    this.target = [0, 1.2, 2.4, 3.6];
    this.spinSpeed = [0.0055, -0.0042, 0.0036, -0.006];
    this.spinning = [true, true, true, true];
    this.glow = 0;
    this.ink = "#ffffff";
    this.t = 0;
    this.raf = 0;
    this.running = false;
    this.dpr = 1;
    this._frame = this._frame.bind(this);
    this._readInk = this._readInk.bind(this);
  }

  VaultDial.prototype.init = function () {
    if (!this.ctx) return this;
    this._readInk();
    this._resize();
    global.addEventListener("exotic:theme", this._readInk);
    this.running = true;
    this.raf = requestAnimationFrame(this._frame);
    return this;
  };

  VaultDial.prototype._readInk = function () {
    var ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
    this.ink = ink || "#ffffff";
  };

  VaultDial.prototype._resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var size = Math.max(180, Math.min(this.opts.size, rect.width || this.opts.size));
    this.dpr = Math.min(global.devicePixelRatio || 1, 2);
    this.size = size;
    this.canvas.width = Math.floor(size * this.dpr);
    this.canvas.height = Math.floor(size * this.dpr);
    this.canvas.style.width = "100%";
    this.canvas.style.height = "auto";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  /** @param {{digits:(number|null)[], solved:boolean[]}} next */
  VaultDial.prototype.setState = function (next) {
    if (next.digits) this.state.digits = next.digits.slice(0, this.opts.rings);
    if (next.solved) this.state.solved = next.solved.slice(0, this.opts.rings);
    for (var i = 0; i < this.opts.rings; i++) {
      if (this.state.solved[i] && this.state.digits[i] != null) {
        this.spinning[i] = false;
        var want = -Math.PI / 2 - ((this.state.digits[i] / 10) * TAU);
        var cur = this.rot[i] % TAU;
        var delta = ((want - cur) % TAU + TAU * 1.5) % TAU - TAU / 2;
        this.target[i] = this.rot[i] + delta;
      } else {
        this.spinning[i] = true;
      }
    }
    return this;
  };

  VaultDial.prototype.reveal = function (index, digit) {
    this.state.digits[index] = digit;
    this.state.solved[index] = true;
    var want = -Math.PI / 2 - ((digit / 10) * TAU);
    var cur = this.rot[index] % TAU;
    var delta = ((want - cur) % TAU + TAU * 1.5) % TAU - TAU / 2;
    this.target[index] = this.rot[index] + delta;
    this.spinning[index] = false;
    this.glow = 1;
    return this;
  };

  VaultDial.prototype.reset = function () {
    this.state = { digits: [null, null, null, null], solved: [false, false, false, false] };
    for (var i = 0; i < this.opts.rings; i++) this.spinning[i] = true;
    this.glow = 0;
    return this;
  };

  VaultDial.prototype.crackOpen = function () {
    this.glow = 1.6;
    this._flash = 1;
    return this;
  };

  VaultDial.prototype._frame = function () {
    if (!this.running) return;
    this.t += 1;
    if (this.glow > 0) this.glow = Math.max(0, this.glow - 0.012);
    for (var i = 0; i < this.opts.rings; i++) {
      if (this.spinning[i]) this.rot[i] += this.spinSpeed[i];
      else this.rot[i] += (this.target[i] - this.rot[i]) * 0.12;
    }
    this._draw();
    this.raf = requestAnimationFrame(this._frame);
  };

  VaultDial.prototype._draw = function () {
    var ctx = this.ctx;
    var s = this.size;
    var cx = s / 2;
    var cy = s / 2;
    var ink = this.ink;
    var rgb = ink === "#ffffff" ? "255,255,255" : "0,0,0";
    var maxR = s * 0.46;
    var ringGap = maxR / (this.opts.rings + 0.6);

    ctx.clearRect(0, 0, s, s);

    /* outer scanning arc */
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR + 6, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, maxR + 6, this.t * 0.012, this.t * 0.012 + 1.1);
    ctx.stroke();

    /* glows */
    if (this.glow > 0) {
      var glowR = maxR * (1 + (1 - this.glow) * 0.5);
      var grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      grad.addColorStop(0, "rgba(" + rgb + "," + (0.14 * this.glow).toFixed(3) + ")");
      grad.addColorStop(1, "rgba(" + rgb + ",0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowR, 0, TAU);
      ctx.fill();
    }

    for (var i = 0; i < this.opts.rings; i++) {
      var r = maxR - i * ringGap;
      var solved = this.state.solved[i];
      var digit = this.state.digits[i];

      /* ring track */
      ctx.globalAlpha = solved ? 0.9 : 0.14;
      ctx.strokeStyle = ink;
      ctx.lineWidth = solved ? 2 : 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.stroke();

      /* tick marks + digits */
      for (var d = 0; d < 10; d++) {
        var a = (d / 10) * TAU + this.rot[i];
        var isTop = false;
        var norm = ((a + Math.PI / 2) % TAU + TAU) % TAU;
        if (norm < 0.32 || norm > TAU - 0.32) isTop = true;

        var inner = r - 4;
        var outer = r - (solved && isTop ? 16 : 10);
        ctx.globalAlpha = isTop ? 0.9 : 0.24;
        ctx.lineWidth = isTop ? 2.4 : 1;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.stroke();

        var tr = r - 26;
        var tx = cx + Math.cos(a) * tr;
        var ty = cy + Math.sin(a) * tr;
        ctx.globalAlpha = isTop ? 1 : 0.2;
        ctx.fillStyle = ink;
        ctx.font = (isTop ? "700 " : "500 ") + (solved ? 14 : 11) + "px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(d), tx, ty);
      }

      /* the locked digit marker */
      if (solved && digit != null) {
        var ma = (digit / 10) * TAU + this.rot[i];
        var mx = cx + Math.cos(ma) * (r - 5);
        var my = cy + Math.sin(ma) * (r - 5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(mx, my, 4.6, 0, TAU);
        ctx.fill();
      }
    }

    /* top marker */
    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(cx, cy - maxR - 1);
    ctx.lineTo(cx - 6, cy - maxR - 13);
    ctx.lineTo(cx + 6, cy - maxR - 13);
    ctx.closePath();
    ctx.fill();

    /* core */
    ctx.globalAlpha = 0.1;
    ctx.beginPath();
    ctx.arc(cx, cy, ringGap * 0.72, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    ctx.font = "700 15px 'JetBrains Mono', monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    var core = this.state.digits.map(function (d) { return d == null ? "•" : String(d); }).join("");
    ctx.fillText(core, cx, cy);
  };

  VaultDial.prototype.destroy = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
    global.removeEventListener("exotic:theme", this._readInk);
  };

  /* ----------------------------------------------------------- cipherRain -- */

  function cipherRain(canvas, opts) {
    var o = util.merge({ columns: 0, speed: 1, alphaScale: 1 }, opts || {});
    if (!canvas || util.prefersReducedMotion()) return { destroy: function () {} };
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w, h, cols, drops, font = 15;
    var ink = "#ffffff";
    var running = true;
    var raf = 0;
    var last = 0;

    function readInk() {
      var v = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim();
      ink = v || "#ffffff";
    }
    readInk();
    global.addEventListener("exotic:theme", readInk);

    function resize() {
      var rect = canvas.getBoundingClientRect();
      w = rect.width || 600;
      h = rect.height || 320;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      font = w < 520 ? 12 : 15;
      cols = o.columns || Math.max(8, Math.floor(w / (font * 1.5)));
      drops = [];
      for (var i = 0; i < cols; i++) drops.push(Math.random() * h);
    }
    resize();
    global.addEventListener("resize", resize);

    function frame(ts) {
      if (!running) return;
      var dt = Math.min(60, ts - last) || 16;
      last = ts;
      var rgb = ink === "#ffffff" ? "255,255,255" : "0,0,0";
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.14)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "600 " + font + "px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      for (var i = 0; i < cols; i++) {
        var x = i * (font * 1.5) + font;
        var y = drops[i];
        var ch = String(util.randInt(0, 9));
        var head = Math.random() < 0.06;
        ctx.globalAlpha = (head ? 0.85 : util.lerp(0.08, 0.4, Math.random())) * o.alphaScale;
        ctx.fillStyle = "rgb(" + rgb + ")";
        ctx.fillText(ch, x, y);
        drops[i] += font * (0.5 + Math.random() * 0.9) * o.speed * (dt / 16.667);
        if (drops[i] > h + font * 2 && Math.random() > 0.965) drops[i] = -font * Math.random() * 12;
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return {
      destroy: function () {
        running = false;
        cancelAnimationFrame(raf);
        global.removeEventListener("resize", resize);
        global.removeEventListener("exotic:theme", readInk);
      }
    };
  }

  X.VaultDial = VaultDial;
  X.cipherRain = cipherRain;
})(window);
