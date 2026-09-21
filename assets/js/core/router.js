/* ==========================================================================
   Exotic — router
   Hash based, so the game also runs straight off the filesystem with no
   server rewrite rules. Views mount/unmount without a page navigation.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var Emitter = X.Emitter;
  var dom = X.dom;

  function parseHash(hash) {
    var raw = String(hash || "").replace(/^#/, "");
    if (!raw || raw === "/") return { path: "/", query: {}, hash: "" };
    var qIndex = raw.indexOf("?");
    var path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
    var search = qIndex >= 0 ? raw.slice(qIndex + 1) : "";
    var query = {};
    search.split("&").filter(Boolean).forEach(function (pair) {
      var eq = pair.indexOf("=");
      var k = eq >= 0 ? pair.slice(0, eq) : pair;
      var v = eq >= 0 ? pair.slice(eq + 1) : "";
      try { query[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, " ")); }
      catch (e) { query[k] = v; }
    });
    if (!path) path = "/";
    if (path[0] !== "/") path = "/" + path;
    path = path.replace(/\/+$/, "") || "/";
    return { path: path, query: query, hash: "" };
  }

  function matchRoute(pattern, path) {
    var pParts = pattern.split("/").filter(Boolean);
    var uParts = path.split("/").filter(Boolean);
    if (pParts.length !== uParts.length) return null;
    var params = {};
    for (var i = 0; i < pParts.length; i++) {
      if (pParts[i].charAt(0) === ":") {
        params[pParts[i].slice(1)] = decodeURIComponent(uParts[i]);
      } else if (pParts[i].toLowerCase() !== uParts[i].toLowerCase()) {
        return null;
      }
    }
    return params;
  }

  function build(route, params, query) {
    var path = route.replace(/:([A-Za-z0-9_]+)/g, function (_, key) {
      return encodeURIComponent((params && params[key]) != null ? params[key] : "");
    });
    var qs = "";
    if (query && Object.keys(query).length) {
      qs = "?" + Object.keys(query)
        .filter(function (k) { return query[k] != null && query[k] !== ""; })
        .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(query[k]); })
        .join("&");
    }
    return "#" + path + qs;
  }

  function Router() {
    Emitter.call(this);
    this.routes = [];
    this.current = null;
    this.previous = null;
    this.mounts = [];
    this.outlet = null;
    this._started = false;
    this._navigating = false;
    this._onHash = this._onHash.bind(this);
  }

  Router.prototype = Object.create(Emitter.prototype);
  Router.prototype.constructor = Router;

  Router.prototype.register = function (def) {
    /* def: { path, name, title, realm, auth, view, host } */
    this.routes.push(def);
    return this;
  };

  Router.prototype.registerAll = function (list) {
    var self = this;
    list.forEach(function (d) { self.register(d); });
    return this;
  };

  Router.prototype.resolve = function (path) {
    for (var i = 0; i < this.routes.length; i++) {
      var params = matchRoute(this.routes[i].path, path);
      if (params) return { def: this.routes[i], params: params };
    }
    return null;
  };

  Router.prototype.start = function (outlet) {
    this.outlet = typeof outlet === "string" ? dom.qs(outlet) : outlet;
    if (this._started) return this;
    this._started = true;
    global.addEventListener("hashchange", this._onHash);
    if (!global.location.hash || global.location.hash === "#") {
      global.location.replace(global.location.pathname + global.location.search + "#/");
    } else {
      this._onHash();
    }
    return this;
  };

  Router.prototype._onHash = function () {
    if (this._navigating) return;
    var loc = parseHash(global.location.hash);
    this._go(loc.path, loc.query, false);
  };

  Router.prototype.go = function (path, query, replace) {
    var target = "#" + path + (query && Object.keys(query).length
      ? "?" + Object.keys(query).map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(query[k]); }).join("&")
      : "");
    if (global.location.hash === target) return this;
    if (replace) global.location.replace(global.location.pathname + global.location.search + target);
    else global.location.hash = target;
    return this;
  };

  Router.prototype._go = function (path, query, force) {
    var found = this.resolve(path);
    if (!found) {
      this._navigating = false;
      this.emit("miss", path, query);
      return;
    }
    var def = found.def;

    /* route guard */
    if (def.guard && !force) {
      var verdict = def.guard(found.params, query, this);
      if (verdict) {
        if (typeof verdict === "string") this.go(verdict, null, true);
        return;
      }
    }

    var previous = this.current;
    if (previous && previous.def.view && previous.def.view.unmount) {
      try { previous.def.view.unmount(this.outlet, previous.context); } catch (e) { /* view teardown must never block nav */ }
    }
    this._teardownBindings();

    var ctx = {
      params: found.params,
      query: query || {},
      path: path,
      route: def,
      router: this,
      started: util.now()
    };

    this.previous = previous;
    this.current = { def: def, params: found.params, query: query || {}, context: ctx, path: path };

    if (this.outlet) {
      this.outlet.className = "app-main";
      this.outlet.setAttribute("data-view", def.name || "");
    }

    var self = this;
    var view = def.view;

    Promise.resolve()
      .then(function () {
        if (view && view.mount) return view.mount(self.outlet, ctx);
        if (view && view.render) return view.render(ctx);
        return null;
      })
      .then(function () {
        if (self.outlet) {
          self.outlet.classList.add("view-enter");
          setTimeout(function () { if (self.outlet) self.outlet.classList.remove("view-enter"); }, 460);
          self.outlet.scrollTop = 0;
        }
        global.scrollTo({ top: 0, behavior: "auto" });
        document.title = (def.title ? def.title + " — " : "") + "Exotic";
        self.emit("navigate", self.current, previous);
        self.emit("after:" + (def.name || ""), ctx);
        self._navigating = false;
      })
      .catch(function (err) {
        self._navigating = false;
        self.emit("error", err, def);
        if (global.console) global.console.error("[router] view failed:", def.name, err);
      });

    this.emit("before", this.current, previous);
    return this;
  };

  Router.prototype.reload = function () {
    if (!this.current) return this;
    return this._go(this.current.path, this.current.query, true);
  };

  Router.prototype._teardownBindings = function () {
    var list = this.mounts.splice(0, this.mounts.length);
    list.forEach(function (off) { try { if (typeof off === "function") off(); } catch (e) { /* noop */ } });
  };

  Router.prototype.bind = function (off) {
    if (typeof off === "function") this.mounts.push(off);
    return off;
  };

  Router.prototype.is = function (name) {
    return !!(this.current && this.current.def.name === name);
  };

  Router.prototype.href = function (route, params, query) {
    return build(route, params, query);
  };

  Router.prototype.link = function (route, params, query, label, className) {
    var a = dom.el("a", { href: build(route, params, query), class: className || "nav-link" }, label);
    return a;
  };

  X.Router = Router;
  X.parseHash = parseHash;
  X.matchRoute = matchRoute;
  X.buildHref = build;
})(window);
