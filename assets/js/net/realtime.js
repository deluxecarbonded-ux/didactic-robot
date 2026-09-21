/* ==========================================================================
   Exotic — realtime
   Every live surface in Exotic is declared here once and reused: room state,
   presence, rival progress, chat, profile mutations, shop catalogue changes
   and leaderboard shifts. Nothing here requires a page refresh or a
   navigation — the views subscribe and re-render in place.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var Emitter = X.Emitter;

  function Realtime() {
    Emitter.call(this);
    this.live = [];
    this.connected = false;
    this.degraded = false;
  }
  Realtime.prototype = Object.create(Emitter.prototype);
  Realtime.prototype.constructor = Realtime;

  function sb(realm) { return X.SBfor(realm || "multi"); }

  Realtime.prototype.available = function (realm) {
    return sb(realm).isReady() && typeof global.WebSocket !== "undefined";
  };

  /**
   * Shared bookkeeping so views can close everything with one call.
   * @returns {{close:Function, channels:Array}}
   */
  function handle(channels) {
    var closed = false;
    return {
      channels: channels,
      close: function () {
        if (closed) return;
        closed = true;
        channels.forEach(function (ch) {
          try { ch.unsubscribe(); } catch (e) { /* noop */ }
        });
      }
    };
  }

  Realtime.prototype._track = function (h) {
    var self = this;
    this.live.push(h);
    var original = h.close;
    h.close = function () {
      original();
      var i = self.live.indexOf(h);
      if (i >= 0) self.live.splice(i, 1);
    };
    return h;
  };

  Realtime.prototype.closeAll = function () {
    this.live.splice(0, this.live.length).forEach(function (h) {
      try { h.close(); } catch (e) { /* noop */ }
    });
  };

  /* ------------------------------------------------------------- rooms --- */

  /**
   * Full live room: state, players, events, chat and presence.
   * @param {string} roomId
   * @param {{onRoom:Function,onPlayers:Function,onEvent:Function,onChat:Function,onPresence:Function,onStatus:Function}} cb
   */
  Realtime.prototype.room = function (roomId, cb) {
    var c = cb || {};
    var conn = sb("multi");
    var channels = [];

    var state = conn.channel("room-state-" + roomId);
    state.onPostgres("mp_rooms", function (msg) {
      if (c.onRoom && msg.record) c.onRoom(msg.type, msg.record, msg.old_record);
    }, { filter: "id=eq." + roomId });
    channels.push(state);

    var players = conn.channel("room-players-" + roomId);
    players.onPostgres("mp_room_players", function (msg) {
      if (c.onPlayers) c.onPlayers(msg.type, msg.record, msg.old_record);
    }, { filter: "room_id=eq." + roomId });
    channels.push(players);

    var events = conn.channel("room-events-" + roomId);
    events.onPostgres("mp_room_events", function (msg) {
      if (c.onEvent) c.onEvent(msg.type, msg.record);
    }, { filter: "room_id=eq." + roomId });
    ["start", "progress", "finish", "emote", "action", "sabotage"].forEach(function (t) {
      events.onBroadcast(t, function (payload) {
        if (c.onEvent) c.onEvent("broadcast", util.merge({ kind: t }, payload || {}));
      });
    });
    channels.push(events);

    var chat = conn.channel("room-chat-" + roomId);
    chat.onPostgres("mp_chat", function (msg) {
      if (c.onChat && msg.record) c.onChat(msg.record);
    }, { filter: "room_id=eq." + roomId });
    chat.onBroadcast("chat", function (payload) {
      if (c.onChat) c.onChat(payload);
    });
    channels.push(chat);

    Promise.all(channels.map(function (ch) { return ch.subscribe(); })).then(function (results) {
      var ok = results.some(function (r) { return !!r; });
      if (c.onStatus) c.onStatus(ok ? "live" : "degraded");
      if (ok) {
        chat.onPresence(function (presence) {
          if (c.onPresence) c.onPresence(presence);
        });
      }
    });

    return this._track(handle(channels));
  };

  /** Broadcast a player action (guess, sabotage, emote) without a DB round trip. */
  Realtime.prototype.roomAction = function (roomId, event, payload) {
    var ch = sb("multi").channel("room-events-" + roomId);
    ch.subscribe().then(function () {
      ch.send(event, payload);
      setTimeout(function () { ch.unsubscribe(); }, 900);
    });
    return this;
  };

  /** Lobby list: new rooms appearing, rooms filling, rooms closing. */
  Realtime.prototype.lobby = function (cb) {
    var c = cb || {};
    var list = sb("multi").channel("lobby-rooms");
    list.onPostgres("mp_rooms", function (msg) {
      if (c.onChange) c.onChange(msg.type, msg.record, msg.old_record);
    }, {});
    var presence = sb("multi").channel("lobby-presence", { broadcastSelf: false });
    presence.onPresence(function (p) {
      if (c.onPresence) c.onPresence(p);
    });
    var channels = [list, presence];
    Promise.all(channels.map(function (ch) { return ch.subscribe(); })).then(function (r) {
      if (c.onStatus) c.onStatus(r.some(Boolean) ? "live" : "degraded");
    });
    return this._track(handle(channels));
  };

  /* ---------------------------------------------------------- profiles --- */

  Realtime.prototype.profile = function (realm, userId, cb) {
    var table = realm === "multi" ? "mp_profiles" : "sp_profiles";
    var ch = sb(realm).channel("profile-" + realm + "-" + userId);
    ch.onPostgres(table, function (msg) {
      if (cb.onChange && msg.record) cb.onChange(msg.type, msg.record);
    }, { filter: "id=eq." + userId });
    ch.subscribe().then(function (r) {
      if (!r && cb.onStatus) cb.onStatus("degraded");
    });
    return this._track(handle([ch]));
  };

  Realtime.prototype.inventory = function (realm, userId, cb) {
    var table = realm === "multi" ? "mp_inventory" : "sp_inventory";
    var ch = sb(realm).channel("inv-" + realm + "-" + userId);
    ch.onPostgres(table, function (msg) {
      if (cb.onChange) cb.onChange(msg.type, msg.record);
    }, { filter: "profile_id=eq." + userId });
    ch.subscribe();
    return this._track(handle([ch]));
  };

  /* ------------------------------------------------------ leaderboards --- */

  Realtime.prototype.leaderboard = function (realm, cb) {
    var view = realm === "multi" ? "mp_profiles" : "sp_profiles";
    var ch = sb(realm).channel("board-" + realm);
    ch.onPostgres(view, function (msg) {
      if (cb.onChange) cb.onChange(msg.type, msg.record);
    }, {});
    ch.subscribe().then(function (r) { if (cb.onStatus) cb.onStatus(r ? "live" : "degraded"); });
    return this._track(handle([ch]));
  };

  /* ------------------------------------------------------------ shop ----- */

  Realtime.prototype.shop = function (realm, cb) {
    var table = realm === "multi" ? "mp_shop_items" : "sp_shop_items";
    var ch = sb(realm).channel("shop-" + realm);
    ch.onPostgres(table, function (msg) {
      if (cb.onChange) cb.onChange(msg.type, msg.record);
    }, {});
    var purchases = sb(realm).channel("shop-buys-" + realm);
    purchases.onPostgres(realm === "multi" ? "mp_purchases" : "sp_purchases", function (msg) {
      if (cb.onPurchase) cb.onPurchase(msg.type, msg.record);
    }, {});
    ch.subscribe();
    purchases.subscribe();
    return this._track(handle([ch, purchases]));
  };

  /* ------------------------------------------------------------ run ------ */

  /** Cross-device resume: the same account picks up an in-flight run elsewhere. */
  Realtime.prototype.run = function (realm, userId, cb) {
    var table = realm === "multi" ? "mp_runs" : "sp_runs";
    var ch = sb(realm).channel("run-" + realm + "-" + userId);
    ch.onPostgres(table, function (msg) {
      if (cb.onChange && msg.record) cb.onChange(msg.type, msg.record);
    }, { filter: "profile_id=eq." + userId });
    ch.subscribe();
    return this._track(handle([ch]));
  };

  /* --------------------------------------------------------- heartbeat --- */

  Realtime.prototype.ping = function () {
    if (!this.available()) return Promise.resolve(false);
    var ch = sb().channel("ping");
    return ch.subscribe(3000).then(function (r) {
      ch.unsubscribe();
      return !!r;
    });
  };

  X.Realtime = new Realtime();
})(window);
