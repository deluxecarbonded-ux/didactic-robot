/* ==========================================================================
   Exotic — single player view
   The Shard realm, end to end: tier picker, live board, and the vault
   seal (win or lose). A saved run can be resumed later; the daily cipher
   is one seeded vault per calendar day, identical for everyone.
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

  X.views["single-play"] = {
    _phase: "setup",
    _tier: null,
    _session: null,
    _board: null,
    _dial: null,
    _gone: false,

    mount: function (outlet, ctx) {
      this._outlet = outlet;
      this._gone = false;
      this.renderInto();
    },

    unmount: function () {
      this._gone = true;
      if (this._board) { this._board.destroy(); this._board = null; }
      if (this._dial) { this._dial.destroy && this._dial.destroy(); this._dial = null; }
      return true;
    },

    /* ------------------------------------------------------------- render -- */

    render: function (ctx) {
      var self = this;
      this._gone = false;
      if (this._phase === "end") return this.renderEnd();
      if (this._phase === "play" && this._session) return this.renderBoard();
      return this.renderSetup(ctx);
    },

    /* ============================================================ setup ==== */

    renderSetup: function (ctx) {
      var self = this;

      var tierRows = Object.keys(CFG.TIERS).map(function (id) {
        var t = CFG.TIERS[id];
        return h("div", { class: "setup-card" }, [
          h("div", { class: "setup-head" }, [
            h("span", { class: "setup-glyph" }, { html: X.icons.icon(t.icon, { size: 22 }) }),
            h("div", { class: "stack-1" }, [
              h("div", { style: { display: "flex", alignItems: "center", gap: "var(--sp-2)" } }, [
                h("h4", {}, t.name),
                t.noHints ? h("span", { class: "chip chip-solid" }, "no hints") : null
              ]),
              h("p", { class: "muted", style: { margin: 0 } }, t.blurb)
            ])
          ]),
          h("div", { class: "setup-foot" }, [
            W.chip(t.seconds + "s", { icon: "timer" }),
            W.chip(t.guesses + " guesses", { icon: "target" }),
            W.chip(t.puzzles + " puzzles", { icon: "lock" }),
            W.chip("hints " + t.hintCost + " ⬡", { icon: "lightbulb" }),
            W.chip("×" + t.shardMult + " shards", { icon: "gem" }),
            W.chip("×" + t.xpMult + " xp", { icon: "trending" }),
            h("span", { style: { flex: 1 } }),
            W.btn("Crack it", { size: "sm", onClick: function () { self.startTier(id); } })
          ])
        ]);
      });

      var dailyDone = X.SinglePlayer.dailyDone();
      var dailyCard = h("div", { class: "setup-card" }, [
        h("div", { class: "setup-head" }, [
          h("span", { class: "setup-glyph" }, { html: X.icons.icon("calendar", { size: 22 }) }),
          h("div", { class: "stack-1" }, [
            h("h4", {}, "Daily cipher" + (dailyDone ? " — cleared today" : "")),
            h("p", { class: "muted", style: { margin: 0 } }, "One seeded vault per calendar day, the same four puzzles for everyone on the board.")
          ])
        ]),
        h("div", { class: "setup-foot" }, [
          h("span", { class: "hint" }, "Standard tier · no special rules"),
          h("span", { style: { flex: 1 } }),
          W.btn(dailyDone ? "Done for today" : "Take the daily", {
            size: "sm",
            disabled: dailyDone,
            onClick: function () { self.startDaily(); }
          })
        ])
      ]);

      return h("div", { class: "stack-6" }, [
        W.pageHead({
          eyebrow: "Shard realm",
          title: "Solo vaults",
          sub: "Four puzzles, one code, a tier that decides how rude it gets. Shards are the payout; the streak is the pride.",
          back: { href: "#/" }
        }),
        h("div", { class: "stack-4" },
          tierRows.concat([
            dailyCard,
            h("div", { "data-role": "resume-slot" })
          ])
        )
      ]);
    },

    /* ============================================================ board ==== */

    renderBoard: function () {
      var self = this;
      var session = this._session;
      var tier = CFG.tier(session.run.tier);

      var top = h("div", { class: "stack-3" }, [
        h("div", { class: "breadcrumb" }, [
          h("a", { class: "back-link", href: "#/play", onclick: function (e) {
            e.preventDefault();
            self.leavePrompt();
          } }, [
            { html: X.icons.icon("arrowLeft", { size: 14 }) },
            "Vaults"
          ]),
          h("span", { class: "sep" }, "·"),
          h("span", { class: "mono" }, session.run.mode === "daily" ? "DAILY" : tier.name.toUpperCase()),
          session.run.outcome ? h("span", { class: "chip" }, session.run.outcome) : null
        ]),
        h("div", { class: "page-head-row" }, [
          h("h1", {}, session.run.mode === "daily" ? "Daily cipher" : tier.name + " vault"),
          h("div", { class: "profile-actions" }, [
            W.btn("Save & leave", {
              size: "sm",
              variant: "ghost",
              onClick: function () {
                session.save().then(function () {
                  X.Toast.success("Vault snapshotted — you can resume it any time.");
                  self._phase = "setup";
                  self.renderInto();
                });
              }
            }),
            W.btn("Give up", {
              size: "sm",
              variant: "ghost",
              onClick: function () { self.leavePrompt(); }
            })
          ])
        ])
      ]);

      var holder = h("div", { "data-role": "board-holder" });

      return h("div", { class: "stack-5" }, [top, holder]);
    },

    renderInto: function () {
      var outlet = this._outlet || dom.qs("#view-root") || dom.qs("#app-root");
      if (!outlet) return;
      var self = this;
      if (this._board) { this._board.destroy(); this._board = null; }
      if (this._phase === "end") { dom.mount(outlet, this.renderEnd()); return; }
      if (this._phase === "play" && this._session) {
        dom.mount(outlet, this.renderBoard());
        var holder = dom.qs('[data-role="board-holder"]');
        if (holder) {
          var session = this._session;
          this._board = new X.Board().mount(session, {
            focusIndex: this._activeSlot(),
            onSolve: function () {
              self._board.opts.focusIndex = self._activeSlot();
              self._board._refresh();
            },
            hudExtra: function () {
              var R = X.Cloud.realm("single");
              return h("div", { class: "hud-item" }, [
                h("span", { class: "hud-label" }, "Streak"),
                h("span", { class: "hud-value", style: { fontSize: "var(--fs-sm)" } },
                  (R.profile ? (R.profile.streak || 0) : 0) + " streak")
              ]);
            },
            side: function () { return self.sidePanel(); },
            onEnd: function () {},
            showExplanations: !!CFG.get("showExplanations")
          }, holder);
        }
        return;
      }
      dom.mount(outlet, this.renderSetup({}));
      this.renderSetupAsync();
    },

    renderSetupAsync: function () {
      this.mountResumeCard(dom.qs('[data-role="resume-slot"]'));
    },

    mountResumeCard: function (slot) {
      var self = this;
      if (!slot) return;
      X.SinglePlayer.hasSaved().then(function (has) {
        if (!has || self._gone) return;
        slot.appendChild(h("div", { class: "setup-card" }, [
          h("div", { class: "setup-head" }, [
            h("span", { class: "setup-glyph" }, { html: X.icons.icon("refresh", { size: 22 }) }),
            h("div", { class: "stack-1" }, [
              h("h4", {}, "Saved vault"),
              h("p", { class: "muted", style: { margin: 0 } }, "An in-progress cipher is waiting. Resume where you left off.")
            ])
          ]),
          h("div", { class: "setup-foot" }, [
            h("span", { style: { flex: 1 } }),
            W.btn("Resume", { size: "sm", onClick: function () { self.startResume(); } }),
            W.btn("Abandon the saved run", { size: "sm", variant: "ghost", onClick: function () {
              X.Cloud.realm("single").clearRun().then(function () {
                X.Toast.info("Saved vault discarded.");
                slot.textContent = "";
              });
            } })
          ])
        ]));
      });
    },

    /* ============================================================== side === */

    sidePanel: function () {
      var self = this;
      var session = this._session;
      var R = X.Cloud.realm("single");
      var run = session.run;
      var p = R.profile || {};
      var solved = X.Engine.solvedCount(run);
      var pct = solved / run.slots.length;

      var status = h("section", { class: "panel stack-3" }, [
        h("div", { class: "section-head" }, [h("h3", {}, "Run")]),
        W.meter({ label: "Solved", value: solved + " / " + run.slots.length, pct: pct }),
        h("div", { class: "hud" }, [
          h("div", { class: "hud-item" }, [
            h("span", { class: "hud-label" }, "Elapsed"),
            h("span", { class: "hud-value", "data-role": "clock-elapsed", style: { fontSize: "var(--fs-sm)" } }, "0:00")
          ]),
          h("div", { class: "hud-item" }, [
            h("span", { class: "hud-label" }, "Hints"),
            h("span", { class: "hud-value", style: { fontSize: "var(--fs-sm)" } }, String(run.hintsUsed || 0))
          ])
        ])
      ]);

      var you = h("section", { class: "panel stack-3" }, [
        h("div", { class: "section-head" }, [h("h3", {}, "Trade")]),
        h("div", { class: "list-row" }, [
          W.avatar(p.display_name || p.username || "You", { size: "sm" }),
          h("div", { class: "list-row-main" }, [
            h("div", { class: "list-row-title" }, p.display_name || "Streak " + (p.streak || 0)),
            h("div", { class: "list-row-sub" }, "streak " + (p.streak || 0) + " · level " + (p.level || 1))
          ]),
          h("span", { class: "mono" }, util.fmtNum(p.shards || 0) + " ⬡")
        ]),
        h("div", { class: "hint" }, tierNoHintsNote(run)),
        W.btn("Open shop", { variant: "ghost", block: true, icon: "gem", onClick: function () {
          X.Router.go("/shop?realm=single");
        } })
      ]);

      function tierNoHintsNote(run) {
        var t = CFG.tier(run.tier);
        if (t.noHints) return "This tier is silent: no hints, no oracles.";
        var next = Math.min(3, (run.slots[0] ? run.slots[0].hintLevel : 0) + 1);
        return "Hints cost " + X.Engine.hintCost(run, next) + " ⬡ and climb as tiers get meaner.";
      }

      return [status, you];
    },

    /* ============================================================== end ==== */

    renderEnd: function () {
      var self = this;
      var rec = X.SinglePlayer.lastResult || {};
      var run = rec.run || (this._session ? this._session.run : null);
      var result = rec.result;
      var applied = rec.applied;
      if (!run) {
        this._phase = "setup";
        return this.renderSetup({});
      }
      var won = run.outcome === "won";

      var dialWrap = h("div", { style: { display: "grid", placeItems: "center" } }, [
        h("canvas", { class: "dial-canvas", width: 260, height: 260, "aria-hidden": "true" })
      ]);

      var stats = [];
      if (result) {
        stats = [
          { label: "Score", value: util.fmtNum(result.score) },
          { label: "XP", value: "+" + util.fmtNum(result.xp) },
          { label: "Shards", value: "+" + util.fmtNum(result.currency) + " ⬡" },
          { label: "Time", value: X.Board.formatClock(run.elapsedMs / 1000) },
          { label: "Solved", value: result.solved + "/" + result.total },
          { label: "Wrong guesses", value: String(run.guesses.filter(function (g) { return !g.correct; }).length) }
        ];
      }

      var badges = [];
      if (applied && applied.earned && applied.earned.length) {
        badges = applied.earned.map(function (b) {
          return h("span", { class: "chip chip-solid" }, [
            { html: X.icons.icon(b.icon, { size: 12 }) },
            b.name
          ]);
        });
      }

      var levelUp = applied && applied.levelUp
        ? h("div", { class: "hint" }, "LEVEL UP — level " + applied.levelUp.from + " → " + applied.levelUp.to)
        : null;

      return h("div", { class: "stack-6", style: { maxWidth: "620px", margin: "0 auto" } }, [
        h("div", { class: "panel stack-5" }, [
          h("div", { class: "center stack-2", style: { textAlign: "center" } }, [
            h("div", { class: "hud-label" }, won ? "VAULT OPEN" : "VAULT SEALED"),
            h("h1", {}, won ? "The code was " + run.code.join("") : "You ran out of time"),
            h("p", { class: "muted" }, won
              ? "All four rings aligned. The vault swings open."
              : "The vault stays sealed. The code was " + run.code.join("") + " — it will do you no good now."),
            levelUp
          ]),
          dialWrap,
          h("div", { class: "stat-grid" }, stats.map(function (s) { return W.stat(s.label, s.value); })),
          badges.length ? h("div", { class: "cat-row" }, badges) : null,
          h("div", { class: "btn-row" }, [
            W.btn("Run it again", { icon: "refresh", onClick: function () {
              self._phase = "setup";
              self.renderInto();
            } }),
            W.btn("Home", { variant: "ghost", icon: "house", onClick: function () { X.Router.go("/"); } }),
            W.btn("Profile", { variant: "ghost", icon: "user", onClick: function () { X.Router.go("/profile?realm=single"); } })
          ])
        ])
      ]);
    },

    /* =========================================================== actions === */

    _activeSlot: function () {
      if (!this._session) return 0;
      for (var i = 0; i < this._session.run.slots.length; i++) {
        if (!this._session.run.slots[i].solved) return i;
      }
      return 0;
    },

    startTier: function (id) {
      var self = this;
      var session = X.SinglePlayer.create({ tier: id });
      this._phase = "play";
      this._session = session;
      this.wireSession(session);
      this.renderInto();
    },

    startDaily: function () {
      var self = this;
      var session = X.SinglePlayer.daily();
      this._phase = "play";
      this._session = session;
      this.wireSession(session);
      this.renderInto();
    },

    startResume: function () {
      var self = this;
      X.SinglePlayer.resume().then(function (session) {
        if (!session) { X.Toast.info("No saved vault to resume."); return; }
        self._phase = "play";
        self._session = session;
        self.wireSession(session);
        self.renderInto();
      });
    },

    wireSession: function (session) {
      var self = this;
      session.on("end", function (run, result, applied) {
        if (self._gone) return;
        self._phase = "end";
        self.renderInto();
        if (run.outcome === "won") {
          if (X.fx && X.fx.burst) X.fx.burst.confetti({ count: 160 });
          self.spinDial(run);
        } else {
          self.spinDial(run);
        }
      });
      session.on("tick", function (t) {
        var el = dom.qs('[data-role="clock-elapsed"]');
        if (el) el.textContent = X.Board.formatClock(t.elapsed / 1000);
        if (self._board && t.critical) {
          var ring = self._board.el && self._board.el.querySelector(".timer-ring");
          if (ring) ring.classList.add("is-critical");
        }
      });
    },

    spinDial: function (run) {
      var canvas = document.querySelector(".dial-canvas");
      if (!canvas) return;
      var dial = new X.VaultDial(canvas, { size: 260, rings: run.slots.length });
      this._dial = dial;
      dial.init();
      run.slots.forEach(function (s, i) {
        setTimeout(function () { dial.reveal(i, s.digit); }, 300 + i * 320);
      });
    },

    leavePrompt: function () {
      var self = this;
      X.Modal.confirm({
        title: "Leave this vault?",
        message: "Your progress is snapshotted and can be resumed from the vault list.",
        confirmLabel: "Save & leave",
        cancelLabel: "Keep playing"
      }).then(function (ok) {
        if (!ok) return;
        var session = self._session;
        if (session && !session.finished) {
          session.save().then(function () {
            session.stop();
            self._phase = "setup";
            self.renderInto();
          });
        } else {
          self._phase = "setup";
          self.renderInto();
        }
      });
    },

    /* ============================================================= bind ==== */

    bind: function (ctx) {
      // kept for the view contract; mount() routes through renderInto(),
      // which already mounts the resume card via renderSetupAsync.
    }
  };
})(window);