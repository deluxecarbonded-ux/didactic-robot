/* ==========================================================================
   Exotic — profile view
   One ledger per realm: level, currency, streak, mastery, badges and a
   scroll of every vault you have cracked (or failed). Nothing here reaches
   across realms.
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

  function realmOf(ctx) { return ctx.query.realm === "multi" ? "multi" : "single"; }
  function glyph(realm) { return realm === "multi" ? "orbit" : "gem"; }

  function timeAgo(ts) {
    if (!ts) return "";
    var s = Math.max(0, Math.floor((Date.now() - Number(ts)) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function tags(p, realm) {
    var out = [];
    out.push(h("span", { class: "chip chip-solid" }, "Level " + (p.level || 1)));
    if (realm === "multi") {
      var r = CFG.rankFor(p.elo == null ? 1000 : p.elo);
      out.push(h("span", { class: "chip" }, [r.icon ? { html: X.icons.icon(r.icon, { size: 12 }) } : null, r.name]));
      out.push(h("span", { class: "chip" }, Math.round(p.elo || 1000) + " elo"));
      out.push(h("span", { class: "chip" }, p.rank_id ? "season " + (p.season || "") : ""));
    } else {
      out.push(h("span", { class: "chip" }, util.fmtNum(p.shards || 0) + " ⬡"));
      out.push(h("span", { class: "chip" }, (p.runs_won || 0) + " cracked"));
    }
    return out;
  }

  function stats(p, realm) {
    var sum;
    if (realm === "multi") {
      sum = [
        { label: "Cores", value: util.fmtNum(p.cores || 0), icon: "orbit" },
        { label: "Rating", value: Math.round(p.elo || 1000), icon: "hash" },
        { label: "Wins", value: util.fmtNum(p.wins || 0), icon: "trophy" },
        { label: "Matches", value: util.fmtNum(p.matches || 0), icon: "swords" }
      ];
    } else {
      sum = [
        { label: "Shards", value: util.fmtNum(p.shards || 0), icon: "gem" },
        { label: "Streak", value: (p.streak || 0) + (p.streak === 1 ? " win" : " wins"), icon: "flame" },
        { label: "Best streak", value: (p.best_streak || 0) + "w", icon: "award" },
        { label: "Solved", value: util.fmtNum(p.puzzles_solved || 0), icon: "brain" }
      ];
    }
    return h("div", { class: "stat-grid" }, sum.map(function (s) { return W.stat(s.label, s.value, { icon: s.icon }); }));
  }

  function xpBlock(p, realm) {
    var lv = CFG.XP.levelFor(p.xp || 0);
    var pct = lv.need ? util.clamp(lv.into / lv.need, 0, 1) : 1;
    return h("section", { class: "panel" }, [
      h("div", { class: "section-head" }, [
        h("h3", {}, "Level " + lv.level + (realm === "multi" && CFG.rankFor(p.elo || 1000) ? " · " + CFG.rankFor(p.elo || 1000).name : "")),
        h("span", { class: "mono" }, util.fmtNum(p.xp || 0) + " xp")
      ]),
      W.meter({
        label: "Progress to level " + (lv.level + 1),
        value: util.fmtNum(lv.into) + " / " + util.fmtNum(lv.need),
        pct: pct
      })
    ]);
  }

  function mastery(p) {
    var cats = X.Puzzles.categories();
    var stats = p.category_stats || {};
    var rows = cats.slice(0, 8).map(function (c) {
      var n = stats[c.id] || 0;
      return h("div", { class: "mastery-row" }, [
        h("div", { class: "mastery-name" }, c.label),
        W.bar(util.clamp(n / 40, 0, 1), { thin: true }),
        h("div", { class: "mastery-val" }, String(n))
      ]);
    });
    return h("section", { class: "panel" }, [
      h("div", { class: "section-head" }, [h("h3", {}, "Mastery"), h("span", { class: "muted" }, "Puzzles solved per family")]),
      h("div", { class: "mastery" }, rows)
    ]);
  }

  function badges(p, realm) {
    var ctx = X.Profile.badgeContext(realm, p);
    var earned = X.Badges.evaluate(ctx);
    var cards = X.Badges.all().map(function (b) {
      var has = earned.indexOf(b.id) >= 0;
      return h("div", {
        class: "badge" + (has ? " earned" : " locked"),
        title: has ? b.name + " — " + b.desc : "Locked: " + b.desc
      }, [
        h("div", { class: "badge-glyph" }, {
          html: has ? X.icons.icon(b.icon, { size: 20 }) : X.icons.icon("lock", { size: 18 })
        }),
        h("div", { class: "badge-name" }, has ? b.name : "?????"),
        h("div", { class: "badge-desc" }, has ? b.tier : b.desc)
      ]);
    });
    return h("section", { class: "stack-4" }, [
      h("div", { class: "section-head" }, [
        h("h3", {}, "Badges"),
        h("span", { class: "muted" }, earned.length + " of " + X.Badges.all().length + " earned")
      ]),
      h("div", { class: "badge-grid" }, cards)
    ]);
  }

  function history(realm, rows) {
    return h("section", { class: "panel stack-4" }, [
      h("div", { class: "section-head" }, [h("h3", {}, "Recent vaults"), h("span", { class: "muted" }, "Score · xp · reward")]),
      rows.length ? h("div", { class: "rows" }, rows.map(function (r) {
        var win = r.outcome === "win";
        return h("div", { class: "history-row" }, [
          h("span", { class: "history-out " + (win ? "win" : "loss") }, win ? "WIN" : "LOSS"),
          h("span", { class: "mono", style: { fontWeight: 600 } }, [
            CFG.tier(r.tier).name.toUpperCase(),
            h("span", { class: "faint", style: { fontSize: "var(--fs-2xs)" } }, "  ·  " + (r.code || "") + (r.hints ? "  ·  " + r.hints + " hints" : ""))
          ]),
          h("span", { class: "history-num hide-sm" }, util.fmtNum(r.score)),
          h("span", { class: "history-num hide-sm" }, "+" + util.fmtNum(r.xp)),
          h("span", { class: "history-num" }, ["+", util.fmtNum(r.currency), realm === "multi" ? " ◈" : " ⬡"]),
          h("span", { class: "faint", style: { fontSize: "var(--fs-2xs)", textAlign: "right" } }, timeAgo(r.created_at))
        ]);
      })) : W.empty({ icon: "vault", title: "No vaults yet", message: "Crack the first cipher and your ledger starts." })
    ]);
  }

  function head(p, realm, R) {
    return h("div", { class: "profile-head" }, [
      W.avatar(p.display_name || p.username || "You", { size: "xl", solid: true }),
      h("div", { class: "profile-id" }, [
        h("div", { class: "profile-name" }, p.display_name || p.username || "Guest cipher"),
        h("div", { class: "profile-tags" }, tags(p, realm))
      ]),
      h("div", { class: "profile-actions" }, [
        W.btn("Play", { icon: "play", onClick: function () { X.Router.go("/play"); } }),
        W.btn("Shop", { variant: "ghost", icon: "gem", onClick: function () { X.Router.go("/shop?realm=" + realm); } }),
        W.btn("Leaderboard", { variant: "ghost", icon: "trophy", onClick: function () { X.Router.go("/leaderboard?realm=" + realm); } }),
        W.btn("Sign out", {
          variant: "ghost",
          size: "sm",
          onClick: function () {
            R.signOut().then(function () {
              X.Toast.info("Signed out of the " + (realm === "multi" ? "Core" : "Shard") + " realm.");
              X.Router.reload();
            });
          }
        })
      ])
    ]);
  }

  X.views.profile = {
    mount: function (outlet, ctx) {
      dom.mount(outlet, this.render(ctx));
      this.bind(ctx);
    },
    render: function (ctx) {
      var realm = realmOf(ctx);
      var R = X.Cloud.realm(realm);
      var p = R.profile;
      if (!p) {
        return h("div", { class: "stack-6" }, [
          W.pageHead({ eyebrow: realm === "multi" ? "Core realm" : "Shard realm", title: "Your ledger", back: { href: "#/" } }),
          h("div", { class: "setup-card" }, [
            W.empty({
              icon: "vault",
              title: "No profile yet",
              message: "Your realm profile appears the first time you run a cipher.",
              action: W.btn("Start playing", { icon: "play", onClick: function () { X.Router.go("/play"); } })
            })
          ])
        ]);
      }
      return h("div", { class: "stack-6" }, [
        head(p, realm, R),
        stats(p, realm),
        xpBlock(p, realm),
        realm === "multi" ? null : mastery(p),
        badges(p, realm),
        h("div", { "data-role": "profile-history" })
      ]);
    },
    bind: function (ctx) {
      var realm = realmOf(ctx);
      var R = X.Cloud.realm(realm);
      var slot = dom.qs('[data-role="profile-history"]');
      if (!slot) return;
      R.loadHistory(12).then(function (list) {
        slot.appendChild(history(realm, list || []));
      });
    },
    unmount: function () { return true; }
  };
})(window);