/* ==========================================================================
   Exotic — emitter
   Minimal synchronous event bus. Every subsystem talks through this so views
   never reach into each other directly.
   ========================================================================== */
(function (global) {
  "use strict";

  function Emitter() {
    this._handlers = Object.create(null);
  }

  Emitter.prototype.on = function (type, fn, ctx) {
    if (typeof fn !== "function") throw new TypeError("handler must be a function");
    (this._handlers[type] || (this._handlers[type] = [])).push({ fn: fn, ctx: ctx || null, once: false });
    var self = this;
    return function off() { self.off(type, fn); };
  };

  Emitter.prototype.once = function (type, fn, ctx) {
    var self = this;
    var wrapped = function () {
      self.off(type, fn);
      fn.apply(ctx || null, arguments);
    };
    (this._handlers[type] || (this._handlers[type] = [])).push({ fn: fn, ctx: ctx || null, once: true, wrapped: wrapped });
    return function off() { self.off(type, fn); };
  };

  Emitter.prototype.off = function (type, fn) {
    var list = this._handlers[type];
    if (!list) return this;
    if (!fn) { delete this._handlers[type]; return this; }
    for (var i = list.length - 1; i >= 0; i--) {
      if (list[i].fn === fn) list.splice(i, 1);
    }
    return this;
  };

  Emitter.prototype.emit = function (type) {
    var list = this._handlers[type];
    var any = this._handlers["*"];
    var args = Array.prototype.slice.call(arguments, 1);
    if (list) {
      list = list.slice();
      for (var i = 0; i < list.length; i++) {
        var h = list[i];
        var target = h.once && h.wrapped ? h.wrapped : h.fn;
        if (!h.once) target.apply(h.ctx, args);
        else target.apply(h.ctx, args);
      }
    }
    if (any) {
      any = any.slice();
      for (var j = 0; j < any.length; j++) {
        any[j].fn.apply(any[j].ctx, [type].concat(args));
      }
    }
    return this;
  };

  Emitter.prototype.listeners = function (type) {
    return (this._handlers[type] || []).length;
  };

  Emitter.prototype.clear = function () {
    this._handlers = Object.create(null);
    return this;
  };

  global.Exotic = global.Exotic || {};
  global.Exotic.Emitter = Emitter;
})(window);
