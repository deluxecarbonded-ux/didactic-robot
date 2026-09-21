/* ==========================================================================
   Exotic — auth view
   Authentication is per realm: the Shard realm signs into sp_* and the Core
   realm signs into mp_*, with fully separate sessions. Offline play never
   needs an account — the panel is only for the cloud build.
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

  function realmOf(ctx) {
    return ctx.query.realm === "multi" ? "multi" : "single";
  }

  function currencyLabel(realm) {
    return realm === "multi" ? "cores ◈" : "shards ⬡";
  }

  function art() {
    var cells = [3, 7, 1, 9].map(function (d, i) {
      return h("div", { class: "art-cell" + (i === 2 ? " solid" : "") }, {
        html: i === 2 ? X.icons.icon("lock", { size: 22 }) : String(d)
      });
    });
    return h("div", { class: "auth-art" }, [
      h("div", { class: "art-slot" }, cells),
      h("h3", {}, "Your vault. Your session."),
      h("p", { class: "muted" }, "Signing in here only touches this realm's ledger. " +
        "The other realm keeps its own identity, balance and history — on purpose.")
    ]);
  }

  function signedInPanel(ctx, R) {
    var p = R.profile || {};
    var local = R.local();
    return h("div", { class: "auth-panel" }, [
      h("div", { class: "stack-4 center" }, [
        W.avatar(p.display_name || p.username || "You", { size: "xl", solid: !local }),
        h("div", { class: "center" }, [
          h("div", { class: "profile-name" }, p.display_name || p.username || "You"),
          h("div", { class: "muted", style: { fontSize: "var(--fs-xs)" } }, local ? "Local vault" : R.accountLabel())
        ]),
        h("div", { class: "cat-row" }, [
          h("span", { class: "chip" }, "level " + (p.level || 1)),
          h("span", { class: "chip" }, (p.shards != null ? p.shards : p.cores) + " " + currencyLabel(ctx.query.realm === "multi" ? "multi" : "single"))
        ])
      ]),
      h("div", { class: "btn-row" }, [
        W.btn("Continue", { onClick: function () { X.Router.go("/"); } }),
        W.btn("Sign out", {
          variant: "ghost",
          onClick: function () {
            R.signOut().then(function () {
              X.Toast.info("Signed out of the " + (ctx.query.realm === "multi" ? "Core" : "Shard") + " realm.");
              X.Router.reload();
            });
          }
        })
      ]),
      local ? h("div", { class: "realm-note" }, [
        { html: X.icons.icon("wifiOff", { size: 15 }) },
        h("span", {}, "You are on the local vault. Add a Supabase URL in Settings to unlock cloud sync and multiplayer rooms."),
        h("a", { href: "#/settings" }, "Open settings")
      ]) : null
    ]);
  }

  function formPanel(ctx, R) {
    var realmName = realmOf(ctx);
    var mode = { value: "in", ref: null };
    var busy = { value: false };

    var emailInput = W.input({ type: "email", placeholder: "you@example.com", autocomplete: "email" });
    var passInput = W.input({ type: "password", placeholder: "password", autocomplete: mode.value === "in" ? "current-password" : "new-password" });
    var nameInput = W.input({ placeholder: "username", autocomplete: "username" });
    var errBox = h("div", { class: "error-text", style: { minHeight: "18px" } });

    function refreshMode() {
      nameInput.style.display = mode.value === "up" ? "" : "none";
      submitBtn.textContent = mode.value === "up" ? "Create account" : "Sign in";
    }

    var submitBtn = W.btn("Sign in", {
      block: true,
      busy: false,
      onClick: function () {
        var conf = mode.value === "up"
          ? { email: emailInput.value.trim(), password: passInput.value, username: nameInput.value.trim() || "cipher" }
          : { email: emailInput.value.trim(), password: passInput.value };
        if (!conf.email || !conf.password) { errBox.textContent = "Email and password are required."; return; }
        if (conf.password.length < 6) { errBox.textContent = "Password needs at least 6 characters."; return; }
        busy.value = true;
        submitBtn.disabled = true;
        errBox.textContent = "";
        var action = mode.value === "up" ? R.signUp(conf) : R.signIn(conf);
        action.then(function (res) {
          if (res && res.pending) {
            X.Toast.info("Check your inbox to confirm the email.", "Confirm your account");
            busy.value = false;
            submitBtn.disabled = false;
            return;
          }
          X.Toast.success("Welcome to the " + (realmName === "multi" ? "Core" : "Shard") + " realm.");
          X.Router.go("/");
        }).catch(function (err) {
          busy.value = false;
          submitBtn.disabled = false;
          errBox.textContent = (err && err.message) ? err.message : "Sign-in failed. Try again.";
        });
      }
    });

    var tabs = h("div", { class: "auth-tabs" }, [
      h("button", { type: "button", class: "is-active", onclick: function () { mode.value = "in"; tabs.children[0].classList.add("is-active"); tabs.children[1].classList.remove("is-active"); refreshMode(); } }, "Sign in"),
      h("button", { type: "button", onclick: function () { mode.value = "up"; tabs.children[1].classList.add("is-active"); tabs.children[0].classList.remove("is-active"); refreshMode(); } }, "Create account")
    ]);

    return h("div", { class: "auth-panel" }, [
      h("h2", {}, "The " + (realmName === "multi" ? "Core" : "Shard") + " realm"),
      h("p", { class: "muted" }, "This login is separate from the other realm, and separate from your local vault."),
      tabs,
      h("div", { class: "field" }, [
        h("label", { class: "field-label", for: "auth-email" }, "Email"),
        emailInput
      ]),
      h("div", { class: "field" }, [
        h("label", { class: "field-label", for: "auth-name" }, "Username"),
        nameInput
      ]),
      h("div", { class: "field" }, [
        h("label", { class: "field-label", for: "auth-pass" }, "Password"),
        passInput
      ]),
      errBox,
      submitBtn,
      h("div", { class: "auth-alt" }, [
        "Playing offline? You already have a local vault. ",
        h("a", { href: "#/settings" }, "Connect Supabase")
      ])
    ]);
  }

  X.views.auth = {
    mount: function (outlet, ctx) {
      dom.mount(outlet, this.render(ctx));
    },
    render: function (ctx) {
      var R = X.Cloud.realm(realmOf(ctx));
      var signedIn = !!R.profile;
      return h("div", { class: "stack-6" }, [
        W.pageHead({ eyebrow: "Account", title: "Realm access", sub: "Separate identities, separate ledgers. This screen only touches the realm you opened it from." }),
        h("div", { class: "auth-shell" }, [
          art(),
          signedIn ? signedInPanel(ctx, R) : formPanel(ctx, R)
        ])
      ]);
    },
    unmount: function () { return true; }
  };
})(window);