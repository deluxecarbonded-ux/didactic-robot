/* ==========================================================================
   Exotic — home view
   The front door. One hero, two realms, and enough proof that the vault is
   real before the player ever touches a key.
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

  function proofs() {
    var sp = X.Cloud.realm("single").profile;
    var mp = X.Cloud.realm("multi").profile;
    return [
      { num: util.fmtNum(X.Puzzles.count), cap: "Hand-written puzzles" },
      { num: "4", cap: "Digit vault code" },
      { num: "2", cap: "Separate realms" },
      { num: "0", cap: "Binary assets" }
    ];
  }

  function hero() {
    return h("section", { class: "hero" }, [
      h("div", { class: "hero-inner" }, [
        h("div", { class: "hero-badge" }, [
          h("span", { class: "dot dot-live" }),
          "Playable offline · Live online"
        ]),
        h("h1", { class: "hero-title" }, [
          "Every vault has a ",
          h("em", {}, "4-digit"),
          " ",
          h("span", { class: "ghost" }, "password")
        ]),
        h("p", { class: "hero-lede" },
          "Four rings, four puzzles, one code. Solve the riddles, crack the cipher, " +
          "unlock the vault — solo for Shards or head-to-head for Cores."),
        h("div", { class: "hero-actions" }, [
          W.btn("Crack a cipher", { size: "lg", icon: "lock", onClick: function () { X.Router.go("/play"); } }),
          W.btn("Multiplayer", { size: "lg", variant: "ghost", icon: "swords", onClick: function () { X.Router.go("/multi"); } })
        ]),
        h("div", { class: "hero-proof" },
          proofs().map(function (p) {
            return h("div", { class: "proof-item" }, [
              h("div", { class: "proof-num" }, p.num),
              h("div", { class: "proof-cap" }, p.cap)
            ]);
          })
        )
      ])
    ]);
  }

  function realms(sp, mp) {
    return h("section", { class: "stack-6" }, [
      h("div", { class: "section-head" }, [
        h("h2", {}, "Two realms. One mind."),
        h("span", { class: "muted" }, "Nothing crosses between them — not currency, not progress.")
      ]),
      h("div", { class: "mode-grid" }, [
        h("a", { class: "mode-card dark", href: "#/play" }, [
          h("div", { class: "mode-glyph" }, { html: X.icons.icon("gem", { size: 24 }) }),
          h("div", { class: "mode-name" }, "The Shard Realm"),
          h("div", { class: "mode-desc" }, "Solo vaults with rising tiers, a streak that survives a shield, and a shop paid in shards."),
          h("div", { class: "mode-chips" }, [
            h("span", { class: "chip" }, "5 tiers"),
            h("span", { class: "chip" }, "Daily cipher"),
            sp ? h("span", { class: "chip" }, util.fmtNum(sp.shards || 0) + " ⬡") : null
          ]),
          h("div", { class: "mode-foot" }, [
            h("span", { class: "hint" }, "Single player"),
            h("span", { class: "mode-arrow" }, { html: X.icons.icon("arrowRight", { size: 18 }) })
          ])
        ]),
        h("a", { class: "mode-card", href: "#/multi" }, [
          h("div", { class: "mode-glyph" }, { html: X.icons.icon("orbit", { size: 24 }) }),
          h("div", { class: "mode-name" }, "The Core Realm"),
          h("div", { class: "mode-desc" }, "Live rooms, realtime progress, ranked duels and squads — or a hotseat around a shared device."),
          h("div", { class: "mode-chips" }, [
            h("span", { class: "chip" }, "Realtime rooms"),
            h("span", { class: "chip" }, "Elo ladder"),
            mp ? h("span", { class: "chip" }, util.fmtNum(mp.cores || 0) + " ◈") : null
          ]),
          h("div", { class: "mode-foot" }, [
            h("span", { class: "hint" }, "Multiplayer"),
            h("span", { class: "mode-arrow" }, { html: X.icons.icon("arrowRight", { size: 18 }) })
          ])
        ])
      ])
    ]);
  }

  function features() {
    var list = [
      { icon: "brain", title: "Real brain-teasers", text: "Riddles, math, wordplay, ciphers — every one resolves to a single digit." },
      { icon: "shield", title: "Fair by design", text: "Same seed, same vault. Nobody sees your code, nobody cheats the clock." },
      { icon: "wifiOff", title: "Works offline", text: "No server? The vault runs on your own device, identical rules." },
      { icon: "gem", title: "Earned, not bought", text: "Shards and cores are won at the board. Badges are never for sale." }
    ];
    return h("section", { class: "stack-6" }, [
      h("div", { class: "section-head" }, [
        h("h2", {}, "Why it feels different"),
        h("span", { class: "muted" }, "No paywalls, no loot boxes, no noise.")
      ]),
      h("div", { class: "feature-grid" },
        list.map(function (f) {
          return h("div", { class: "feature" }, [
            { html: X.icons.icon(f.icon, { size: 20 }) },
            h("h4", {}, f.title),
            h("p", {}, f.text)
          ]);
        })
      )
    ]);
  }

  function categories() {
    var cats = X.Puzzles.categories();
    return h("section", { class: "stack-6" }, [
      h("div", { class: "section-head" }, [
        h("h2", {}, "Pick a poison"),
        h("span", { class: "muted" }, cats.length + " puzzle families in the vault")
      ]),
      h("div", { class: "cat-row" },
        cats.map(function (c) {
          return h("a", {
            class: "cat-pill",
            href: "#/play?cat=" + encodeURIComponent(c.id)
          }, [
            { html: X.icons.icon(c.icon, { size: 13 }) },
            c.label
          ]);
        })
      )
    ]);
  }

  X.views.home = {
    mount: function (outlet, ctx) {
      dom.mount(outlet, this.render(ctx));
    },
    render: function () {
      return h("div", { class: "stack-7" }, [
        hero(),
        h("div", { class: "divider" }),
        realms(X.Cloud.realm("single").profile, X.Cloud.realm("multi").profile),
        features(),
        categories()
      ]);
    },
    unmount: function () { return true; }
  };
})(window);