/* ==========================================================================
   Exotic — multiplayer room
   One route, two realities. With Supabase: a live room — realtime players,
   one seeded cipher, racers, table talk and the sabotage rail. Without it:
   the hotseat, the same match passed device-to-device seat by seat.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;
  var W = X.Widgets;
  var CFG = X.config;

  var h = dom.el;
  X.views = X.views || {};

  var SABO_ITEMS = ["mp-scan", "mp-ward", "mp-cloak", "mp-fog", "mp-freeze", "mp-thief"];
  var SABO_SELF = { "mp-ward": true, "mp-cloak": true, "mp-scan": true };
  var SABO_NEEDS_TARGET = { "mp-fog": true, "mp-freeze": true, "mp-thief": true };

  function byPlacement(list) {
    return list.slice().sort(function (a, b) {
      var ap = a.placement, bp = b.placement;
      if (ap != null && bp != null) return ap - bp;
      if (ap != null) return -1;
      if (bp != null) return 1;
      if ((b.solved || 0) !== (a.solved || 0)) return (b.solved || 0) - (a.solved || 0);
      return String(a.finished_at || "") < String(b.finished_at || "") ? -1 : 1;
    });
  }

  X.views["multi-room"] = {
    _code: null,
    _phase: "loading",
    _outlet: null,
    _board: null,
    _unsubs: [],
    _gone: false,
    _seat: 0,
    _hotseatSession: null,
    _sab: { wardUntil: 0, freezeUntil: 0, fogUntil: 0, hidden: {} },
    _sabTarget: null,

    /* ------------------------------------------------------------ mount --- */

    mount: function (outlet, ctx) {
      this._gone = false;
      this._code = String((ctx.params && ctx.params.code) || (ctx.query && ctx.query.code) || "").toUpperCase();
      if (this._code === "HOTSEAT") return this.mountHotseat(outlet, ctx);
      return this.mountOnline(outlet, ctx);
    },

    unmount: function () {
      this._gone = true;
      this._off();
      if (this._board) { this._board.destroy(); this._board = null; }
      if (this._sabTimer) { clearInterval(this._sabTimer); this._sabTimer = null; }
      this._outlet = null;
      return true;
    },

    _listen: function (em, ev, fn) {
      em.on(ev, fn);
      this._unsubs.push(function () { em.off(ev, fn); });
    },

    _off: function () {
      (this._unsubs || []).forEach(function (off) { off(); });
      this._unsubs = [];
    },

    /* ===================================================== offline: hotseat */

    mountHotseat: function (outlet) {
      var self = this;
      this._outlet = outlet;
      if (!X.Multiplayer.hotseat) {
        X.Toast.error("No hotseat match is running on this device.");
        X.Router.go("/multi");
        return;
      }
      this._listen(X.Multiplayer, "hotseat-end", function (seat, run, result) { self._onHotseatEnd(seat, run, result); });
      this._phase = X.Multiplayer.session ? "hotseat-play" : "hotseat-lobby";
      dom.mount(outlet, this.renderHotseat());
    },

    renderHotseat: function () {
      var self = this;
      var mp = X.Multiplayer;
      var match = mp.hotseat;

      var seats = (match.players || []).map(function (p, i) {
        var done = !!p.outcome;
        return h("div", { class: "racer" + (done ? " is-done" : "") }, [
          h("span", { class: "racer-flag" }, p.placement ? "#" + p.placement : String(i + 1)),
          W.avatar(p.name, { size: "sm", solid: true }),
          h("div", { class: "racer-main" }, [
            h("div", { class: "racer-top" }, [
              h("div", { class: "racer-name" }, [p.name, i === 0 ? h("span", { class: "chip" }, "host") : null]),
              h("span", { class: "racer-sub" }, done
                ? (p.outcome === "won" ? "VAULT " + p.placement : p.outcome.toUpperCase())
                : (i === match.turn && mp.session ? "PLAYING NOW" : "ready"))
            ]),
            W.bar((p.solved || 0) / (p.total || 4), { thin: true })
          ])
        ]);
      });

      var controls;
      if (this._phase === "hotseat-play") {
        controls = h("div", { class: "panel stack-3" }, [
          h("div", { class: "section-head" }, [h("h3", {}, "Seat " + (this._seat + 1) + " is up"), h("span", { class: "muted" }, "same seed for everyone")]),
          h("p", { class: "muted" }, "Pass the device when the vault resolves. Scores compare on the next screen.")
        ]);
      } else {
        controls = h("div", { class: "panel" }, [
          h("div", { class: "section-head" }, [h("h3", {}, "Ready to begin")]),
          h("p", { class: "muted" }, match.mode + " · " + CFG.tier(match.tier).name + " · " + match.players.length + " seats. Seat one starts, everyone races the same cipher."),
          h("div", { class: "btn-row" }, [
            W.btn("Begin — seat 1", { icon: "play", onClick: function () { self.beginHotseat(); } }),
            W.btn("Scrap match", { variant: "ghost", onClick: function () {
              X.Multiplayer.leave().then(function () { X.Router.go("/multi"); });
            } })
          ])
        ]);
      }

      return h("div", { class: "stack-5" }, [
        W.pageHead({
          eyebrow: "Core realm · hotseat",
          title: match.mode.charAt(0).toUpperCase() + match.mode.slice(1) + " — one device",
          sub: "The same seeded vault is passed around. Honest seats, no accounts.",
          back: { href: "#/multi" }
        }),
        h("div", { class: "room-grid", style: { gridTemplateColumns: "minmax(0,1fr)" } }, [
          h("div", { class: "stack-4" }, [
            h("div", { class: "panel stack-3" }, [
              h("div", { class: "section-head" }, [h("h3", {}, "Seats")]),
              h("div", { class: "stack-2" }, seats)
            ]),
            controls,
            h("div", { "data-role": "hotseat-stage" }, this._phase === "hotseat-play"
              ? h("div", { class: "stack-4", "data-role": "board-holder" })
              : null)
          ])
        ])
      ]);
    },

    beginHotseat: function () {
      var mp = X.Multiplayer;
      this._seat = 0;
      this._hotseatSession = mp.hotseatPlay(0);
      this._phase = "hotseat-play";
      dom.mount(this._outlet || dom.qs("#app-root"), this.renderHotseat());
      this.mountRoomBoard(this._hotseatSession);
    },

    _onHotseatEnd: function (seat, run, result) {
      var self = this;
      if (this._gone) return;
      var mp = X.Multiplayer;
      if (this._board) { this._board.destroy(); this._board = null; }
      var p = mp.hotseat.players[seat];
      var stage = dom.qs('[data-role="hotseat-stage"]');
      if (stage) {
        stage.textContent = "";
        stage.appendChild(h("div", { class: "panel stack-4" }, [
          h("div", { class: "center stack-2", style: { textAlign: "center" } }, [
            h("div", { class: "hud-label" }, p.name.toUpperCase()),
            h("h2", {}, run.outcome === "won" ? "Vault cracked" : "Vault sealed"),
            h("p", { class: "muted" }, "Solved " + result.solved + "/" + result.total + " in " + X.Board.formatClock(run.elapsedMs / 1000) + (run.outcome === "won" ? " — " + ordinal(p.placement) + " to finish." : ". The code was " + run.code.join("") + "."))
          ]),
          h("div", { class: "stat-grid" }, [
            W.stat("Score", util.fmtNum(result.score)),
            W.stat("Solved", result.solved + "/" + result.total),
            W.stat("Wrong", String(run.guesses.filter(function (g) { return !g.correct; }).length)),
            W.stat("Hints", String(run.hintsUsed || 0))
          ]),
          h("div", { class: "btn-row" }, [
            W.btn("Next seat", { icon: "arrowRight", onClick: function () { self.nextHotseat(); } }),
            W.btn("Home", { variant: "ghost", onClick: function () { X.Router.go("/"); } })
          ])
        ]));
      }
    },

    nextHotseat: function () {
      var mp = X.Multiplayer;
      var next = mp.hotseatNext();
      if (next == null) {
        this._phase = "standings";
        dom.mount(this._outlet || dom.qs("#app-root"), this.renderHotseatStandings());
        return;
      }
      this._seat = next;
      this._hotseatSession = mp.hotseatPlay(next);
      dom.mount(this._outlet || dom.qs("#app-root"), this.renderHotseat());
      this.mountRoomBoard(this._hotseatSession);
    },

    renderHotseatStandings: function () {
      var self = this;
      var mp = X.Multiplayer;
      var rows = mp.hotseatStandings().map(function (p, i) {
        return h("div", { class: "racer" + (i === 0 ? " is-done" : "") }, [
          h("span", { class: "racer-flag" }, "#" + (i + 1)),
          W.avatar(p.name, { size: "sm", solid: true }),
          h("div", { class: "racer-main" }, [
            h("div", { class: "racer-top" }, [
              h("div", { class: "racer-name" }, p.name),
              h("span", { class: "racer-sub" }, (p.solved || 0) + "/" + (p.total || 4) + " solved · " + (p.elapsed_ms != null ? X.Board.formatClock(p.elapsed_ms / 1000) : "—"))
            ]),
            W.bar((p.solved || 0) / (p.total || 4), { thin: true })
          ])
        ]);
      });
      return h("div", { class: "stack-5" }, [
        W.pageHead({ eyebrow: "Core realm · hotseat", title: "Final standings", back: { href: "#/multi" } }),
        h("div", { class: "panel stack-3" }, [
          h("div", { class: "section-head" }, [h("h3", {}, "How the seats compare")]),
          h("div", { class: "stack-2" }, rows)
        ]),
        h("div", { class: "btn-row" }, [
          W.btn("Run another match", { icon: "refresh", onClick: function () { X.Router.go("/multi"); } }),
          W.btn("Home", { variant: "ghost", onClick: function () { X.Router.go("/"); } })
        ])
      ]);
    },

    /* ======================================================== online room --- */

    mountOnline: function (outlet, ctx) {
      var self = this;
      var mp = X.Multiplayer;
      dom.mount(outlet, h("div", { class: "stack-4 center", style: { padding: "var(--sp-10) 0", textAlign: "center" } }, [
        W.spinner(28),
        h("p", { class: "muted" }, "Entering room " + this._code + "…")
      ]));

      var fail = function (err) {
        X.Toast.error(err && err.message ? err.message : "Could not enter that room.");
        X.Router.go("/multi");
      };

      if (!mp.available()) { X.Toast.warn("Multiplayer needs Supabase — connect it in Settings, or play a hotseat."); X.Router.go("/multi"); return; }
      if (!mp.online()) { X.Toast.warn("Sign in to the Core realm before entering a room."); X.Router.go("/auth?realm=multi"); return; }

      if (mp.inRoom()) {
        if (mp.roomCode() === self._code) self.connected(outlet);
        else mp.leave().then(function () {
          return mp.joinByCode(self._code);
        }).then(function () { self.connected(outlet); }).catch(fail);
      } else {
        mp.joinByCode(this._code).then(function () { self.connected(outlet); }).catch(fail);
      }
    },

    connected: function (outlet) {
      var mp = X.Multiplayer;
      if (!mp.room) { X.Router.go("/multi"); return; }
      this._phase = mp.room.status === "live" ? "play" : (mp.room.status === "closed" ? "done" : "lobby");
      this._outlet = outlet;
      this.bind();
      if (this._phase === "play" && !mp.session) mp._begin(mp.room);
      this.render();
    },

    bind: function () {
      var self = this;
      var mp = X.Multiplayer;
      var R = X.Cloud.realm("multi");
      this._listen(mp, "players", util.debounce(function () { self._onPlayers(); }, 250));
      this._listen(mp, "room", util.debounce(function () { self._onRoom(); }, 120));
      this._listen(mp, "begin", function () { self._onBegin(); });
      this._listen(mp, "local-end", function () { self._onLocalEnd(); });
      this._listen(mp, "chat", function (p) { self._onChat(p); });
      this._listen(mp, "event", function (rec) { self._onEvent(rec); });
      this._listen(mp, "rival-won", function (p) { X.Toast.info((p.name || "A rival") + " cracked the vault first.", "Race lost"); });
      this._listen(mp, "closed", function () { self._onClosed(); });
      this._listen(R, "inventory", util.debounce(function () {
        if (self._phase === "play" && self._board) self._board._refresh();
      }, 120));
    },

    _onPlayers: function () {
      if (this._gone) return;
      if (this._phase === "play") {
        if (this._board) this._board._refresh();
        return;
      }
      this.render();
    },

    _onRoom: function () {
      if (this._gone) return;
      var mp = X.Multiplayer;
      var status = mp.room && mp.room.status;
      if (status === "live" && this._phase !== "play") {
        this._phase = "play";
        this.render();
        return;
      }
      if (this._phase === "play") {
        this.patchTop();
      } else {
        this.render();
      }
    },

    _onBegin: function () {
      if (this._gone) return;
      if (this._phase !== "play") { this._phase = "play"; this.render(); }
    },

    _onLocalEnd: function () {
      if (this._gone) return;
      this._phase = "done";
      this.render();
    },

    _onChat: function (payload) {
      if (this._gone || !payload) return;
      var list = dom.qs('[data-role="chat-list"]');
      if (!list) return;
      var row = h("div", { class: "chat-line" }, [
        h("b", {}, payload.name || "?"),
        " ",
        String(payload.body || "")
      ]);
      list.appendChild(row);
      list.scrollTop = list.scrollHeight;
    },

    _onEvent: function (rec) {
      if (this._gone) return;
      var self = this;
      if (rec && rec.kind === "sabotage") this._applySabotage(rec);
      var feed = dom.qs('[data-role="event-feed"]');
      if (feed && rec && rec.name) {
        var line = h("div", { class: "chat-line system" },
          rec.kind === "sabotage"
            ? rec.name + " threw " + (SABO_DISPLAY[rec.act] || rec.act) + (rec.target === this.meId() ? " at YOU" : "")
            : rec.kind + " — " + rec.name);
        feed.insertBefore(line, feed.firstChild);
        while (feed.children.length > 5) feed.removeChild(feed.lastChild);
      }
    },

    _onClosed: function () {
      if (this._gone) return;
      X.Toast.info("This room was closed by its host.");
      X.Multiplayer.leave().then(function () { X.Router.go("/multi"); });
    },

    meId: function () { return X.Multiplayer.profileId(); },

    /* ------------------------------------------------------------ render --- */

    render: function () {
      if (!this._outlet) return;
      if (this._phase === "play") return this.renderPlay();
      if (this._phase === "done") return this.renderDone();
      return this.renderLobby();
    },

    topBar: function () {
      var self = this;
      var mp = X.Multiplayer;
      var room = mp.room || {};
      var mode = CFG.mode(room.mode);
      var statusText = room.status === "live" ? "LIVE" : room.status === "closed" ? "CLOSED" : "OPEN";
      return h("div", { class: "stack-3", "data-role": "room-top" }, [
        h("div", { class: "breadcrumb" }, [
          h("a", { class: "back-link", href: "#/multi", onclick: function (e) {
            e.preventDefault();
            self.leaveRoom();
          } }, [
            { html: X.icons.icon("arrowLeft", { size: 14 }) },
            "Lobby"
          ]),
          h("span", { class: "sep" }, "·"),
          h("button", { type: "button", class: "back-link", onclick: function () { self.copyCode(); } }, [
            h("code", { class: "room-code mono", style: { letterSpacing: "0.16em" } }, room.code || "——"),
            h("span", { class: "hint" }, "tap to copy")
          ])
        ]),
        h("div", { class: "page-head-row" }, [
          h("div", { class: "stack-1" }, [
            h("h1", {}, mode.name),
            h("div", { class: "profile-tags" }, [
              W.chip(statusText, { dot: true, live: room.status === "live", solid: room.status === "live" }),
              W.chip("tier " + CFG.tier(room.tier).name, { icon: "target" }),
              room.ranked ? W.chip("ranked", { solid: true, icon: "trophy" }) : W.chip("casual", {}),
              W.chip((room.player_count || 0) + "/" + (room.max_players || 4) + " seats", { icon: "users" })
            ])
          ]),
          h("div", { class: "profile-actions" }, [
            W.btn("Leave room", { size: "sm", variant: "ghost", icon: "logOut", onClick: function () { self.leaveRoom(); } })
          ])
        ])
      ]);
    },

    renderLobby: function () {
      var self = this;
      var mp = X.Multiplayer;
      var room = mp.room || {};
      var mode = CFG.mode(room.mode);
      var minNeeded = mode.minPlayers || 2;
      var seats = (mp.players || []);

      var racerRows = seats.map(function (p) {
        var me = p.profile_id === self.meId();
        return h("div", { class: "racer" + (me ? " is-you" : "") }, [
          h("span", { class: "racer-flag" }, String((seats.indexOf(p) + 1))),
          W.avatar(p.name || "?", { size: "sm", solid: true }),
          h("div", { class: "racer-main" }, [
            h("div", { class: "racer-top" }, [
              h("div", { class: "racer-name" }, [
                p.name || "?",
                me ? h("span", { class: "chip chip-solid" }, "you") : null,
                p.profile_id === room.host_id ? h("span", { class: "chip" }, "host") : null
              ]),
              h("span", { class: "racer-sub" }, p.ready ? "READY" : "waiting")
            ]),
            W.bar(p.ready ? 1 : 0, { thin: true })
          ]),
          me ? h("button", {
            type: "button",
            class: "tag" + (p.ready ? "" : " tag-solid"),
            onclick: function () { self.toggleReady(p); }
          }, p.ready ? "unready" : "ready") : null
        ]);
      });

      var hostControls;
      if (mp.isHost()) {
        var allReady = seats.length >= 2 && seats.every(function (p) { return p.ready; });
        hostControls = h("div", { class: "panel" }, [
          h("div", { class: "section-head" }, [h("h3", {}, "Host the match")]),
          h("p", { class: "muted" }, allReady
            ? "Everyone is ready. Start the clock and deal the same cipher."
            : "Need at least " + minNeeded + " seats, everyone marked ready (" + seats.filter(function (p) { return p.ready; }).length + "/" + seats.length + " ready)."),
          h("div", { class: "btn-row" }, [
            W.btn("Start match", { icon: "play", disabled: !allReady, onClick: function () {
              X.Multiplayer.start().catch(function (err) { X.Toast.error(err && err.message ? err.message : "Could not start."); });
            } })
          ])
        ]);
      } else {
        hostControls = h("div", { class: "panel" }, [
          h("div", { class: "section-head" }, [h("h3", {}, "Waiting on the host")]),
          h("p", { class: "muted" }, (room.host_name || "The host") + " will deal the cipher when everyone is ready. Mark yourself ready above.")
        ]);
      }

      return dom.mount(this._outlet, h("div", { class: "stack-5" }, [
        this.topBar(),
        h("div", { class: "room-grid" }, [
          h("div", { class: "stack-4" }, [
            h("div", { class: "panel stack-3" }, [
              h("div", { class: "section-head" }, [h("h3", {}, "Seats"), h("span", { class: "muted" }, "same cipher for all")]),
              h("div", { class: "stack-2" }, racerRows)
            ]),
            hostControls,
            h("div", { class: "panel" }, [
              h("div", { class: "section-head" }, [h("h3", {}, "The deal")]),
              h("p", { class: "muted" }, "Every seat races the exact same four puzzles. Whoever resolves all four and unlocks the vault first takes the " + (room.ranked ? "rating and the cores." : "cores.") + " Wrong guesses cost time; correct answers close the code in.")
            ])
          ]),
          this.chatPanel()
        ])
      ]));
    },

    toggleReady: function () {
      var mp = X.Multiplayer;
      var room = mp.room;
      var me = mp.me;
      if (!room || !me) return;
      var next = !me.ready;
      X.Cloud.realm("multi").rooms.updatePlayer(room.id, me.profile_id, { ready: next })
        .then(function () {
          mp.me = util.merge(mp.me || {}, { ready: next });
          mp.emit("players", mp.players);
        })
        .catch(function () { X.Toast.error("Could not toggle readiness."); });
    },

    /* ------------------------------------------------------------- play --- */

    renderPlay: function () {
      var self = this;
      var mp = X.Multiplayer;
      if (!mp.session) { this._phase = "lobby"; return this.renderLobby(); }
      var holder = h("div", { "data-role": "board-holder" });
      dom.mount(this._outlet, h("div", { class: "stack-5" }, [
        this.topBar(),
        h("div", { class: "room-grid" }, [holder, this.chatPanel()])
      ]));
      this.mountRoomBoard(mp.session);
      return this._outlet;
    },

    mountRoomBoard: function (session) {
      var self = this;
      if (this._board) { this._board.destroy(); this._board = null; }
      var holder = dom.qs('[data-role="board-holder"]');
      if (!holder) return;
      this._board = new X.Board().mount(session, {
        focusIndex: this._activeSlot(),
        onSolve: function () {
          self._board.opts.focusIndex = self._activeSlot();
        },
        hudExtra: function () {
          return h("div", { class: "hud-item" }, [
            h("span", { class: "hud-label" }, "You"),
            h("span", { class: "hud-value", style: { fontSize: "var(--fs-sm)" } }, X.Multiplayer.myName())
          ]);
        },
        side: function () { return [self.racersPanel(), self.sabotagePanel()]; },
        onEnd: function () {}
      }, holder);
      this._refreshTimers();
    },

    _activeSlot: function () {
      var run = this._board ? this._board.session.run : (X.Multiplayer.session ? X.Multiplayer.session.run : null);
      if (!run) return 0;
      for (var i = 0; i < run.slots.length; i++) if (!run.slots[i].solved) return i;
      return 0;
    },

    _refreshTimers: function () {
      var self = this;
      if (this._sabTimer) clearInterval(this._sabTimer);
      this._sabTimer = setInterval(function () {
        if (self._gone || self._phase !== "play" || !self._board) return;
        if (Date.now() < self._sab.freezeUntil || Date.now() < self._sab.fogUntil) {
          var kp = self._board.keypad && self._board.keypad.el;
          if (kp && !kp.classList.contains("is-veiled")) kp.classList.add("is-veiled");
        } else {
          var kp2 = self._board.keypad && self._board.keypad.el;
          if (kp2) kp2.classList.remove("is-veiled");
        }
      }, 300);
    },

    racersPanel: function () {
      var self = this;
      var mp = X.Multiplayer;
      var meId = this.meId();
      var rows = byPlacement(mp.players || []).map(function (p, i) {
        var me = p.profile_id === meId;
        var cloaked = self._sab.hidden[p.profile_id] > Date.now();
        var done = !!p.finished_at || p.outcome;
        var bar;
        if (done) {
          bar = W.bar(1, { thin: true });
        } else if (cloaked) {
          bar = h("div", { class: "hint", style: { fontSize: "var(--fs-2xs)" } }, "cloaked — no signal");
        } else {
          bar = W.bar((p.solved || 0) / (p.total || 4), { thin: true });
        }
        return h("div", { class: "racer" + (me ? " is-you" : "") + (done ? " is-done" : "") }, [
          h("span", { class: "racer-flag" }, p.placement ? "#" + p.placement : String(i + 1)),
          W.avatar(p.name || "?", { size: "sm", solid: true }),
          h("div", { class: "racer-main" }, [
            h("div", { class: "racer-top" }, [
              h("div", { class: "racer-name" }, [p.name || "?", me ? h("span", { class: "chip chip-solid" }, "you") : null]),
              h("span", { class: "racer-sub" }, done
                ? (p.outcome === "won" ? "VAULT OPEN" : String(p.outcome || "done").toUpperCase())
                : (p.solved || 0) + "/" + (p.total || 4) + " solved")
            ]),
            bar
          ])
        ]);
      });
      return h("section", { class: "panel stack-3" }, [
        h("div", { class: "section-head" }, [h("h3", {}, "Racers"), h("span", { class: "muted" }, "live")]),
        h("div", { class: "stack-2" }, rows),
        h("div", { "data-role": "event-feed", class: "stack-1" })
      ]);
    },

    sabotagePanel: function () {
      var self = this;
      var mp = X.Multiplayer;
      var R = X.Cloud.realm("multi");
      var meId = this.meId();
      var rivals = (mp.players || []).filter(function (p) { return p.profile_id !== meId; });
      var targetSel = h("select", { class: "select", onchange: function (e) { self._sabTarget = e.target.value || null; } },
        rivals.map(function (p) {
          return h("option", { value: p.profile_id, selected: self._sabTarget === p.profile_id }, p.name || "?");
        })
      );
      var hasTargets = rivals.length > 0;

      var buttons = SABO_ITEMS.map(function (id) {
        var item = X.Shop.get(id);
        var qty = R.quantityOf(id);
        if (!item || qty <= 0) return null;
        var needsTarget = !!SABO_NEEDS_TARGET[id];
        var disabled = needsTarget && !hasTargets;
        var flag = "";
        if (id === "mp-ward" && self._sab.wardUntil > Date.now()) flag = " warded";
        if (id === "mp-cloak" && Object.keys(self._sab.hidden).length) flag = " cloaked";
        return h("button", {
          type: "button",
          class: "powerup" + flag,
          disabled: disabled,
          title: item.desc,
          onclick: function () { self.sabotage(id, item); }
        }, [
          { html: X.icons.icon(item.icon, { size: 16 }) },
          h("span", { class: "powerup-text" }, [
            h("strong", {}, item.name),
            h("span", {}, "×" + qty + (needsTarget ? (hasTargets ? " · target set" : " · no rivals") : ""))
          ])
        ]);
      }).filter(Boolean);

      return h("section", { class: "panel stack-3" }, [
        h("div", { class: "section-head" }, [h("h3", {}, "Sabotage rail")]),
        h("div", { class: "field" }, [
          h("label", { class: "field-label" }, "Target"),
          hasTargets ? targetSel : h("p", { class: "hint" }, "No rivals in this match yet.")
        ]),
        buttons.length
          ? h("div", { class: "powerups" }, buttons)
          : h("div", { class: "hint" }, "Owned sabotage items appear here. Cores buy them in the shop.")
      ]);
    },

    sabotage: function (itemId, item) {
      var self = this;
      var mp = X.Multiplayer;
      var R = X.Cloud.realm("multi");
      var meId = this.meId();
      var key = item.effect.key;
      var target = SABO_NEEDS_TARGET[itemId] ? this._sabTarget : null;
      if (SABO_NEEDS_TARGET[itemId] && !target) { X.Toast.warn("Pick a target first."); return; }

      var after = function () { self._board._refresh(); };

      /* self-side effect first */
      if (itemId === "mp-ward") {
        this._sab.wardUntil = Date.now() + 20000;
        X.Toast.success("Ward up — the next twenty seconds shrug off sabotage.");
      } else if (itemId === "mp-cloak") {
        X.Realtime.roomAction(mp.room.id, "sabotage", { act: "cloak", by: meId, name: mp.myName(), until: Date.now() + 12000 });
        X.Toast.info("Cloaked — your progress bar goes quiet for twelve seconds.");
      } else if (itemId === "mp-scan") {
        var visible = (mp.players || []).filter(function (p) { return p.profile_id !== meId; }).length;
        this._sab.hidden = {};
        X.Realtime.roomAction(mp.room.id, "sabotage", { act: "scan", by: meId, name: mp.myName() });
        X.Toast.info("Scan complete — " + visible + " rival" + (visible === 1 ? "" : "s") + " on the board.");
      } else if (itemId === "mp-thief") {
        var run = mp.session.run;
        run.endsAt += 10000;
        X.Realtime.roomAction(mp.room.id, "sabotage", { act: "steal", by: meId, name: mp.myName(), target: target, value: 5000 });
      } else {
        X.Realtime.roomAction(mp.room.id, "sabotage", {
          act: key, by: meId, name: mp.myName(), target: target, value: item.effect.value
        });
        X.Toast.info(({ fog: "Fog thrown", freeze: "Freeze cast", steal: "Stolen" })[key] || item.name);
      }

      R.consume(itemId, 1)
        .then(function () { after(); })
        .catch(function (err) { X.Toast.error(err && err.message ? err.message : "Could not use that."); });
    },

    _applySabotage: function (rec) {
      var self = this;
      var mp = X.Multiplayer;
      var meId = this.meId();
      var act = rec.act;
      if (act === "steal") {
        if (rec.target === meId) {
          if (mp.session) {
            mp.session.run.endsAt -= (rec.value || 5000);
            X.Toast.warn((rec.name || "A rival") + " stole five seconds from you.", "Time thief");
          }
        }
        return;
      }
      if (act === "cloak") {
        if (rec.by !== meId) this._sab.hidden[rec.by] = rec.until || (Date.now() + 12000);
        if (this._board) this._board._refresh();
        return;
      }
      if (act === "scan") {
        if (rec.by !== meId) { delete this._sab.hidden[rec.by]; if (this._board) this._board._refresh(); }
        return;
      }
      /* targeted debuffs at me */
      if (rec.target !== meId) return;
      if (this._sab.wardUntil > Date.now()) {
        X.Toast.info((rec.name || "A rival") + "'s sabotage was warded off.");
        return;
      }
      if (act === "freeze" && mp.session) {
        this._sab.freezeUntil = Date.now() + (rec.value || 3000);
        X.Toast.warn((rec.name || "A rival") + " froze your keypad for three seconds.", "Frozen");
      } else if (act === "fog") {
        this._sab.fogUntil = Date.now() + (rec.value || 5000);
        X.Toast.warn((rec.name || "A rival") + " fogged your keypad.", "Fog");
      }
    },

    /* -------------------------------------------------------------- done --- */

    renderDone: function () {
      var self = this;
      var mp = X.Multiplayer;
      var room = mp.room || {};
      var R = X.Cloud.realm("multi");
      var me = mp.me || {};
      var result = mp.session ? (mp.session.result || null) : null;
      var won = (me.outcome === "won") || (mp.session && mp.session.run && mp.session.run.outcome === "won");
      var isHost = mp.isHost();

      var myPanel = h("div", { class: "panel stack-4" }, [
        h("div", { class: "center stack-2", style: { textAlign: "center" } }, [
          h("div", { class: "hud-label" }, won ? "VAULT OPEN" : "VAULT SEALED"),
          h("h2", {}, won ? "You cracked it" : (mp.session && mp.session.run && mp.session.run.outcome === "expired" ? "Time ran out" : "Lost the race")),
          me.placement ? h("p", { class: "muted" }, ordinal(me.placement) + " to finish.") : null
        ]),
        result ? h("div", { class: "stat-grid" }, [
          W.stat("Score", util.fmtNum(result.score)),
          W.stat("XP", "+" + util.fmtNum(result.xp)),
          W.stat("Cores", "+" + util.fmtNum(result.currency) + " ◈"),
          W.stat("Solved", result.solved + "/" + result.total)
        ]) : null,
        h("div", { class: "btn-row" }, [
          isHost ? W.btn("Run it back", { icon: "refresh", onClick: function () { self.rematch(); } }) : null,
          W.btn("Leave room", { variant: "ghost", icon: "logOut", onClick: function () { self.leaveRoom(); } }),
          W.btn("Home", { variant: "ghost", onClick: function () { X.Router.go("/"); } })
        ])
      ]);

      var rows = byPlacement(mp.players || []).map(function (p, i) {
        var meToo = p.profile_id === self.meId();
        return h("div", { class: "racer" + (i === 0 ? " is-done" : "") + (meToo ? " is-you" : "") }, [
          h("span", { class: "racer-flag" }, p.placement ? "#" + p.placement : "·"),
          W.avatar(p.name || "?", { size: "sm", solid: true }),
          h("div", { class: "racer-main" }, [
            h("div", { class: "racer-top" }, [
              h("div", { class: "racer-name" }, [p.name || "?", meToo ? h("span", { class: "chip chip-solid" }, "you") : null]),
              h("span", { class: "racer-sub" }, [
                String(p.outcome === "won" ? "VAULT OPEN" : (p.outcome || "done")),
                " · ",
                String((p.solved || 0) + "/" + (p.total || 4))
              ])
            ]),
            W.bar((p.solved || 0) / (p.total || 4), { thin: true })
          ])
        ]);
      });

      return dom.mount(this._outlet, h("div", { class: "stack-5" }, [
        this.topBar(),
        h("div", { class: "room-grid" }, [
          h("div", { class: "stack-4" }, [myPanel, h("div", { class: "panel stack-3" }, [
            h("div", { class: "section-head" }, [h("h3", {}, "Standings")]),
            h("div", { class: "stack-2" }, rows)
          ])]),
          this.chatPanel()
        ])
      ]));
    },

    rematch: function () {
      var self = this;
      var mp = X.Multiplayer;
      var rid = mp.room && mp.room.id;
      if (!rid) return;
      X.Cloud.realm("multi").rooms.update(rid, {
        status: "open",
        state: { startedAt: null, endsAt: null }
      }).then(function () {
        if (!mp.room) return;
        mp.room = util.merge(mp.room, { status: "open", state: { startedAt: null, endsAt: null } });
        mp.emit("room", "UPDATE", mp.room);
        self._phase = "lobby";
        self.render();
      }).catch(function (err) { X.Toast.error(err && err.message ? err.message : "Could not reset the room."); });
    },

    /* -------------------------------------------------------------- chat --- */

    chatPanel: function () {
      var self = this;
      var input = W.input({ placeholder: "Say something…", maxlength: 240 });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); self.sendChat(input); }
      });
      return h("section", { class: "panel chat stack-3", "data-role": "chat-root" }, [
        h("div", { class: "section-head" }, [h("h3", {}, "Table talk"), h("span", { class: "muted" }, "realtime")]),
        h("div", { class: "chat-list", "data-role": "chat-list", style: { maxHeight: "240px", overflowY: "auto" } }),
        h("div", { class: "btn-row", style: { gap: "var(--sp-2)" } }, [
          input,
          W.btn("Send", { size: "sm", onClick: function () { self.sendChat(input); } })
        ]),
        h("div", { class: "cat-row", style: { gap: "var(--sp-2)" } },
          ["glare", "slow", "wp"].map(function (k) {
            return W.btn(k, { size: "sm", variant: "ghost", onClick: function () { X.Multiplayer.emote(k); } });
          })
        )
      ]);
    },

    sendChat: function (input) {
      var body = input.value;
      if (!String(body || "").trim()) return;
      X.Multiplayer.say(body);
      input.value = "";
      var list = dom.qs('[data-role="chat-list"]');
      if (list) list.scrollTop = list.scrollHeight;
    },

    copyCode: function () {
      var code = X.Multiplayer.roomCode();
      if (!code) return;
      util.copy(code).then(function (ok) {
        X.Toast[ok ? "success" : "info"](ok ? "Room code copied — share " + code + "." : "Copy blocked by the browser — the code is " + code + ".");
      });
    },

    leaveRoom: function () {
      var self = this;
      var mp = X.Multiplayer;
      var leave = function () {
        if (mp.session && mp.session.active) mp.session.destroy();
        mp.leave().then(function () { X.Router.go("/multi"); });
      };
      if (this._phase === "play") {
        X.Modal.confirm({
          title: "Leave mid-match?",
          message: "Your seat goes quiet and your rivals keep racing without you.",
          confirmLabel: "Leave the match",
          cancelLabel: "Keep racing"
        }).then(function (ok) { if (ok) leave(); });
      } else {
        leave();
      }
    },

    patchTop: function () {
      var top = dom.qs('[data-role="room-top"]');
      if (top) { top.textContent = ""; top.appendChild(this.topBar()); }
    }
  };

  function ordinal(n) {
    var s = ["th", "st", "nd", "rd"];
    var v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  var SABO_DISPLAY = { freeze: "a freeze", fog: "fog", steal: "a theft", cloak: "a cloak", scan: "a scan" };
})(window);