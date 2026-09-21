/* ==========================================================================
   Exotic — shared play board
   The one rendering engine for a live Session, reused by single-player and
   by every multiplayer seat. It owns the hud, the vault keypad, the attempt
   log, the puzzle cards and the power-up rail; the view supplies the right
   hand column (score/streak or the rival racers) and the end screen.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;
  var W = X.Widgets;
  var CFG = X.config;

  var h = dom.el;

  function formatClock(seconds) {
    var s = Math.max(0, Math.ceil(Number(seconds) || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? "0" + m : m) + ":" + (r < 10 ? "0" + r : r);
  }

  function tierNoHints(run) {
    var t = CFG.tier(run ? run.tier : "standard");
    return !!(t && t.noHints);
  }

  function Board() {
    this.session = null;
    this.opts = {};
    this.el = null;
    this.keypad = null;
    this._subs = [];
  }

  /* -------------------------------------------------------------- mount --- */

  Board.prototype.mount = function (session, opts, target) {
    var self = this;
    this.session = session;
    this.opts = util.merge({
      showExplanations: !!CFG.get("showExplanations"),
      side: null,        /* () -> node, re-rendered each refresh */
      hudExtra: null,    /* () -> node appended in the hud */
      onFocus: null,     /* (index) slot clicked while unsolved */
      onTick: null,
      onSolve: null,
      onGuess: null,
      onEnd: null,
      currency: session.realm === "multi" ? "◈" : "⬡"
    }, opts || {});

    var run = session.run;

    this.keypad = new X.Keypad({
      max: run.slots.length,
      physical: !!CFG.get("keyboardCapture"),
      onChange: util.debounce(function () { self._renderStrip(); }, 30)
    });
    this.keypad.onSubmit = function (v) { self.guess(v); };

    this.el = h("div", { class: "board" }, [
      h("div", { class: "board-main" }, [
        this._hud(),
        h("div", { "data-role": "slots", class: "stack-2" }),
        this._codePanel(),
        h("div", { "data-role": "puzzles", class: "stack-4" }),
        this._powerups()
      ]),
      h("div", { class: "board-side" }, this.opts.side ? this.opts.side() : null)
    ]);
    target.appendChild(this.el);
    this.keypad.focus();

    this._on("tick", function () { self._hudTick(); });
    this._on("solve", function (index) { self._refresh(); if (self.opts.onSolve) self.opts.onSolve(index); });
    this._on("wrong", function (index) { self._markWrong(index); });
    this._on("commit-wrong", function (index, res) {
      if (res && res.correct) return;
      self._markWrong(index);
    });
    this._on("hint", function () { self._refresh(); });
    this._on("item", function () { self._refresh(); });
    this._on("guess", function (res) {
      self._renderStrip();
      self._renderAttempts(res);
      if (self.opts.onGuess) self.opts.onGuess(res);
    });
    this._on("ready", function (code) {
      X.Toast.info("All four slots cracked — enter " + code + " to unlock the vault.", "The code is yours");
    });
    this._on("end", function (run2, result, applied) {
      self.keypad.blur();
      if (self.opts.onEnd) self.opts.onEnd(run2, result, applied);
    });

    this._refresh();
    return this;
  };

  Board.prototype.guess = function (v) {
    if (this.session.finished) return;
    if (String(v).length !== this.session.run.slots.length) {
      X.Toast.warn("Enter all " + this.session.run.slots.length + " digits first.");
      return;
    }
    this.session.guess(v);
  };

  Board.prototype._on = function (ev, fn) {
    var self = this;
    this.session.on(ev, fn);
    this._subs.push([ev, fn]);
  };

  Board.prototype.destroy = function () {
    var self = this;
    (this._subs || []).forEach(function (pair) { self.session.off(pair[0], pair[1]); });
    this._subs = [];
    if (this.keypad) this.keypad.blur();
    if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
    this.el = null;
  };

  /* --------------------------------------------------------------- hud ---- */

  Board.prototype._hud = function () {
    var run = this.session.run;
    var tier = CFG.tier(run.tier);
    var secs = Math.max(0, Math.ceil((run.endsAt - Date.now()) / 1000));
    return h("div", { class: "hud", "data-role": "board-hud" }, [
      h("div", { class: "hud-item" }, [
        h("span", { class: "hud-label" }, "Tier"),
        h("span", { class: "hud-value", style: { fontSize: "var(--fs-sm)" } }, tier.name)
      ]),
      this.opts.hudExtra ? this.opts.hudExtra() : null,
      h("div", { class: "hud-spacer" }),
      h("div", { class: "hud-item" }, [
        h("span", { class: "hud-label" }, "Guesses left"),
        h("div", { class: "hud-value", style: { display: "flex", gap: "4px", alignItems: "center", height: "20px" } },
          Array.from({ length: run.guessesTotal || 8 }).map(function (_, i) {
            return h("span", {
              class: "dot" + (i < run.attemptsLeft ? " dot-live" : ""),
              style: { width: "9px", height: "9px" }
            });
          })
        )
      ]),
      W.timerRing(secs, this._timePct(secs))
    ]);
  };

  Board.prototype._timePct = function (secs) {
    var run = this.session.run;
    var total = Math.max(1, Math.ceil((run.endsAt - run.startedAt) / 1000));
    return util.clamp(secs / total, 0, 1);
  };

  Board.prototype._hudTick = function () {
    var hud = this.el && this.el.querySelector('[data-role="board-hud"]');
    if (!hud) return;
    var run = this.session.run;
    var secs = Math.max(0, Math.ceil((run.endsAt - Date.now()) / 1000));
    var ring = hud.querySelector(".timer-ring");
    if (ring) {
      var label = ring.querySelector(".label");
      if (label) label.textContent = formatClock(secs);
      var fill = ring.querySelector(".fill");
      if (fill) {
        var C = 2 * Math.PI * 26;
        fill.setAttribute("stroke-dashoffset", C * (1 - this._timePct(secs)));
      }
      ring.classList.toggle("is-critical", secs <= 15);
    }
    var dots = hud.querySelectorAll(".dot");
    var left = run.attemptsLeft;
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle("dot-live", i < left);
    if (this.opts.onTick) this.opts.onTick(secs);
  };

  /* ---------------------------------------------------------- status ----- */

  Board.prototype._slotsRow = function () {
    var run = this.session.run;
    var self = this;
    var slots = run.slots.map(function (s, i) {
      return { index: i, solved: s.solved, digit: s.solved ? s.digit : null, current: i === self.opts.focusIndex };
    });
    return W.slots(slots);
  };

  /* --------------------------------------------------------- code panel -- */

  Board.prototype._codePanel = function () {
    var self = this;
    var strip = h("div", { class: "guess-strip", "data-role": "guess-strip" });
    var log = h("div", { class: "attempt-log", "data-role": "attempt-log" });
    var submit = W.btn("Unlock the vault", {
      icon: "lock",
      block: true,
      onClick: function () { self.guess(self.keypad.value); }
    });

    this._renderStrip = function () {
      strip.textContent = "";
      var v = self.keypad ? self.keypad.value : "";
      var n = self.session.run.slots.length;
      for (var i = 0; i < n; i++) {
        strip.appendChild(h("span", {
          class: "guess-cell" + (v[i] != null ? " filled" : "") + (i === v.length && !self.session.finished ? " cursor" : ""),
          style: i === v.length && self.session.finished ? null : null
        }, v[i] != null ? v[i] : "·"));
      }
    };

    return h("div", { class: "code-panel" }, [
      h("div", { class: "code-panel-head" }, [
        h("div", { class: "stack-1" }, [
          h("div", { class: "hud-label" }, "Vault entry"),
          h("div", { class: "hint" }, "Wrong guesses cost an attempt and six seconds. Solving all four slots reveals the exact code.")
        ]),
        submit
      ]),
      strip,
      log,
      this.keypad.el
    ]);
  };

  Board.prototype._renderAttempts = function () {
    var log = this.el && this.el.querySelector('[data-role="attempt-log"]');
    if (!log) return;
    var run = this.session.run;
    log.textContent = "";
    run.guesses.slice().reverse().forEach(function (g, idx) {
      var marks = g.marks || [];
      log.appendChild(h("div", { class: "attempt" + (g.correct ? " hit" : "") }, [
        h("span", { class: "guess-value", style: { letterSpacing: "0.2em", flex: "none" } }, String(g.value)),
        h("span", { class: "attempt-marks" },
          marks.map(function (m) {
            return h("span", { class: "mark" + (m.hit ? " on" : "") }, m.hit ? "✓" : "·");
          })
        ),
        h("span", { class: "hint", style: { marginLeft: "auto" } },
          g.correct ? "VAULT OPEN" : (g.penaltyMs ? "-" + Math.round(g.penaltyMs / 1000) + "s" : idx < 0 ? "" : ""))
      ]));
    });
  };

  /* --------------------------------------------------------- puzzles ----- */

  Board.prototype._puzzleCard = function (slot, index) {
    var self = this;
    var run = this.session.run;
    var cur = index === this.opts.focusIndex;
    var cls = "puzzle" + (slot.solved ? " is-solved" : cur ? " is-active" : "");
    var diff = slot.puzzle.difficulty || 1;

    var dots = h("div", { class: "puzzle-dots" },
      Array.from({ length: 5 }).map(function (_, i) {
        return h("span", { class: "pdot" + (i < diff ? " on" : "") });
      })
    );

    var choices;
    if (slot.solved) {
      choices = h("div", { class: "puzzle-solved" }, [
        { html: X.icons.icon("check", { size: 18 }) },
        h("span", {}, "Slot " + (index + 1) + " resolved"),
        h("span", { class: "digit" }, String(slot.digit))
      ]);
    } else {
      choices = h("div", { class: "choices" },
        Array.from({ length: 10 }).map(function (_, d) {
          var inCands = slot.candidates && slot.candidates.length ? slot.candidates.indexOf(d) >= 0 : true;
          var wrong = slot.wrongPicks.indexOf(String(d)) >= 0;
          var label = wrong ? "tried" : (!inCands ? "ruled out" : "—");
          return h("button", {
            type: "button",
            class: "choice" + (wrong ? " is-wrong" : "") + (!inCands ? " is-wrong" : ""),
            style: inCands ? null : { opacity: 0.45 },
            onclick: function () { self._pickAnswer(index, d); }
          }, [
            h("span", { class: "choice-key" }, String(d)),
            h("span", { class: "hint" }, label)
          ]);
        })
      );
    }

    var hintBtn = null;
    if (!slot.solved && !tierNoHints(run) && !run.modifiers.noHints) {
      var level = Math.min(3, (slot.hintLevel || 0) + 1);
      var cost = X.Engine.hintCost(run, level);
      hintBtn = W.btn("Hint " + level + " · " + util.fmtNum(cost) + " " + this.opts.currency, {
        size: "sm",
        variant: "ghost",
        onClick: function () {
          self.session.hint(index).then(function (res) {
            if (res && res.ok) {
              if (X.audio && X.audio.hint) X.audio.hint();
            } else if (res && res.reason) {
              X.Toast.info(res.reason);
            }
          });
        }
      });
    }

    var hintText = slot.hintText ? h("div", { class: "hint", style: { fontFamily: "var(--font-mono)", fontSize: "var(--fs-xs)" } }, slot.hintText) : null;

    var codeLine = slot.solved
      ? h("div", { class: "puzzle-code" }, "Digit " + slot.digit)
      : h("div", { class: "puzzle-code" },
          slot.candidates && slot.candidates.length < 10
            ? "Candidates: " + slot.candidates.join("  ")
            : "Candidates: 0 1 2 3 4 5 6 7 8 9");

    return h("div", { class: cls, "data-slot-card": index }, [
      h("div", { class: "puzzle-head" }, [
        h("div", { class: "puzzle-meta" }, [
          h("span", { class: "chip" }, [
            { html: X.icons.icon(X.Puzzles.categoryIcon(slot.puzzle.category), { size: 12 }) },
            X.Puzzles.categoryLabel(slot.puzzle.category)
          ]),
          dots
        ]),
        slot.solved
          ? h("span", { class: "tag" }, "SOLVED")
          : h("button", {
            type: "button",
            class: "tag",
            onclick: function () { if (self.opts.onFocus) self.opts.onFocus(index); }
          }, "slot " + (index + 1) + " ▸")
      ]),
      h("div", { class: "puzzle-prompt" }, String(slot.puzzle.prompt || "Resolve this slot to its digit.")),
      codeLine,
      hintText,
      choices,
      slot.solved && this.opts.showExplanations && slot.puzzle.explanation
        ? h("div", { class: "puzzle-explain" }, slot.puzzle.explanation)
        : null,
      h("div", { class: "puzzle-foot" }, [
        hintBtn || h("span", {}),
        W.puzzleDots(run.slots.length, index, X.Engine.solvedCount(run))
      ])
    ]);
  };

  Board.prototype._pickAnswer = function (index, digit) {
    var res = this.session.answer(index, String(digit));
    if (res.ok) {
      if (X.fx && X.fx.burst && this.el) {
        var card = this.el.querySelector('[data-slot-card="' + index + '"]');
        var rect = card ? card.getBoundingClientRect() : null;
        if (rect) X.fx.burst.sparks(rect.left + rect.width / 2, rect.top + rect.height / 2, { count: 22 });
      }
      if (X.audio && X.audio.solve) X.audio.solve();
    } else if (res.reason !== "already-solved" && res.reason !== "This run is over.") {
      this._markWrong(index);
      if (X.audio && X.audio.wrong) X.audio.wrong();
    }
  };

  Board.prototype._markWrong = function (index) {
    var card = this.el && this.el.querySelector('[data-slot-card="' + index + '"]');
    if (!card) return;
    card.classList.remove("is-shaking");
    void card.offsetWidth;
    card.classList.add("is-shaking");
    setTimeout(function () { card.classList.remove("is-shaking"); }, 420);
  };

  /* --------------------------------------------------------- powerups ---- */

  Board.prototype._powerups = function () {
    var self = this;
    var R = X.Cloud.realm(this.session.realm);
    var mine = (R.inventory || []).filter(function (row) { return row.quantity > 0; });
    var chips = mine.map(function (row) {
      var item = X.Shop.get(row.item_id);
      if (!item || item.type !== "power") return null;
      if (!X.Engine.ITEM_HANDLERS[item.effect.key]) return null; /* sabotage family is handled by the room view */
      return h("button", {
        type: "button",
        class: "powerup",
        title: item.desc,
        onclick: function () {
          self.session.useItem(item.id).then(function (res) {
            if (res && !res.ok) X.Toast.info(res.reason || "That did not work.");
            else if (res && res.ok && X.audio && X.audio.item) X.audio.item();
          });
        }
      }, [
        { html: X.icons.icon(item.icon, { size: 16 }) },
        h("span", { class: "powerup-text" }, [
          h("strong", {}, item.name),
          h("span", {}, "×" + row.quantity)
        ])
      ]);
    }).filter(Boolean);

    return h("div", { class: "stack-2" }, [
      h("div", { class: "hud-label" }, "Power-ups"),
      chips.length
        ? h("div", { class: "powerups" }, chips)
        : h("div", { class: "hint" }, "No power-ups yet — grab some in the shop. Answers, hints and Fifty-Fifty need no items.")
    ]);
  };

  /* --------------------------------------------------------- refresh ----- */

  Board.prototype._refresh = function () {
    if (!this.el) return;
    var self = this;

    var slotsWrap = this.el.querySelector('[data-role="slots"]');
    if (slotsWrap) {
      slotsWrap.textContent = "";
      slotsWrap.appendChild(this._slotsRow());
    }

    var puzzlesWrap = this.el.querySelector('[data-role="puzzles"]');
    if (puzzlesWrap) {
      puzzlesWrap.textContent = "";
      var run = this.session.run;
      var parts = [];
      for (var i = 0; i < run.slots.length; i++) {
        parts.push(this._puzzleCard(run.slots[i], i));
      }
      parts.forEach(function (n) { puzzlesWrap.appendChild(n); });
    }

    var side = this.el.querySelector(".board-side");
    if (side && this.opts.side) {
      side.textContent = "";
      var s = this.opts.side();
      if (Array.isArray(s)) s.forEach(function (n) { side.appendChild(n); });
      else if (s) side.appendChild(s);
    }

    this._renderStrip();
    this._renderAttempts();
  };

  X.Board = Board;
  X.Board.formatClock = formatClock;
})(window);