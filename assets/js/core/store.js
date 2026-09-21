/* ==========================================================================
   Exotic — store
   Observable state container with dotted paths, batching and persistence.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var Emitter = X.Emitter;

  function getPath(obj, path) {
    var parts = String(path).split(".");
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = String(path).split(".");
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i];
      if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
      cur = cur[k];
    }
    cur[parts[parts.length - 1]] = value;
    return obj;
  }

  function Store(initial, opts) {
    Emitter.call(this);
    this._state = initial || {};
    this._opts = util.merge({ persist: null, name: "store" }, opts || {});
    this._batch = 0;
    this._pending = Object.create(null);

    if (this._opts.persist) {
      var saved = util.storage.get(this._opts.persist, null);
      if (saved && typeof saved === "object") this._state = util.merge(this._state, saved);
      this._loaded = !!saved;
    }
  }

  Store.prototype = Object.create(Emitter.prototype);
  Store.prototype.constructor = Store;

  Store.prototype.get = function (path) {
    if (path == null) return this._state;
    return getPath(this._state, path);
  };

  Store.prototype.set = function (path, value) {
    var prev = this.get(path);
    if (prev === value) return this;
    if (typeof path === "object") {
      this._state = util.merge(this._state, path);
      path = "*";
      prev = undefined;
    } else {
      setPath(this._state, path, value);
    }
    this._queue(path, value, prev);
    return this;
  };

  Store.prototype.update = function (path, fn) {
    var next = fn(this.get(path));
    return this.set(path, next);
  };

  Store.prototype.toggle = function (path) {
    return this.set(path, !this.get(path));
  };

  Store.prototype.push = function (path, item) {
    var arr = this.get(path) || [];
    arr = arr.concat([item]);
    return this.set(path, arr);
  };

  Store.prototype.remove = function (path, predicate) {
    var arr = this.get(path) || [];
    return this.set(path, arr.filter(function (i) { return !predicate(i); }));
  };

  Store.prototype.reset = function (initial) {
    this._state = initial || {};
    this._flush();
    this.emit("reset", this._state);
    return this;
  };

  Store.prototype.batch = function (fn) {
    this._batch++;
    try { fn(this); } finally {
      this._batch--;
      if (this._batch === 0) this._flush();
    }
    return this;
  };

  Store.prototype._queue = function (path, value, prev) {
    this._pending[path] = { value: value, prev: prev };
    if (this._batch === 0) this._flush();
  };

  Store.prototype._flush = function () {
    var pending = this._pending;
    this._pending = Object.create(null);
    var keys = Object.keys(pending);
    if (!keys.length) return;
    this._persist();
    var self = this;
    keys.forEach(function (k) {
      self.emit("change:" + k, pending[k].value, pending[k].prev);
    });
    this.emit("change", this._state, keys);
  };

  Store.prototype._persist = util.debounce(function () {
    if (!this._opts.persist) return;
    util.storage.set(this._opts.persist, this._state);
  }, 220);

  X.Store = Store;
  X.getPath = getPath;
  X.setPath = setPath;
})(window);
