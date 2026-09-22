/* ==========================================================================
   Exotic — settings view
   Connection, sound, motion and defaults. Keys are never stored in plain
   sight; everything is written to the exotic.v1.* local vault unless the
   cloud keys are filled in.
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

  function connection() {
    var urlInput = W.input({ value: CFG.get("supabaseUrl"), placeholder: "https://xxxx.supabase.co", mono: true });
    var keyInput = W.input({ value: CFG.get("supabaseAnonKey"), placeholder: "anon key (starts with eyJ…)", mono: true });
    var orInput = W.input({ value: CFG.get("openrouterKey"), placeholder: "sk-or-v1-…", mono: true });
    var status = h("span", { class: "hint", "data-role": "conn-status" });
    var proxySwitch = W.switchRow({
      title: "Route AI through the edge function",
      sub: "Recommended for public builds — keeps the OpenRouter key on the server.",
      checked: !!CFG.get("useAiProxy"),
      onChange: function (v) { CFG.set("useAiProxy", v); X.Toast.info("AI routing updated."); }
    });

    var testBtn = W.btn("Test connection", {
      variant: "ghost",
      size: "sm",
      onClick: function () {
        testBtn.disabled = true;
        status.textContent = "checking…";
        var changed = urlInput.value.trim() !== CFG.get("supabaseUrl") || keyInput.value.trim() !== CFG.get("supabaseAnonKey");
        if (changed) {
          X.Cloud.reconfigure(urlInput.value.trim(), keyInput.value.trim());
          setTimeout(runHealth, 250);
        } else {
          runHealth();
        }
        function runHealth() {
          X.Cloud.health().then(function (res) {
            testBtn.disabled = false;
            status.textContent = res.ok
              ? (res.mode === "local" ? "Local vault — everything stays on this device." : "Cloud connected (" + res.latency + " ms).")
              : "Cloud error: " + (res.error || "unknown");
            X.Toast[res.ok ? "success" : "warn"](status.textContent, res.mode === "local" ? "Offline mode" : "Supabase");
          });
        }
      }
    });

    return h("section", { class: "panel stack-4" }, [
      h("div", { class: "section-head" }, [h("h3", {}, "Connections"), h("span", { class: "muted" }, "Optional. Empty = play against the local vault.")]),
      W.field({ label: "Supabase URL", control: urlInput, hint: "Project settings → API → Project URL." }),
      W.field({ label: "Supabase anon key", control: keyInput, hint: "Project settings → API → anon public key." }),
      W.field({ label: "OpenRouter key", control: orInput, hint: "Used by the Oracle to forge custom puzzles. Leave empty to disable AI." }),
      proxySwitch,
      h("div", { class: "btn-row" }, [
        W.btn("Save connections", {
          onClick: function () {
            var url = urlInput.value.trim();
            var key = keyInput.value.trim();
            var changed = url !== CFG.get("supabaseUrl") || key !== CFG.get("supabaseAnonKey");
            CFG.update({ supabaseUrl: url, supabaseAnonKey: key, openrouterKey: orInput.value.trim() });
            X.Oracle && X.Oracle.refresh && X.Oracle.refresh();
            if (changed) {
              X.Cloud.reconfigure(url, key).then(function () {
                X.Toast.success("Cloud connections saved.");
              });
            } else {
              X.Toast.success("Settings saved.");
            }
          }
        }),
        testBtn,
        status
      ])
    ]);
  }

  function localization() {
    var current = { code: X.i18n.locale, name: X.i18n.locale };
    var trigger;
    var list;
    var wrapper = h("div", { class: "locale-menu", "data-role": "locale-menu" });

    function flag(code) {
      var value = String(code || "en").toLowerCase();
      var region = value.indexOf("-") > -1 ? value.split("-")[1] : value;
      var regions = { en: "US", es: "ES", fr: "FR", de: "DE", it: "IT", pt: "BR", ru: "RU", uk: "UA", pl: "PL", nl: "NL", sv: "SE", no: "NO", da: "DK", fi: "FI", ar: "SA", he: "IL", fa: "IR", ur: "PK", hi: "IN", bn: "BD", ja: "JP", ko: "KR", zh: "CN", tr: "TR", el: "GR", th: "TH", vi: "VN", id: "ID", ms: "MY", sw: "KE", af: "ZA" };
      return h("span", { class: "locale-flag", "data-flag": (regions[value] || regions[region] || value).toLowerCase(), "aria-hidden": "true" }, "");
    }

    function close() {
      wrapper.classList.remove("is-open");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    }

    function choose(item) {
      current = item;
      trigger.replaceChildren(flag(item.code), h("span", { class: "locale-current-name" }, item.name), h("span", { class: "locale-current-code mono" }, item.code), h("span", { class: "locale-chevron", html: X.icons.icon("chevronDown", { size: 15 }) }));
      close();
      trigger.disabled = true;
      X.i18n.setLocale(item.code).then(function () {
        trigger.disabled = false;
        X.Toast.info("Language updated.");
      });
    }

    function option(item) {
      var selected = item.code === X.i18n.locale;
      var button = h("button", { type: "button", class: "locale-option" + (selected ? " is-selected" : ""), role: "option", "aria-selected": selected }, [
        flag(item.code),
        h("span", { class: "locale-option-copy" }, [h("strong", {}, item.name), h("small", { class: "mono" }, item.code)]),
        selected ? { html: X.icons.icon("check", { size: 15 }) } : null
      ]);
      button.addEventListener("click", function () { choose(item); });
      return button;
    }

    trigger = h("button", { type: "button", class: "locale-trigger", "aria-haspopup": "listbox", "aria-expanded": "false" }, [
      flag(current.code), h("span", { class: "locale-current-name" }, current.name), h("span", { class: "locale-current-code mono" }, current.code),
      { html: X.icons.icon("chevronDown", { size: 15 }) }
    ]);
    list = h("div", { class: "locale-list", role: "listbox", tabindex: "-1", "aria-label": "Languages" }, [h("span", { class: "hint" }, "Loading languages…")]);
    trigger.addEventListener("click", function () {
      var open = !wrapper.classList.contains("is-open");
      wrapper.classList.toggle("is-open", open);
      trigger.setAttribute("aria-expanded", String(open));
      if (open) list.focus();
    });
    trigger.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        trigger.click();
      }
      if (event.key === "Escape") close();
    });
    list.addEventListener("keydown", function (event) {
      if (event.key === "Escape") { close(); trigger.focus(); }
    });
    document.addEventListener("click", function (event) {
      if (!wrapper.contains(event.target)) close();
    });
    wrapper.append(trigger, list);
    X.i18n.listLocales().then(function (locales) {
      list.textContent = "";
      if (!locales.length) {
        list.appendChild(h("span", { class: "hint" }, "Languages unavailable offline."));
        return;
      }
      locales.forEach(function (item) { list.appendChild(option(item)); });
    });
    return h("section", { class: "panel stack-4" }, [
      h("div", { class: "section-head" }, [h("h3", {}, "Language and direction")]),
      h("div", { class: "field" }, [
        h("label", { class: "field-label" }, "Interface language"),
        wrapper,
        h("span", { class: "hint" }, "Arabic locales automatically enable right-to-left layout for text, controls and icons.")
      ])
    ]);
  }

  function preferences() {
    var theme = CFG.get("theme") || "dark";
    var seg = W.segment({
      options: [{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }],
      value: theme,
      onChange: function (v) {
        CFG.set("theme", v);
        if (X.setTheme) X.setTheme(v);
        else document.documentElement.setAttribute("data-theme", v);
        X.Toast.info("Theme applied.");
      }
    });
    var soundSwitch = W.switchRow({
      title: "Sound effects",
      sub: "Everything you hear is synthesized live — zero audio files.",
      checked: X.audio.enabled,
      onChange: function (v) { X.audio.setEnabled(v); }
    });
    var musicSwitch = W.switchRow({
      title: "Ambient tones",
      sub: "A sparse dark drone under the tick of the timer.",
      checked: !!CFG.get("music"),
      onChange: function (v) { CFG.set("music", v); }
    });
    var hapticSwitch = W.switchRow({
      title: "Haptics",
      sub: "A short knock when a slot locks in (supported devices).",
      checked: !!CFG.get("haptics"),
      onChange: function (v) { CFG.set("haptics", v); }
    });
    var fxSwitch = W.switchRow({
      title: "Reduce effects",
      sub: "Calm the fields and cuts for low-power devices.",
      checked: !!CFG.get("reducedFx"),
      onChange: function (v) { CFG.set("reducedFx", v); }
    });

    return h("section", { class: "panel stack-4" }, [
      h("div", { class: "section-head" }, [h("h3", {}, "Preferences")]),
      h("div", { class: "field" }, [
        h("label", { class: "field-label" }, "Theme"),
        seg
      ]),
      soundSwitch,
      musicSwitch,
      hapticSwitch,
      fxSwitch
    ]);
  }

  function gameDefaults() {
    var tiers = Object.keys(CFG.TIERS).map(function (id) {
      return { value: id, label: CFG.TIERS[id].name };
    });
    var tierSelect = W.select({
      value: CFG.get("defaultTier"),
      options: tiers,
      onChange: function (e) { CFG.set("defaultTier", e.target.value); }
    });
    return h("section", { class: "panel stack-4" }, [
      h("div", { class: "section-head" }, [h("h3", {}, "Game defaults")]),
      h("div", { class: "field" }, [
        h("label", { class: "field-label" }, "Default tier"),
        tierSelect
      ]),
      W.switchRow({
        title: "Auto-advance",
        sub: "Jump to the next unsolved slot after a correct answer.",
        checked: !!CFG.get("autoAdvance"),
        onChange: function (v) { CFG.set("autoAdvance", v); }
      }),
      W.switchRow({
        title: "Show explanations",
        sub: "Reveal why a puzzle resolved the way it did after solving.",
        checked: !!CFG.get("showExplanations"),
        onChange: function (v) { CFG.set("showExplanations", v); }
      }),
      W.switchRow({
        title: "Physical keyboard entry",
        sub: "Let digits, backspace and enter drive the keypad while the board is focused.",
        checked: !!CFG.get("keyboardCapture"),
        onChange: function (v) { CFG.set("keyboardCapture", v); }
      })
    ]);
  }

  function danger() {
    return h("section", { class: "panel stack-4" }, [
      h("div", { class: "section-head" }, [h("h3", {}, "The last door")]),
      h("p", { class: "muted" }, "Wipe every exotic.v1.* key on this device: both realm profiles, balances, history, badges, runs and config. Cloud data is untouched — this only clears the local vault."),
      h("div", { class: "btn-row" }, [
        W.btn("Reset local vault", {
          variant: "danger",
          onClick: function () {
            X.Modal.confirm({
              title: "Erase the local vault?",
              message: "Your on-device profiles, balances, history and settings will be gone. This cannot be undone.",
              confirmLabel: "Erase everything",
              tone: "danger"
            }).then(function (ok) {
              if (!ok) return;
              util.storage.clear();
              try { localStorage.removeItem("config"); } catch (e) { /* noop */ }
              global.location.reload();
            });
          }
        })
      ])
    ]);
  }

  X.views.settings = {
    mount: function (outlet, ctx) {
      dom.mount(outlet, this.render(ctx));
    },
    render: function () {
      return h("div", { class: "stack-6" }, [
        W.pageHead({
          eyebrow: "System",
          title: "Settings",
          sub: "Put your own keys in, or leave them empty and play entirely on-device.",
          back: { href: "#/" }
        }),
        localization(),
        connection(),
        preferences(),
        gameDefaults(),
        danger(),
        h("div", { class: "hint center", style: { textAlign: "center" } }, "Exotic v1 — every pixel drawn by hand, every sound synthesized. No borders. No gradients. Just ink.")
      ]);
    },
    unmount: function () { return true; }
  };
})(window);