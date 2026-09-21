/* ==========================================================================
   Exotic — Supabase client (built from scratch)
   PostgREST query builder + GoTrue auth + the Realtime Phoenix channel
   protocol, all over fetch and WebSocket. No SDK, no bundler, works from a
   plain static host and from the filesystem.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var Emitter = X.Emitter;

  var DEFAULT_SESSION_KEY = "sb.session.single";

  /* ------------------------------------------------------------ transport -- */

  function HttpError(message, status, body) {
    var err = new Error(message);
    err.status = status;
    err.body = body;
    err.name = "SupabaseError";
    return err;
  }

  function Client(sessionKey) {
    Emitter.call(this);
    this.url = "";
    this.key = "";
    this.sessionKey = sessionKey || DEFAULT_SESSION_KEY;
    this.session = util.storage.get(this.sessionKey, null);
    this._refreshPromise = null;
    this._sockets = {};
  }
  Client.prototype = Object.create(Emitter.prototype);
  Client.prototype.constructor = Client;

  Client.prototype.configure = function (url, key) {
    var clean = String(url || "").replace(/\/+$/, "");
    if (clean === this.url && key === this.key) return this;
    this.url = clean;
    this.key = key || "";
    return this;
  };

  Client.prototype.isReady = function () {
    return !!(this.url && this.key && /^https?:\/\//.test(this.url));
  };

  /* --------------------------------------------------------------- auth ---- */

  Client.prototype._saveSession = function (session) {
    this.session = session;
    if (session) util.storage.set(this.sessionKey, session);
    else util.storage.remove(this.sessionKey);
    this.emit("auth", session);
    return session;
  };

  Client.prototype.user = function () {
    return this.session ? this.session.user : null;
  };

  Client.prototype.isSignedIn = function () {
    return !!(this.session && this.session.access_token);
  };

  Client.prototype._tokenFresh = function () {
    if (!this.session) return false;
    if (!this.session.expires_at) return true;
    return this.session.expires_at * 1000 - Date.now() > 60000;
  };

  Client.prototype.ensureToken = function () {
    var self = this;
    if (!this.session) return Promise.resolve(null);
    if (this._tokenFresh()) return Promise.resolve(this.session.access_token);
    if (this._refreshPromise) return this._refreshPromise;
    this._refreshPromise = this._authFetch("/auth/v1/token?grant_type=refresh_token", {
      refresh_token: this.session.refresh_token
    }).then(function (data) {
      self._refreshPromise = null;
      return self._saveSession(data).access_token;
    }).catch(function (err) {
      self._refreshPromise = null;
      self._saveSession(null);
      throw err;
    });
    return this._refreshPromise;
  };

  Client.prototype._authFetch = function (path, body, method) {
    var self = this;
    return fetch(this.url + path, {
      method: method || "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: this.key,
        Authorization: "Bearer " + (this.session ? this.session.access_token : this.key)
      },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (!res.ok) {
          var msg = (data && (data.error_description || data.msg || data.message || data.error)) || ("Auth failed (" + res.status + ")");
          throw HttpError(msg, res.status, data);
        }
        return data;
      });
    });
  };

  Client.prototype.signUp = function (creds) {
    var self = this;
    return this._authFetch("/auth/v1/signup", {
      email: creds.email,
      password: creds.password,
      data: creds.data || {}
    }).then(function (data) {
      if (data && data.access_token) return self._saveSession(data);
      /* email confirmation is on — surface a distinct signal */
      self.emit("confirm", creds.email);
      return { pending: true, user: data && data.user ? data.user : null };
    });
  };

  Client.prototype.signIn = function (creds) {
    var self = this;
    return this._authFetch("/auth/v1/token?grant_type=password", {
      email: creds.email,
      password: creds.password
    }).then(function (data) { return self._saveSession(data); });
  };

  Client.prototype.signInWithOtp = function (email) {
    return this._authFetch("/auth/v1/otp", { email: email, create_user: true });
  };

  Client.prototype.verifyOtp = function (email, token) {
    var self = this;
    return this._authFetch("/auth/v1/verify", { email: email, token: token, type: "email" })
      .then(function (data) { return self._saveSession(data); });
  };

  Client.prototype.resetPassword = function (email) {
    return this._authFetch("/auth/v1/recover", { email: email });
  };

  Client.prototype.signOut = function () {
    var self = this;
    var done = function () { self._saveSession(null); };
    if (!this.session) { done(); return Promise.resolve(); }
    return this._authFetch("/auth/v1/logout", null, "POST").then(done).catch(done);
  };

  Client.prototype.updateUser = function (patch) {
    var self = this;
    return this._authFetch("/auth/v1/user", patch, "PUT").then(function (user) {
      if (self.session) {
        self.session.user = user;
        self._saveSession(self.session);
      }
      return user;
    });
  };

  /* ----------------------------------------------------------- postgrest -- */

  function Query(client, table) {
    this.client = client;
    this.table = table;
    this._method = "GET";
    this._body = null;
    this._params = [];
    this._headers = {};
    this._single = null;
    this._count = null;
    this._returning = null;
  }

  Query.prototype._add = function (key, value) {
    this._params.push([key, value]);
    return this;
  };

  Query.prototype.select = function (columns) {
    this._method = "GET";
    this._add("select", columns || "*");
    return this;
  };

  Query.prototype.insert = function (rows) {
    this._method = "POST";
    this._body = rows;
    this._headers.Prefer = "return=representation";
    return this;
  };

  Query.prototype.upsert = function (rows, onConflict) {
    this._method = "POST";
    this._body = rows;
    this._headers.Prefer = "resolution=merge-duplicates,return=representation";
    if (onConflict) this._add("on_conflict", onConflict);
    return this;
  };

  Query.prototype.update = function (patch) {
    this._method = "PATCH";
    this._body = patch;
    this._headers.Prefer = "return=representation";
    return this;
  };

  Query.prototype.delete = function () {
    this._method = "DELETE";
    this._headers.Prefer = "return=representation";
    return this;
  };

  Query.prototype.eq = function (col, val) { return this._add(col, "eq." + val); };
  Query.prototype.neq = function (col, val) { return this._add(col, "neq." + val); };
  Query.prototype.gt = function (col, val) { return this._add(col, "gt." + val); };
  Query.prototype.gte = function (col, val) { return this._add(col, "gte." + val); };
  Query.prototype.lt = function (col, val) { return this._add(col, "lt." + val); };
  Query.prototype.lte = function (col, val) { return this._add(col, "lte." + val); };
  Query.prototype.like = function (col, val) { return this._add(col, "like." + val); };
  Query.prototype.ilike = function (col, val) { return this._add(col, "ilike." + val); };
  Query.prototype.is = function (col, val) { return this._add(col, "is." + val); };
  Query.prototype.in = function (col, vals) { return this._add(col, "in.(" + vals.join(",") + ")"); };
  Query.prototype.contains = function (col, val) { return this._add(col, "cs." + JSON.stringify(val)); };
  Query.prototype.order = function (col, opts) {
    var o = opts || {};
    return this._add("order", col + "." + (o.ascending === false ? "desc" : "asc") + (o.nullsFirst ? ".nullsfirst" : ""));
  };
  Query.prototype.limit = function (n) { return this._add("limit", n); };
  Query.prototype.range = function (from, to) {
    this._headers.Range = from + "-" + to;
    this._headers["Range-Unit"] = "items";
    return this;
  };
  Query.prototype.count = function (mode) {
    this._count = mode || "exact";
    var pref = this._headers.Prefer || "";
    this._headers.Prefer = (pref ? pref + "," : "") + "count=" + this._count;
    return this;
  };
  Query.prototype.single = function () { this._single = "single"; this._headers.Accept = "application/vnd.pgrst.object+json"; return this; };
  Query.prototype.maybeSingle = function () { this._single = "maybe"; this._headers.Accept = "application/vnd.pgrst.object+json"; return this; };

  Query.prototype._url = function () {
    var qs = this._params.map(function (p) {
      return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]);
    }).join("&");
    return this.client.url + "/rest/v1/" + this.table + (qs ? "?" + qs : "");
  };

  Query.prototype.then = function (onOk, onErr) {
    return this._run().then(onOk, onErr);
  };
  Query.prototype.catch = function (fn) { return this._run().catch(fn); };
  Query.prototype.finally = function (fn) { return this._run().finally(fn); };

  Query.prototype._run = function () {
    var self = this;
    if (!this.client.isReady()) {
      return Promise.reject(HttpError("Supabase is not configured", 0, null));
    }
    return this.client.ensureToken().then(function (token) {
      var headers = util.merge({
        "Content-Type": "application/json",
        apikey: self.client.key,
        Authorization: "Bearer " + (token || self.client.key)
      }, self._headers);

      return fetch(self._url(), {
        method: self._method === "GET" ? "GET" : self._method,
        headers: headers,
        body: self._body == null ? undefined : JSON.stringify(self._body)
      }).then(function (res) {
        var contentRange = res.headers.get("content-range");
        return res.text().then(function (text) {
          var data = null;
          if (text) {
            try { data = JSON.parse(text); } catch (e) { data = text; }
          }
          if (!res.ok) {
            var message = (data && (data.message || data.hint || data.error)) || ("Request failed (" + res.status + ")");
            throw HttpError(message, res.status, data);
          }
          if (self._count && contentRange) {
            var total = parseInt(contentRange.split("/")[1], 10);
            return { data: data, count: isNaN(total) ? (Array.isArray(data) ? data.length : 0) : total };
          }
          if (self._single === "single") {
            if (Array.isArray(data)) {
              if (!data.length) throw HttpError("No rows returned", 406, data);
              data = data[0];
            }
            if (!data) throw HttpError("No rows returned", 406, null);
          }
          if (self._single === "maybe" && Array.isArray(data)) data = data[0] || null;
          return data;
        });
      });
    });
  };

  Client.prototype.from = function (table) { return new Query(this, table); };

  Client.prototype.rpc = function (fn, args) {
    var client = this;
    var url = this.url + "/rest/v1/rpc/" + fn;
    return this.ensureToken().then(function (token) {
      return fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: client.key,
          Authorization: "Bearer " + (token || client.key)
        },
        body: JSON.stringify(args || {})
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
          if (!res.ok) {
            throw HttpError((data && (data.message || data.error)) || "RPC failed", res.status, data);
          }
          return data;
        });
      });
    });
  };

  Client.prototype.invoke = function (name, body, opts) {
    var client = this;
    var o = opts || {};
    var url = this.url + "/functions/v1/" + name;
    return this.ensureToken().then(function (token) {
      return fetch(url, {
        method: o.method || "POST",
        headers: util.merge({
          "Content-Type": "application/json",
          apikey: client.key,
          Authorization: "Bearer " + (token || client.key)
        }, o.headers || {}),
        body: o.method === "GET" ? undefined : JSON.stringify(body || {})
      }).then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
          if (!res.ok) throw HttpError((data && data.error) || ("Edge function " + name + " failed"), res.status, data);
          return data;
        });
      });
    });
  };

  /* ------------------------------------------------------------ realtime -- */

  function Channel(client, topic, opts) {
    Emitter.call(this);
    this.client = client;
    this.topic = "realtime:" + topic;
    this.name = topic;
    this.opts = opts || {};
    this.ref = 0;
    this.joined = false;
    this.socket = null;
    this._handlers = [];
    this._heartbeat = null;
    this._queue = [];
  }
  Channel.prototype = Object.create(Emitter.prototype);
  Channel.prototype.constructor = Channel;

  Channel.prototype.on = function (type, filter, cb) {
    var handler = { type: type, filter: filter, cb: cb };
    this._handlers.push(handler);
    if (this.joined) this._sendJoin();
    return this;
  };

  Channel.prototype.onPostgres = function (table, cb, filter) {
    return this.on("postgres_changes", util.merge({ event: "*", schema: "public", table: table }, filter || {}), cb);
  };

  Channel.prototype.onBroadcast = function (event, cb) {
    return this.on("broadcast", { event: event }, cb);
  };

  Channel.prototype.onPresence = function (cb, opts) {
    var o = opts || {};
    this._presenceCb = cb;
    if (o.key) this._presenceKey = o.key;
    return this;
  };

  Channel.prototype._sendJoin = function () {
    var self = this;
    var pg = this._handlers.filter(function (h) { return h.type === "postgres_changes"; }).map(function (h) { return h.filter; });
    var bc = this._handlers.filter(function (h) { return h.type === "broadcast"; }).map(function (h) { return { event: h.filter.event }; });
    var payload = {
      config: {
        broadcast: { self: this.opts.broadcastSelf !== false, ack: false },
        presence: this._presenceCb ? { key: this._presenceKey || "" } : undefined,
        postgres_changes: pg.length ? pg : undefined,
        private: !!this.opts.private
      },
      access_token: this.client.session ? this.client.session.access_token : undefined
    };
    if (!pg.length) delete payload.config.postgres_changes;
    if (!bc.length) delete payload.config.broadcast;
    if (!this._presenceCb) delete payload.config.presence;

    this.socket.send(JSON.stringify({
      topic: this.topic,
      event: "phx_join",
      payload: payload,
      ref: String(++this.ref)
    }));
  };

  Channel.prototype.send = function (event, payload) {
    var msg = {
      topic: this.topic,
      event: "broadcast",
      payload: { type: "broadcast", event: event, payload: payload || {} },
      ref: String(++this.ref)
    };
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(msg));
    else this._queue.push(msg);
    return this;
  };

  Channel.prototype.track = function (state) {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify({
        topic: this.topic,
        event: "presence",
        payload: { type: "presence", event: "track", payload: state || {} },
        ref: String(++this.ref)
      }));
    }
    return this;
  };

  Channel.prototype.untrack = function () {
    if (this.socket && this.socket.readyState === 1) {
      this.socket.send(JSON.stringify({
        topic: this.topic,
        event: "presence",
        payload: { type: "presence", event: "untrack", payload: {} },
        ref: String(++this.ref)
      }));
    }
    return this;
  };

  Channel.prototype._onMessage = function (msg) {
    var self = this;
    if (msg.event === "phx_reply") {
      if (msg.payload && msg.payload.status === "ok") {
        this.joined = true;
        this.emit("joined", msg.payload.response || {});
        while (this._queue.length) this.socket.send(JSON.stringify(this._queue.shift()));
        if (this._presenceCb) this.track(this._presenceState || {});
      } else if (msg.payload && msg.payload.status === "error") {
        this.emit("error", msg.payload.response);
      }
      return;
    }
    if (msg.event === "postgres_changes") {
      var d = msg.payload && msg.payload.data ? msg.payload.data : msg.payload;
      this.emit("change", d);
      this.emit("change:" + (d && d.table), d);
      return;
    }
    if (msg.event === "broadcast") {
      var ev = msg.payload && msg.payload.event;
      this.emit("broadcast", msg.payload);
      this.emit("broadcast:" + ev, msg.payload && msg.payload.payload);
      return;
    }
    if (msg.event === "presence_state") {
      this._presence = this._parsePresence(msg.payload);
      if (this._presenceCb) this._presenceCb(this._presence);
      this.emit("presence", this._presence);
      return;
    }
    if (msg.event === "presence_diff") {
      var next = util.merge({}, this._presence || {});
      var joins = msg.payload && msg.payload.joins ? msg.payload.joins : {};
      var leaves = msg.payload && msg.payload.leaves ? msg.payload.leaves : {};
      Object.keys(joins).forEach(function (k) { next[k] = joins[k].metas ? joins[k].metas[0] : joins[k]; });
      Object.keys(leaves).forEach(function (k) { delete next[k]; });
      this._presence = next;
      if (this._presenceCb) this._presenceCb(next);
      this.emit("presence", next);
      return;
    }
    if (msg.event === "system") {
      this.emit("system", msg.payload);
      return;
    }
    void self;
  };

  Channel.prototype._parsePresence = function (state) {
    var out = {};
    if (!state) return out;
    Object.keys(state).forEach(function (key) {
      var entry = state[key];
      out[key] = entry.metas && entry.metas.length ? entry.metas[0] : entry;
    });
    return out;
  };

  Channel.prototype.subscribe = function (timeoutMs) {
    var self = this;
    var client = this.client;
    var wsUrl = client.url.replace(/^http/, "ws") +
      "/realtime/v1/websocket?apikey=" + encodeURIComponent(client.key) + "&vsn=1.0.0";

    if (!client._sockets[wsUrl]) {
      var socket = new WebSocket(wsUrl);
      socket._channels = [];
      socket.onmessage = function (e) {
        var msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        if (!msg.topic) return;
        socket._channels.forEach(function (ch) {
          if (ch.topic === msg.topic) ch._onMessage(msg);
        });
      };
      socket.onclose = function () {
        socket._channels.forEach(function (ch) {
          ch.joined = false;
          ch.emit("closed");
        });
      };
      client._sockets[wsUrl] = socket;
    }

    this.socket = client._sockets[wsUrl];
    var begin = function () {
      self._sendJoin();
      if (!self._heartbeat) {
        self._heartbeat = setInterval(function () {
          if (self.socket.readyState === 1) {
            self.socket.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++self.ref) }));
          }
        }, 25000);
      }
    };
    if (this.socket.readyState === 1) begin();
    else this.socket.addEventListener("open", begin, { once: true });
    this.socket._channels.push(this);

    return new Promise(function (resolve) {
      var settled = false;
      var finish = function (v) { if (!settled) { settled = true; resolve(v); } };
      self.once("joined", function () { finish(self); });
      self.once("error", function () { finish(null); });
      setTimeout(function () { finish(self.joined ? self : null); }, timeoutMs || 6000);
    });
  };

  Channel.prototype.unsubscribe = function () {
    if (this._heartbeat) { clearInterval(this._heartbeat); this._heartbeat = null; }
    if (this.socket) {
      if (this.socket.readyState === 1) {
        this.socket.send(JSON.stringify({
          topic: this.topic,
          event: "phx_leave",
          payload: {},
          ref: String(++this.ref)
        }));
      }
      var idx = this.socket._channels.indexOf(this);
      if (idx >= 0) this.socket._channels.splice(idx, 1);
    }
    this.joined = false;
    this.emit("left");
    return this;
  };

  Client.prototype.channel = function (topic, opts) {
    return new Channel(this, topic, opts);
  };

  Client.prototype.removeAllChannels = function () {
    var self = this;
    Object.keys(this._sockets).forEach(function (k) {
      try { self._sockets[k].close(); } catch (e) { /* noop */ }
      delete self._sockets[k];
    });
    return this;
  };

  /* Two realms, two sessions, two clients. Single-player sign-in and
     multiplayer sign-in never share a token, so a player can be signed into
     both with different accounts. */
  var single = new Client("sb.session.single");
  var multi = new Client("sb.session.multi");

  function SBfor(realm) { return realm === "multi" ? multi : single; }

  X.SB = single;
  X.SBm = multi;
  X.SBfor = SBfor;
  X.SupabaseError = HttpError;
})(window);
