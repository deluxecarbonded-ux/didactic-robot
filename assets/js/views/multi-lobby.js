/* ==========================================================================
   Exotic — multiplayer lobby
   The Core realm's front room. Live rooms stream in from Supabase when it is
   connected; without it, the lobby offers a real hotseat — the same seeded
   cipher passed around one device, still scored like a match.
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

  var MODE_KEYS = ["duel", "squad", "blitz", "coop"];

  function statusChip() {
    var mp = X.Multiplayer;
    if (mp.available() && mp.online()) {
      return W.chip("Realtime online", { dot: true, live: true, solid: true });
    }
    if (mp.available()) {
      return W.chip("Cloud ready · sign in", { dot: true });
    }
    return W.chip("Local only — hotseat", { dot: true });
  }

  X.views["multi-lobby"] = {
    _timer: null,
    _gone: false,

    mount: function (outlet, ctx) {
      this._outlet = outlet;
      dom.mount(outlet, this.render(ctx));
      this.bind(ctx);
    },
    unmount: function () {
      this._gone = true;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      this._outlet = null;
      return true;
    },

    render: function (ctx) {
      var self = this;
      var mp = X.Multiplayer;

      var roomBanner = null;
      if (mp.inRoom()) {
        roomBanner = h("div", { class: "setup-card" }, [
          h("div", { class: "setup-head" }, [
            h("span", { class: "setup-glyph" }, { html: X.icons.icon("wifi", { size: 22 }) }),
            h("div", { class: "stack-1" }, [
              h("h4", {}, "You are in room " + mp.roomCode()),
              h("p", { class: "muted", style: { margin: 0 } }, "Rejoin the room to keep playing, or leave it here to clear the seat.")
            ])
          ]),
          h("div", { class: "setup-foot" }, [
            h("span", { style: { flex: 1 } }),
            W.btn("Return to room", { size: "sm", onClick: function () { X.Router.go("/room/" + mp.roomCode()); } }),
            W.btn("Leave room", { size: "sm", variant: "ghost", onClick: function () {
              mp.leave().then(function () { self.renderIntoLobby(); });
            } })
          ])
        ]);
      }

      var online = mp.available();
      var signedIn = mp.online();

      var panels = [];
      if (signedIn) {
        panels.push(this.createPanel());
        panels.push(this.joinPanel());
        panels.push(h("div", { class: "stack-3" }, [
          h("div", { class: "section-head" }, [
            h("h3", {}, "Live rooms"),
            W.btn("Refresh", { size: "sm", variant: "ghost", icon: "refresh", onClick: function () { self.reloadRooms(); } })
          ]),
          h("div", { class: "stack-3", "data-role": "rooms" }, [W.spinner()])
        ]));
      } else if (online) {
        panels.push(h("div", { class: "setup-card" }, [
          h("div", { class: "setup-head" }, [
            h("span", { class: "setup-glyph" }, { html: X.icons.icon("key", { size: 22 }) }),
            h("div", { class: "stack-1" }, [
              h("h4", {}, "Sign in to the Core realm"),
              h("p", { class: "muted", style: { margin: 0 } }, "Rooms are tied to your multiplayer identity. Your Shard realm account does not open this door.")
            ])
          ]),
          h("div", { class: "setup-foot" }, [
            h("span", { style: { flex: 1 } }),
            W.btn("Sign in / create", { size: "sm", onClick: function () { X.Router.go("/auth?realm=multi"); } })
          ])
        ]));
      } else {
        panels.push(h("div", { class: "setup-card" }, [
          h("div", { class: "setup-head" }, [
            h("span", { class: "setup-glyph" }, { html: X.icons.icon("wifiOff", { size: 22 }) }),
            h("div", { class: "stack-1" }, [
              h("h4", {}, "No cloud connection"),
              h("p", { class: "muted", style: { margin: 0 } }, "Live rooms need a Supabase project. Add your URL and anon key in Settings — or play a hotseat on this device right now.")
            ])
          ]),
          h("div", { class: "setup-foot" }, [
            h("span", { style: { flex: 1 } }),
            W.btn("Open Settings", { size: "sm", variant: "ghost", onClick: function () { X.Router.go("/settings"); } })
          ])
        ]));
      }

      panels.push(this.hotseatPanel());

      return h("div", { class: "stack-6" }, [
        W.pageHead({
          eyebrow: "Core realm",
          title: "Multiplayer",
          sub: "Duel, squad, blitz or co-op — every match runs the same seeded cipher, streamed over realtime. Locally connected? The lobby becomes a hotseat.",
          back: { href: "#/" }
        }),
        statusChip(),
        roomBanner,
        h("div", { class: "stack-4" }, panels)
      ]);
    },

    createPanel: function () {
      var self = this;
      var ranked = true;
      var modeSel = W.select({
        options: MODE_KEYS.map(function (m) { return { value: m, label: CFG.mode(m).name + " — " + CFG.mode(m).blurb }; }),
        value: "duel",
        onChange: function (e) { ranked = !!CFG.mode(e.target.value).ranked; }
      });
      var tierSel = W.select({
        options: Object.keys(CFG.TIERS).map(function (id) { return { value: id, label: CFG.TIERS[id].name }; }),
        value: CFG.get("defaultTier")
      });
      var rankedSwitch = W.switchRow({
        title: "Ranked",
        sub: "Duel and Blitz rank by default; Squad and Co-op never do.",
        checked: true,
        onChange: function (v) { ranked = v; }
      });

      return h("div", { class: "setup-card" }, [
        h("div", { class: "setup-head" }, [
          h("span", { class: "setup-glyph" }, { html: X.icons.icon("orbit", { size: 22 }) }),
          h("div", { class: "stack-1" }, [
            h("h4", {}, "Open a room"),
            h("p", { class: "muted", style: { margin: 0 } }, "You get a five-character code to share. The host's seed is the cipher everyone races.")
          ])
        ]),
        h("div", { class: "field" }, [
          h("label", { class: "field-label" }, "Mode"),
          modeSel
        ]),
        h("div", { class: "field" }, [
          h("label", { class: "field-label" }, "Puzzle tier"),
          tierSel
        ]),
        rankedSwitch,
        h("div", { class: "setup-foot" }, [
          h("span", { style: { flex: 1 } }),
          W.btn("Create room", { icon: "plus", onClick: function () {
            var mode = modeSel.value;
            X.Multiplayer.createRoom({ mode: mode, tier: tierSel.value, ranked: ranked })
              .then(function (room) { X.Router.go("/room/" + room.code); })
              .catch(function (err) { X.Toast.error(err && err.message ? err.message : "Could not create the room."); });
          } })
        ])
      ]);
    },

    joinPanel: function () {
      var self = this;
      var codeInput = W.input({ placeholder: "ABCDE", mono: true, maxlength: 5 });
      return h("div", { class: "setup-card" }, [
        h("div", { class: "setup-head" }, [
          h("span", { class: "setup-glyph" }, { html: X.icons.icon("logIn", { size: 22 }) }),
          h("div", { class: "stack-1" }, [
            h("h4", {}, "Join by code"),
            h("p", { class: "muted", style: { margin: 0 } }, "Enter the five-character code your host shows in their room.")
          ])
        ]),
        h("div", { class: "setup-foot" }, [
          codeInput,
          h("span", { style: { flex: 1 } }),
          W.btn("Join", { icon: "arrowRight", onClick: function () {
            var code = codeInput.value.trim().toUpperCase();
            if (code.length < 3) { X.Toast.warn("Enter the room code first."); return; }
            X.Multiplayer.joinByCode(code)
              .then(function (room) { X.Router.go("/room/" + room.code); })
              .catch(function (err) { X.Toast.error(err && err.message ? err.message : "Could not join that room."); });
          } })
        ])
      ]);
    },

    hotseatPanel: function () {
      var self = this;
      var nameInputs = [0, 1, 2, 3].map(function () {
        return W.input({ placeholder: "Seat name", maxlength: 16 });
      });
      var modeSel = W.select({
        options: MODE_KEYS.map(function (m) { return { value: m, label: CFG.mode(m).name }; }),
        value: "squad"
      });
      var tierSel = W.select({
        options: Object.keys(CFG.TIERS).map(function (id) { return { value: id, label: CFG.TIERS[id].name }; }),
        value: "standard"
      });
      return h("div", { class: "setup-card" }, [
        h("div", { class: "setup-head" }, [
          h("span", { class: "setup-glyph" }, { html: X.icons.icon("users", { size: 22 }) }),
          h("div", { class: "stack-1" }, [
            h("h4", {}, "Hotseat match"),
            h("p", { class: "muted", style: { margin: 0 } }, "One device, one seeded vault, one seat at a time. Real scoring, zero accounts — perfect on a train.")
          ])
        ]),
        h("div", { class: "powerups" },
          nameInputs.map(function (inp, i) {
            return h("div", { class: "field" }, [
              h("label", { class: "field-label" }, "Seat " + (i + 1)),
              inp
            ]);
          })
        ),
        h("div", { class: "btn-row" }, [
          h("div", { class: "field", style: { flex: 1, minWidth: "140px" } }, [
            h("label", { class: "field-label" }, "Mode"),
            modeSel
          ]),
          h("div", { class: "field", style: { flex: 1, minWidth: "140px" } }, [
            h("label", { class: "field-label" }, "Tier"),
            tierSel
          ])
        ]),
        h("div", { class: "setup-foot" }, [
          h("span", { style: { flex: 1 } }),
          W.btn("Start hotseat", { icon: "play", onClick: function () {
            var names = nameInputs.map(function (i) { return i.value; });
            try {
              var match = X.Multiplayer.startHotseat({ names: names, mode: modeSel.value, tier: tierSel.value });
              X.Router.go("/room/hotseat");
            } catch (err) {
              X.Toast.error(err && err.message ? err.message : "A hotseat match needs at least two names.");
            }
          } })
        ])
      ]);
    },

    reloadRooms: function () {
      var self = this;
      var slot = dom.qs('[data-role="rooms"]');
      if (!slot) return;
      slot.textContent = "";
      slot.appendChild(W.spinner());
      X.Multiplayer.listRooms().then(function (list) {
        if (self._gone) return;
        slot.textContent = "";
        if (!list || !list.length) {
          slot.appendChild(W.empty({ icon: "radar", title: "No open rooms", message: "Open one yourself or join a friend's code." }));
          return;
        }
        list.forEach(function (room) {
          var mode = CFG.mode(room.mode);
          slot.appendChild(h("div", { class: "list-row" }, [
            h("span", { class: "setup-glyph" }, { html: X.icons.icon(mode.icon, { size: 20 }) }),
            h("div", { class: "list-row-main" }, [
              h("div", { class: "list-row-title" }, [
                mode.name,
                room.ranked ? h("span", { class: "chip chip-solid" }, "ranked") : null
              ]),
              h("div", { class: "list-row-sub" }, room.host_name + " · " + CFG.tier(room.tier).name + " · " + room.player_count + "/" + room.max_players + " players")
            ]),
            h("span", { class: "room-code mono", style: { letterSpacing: "0.14em" } }, room.code),
            W.btn("Join", { size: "sm", onClick: function () {
              X.Multiplayer.joinById(room.id)
                .then(function (r2) { X.Router.go("/room/" + r2.code); })
                .catch(function (err) { X.Toast.error(err && err.message ? err.message : "Could not join."); });
            } })
          ]));
        });
      });
    },

    renderIntoLobby: function () {
      var outlet = this._outlet || dom.qs("#view-root") || dom.qs("#app-root");
      if (outlet) { dom.mount(outlet, this.render({ query: {} })); this.bind({ query: {} }); }
    },

    bind: function (ctx) {
      var self = this;
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      var online = X.Multiplayer.available();
      if (online) this.reloadRooms();
      this._timer = setInterval(function () {
        if (self._gone) return;
        if (X.Multiplayer.online()) self.reloadRooms();
      }, 12000);
    }
  };
})(window);