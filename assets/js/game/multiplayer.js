/* ==========================================================================
   Exotic — multiplayer
   The Core realm. Rooms live in Supabase (mp_rooms / mp_room_players /
   mp_room_events / mp_chat / mp_results) and stream over realtime, so nobody
   ever reloads a page mid-match. When Supabase is absent the lobby offers a
   genuine local hotseat: the same seeded cipher, passed around one device.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;
  var CFG = X.config;
  var Emitter = X.Emitter;

  function Multiplayer() {
    Emitter.call(this);
    this.room = null;
    this.players = [];
    this.me = null;
    this.session = null;
    this.handle = null;
    this.status = "idle";
    this.events = [];
    this.chat = [];
    this.presence = [];
    this.winner = null;
    this.hotseat = null;
    this._lastProgress = 0;
    this._lastRowWrite = 0;
  }
  Multiplayer.prototype = Object.create(Emitter.prototype);
  Multiplayer.prototype.constructor = Multiplayer;

  /* --------------------------------------------------------------- helpers */

  Multiplayer.prototype.realm = "multi";

  Multiplayer.prototype.available = function () {
    return CFG.isCloudReady() && X.SBm.isReady();
  };

  Multiplayer.prototype.online = function () {
    return this.available() && !!X.Cloud.realm("multi").profile;
  };

  Multiplayer.prototype.profileId = function () {
    var R = X.Cloud.realm("multi");
    return R.profile ? R.profile.id : null;
  };

  Multiplayer.prototype.myName = function () {
    var p = X.Cloud.realm("multi").profile;
    if (!p) return "Cipher";
    return p.display_name || p.username || "Cipher";
  };

  Multiplayer.prototype.wallet = function () {
    return X.Cloud.realm("multi").balance();
  };

  Multiplayer.prototype.inRoom = function () {
    return !!this.room;
  };

  Multiplayer.prototype.isHost = function () {
    return !!(this.room && this.profileId() && this.room.host_id === this.profileId());
  };

  Multiplayer.prototype.roomCode = function () {
    return this.room ? this.room.code : null;
  };

  Multiplayer.prototype.mode = function () {
    return this.room ? CFG.mode(this.room.mode) : CFG.mode("duel");
  };

  Multiplayer.prototype.listRooms = function () {
    if (!this.available()) return Promise.resolve([]);
    return X.Cloud.realm("multi").rooms.list();
  };

  /* ----------------------------------------------------------- entering -- */

  Multiplayer.prototype.createRoom = function (opts) {
    var self = this;
    var o = opts || {};
    if (!this.available()) {
      return Promise.reject(new Error("Multiplayer rooms need Supabase. Connect it in Settings, or play a local hotseat."));
    }
    var R = X.Cloud.realm("multi");
    if (!R.profile) return Promise.reject(new Error("Sign in to the Core realm first."));
    var mode = CFG.mode(o.mode);
    return R.rooms.create({
      hostId: R.profile.id,
      hostName: this.myName(),
      mode: mode.id,
      tier: o.tier || CFG.get("defaultTier"),
      ranked: !!o.ranked,
      seed: util.uid("seed")
    }).then(function (room) {
      return self._enter(room);
    });
  };

  Multiplayer.prototype.joinByCode = function (code) {
    var self = this;
    if (!this.available()) {
      return Promise.reject(new Error("Multiplayer rooms need Supabase. Connect it in Settings, or play a local hotseat."));
    }
    var R = X.Cloud.realm("multi");
    if (!R.profile) return Promise.reject(new Error("Sign in to the Core realm first."));
    return R.rooms.byCode(code).then(function (room) {
      if (!room) throw new Error("No open room with that code.");
      if (room.status !== "open") throw new Error("That match has already started.");
      if ((room.player_count || 0) >= (room.max_players || 4)) throw new Error("That room is full.");
      return self._enter(room);
    });
  };

  Multiplayer.prototype.joinById = function (roomId) {
    var self = this;
    if (!this.available()) return Promise.reject(new Error("Multiplayer rooms need Supabase."));
    var R = X.Cloud.realm("multi");
    if (!R.profile) return Promise.reject(new Error("Sign in to the Core realm first."));
    return R.rooms.byId(roomId).then(function (room) {
      if (!room) throw new Error("That room has closed.");
      if (room.status !== "open") throw new Error("That match has already started.");
      return self._enter(room);
    });
  };

  Multiplayer.prototype._enter = function (room) {
    var self = this;
    var R = X.Cloud.realm("multi");
    var pid = R.profile.id;
    this.room = room;
    this.players = [];
    this.events = [];
    this.chat = [];
    this.winner = null;

    var seedRow = {
      profile_id: pid,
      name: this.myName(),
      avatar_seed: R.profile.avatar_seed,
      ready: false,
      solved: 0,
      total: CFG.mode(room.mode).puzzles,
      finished_at: null,
      placement: null,
      outcome: null
    };

    return R.rooms.join(room.id, seedRow).then(function (player) {
      self.me = player || seedRow;
      return R.rooms.players(room.id);
    }).then(function (players) {
      self.players = players || [];
      return R.rooms.update(room.id, { player_count: self.players.length });
    }).then(function () {
      self._subscribe();
      self.emit("enter", self.room, self.players);
      if (self.room.status === "live" && !self.session) self._begin(self.room);
      return self.room;
    });
  };

  Multiplayer.prototype._subscribe = function () {
    var self = this;
    if (this.handle) this.handle.close();
    this.handle = X.Realtime.room(this.room.id, {
      onRoom: function (type, record) { self._onRoom(type, record); },
      onPlayers: function (type, record) { self._onPlayer(type, record); },
      onEvent: function (type, record) { self._onEvent(type, record); },
      onChat: function (payload) { self._onChat(payload); },
      onPresence: function (p) { self.presence = p || []; self.emit("presence", self.presence); },
      onStatus: function (s) { self.status = s; self.emit("status", s); }
    });
  };

  Multiplayer.prototype._onRoom = function (type, record) {
    if (!record) return;
    this.room = util.merge(this.room || {}, record);
    this.emit("room", type, this.room);
    if (this.room.status === "live" && !this.session) this._begin(this.room);
    if (this.room.status === "closed") this.emit("closed");
  };

  Multiplayer.prototype._onPlayer = function (type, record) {
    if (!record) return;
    var list = this.players.slice();
    var found = false;
    for (var i = 0; i < list.length; i++) {
      if (list[i].profile_id === record.profile_id) { list[i] = util.merge(list[i], record); found = true; break; }
    }
    if (!found && type !== "DELETE") list.push(record);
    if (type === "DELETE") list = list.filter(function (p) { return p.profile_id !== record.profile_id; });
    this.players = list;
    this.emit("players", this.players);
  };

  Multiplayer.prototype._onEvent = function (type, record) {
    if (type === "broadcast" && record && record.kind) {
      this.events.push(util.merge({ at: Date.now() }, record));
      if (record.kind === "finish") this._onRivalFinish(record);
      if (record.kind === "progress") this._onRivalProgress(record);
      this.emit("event", record);
      return;
    }
    if (record) {
      this.events.push(record);
      this.emit("event", record);
    }
  };

  Multiplayer.prototype._onRivalProgress = function (payload) {
    var list = this.players.slice();
    for (var i = 0; i < list.length; i++) {
      if (list[i].profile_id === payload.profileId) {
        list[i] = util.merge(list[i], { solved: payload.solved, total: payload.total });
      }
    }
    this.players = list;
    this.emit("players", this.players);
  };

  Multiplayer.prototype._onRivalFinish = function (payload) {
    if (payload.profileId === this.profileId()) return;
    var list = this.players.slice();
    for (var i = 0; i < list.length; i++) {
      if (list[i].profile_id === payload.profileId) {
        list[i] = util.merge(list[i], {
          solved: payload.solved,
          outcome: payload.outcome,
          finished_at: new Date(payload.finishedAt).toISOString()
        });
      }
    }
    this.players = list;
    this.emit("players", this.players);
    if (payload.outcome === "won" && !this.winner) {
      this.winner = payload;
      this.emit("rival-won", payload);
      if (this.session && !this.session.finished) this.session.end("lost");
    }
  };

  Multiplayer.prototype._onChat = function (payload) {
    if (!payload) return;
    var self = this;
    var now = Date.now();
    var key = (payload.profileId || payload.profile_id || "") + "|" + (payload.name || "") + "|" + (payload.body || "");
    /* say() echoes locally AND the mp_chat insert comes back over the
       realtime stream — collapse the duplicate before it reaches the UI. */
    var seen = this._seenChat || (this._seenChat = []);
    seen = seen.filter(function (s) { return now - s.t < 4000; });
    this._seenChat = seen;
    if (seen.some(function (s) { return s.k === key; })) return;
    seen.push({ k: key, t: now });
    this.chat.push(payload);
    this.emit("chat", payload);
  };

  /* ------------------------------------------------------------- the match */

  Multiplayer.prototype.start = function () {
    var self = this;
    if (!this.isHost()) return Promise.reject(new Error("Only the host can start."));
    var mode = this.mode();
    var now = Date.now();
    var state = { startedAt: now, endsAt: now + mode.seconds * 1000, seed: this.room.seed };
    return X.Cloud.realm("multi").rooms.update(this.room.id, { status: "live", state: state })
      .then(function () {
        X.Realtime.roomAction(self.room.id, "start", { startedAt: now, endsAt: state.endsAt });
      });
  };

  Multiplayer.prototype._begin = function (room) {
    var self = this;
    if (this.session) return this.session;
    var mode = CFG.mode(room.mode);
    var session = new X.Session({
      realm: "multi",
      mode: room.mode,
      tier: room.tier,
      seed: room.seed,
      count: mode.puzzles,
      perks: X.Profile.perks("multi")
    });
    session.ranked = !!room.ranked;
    this.session = session;
    session.on("solve", function () { self._broadcastProgress(); });
    session.on("guess", function (res) {
      if (!res.correct) self._broadcastProgress();
    });
    session.on("end", function (run, result, applied) { self._onLocalEnd(run, result, applied); });
    session.start();
    var state = room.state || {};
    if (state.startedAt) session.run.startedAt = state.startedAt;
    if (state.endsAt) session.run.endsAt = state.endsAt;
    this.emit("begin", session);
    return session;
  };

  Multiplayer.prototype._broadcastProgress = util.throttle(function () {
    if (!this.room || !this.session) return;
    var run = this.session.run;
    var solved = X.Engine.solvedCount(run);
    X.Realtime.roomAction(this.room.id, "progress", {
      profileId: this.profileId(),
      name: this.myName(),
      solved: solved,
      total: run.slots.length
    });
    if (Date.now() - this._lastRowWrite > 2500) {
      this._lastRowWrite = Date.now();
      X.Cloud.realm("multi").rooms.updatePlayer(this.room.id, this.profileId(), { solved: solved });
    }
  }, 400);

  Multiplayer.prototype._placement = function () {
    var finished = this.players.filter(function (p) {
      return p.finished_at && p.profile_id !== this.profileId;
    }, this);
    return finished.length + 1;
  };

  Multiplayer.prototype._onLocalEnd = function (run, result, applied) {
    var self = this;
    if (!this.room) return;
    var R = X.Cloud.realm("multi");
    var pid = this.profileId();
    var placement = run.outcome === "won" ? this._placement() : null;
    var finishedAt = Date.now();
    var patch = {
      solved: result.solved,
      outcome: run.outcome,
      finished_at: new Date(finishedAt).toISOString(),
      placement: placement
    };
    this.emit("local-end", run, result, applied);

    if (!this.available() || this.hotseat) return;
    R.rooms.updatePlayer(this.room.id, pid, patch);
    R.rooms.submitResult(this.room.id, {
      profile_id: pid,
      name: this.myName(),
      outcome: run.outcome,
      score: result.score,
      xp: result.xp,
      currency: result.currency,
      solved: result.solved,
      elapsed_ms: Math.round(run.elapsedMs || 0),
      placement: placement
    });
    X.Realtime.roomAction(this.room.id, "finish", {
      profileId: pid,
      name: this.myName(),
      solved: result.solved,
      outcome: run.outcome,
      finishedAt: finishedAt
    });
  };

  /* --------------------------------------------------------------- social */

  Multiplayer.prototype.say = function (body) {
    var text = String(body || "").trim().slice(0, 240);
    if (!text || !this.room) return Promise.resolve(null);
    var payload = { profileId: this.profileId(), name: this.myName(), body: text, at: Date.now() };
    this._onChat(payload);
    if (this.hotseat || !this.available()) return Promise.resolve(payload);
    X.Realtime.roomAction(this.room.id, "chat", payload);
    return X.Cloud.realm("multi").rooms.say(this.room.id, this.profileId(), this.myName(), text)
      .catch(function () { return payload; });
  };

  Multiplayer.prototype.emote = function (key) {
    if (!this.room || this.hotseat || !this.available()) return this;
    X.Realtime.roomAction(this.room.id, "emote", { profileId: this.profileId(), name: this.myName(), key: key });
    return this;
  };

  /* ---------------------------------------------------------------- leave */

  Multiplayer.prototype.leave = function () {
    var self = this;
    var R = X.Cloud.realm("multi");
    if (this.handle) { this.handle.close(); this.handle = null; }
    var room = this.room;
    var pid = this.profileId();
    var done;
    if (room && !room.offline && pid && this.available()) {
      done = R.rooms.leave(room.id, pid)
        .then(function () { return R.rooms.players(room.id); })
        .then(function (players) {
          var count = (players || []).length;
          if (self.isHost() && count === 0) return R.rooms.close(room.id);
          return R.rooms.update(room.id, { player_count: count });
        })
        .catch(function () { return null; });
    } else {
      done = Promise.resolve(null);
    }
    this.room = null;
    this.players = [];
    this.me = null;
    this.session = null;
    this.hotseat = null;
    this.winner = null;
    this.status = "idle";
    this.emit("leave");
    return done;
  };

  /* -------------------------------------------------------------- hotseat */

  Multiplayer.prototype.startHotseat = function (opts) {
    var o = opts || {};
    var names = (o.names || []).map(function (n) { return String(n || "").trim(); }).filter(Boolean);
    if (names.length < 2) throw new Error("A hotseat match needs at least two names.");
    var mode = CFG.mode(o.mode);
    names = names.slice(0, mode.maxPlayers);
    var match = {
      id: util.uid("hotseat"),
      offline: true,
      status: "live",
      mode: mode.id,
      tier: o.tier || CFG.get("defaultTier"),
      ranked: false,
      seed: util.uid("hs-seed"),
      code: null,
      host_id: "hotseat",
      host_name: names[0],
      max_players: mode.maxPlayers,
      player_count: names.length,
      state: { startedAt: Date.now(), endsAt: null },
      players: names.map(function (name, i) {
        return {
          profile_id: "seat-" + i,
          name: name,
          seat: i,
          solved: 0,
          total: mode.puzzles,
          finished_at: null,
          placement: null,
          outcome: null,
          elapsed_ms: 0
        };
      }),
      turn: 0
    };
    this.hotseat = match;
    this.room = match;
    this.players = match.players;
    this.emit("enter", this.room, this.players);
    return match;
  };

  /** Begin one seat's turn: everyone races the same seeded cipher. */
  Multiplayer.prototype.hotseatPlay = function (seat) {
    var self = this;
    if (!this.hotseat) throw new Error("No hotseat match running.");
    var player = this.hotseat.players[seat];
    if (!player) throw new Error("No such seat.");
    var mode = CFG.mode(this.hotseat.mode);
    var session = new X.Session({
      realm: "multi",
      mode: this.hotseat.mode,
      tier: this.hotseat.tier,
      seed: this.hotseat.seed,
      count: mode.puzzles,
      perks: {},
      noProfile: true
    });
    session.seat = seat;
    this.session = session;
    session.on("end", function (run, result) {
      player.solved = result.solved;
      player.elapsed_ms = Math.round(run.elapsedMs || 0);
      player.outcome = run.outcome;
      player.finished_at = Date.now();
      if (run.outcome === "won" && player.placement == null) player.placement = self._hotseatPlacement();
      self.emit("hotseat-end", seat, run, result);
    });
    session.start();
    return session;
  };

  Multiplayer.prototype._hotseatPlacement = function () {
    var n = this.hotseat.players.filter(function (p) { return p.placement != null; }).length;
    return n + 1;
  };

  Multiplayer.prototype.hotseatStandings = function () {
    if (!this.hotseat) return [];
    return this.hotseat.players.slice().sort(function (a, b) {
      if (a.placement && b.placement) return a.placement - b.placement;
      if (a.placement) return -1;
      if (b.placement) return 1;
      if (b.solved !== a.solved) return b.solved - a.solved;
      return a.elapsed_ms - b.elapsed_ms;
    });
  };

  Multiplayer.prototype.hotseatNext = function () {
    if (!this.hotseat) return null;
    var next = this.hotseat.turn + 1;
    if (next >= this.hotseat.players.length) return null;
    this.hotseat.turn = next;
    return next;
  };

  X.Multiplayer = new Multiplayer();
})(window);
