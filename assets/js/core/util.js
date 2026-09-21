/* ==========================================================================
   Exotic — util
   Small, dependency-free helpers. Nothing here touches the DOM.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});

  var util = {

    /* ---------- identity ---------- */
    uid: function (prefix) {
      var rnd = Math.random().toString(36).slice(2, 10);
      var t = Date.now().toString(36).slice(-4);
      return (prefix || "id") + "_" + t + rnd;
    },

    /* ---------- math ---------- */
    clamp: function (n, min, max) {
      return n < min ? min : n > max ? max : n;
    },
    lerp: function (a, b, t) { return a + (b - a) * t; },
    invLerp: function (a, b, v) { return b === a ? 0 : (v - a) / (b - a); },
    round: function (n, places) {
      var p = Math.pow(10, places || 0);
      return Math.round(n * p) / p;
    },
    randInt: function (min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    pick: function (arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    },
    pickMany: function (arr, count) {
      return util.shuffle(arr.slice()).slice(0, count);
    },
    shuffle: function (arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    },
    sum: function (arr) {
      return arr.reduce(function (a, b) { return a + (Number(b) || 0); }, 0);
    },
    avg: function (arr) {
      return arr.length ? util.sum(arr) / arr.length : 0;
    },
    seededRandom: function (seedStr) {
      var h = 2166136261;
      for (var i = 0; i < seedStr.length; i++) {
        h ^= seedStr.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return function () {
        h += 0x6d2b79f5;
        var t = h;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    /* ---------- time ---------- */
    now: function () { return Date.now(); },
    fmtClock: function (ms) {
      var total = Math.max(0, Math.ceil(ms / 1000));
      var m = Math.floor(total / 60);
      var s = total % 60;
      return m + ":" + (s < 10 ? "0" : "") + s;
    },
    fmtClockLong: function (ms) {
      var total = Math.max(0, Math.ceil(ms / 1000));
      var m = Math.floor(total / 60);
      var s = total % 60;
      return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    },
    fmtDuration: function (ms) {
      var sec = Math.round(ms / 1000);
      if (sec < 60) return sec + "s";
      var m = Math.floor(sec / 60);
      var s = sec % 60;
      if (m < 60) return m + "m " + (s ? s + "s" : "");
      var h = Math.floor(m / 60);
      return h + "h " + (m % 60) + "m";
    },
    fmtRelative: function (ts) {
      var diff = Date.now() - ts;
      if (diff < 60e3) return "just now";
      if (diff < 3600e3) return Math.floor(diff / 60000) + "m ago";
      if (diff < 86400e3) return Math.floor(diff / 3600000) + "h ago";
      if (diff < 604800e3) return Math.floor(diff / 86400000) + "d ago";
      return new Date(ts).toLocaleDateString();
    },
    fmtDate: function (ts) {
      return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    },

    /* ---------- numbers ---------- */
    fmtNum: function (n) {
      var v = Number(n) || 0;
      if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(v % 1e9 === 0 ? 0 : 1) + "B";
      if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1) + "M";
      if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(v % 1e3 === 0 ? 0 : 1) + "K";
      return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },
    fmtPct: function (n, places) {
      return util.round((Number(n) || 0) * 100, places == null ? 0 : places) + "%";
    },
    ordinal: function (n) {
      var s = ["th", "st", "nd", "rd"];
      var v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    },

    /* ---------- text ---------- */
    escape: function (str) {
      return String(str == null ? "" : str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },
    slug: function (str) {
      return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    },
    initials: function (name) {
      var parts = String(name || "?").trim().split(/[\s_.-]+/).filter(Boolean);
      if (!parts.length) return "?";
      if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
      return (parts[0][0] + parts[1][0]).toUpperCase();
    },
    titleCase: function (str) {
      return String(str || "").replace(/\w\S*/g, function (w) {
        return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
      });
    },
    truncate: function (str, n) {
      var s = String(str || "");
      return s.length > n ? s.slice(0, n - 1) + "…" : s;
    },
    normalize: function (str) {
      return String(str || "")
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
    },

    /* ---------- objects ---------- */
    clone: function (obj) {
      if (obj == null || typeof obj !== "object") return obj;
      if (Array.isArray(obj)) return obj.map(util.clone);
      var out = {};
      for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = util.clone(obj[k]);
      return out;
    },
    merge: function () {
      var out = {};
      for (var i = 0; i < arguments.length; i++) {
        var src = arguments[i];
        if (!src) continue;
        for (var k in src) if (Object.prototype.hasOwnProperty.call(src, k)) out[k] = src[k];
      }
      return out;
    },
    groupBy: function (arr, keyFn) {
      return arr.reduce(function (acc, item) {
        var k = keyFn(item);
        (acc[k] || (acc[k] = [])).push(item);
        return acc;
      }, {});
    },
    sortBy: function (arr, keyFn, dir) {
      var d = dir === "desc" ? -1 : 1;
      return arr.slice().sort(function (a, b) {
        var ka = keyFn(a), kb = keyFn(b);
        if (ka < kb) return -1 * d;
        if (ka > kb) return 1 * d;
        return 0;
      });
    },

    /* ---------- function control ---------- */
    debounce: function (fn, wait) {
      var t = null;
      return function () {
        var args = arguments, ctx = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, wait);
      };
    },
    throttle: function (fn, wait) {
      var last = 0, timer = null, lastArgs = null, lastCtx = null;
      return function () {
        var now = Date.now();
        lastArgs = arguments; lastCtx = this;
        if (now - last >= wait) {
          last = now;
          fn.apply(this, arguments);
        } else if (!timer) {
          timer = setTimeout(function () {
            timer = null; last = Date.now();
            fn.apply(lastCtx, lastArgs);
          }, wait - (now - last));
        }
      };
    },
    sleep: function (ms) {
      return new Promise(function (r) { setTimeout(r, ms); });
    },

    /* ---------- storage ---------- */
    storage: {
      key: function (k) { return "exotic.v1." + k; },
      get: function (k, fallback) {
        try {
          var raw = localStorage.getItem(util.storage.key(k));
          if (raw == null) return fallback;
          return JSON.parse(raw);
        } catch (e) { return fallback; }
      },
      set: function (k, value) {
        try {
          localStorage.setItem(util.storage.key(k), JSON.stringify(value));
          return true;
        } catch (e) { return false; }
      },
      remove: function (k) {
        try { localStorage.removeItem(util.storage.key(k)); } catch (e) { /* noop */ }
      },
      all: function () {
        var out = {};
        try {
          for (var i = 0; i < localStorage.length; i++) {
            var raw = localStorage.key(i);
            if (raw && raw.indexOf("exotic.v1.") === 0) {
              out[raw.replace("exotic.v1.", "")] = JSON.parse(localStorage.getItem(raw));
            }
          }
        } catch (e) { /* noop */ }
        return out;
      },
      clear: function () {
        try {
          Object.keys(localStorage)
            .filter(function (k) { return k.indexOf("exotic.v1.") === 0; })
            .forEach(function (k) { localStorage.removeItem(k); });
        } catch (e) { /* noop */ }
      }
    },

    /* ---------- clipboard ---------- */
    copy: function (text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return false; });
      }
      try {
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return Promise.resolve(true);
      } catch (e) {
        return Promise.resolve(false);
      }
    },

    /* ---------- device ---------- */
    isTouch: function () {
      return "ontouchstart" in window || (navigator.maxTouchPoints || 0) > 0;
    },
    prefersReducedMotion: function () {
      return global.matchMedia && global.matchMedia("(prefers-reduced-motion: reduce)").matches;
    },
    deviceTier: function () {
      var mem = navigator.deviceMemory || 8;
      var cores = navigator.hardwareConcurrency || 8;
      if (mem <= 2 || cores <= 2) return "low";
      if (mem <= 4 || cores <= 4) return "mid";
      return "high";
    },

    /* ---------- retry ---------- */
    retry: function (fn, opts) {
      var o = util.merge({ attempts: 3, baseDelay: 350, factor: 2, onRetry: null, shouldRetry: null }, opts || {});
      var attempt = 0;
      function run() {
        attempt++;
        return Promise.resolve()
          .then(fn)
          .catch(function (err) {
            var retryable = o.shouldRetry ? o.shouldRetry(err) : true;
            if (!retryable || attempt >= o.attempts) throw err;
            var delay = o.baseDelay * Math.pow(o.factor, attempt - 1);
            if (o.onRetry) { try { o.onRetry(err, attempt, delay); } catch (e) { /* noop */ } }
            return util.sleep(delay).then(run);
          });
      }
      return run();
    }
  };

  X.util = util;
})(window);
