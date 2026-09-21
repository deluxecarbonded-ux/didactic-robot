/* ==========================================================================
   Exotic — keypad
   The vault entry pad, reused by single player, multiplayer code entry and
   the daily cipher. One instance reacts to the physical keyboard at a time
   (the focused keypad), but any keypad can be driven by clicks directly.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;

  var FOCUS = null;
  var BOUND = false;

  function handleGlobalKey(e) {
    if (!FOCUS || !FOCUS.el || !FOCUS.el.isConnected) return;
    var k = "";
    if (e.key >= "0" && e.key <= "9") k = e.key;
    else if (e.key === "Backspace" || e.key === "Delete") k = "clear";
    else if (e.key === "Enter") k = "submit";
    if (!k) return;
    if (!FOCUS.physical) return;
    e.preventDefault();
    FOCUS.press(k);
  }

  function Keypad(opts) {
    var o = opts || {};
    this.max = o.max || 4;
    this.value = "";
    this.physical = o.physical !== false;
    this.layout = o.layout || "full";
    this.onChange = o.onChange || null;
    this.onSubmit = o.onSubmit || null;
    this.onClear = o.onClear || null;
    this.onComplete = o.onComplete || null;
    this._preventSubmit = !!o.noAutoSubmit;
    this.el = this._build();
    if (!BOUND) {
      BOUND = true;
      document.addEventListener("keydown", handleGlobalKey);
    }
  }

  Keypad.prototype._build = function () {
    var self = this;
    function key(label, extra, attrs) {
      var a = util.merge({ type: "button", class: extra }, attrs || {});
      a.onclick = function () { self.press(label); };
      return dom.el("button", a, label === "clear" ? { html: X.icons.icon("trash", { size: 18 }) } : label === "submit" ? { html: X.icons.icon("check", { size: 20 }) } : String(label));
    }

    var rows = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
      ["clear", 0, "submit"]
    ];
    var wrap = dom.el("div", { class: "keypad", role: "group", "aria-label": "Digit input" });
    rows.forEach(function (row) {
      row.forEach(function (v) {
        var btn;
        if (v === "clear") {
          btn = key("clear", "key", { "aria-label": "Delete digit", title: "Delete digit" });
        } else if (v === "submit") {
          btn = key("submit", "key key-ink", { "aria-label": "Submit entry", title: "Submit" });
        } else {
          btn = key(v, "key", { "aria-label": "Digit " + v });
        }
        wrap.appendChild(btn);
      });
    });
    return wrap;
  };

  Keypad.prototype.focus = function () {
    FOCUS = this;
    return this;
  };

  Keypad.prototype.blur = function () {
    if (FOCUS === this) FOCUS = null;
    return this;
  };

  Keypad.prototype.set = function (value) {
    this.value = String(value == null ? "" : value).replace(/\D/g, "").slice(0, this.max);
    this._notify();
    return this;
  };

  Keypad.prototype.clear = function () {
    this.value = "";
    this._notify();
    if (this.onClear) this.onClear();
    return this;
  };

  Keypad.prototype.press = function (key) {
    if (key === "submit") {
      if (this.value.length) {
        if (this.onSubmit) this.onSubmit(this.value);
      }
      return this;
    }
    if (key === "clear") {
      if (this.value.length) {
        this.value = this.value.slice(0, -1);
        this._notify();
      }
      return this;
    }
    var d = String(key);
    if (!/^\d$/.test(d)) return this;
    if (this.value.length >= this.max) return this;
    this.value += d;
    this._notify();
    if (this.value.length === this.max && this.onComplete) {
      this.onComplete(this.value);
    }
    return this;
  };

  Keypad.prototype._notify = function () {
    if (this.onChange) this.onChange(this.value);
  };

  Keypad.prototype.destroy = function () {
    this.blur();
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    return this;
  };

  X.Keypad = Keypad;
  X.Keypad.instance = function () { return FOCUS; };
  X.Keypad.handleGlobalKey = handleGlobalKey;
})(window);