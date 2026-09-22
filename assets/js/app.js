/* ==========================================================================
   Exotic — app bootstrap
   Orders the boot: theme, ambient field, chrome (header / tabbar / drawer),
   realms and audio. Then it hands the page to the hash router and keeps the
   shell — wallets, active nav, drawer — honest as the player moves around.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;
  var CFG = X.config;

  var h = dom.el;

  /* --------------------------------------------------------------- theme -- */

  function setTheme(t) {
    t = t === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", t);
    CFG.set("theme", t);
    global.dispatchEvent(new global.CustomEvent("exotic:theme", { detail: { theme: t } }));
    var btn = dom.qs('[data-role="theme-toggle"]');
    if (btn) btn.innerHTML = X.icons.icon(t === "dark" ? "moon" : "sun", { size: 17 });
  }
  X.setTheme = setTheme;

  /* ------------------------------------------------------------------ fx -- */

  function initFx() {
    var fieldEl = document.getElementById("field-canvas");
    var field = fieldEl ? new X.Field(fieldEl) : null;
    if (field) {
      field.init();
      if (CFG.get("reducedFx") || CFG.get("motion") === "minimal") field.setOpacity(0.25);
      global.addEventListener("exotic:theme", function () {
        field.setOpacity(CFG.get("reducedFx") || CFG.get("motion") === "minimal" ? 0.25 : 1);
      });
    }
    var fxEl = document.getElementById("fx-canvas");
    var burst = fxEl ? new X.Burst(fxEl) : null;
    if (burst) burst.init();
    X.fx = { field: field, burst: burst };
  }

  /* -------------------------------------------------------------- chrome -- */

  var NAV = [
    { path: "/", icon: "compass", label: "Home" },
    { path: "/play", icon: "lock", label: "Play" },
    { path: "/multi", icon: "swords", label: "Multi" },
    { path: "/shop", icon: "store", label: "Shop" },
    { path: "/profile", icon: "user", label: "Profile" },
    { path: "/leaderboard", icon: "trophy", label: "Rankings" },
    { path: "/guide", icon: "help", label: "How to play" },
    { path: "/settings", icon: "settings", label: "Settings" }
  ];

  function navLink(item) {
    return h("a", { class: "nav-link", href: "#" + item.path, "data-path": item.path }, [
      { html: X.icons.icon(item.icon, { size: 15 }) },
      item.label
    ]);
  }

  function buildChrome() {
    var header = document.getElementById("app-header");
    var footer = document.getElementById("app-footer");
    if (!header) return;

    var links = h("div", { class: "nav-links" }, NAV.map(navLink));

    var burger = h("button", {
      type: "button",
      class: "btn btn-icon nav-burger",
      "aria-label": "Open menu",
      "data-role": "burger",
      html: X.icons.icon("grip", { size: 18 })
    });

    var themeBtn = h("button", {
      type: "button",
      class: "btn btn-icon",
      "aria-label": "Switch theme",
      "data-role": "theme-toggle",
      "data-theme-value": CFG.get("theme"),
      onclick: function () {
        setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light");
      }
    });
    themeBtn.innerHTML = X.icons.icon(CFG.get("theme") === "dark" ? "moon" : "sun", { size: 17 });

    var walletSp = h("button", {
      type: "button",
      class: "wallet wallet-sp",
      "data-role": "wallet-sp",
      title: "Shards — spend them in the Shard shop",
      onclick: function () { X.Router.go("/shop?realm=single"); }
    }, [{ html: X.icons.icon("gem", { size: 14 }) }, h("span", { "data-role": "wallet-sp-value" }, "0")]);

    var walletMp = h("button", {
      type: "button",
      class: "wallet wallet-mp",
      "data-role": "wallet-mp",
      title: "Cores — spend them in the Core shop",
      onclick: function () { X.Router.go("/shop?realm=multi"); }
    }, [{ html: X.icons.icon("orbit", { size: 14 }) }, h("span", { "data-role": "wallet-mp-value" }, "0")]);

    var nav = h("nav", { class: "nav", "aria-label": "Primary" }, [
      h("a", { class: "brand", href: "#/", "aria-label": "Exotic home" }, [
        h("span", { class: "brand-mark" }, { html: X.icons.icon("gem", { size: 18 }) }),
        h("span", { class: "brand-text" }, [
          h("span", { class: "brand-name" }, "EXOTIC"),
          h("span", { class: "brand-sub" }, "guess the password")
        ])
      ]),
      links,
      h("div", { class: "nav-actions" }, [walletSp, walletMp, themeBtn, burger])
    ]);

    header.textContent = "";
    header.appendChild(nav);

    /* drawer */
    var scrim = h("div", { class: "drawer-scrim", "data-role": "drawer-scrim" });
    var drawer = h("nav", { class: "drawer", "data-role": "drawer", "aria-label": "Menu" }, [
      NAV.map(navLink),
      h("div", { class: "divider" }),
      walletSp.cloneNode(true),
      walletMp.cloneNode(true),
      h("p", { class: "hint", style: { marginTop: "auto" } }, "Exotic — no borders, no gradients, no binaries. Just a mind and a cipher.")
    ]);

    var closing = function () { closeDrawer(); };
    scrim.onclick = closing;
    burger.onclick = function () { openDrawer(); };
    drawer.onclick = function (e) {
      if (e.target && e.target.closest && e.target.closest("a")) closeDrawer();
    };

    document.body.appendChild(scrim);
    document.body.appendChild(drawer);
    closeDrawer();

    function openDrawer() {
      scrim.classList.add("is-open");
      drawer.classList.add("is-open");
      scrim.style.display = "block";
      drawer.style.display = "flex";
    }
    function closeDrawer() {
      scrim.classList.remove("is-open");
      drawer.classList.remove("is-open");
      scrim.style.display = "none";
      drawer.style.display = "none";
    }
    X.closeDrawer = closeDrawer;

    /* mobile tabbar */
    var tabItems = NAV.slice(0, 5).map(function (item) {
      return h("a", { class: "tabbar-item", href: "#" + item.path, "data-path": item.path }, [
        { html: X.icons.icon(item.icon, { size: 19 }) },
        item.label
      ]);
    });
    var tabbar = h("nav", { class: "tabbar", "aria-label": "Primary" }, [
      h("div", { class: "tabbar-inner" }, tabItems)
    ]);
    document.body.appendChild(tabbar);

    /* footer */
    if (footer) {
      footer.appendChild(h("div", { class: "row-3 between wrap", style: { gap: "var(--sp-4)" } }, [
        h("p", {}, "Exotic · written by hand, running on your device."),
        h("p", {}, "Shards ⬡ and Cores ◈ never cross realms.")
      ]));
    }

    X.navEls = { links: links, tabItems: tabItems };
  }

  /* ------------------------------------------------------------- wallets -- */

  function walletValues() {
    var sp = X.Cloud.realm("single");
    var mp = X.Cloud.realm("multi");
    return {
      sp: sp.profile ? (sp.balance() || 0) : 0,
      mp: mp.profile ? (mp.balance() || 0) : 0
    };
  }

  function refreshWallets() {
    var v = walletValues();
    document.querySelectorAll('[data-role="wallet-sp-value"]').forEach(function (el) { el.textContent = util.fmtNum(v.sp); });
    document.querySelectorAll('[data-role="wallet-mp-value"]').forEach(function (el) { el.textContent = util.fmtNum(v.mp); });
    var spBtn = dom.qs('[data-role="wallet-sp"]');
    var mpBtn = dom.qs('[data-role="wallet-mp"]');
    if (spBtn) spBtn.title = "Shards: " + util.fmtNum(v.sp);
    if (mpBtn) mpBtn.title = "Cores: " + util.fmtNum(v.mp);
  }

  /* ---------------------------------------------------------------- nav --- */

  function isActive(path, current) {
    if (path === "/") return current === "/" || current === "/notfound" ? current === "/" : false;
    return current === path || current.indexOf(path + "/") === 0;
  }

  function setActiveNav(currentPath) {
    document.querySelectorAll('[data-path]').forEach(function (el) {
      el.classList.toggle("is-active", isActive(el.getAttribute("data-path"), currentPath));
    });
  }

  /* --------------------------------------------------------------- boot --- */

  function applyAudioPrefs() {
    X.audio.setEnabled(!!CFG.get("sound"));
    X.audio.setVolume(CFG.get("volume") != null ? CFG.get("volume") : 0.55);
  }

  function buildRoutes() {
    var ROUTES = [
      { path: "/", name: "home", title: "Home", view: X.views.home },
      { path: "/play", name: "play", title: "Crack a cipher", view: X.views["single-play"] },
      { path: "/multi", name: "multi", title: "Multiplayer", view: X.views["multi-lobby"] },
      { path: "/room/:code", name: "room", title: "Room", view: X.views["multi-room"] },
      { path: "/shop", name: "shop", title: "Shop", view: X.views.shop },
      { path: "/profile", name: "profile", title: "Profile", view: X.views.profile },
      { path: "/leaderboard", name: "leaderboard", title: "Rankings", view: X.views.leaderboard },
      { path: "/auth", name: "auth", title: "Realm account", view: X.views.auth },
      { path: "/settings", name: "settings", title: "Settings", view: X.views.settings },
      { path: "/guide", name: "guide", title: "How to play", view: X.views.guide },
      { path: "/notfound", name: "notfound", title: "Lost", view: X.views.notfound }
    ];
    var router = new X.Router();
    router.registerAll(ROUTES);
    router.on("miss", function () { router.go("/notfound", null, true); });
    router.on("navigate", function (current) {
      setActiveNav(current.path || "/");
      if (X.closeDrawer) X.closeDrawer();
      refreshWallets();
    });
    router.on("error", function (err) {
      if (global.console) global.console.error("[exotic] view error:", err);
      X.Toast.error("Something shook the vault — try again.");
    });
    return router;
  }

  function finishBoot() {
    var boot = document.getElementById("boot-screen");
    var sub = document.getElementById("boot-status");
    if (sub) sub.textContent = "the vault is open";
    if (boot) {
      setTimeout(function () {
        boot.classList.add("is-done");
        document.body.classList.remove("is-booting");
        var main = document.getElementById("app-root");
        if (main && !main.getAttribute("tabindex")) main.setAttribute("tabindex", "-1");
      }, 240);
    }
  }

  function boot() {
    var status = document.getElementById("boot-status");
    try {
      setTheme(CFG.get("theme"));
      applyAudioPrefs();
      initFx();
      buildChrome();
    } catch (err) {
      if (global.console) global.console.error("[exotic] shell boot failed:", err);
      /* Canvas effects and chrome are optional; the router must still mount. */
    }

    // first gesture unlocks the audio context (mobile policy)
    var unlock = function () {
      X.audio.unlock();
      global.removeEventListener("pointerdown", unlock);
      global.removeEventListener("keydown", unlock);
    };
    global.addEventListener("pointerdown", unlock);
    global.addEventListener("keydown", unlock);

    if (status) status.textContent = "arming the vault…";

    var R = X.Cloud.realm("single");
    var R2 = X.Cloud.realm("multi");
    R.on("profile", refreshWallets);
    R2.on("profile", refreshWallets);

    var cloudInit = X.Cloud.init();
    var cloudTimeout = new Promise(function (resolve) {
      setTimeout(function () { resolve(null); }, 5000);
    });
    Promise.race([cloudInit, cloudTimeout])
      .then(function () {
        if (status) status.textContent = "syncing shards & cores…";
        refreshWallets();
        var router = buildRoutes();
        X.Router = router;
        router.start("#app-root");
      })
      .catch(function (err) {
        // Realms init locally even without a server; this is a belt-and-braces path.
        if (global.console) global.console.warn("[exotic] cloud init fell back to local:", err);
        refreshWallets();
        var router = buildRoutes();
        X.Router = router;
        router.start("#app-root");
      })
      .then(function () { finishBoot(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);