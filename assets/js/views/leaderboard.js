/* ==========================================================================
   Exotic — leaderboard view
   One leaderboard per realm, metric-driven, and live: a realtime channel
   repaints the table the moment a row ahead of you moves. Each realm keeps
   its own hall of fame, so Shard records never leak into Core.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;
  var W = X.Widgets;

  var h = dom.el;
  X.views = X.views || {};

  var METRICS = {
    single: [
      { id: "total_score", label: "Score" },
      { id: "xp", label: "XP" },
      { id: "puzzles_solved", label: "Solved" },
      { id: "best_time_ms", label: "Best time" },
      { id: "streak", label: "Streak" }
    ],
    multi: [
      { id: "elo", label: "Rating" },
      { id: "total_score", label: "Score" },
      { id: "wins", label: "Wins" },
      { id: "streak", label: "Streak" }
    ]
  };

  function realmOf(ctx) { return ctx.query.realm === "multi" ? "multi" : "single"; }

  function fmtValue(metric, v) {
    if (metric === "best_time_ms" && v) {
      var s = Math.round(Number(v) / 1000);
      return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }
    if (metric === "elo") return Math.round(Number(v) || 1000);
    return util.fmtNum(v);
  }

  function podium(rows, metric) {
    if (!rows.length) return null;
    return h("div", { class: "podium" },
      [1, 0, 2].map(function (order) {
        var row = rows[order];
        if (!row) return null;
        var place = ["second", "first", "third"][order];
        return h("div", { class: "podium-card" + (order === 0 ? " first" : "") }, [
          h("div", { class: "podium-rank" }, util.ordinal(order + 1)),
          W.avatar(row.username, { size: "lg", solid: order === 0 }),
          h("div", { class: "podium-name" }, row.username),
          h("div", { class: "podium-score" }, fmtValue(metric, row.value)),
          h("div", { class: "faint", style: { fontSize: "var(--fs-2xs)" } }, "level " + (row.level || 1))
        ]);
      })
    );
  }

  function rows(list, metric, mineId) {
    if (!list.length) {
      return W.empty({
        icon: "radar",
        title: "Not a single record yet",
        message: "Crack a cipher and your name shows up here first."
      });
    }
    return h("div", { class: "rows" }, list.map(function (row, i) {
      var isYou = mineId && row.id === mineId;
      return h("div", { class: "list-row" }, [
        h("span", { class: "rank-no" + (i < 3 ? " is-top" : "") }, String(i + 1).padStart(2, "0")),
        W.avatar(row.username, { size: "sm", solid: i < 3 }),
        h("div", { class: "list-row-main" }, [
          h("div", { class: "list-row-title" }, [row.username, isYou ? h("span", { class: "chip chip-solid" }, "you") : null]),
          h("div", { class: "list-row-sub" }, "Level " + (row.level || 1))
        ]),
        h("div", { class: "mono", style: { fontWeight: 700 } }, fmtValue(metric, row.value))
      ]);
    }));
  }

  X.views.leaderboard = {
    _handle: null,

    mount: function (outlet, ctx) {
      dom.mount(outlet, this.render(ctx));
      this.bind(ctx);
    },
    render: function (ctx) {
      var realm = realmOf(ctx);
      var metrics = METRICS[realm];
      var metric = ctx.query.metric || metrics[0].id;
      return h("div", { class: "stack-6" }, [
        W.pageHead({
          eyebrow: realm === "multi" ? "Core realm" : "Shard realm",
          title: "Hall of records",
          sub: realm === "multi"
            ? "The ranked Core ladder, live as matches land."
            : "The Shard ledger — best scores, fastest cracks, longest streaks.",
          back: { href: "#/" }
        }),
        h("div", { class: "lb-tabs", "data-role": "lb-tabs" },
          metrics.map(function (m) {
            return W.btn(m.label, {
              size: "sm",
              variant: metric === m.id ? "" : "ghost",
              onClick: function () { X.views.leaderboard.switchMetric(realm, m.id); }
            });
          })
        ),
        h("div", { class: "stack-4" }, [
          h("div", { "data-role": "lb-podium" }),
          h("div", { "data-role": "lb-list" })
        ])
      ]);
    },

    switchMetric: function (realm, metric) {
      var self = X.views.leaderboard;
      self._metric = metric;
      self.reload(realm, metric);
      var tabs = dom.qs('[data-role="lb-tabs"]');
      if (tabs) {
        dom.qsa(".btn", tabs).forEach(function (b) {
          b.classList.toggle("btn-ghost", b.textContent.trim() !== metric);
        });
      }
    },

    bind: function (ctx) {
      var self = this;
      var realm = realmOf(ctx);
      this._realm = realm;
      this._metric = ctx.query.metric && METRICS[realm].some(function (m) { return m.id === ctx.query.metric; })
        ? ctx.query.metric : METRICS[realm][0].id;
      this.reload(realm, this._metric);
      if (X.Cloud.realm(realm).online()) {
        this._handle = X.Realtime.leaderboard(realm, {
          onChange: util.debounce(function () { self.reload(realm, self._metric); }, 800)
        });
      }
    },

    reload: function (realm, metric) {
      var self = this;
      var R = X.Cloud.realm(realm);
      R.leaderboard(metric, 20).then(function (list) {
        var mineId = R.profile ? R.profile.id : null;
        var pod = dom.qs('[data-role="lb-podium"]');
        var listEl = dom.qs('[data-role="lb-list"]');
        if (pod) pod.textContent = "";
        if (listEl) listEl.textContent = "";
        if (pod && list.length) pod.appendChild(podium(list, metric));
        if (listEl) listEl.appendChild(rows(list, metric, mineId));
      });
    },

    unmount: function () {
      if (this._handle) { try { this._handle.close(); } catch (e) { /* noop */ } this._handle = null; }
      return true;
    }
  };
})(window);