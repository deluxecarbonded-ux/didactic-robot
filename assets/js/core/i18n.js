/* ============================================================================
   Exotic - localization runtime
   Locale packs are deliberately data-only. Missing translations fall back to
   the original source string, so a new view remains usable before its pack is
   complete.
   ============================================================================ */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var STORAGE_KEY = "exotic.v1.locale";
  var DEFAULT_LOCALE = "en";
  var locale = DEFAULT_LOCALE;
  var pack = { translations: {} };
  var observer = null;
  var pending = Promise.resolve();
  var localesPromise = null;
  var loadSequence = 0;

  function normalize(value) {
    return String(value || "").trim().replace(/\s+/g, " ");
  }

  function isArabic(value) {
    return /^(ar)(?:-|$)/i.test(value);
  }

  function detect() {
    var saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
    if (saved) return saved;
    var languages = (global.navigator && global.navigator.languages) || [];
    return languages[0] || (global.navigator && global.navigator.language) || DEFAULT_LOCALE;
  }

  function localeFile(value) {
    return "assets/locales/" + encodeURIComponent(value) + ".json";
  }

  function applyDirection() {
    var rtl = isArabic(locale);
    document.documentElement.setAttribute("lang", locale);
    document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
    document.documentElement.toggleAttribute("data-rtl", rtl);
  }

  function translate(value) {
    var source = normalize(value);
    if (!source) return value;
    var result = pack.translations && pack.translations[source];
    return result == null ? value : result;
  }

  function translateAttribute(node, name) {
    if (!node || node.nodeType !== 1 || node.hasAttribute("data-i18n-ignore")) return;
    var sourceName = "data-i18n-source-" + name;
    var source = node.getAttribute(sourceName);
    if (source == null) {
      source = node.getAttribute(name);
      if (source) node.setAttribute(sourceName, source);
    }
    if (source) {
      var translated = translate(source);
      if (node.getAttribute(name) !== translated) node.setAttribute(name, translated);
    }
  }

  function translateNode(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      var text = node.nodeValue;
      var normalized = normalize(text);
      if (!normalized || !node.parentNode || node.parentNode.closest("[data-i18n-ignore]")) return;
      if (!node.__exoticSource) node.__exoticSource = text;
      var translated = translate(node.__exoticSource);
      if (node.nodeValue !== translated) node.nodeValue = translated;
      return;
    }
    if (node.nodeType !== 1 || node.hasAttribute("data-i18n-ignore")) return;
    ["aria-label", "title", "placeholder", "alt"].forEach(function (name) {
      translateAttribute(node, name);
    });
    Array.prototype.slice.call(node.childNodes).forEach(translateNode);
  }

  function translateTree(root) {
    if (root) translateNode(root);
  }

  function observe() {
    if (observer || !global.MutationObserver) return;
    observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        if (record.type === "characterData") translateNode(record.target);
        Array.prototype.forEach.call(record.addedNodes, translateNode);
      });
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function load(value) {
    var requested = String(value || DEFAULT_LOCALE);
    var sequence = ++loadSequence;
    pending = fetch(localeFile(requested)).then(function (response) {
      if (!response.ok) throw new Error("Locale pack not found: " + requested);
      return response.json();
    }).catch(function () {
      if (requested === DEFAULT_LOCALE) return { locale: DEFAULT_LOCALE, translations: {} };
      return fetch(localeFile(DEFAULT_LOCALE)).then(function (response) {
        if (!response.ok) throw new Error("Default locale pack not found");
        return response.json();
      }).catch(function () { return { locale: DEFAULT_LOCALE, translations: {} }; });
    }).then(function (nextPack) {
      if (sequence !== loadSequence) return pack;
      locale = nextPack.locale || requested;
      pack = nextPack;
      if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, locale);
      applyDirection();
      translateTree(document.documentElement);
      global.dispatchEvent(new global.CustomEvent("exotic:locale", { detail: { locale: locale, rtl: isArabic(locale) } }));
      return pack;
    });
    return pending;
  }

  function setLocale(value) {
    return load(value);
  }

  function listLocales() {
    if (!localesPromise) {
      localesPromise = fetch("assets/locales/index.json").then(function (response) {
        if (!response.ok) throw new Error("Locale manifest unavailable");
        return response.json();
      }).then(function (data) {
        return data.locales || [];
      }).catch(function () { return []; });
    }
    return localesPromise;
  }

  X.i18n = {
    t: translate,
    get locale() { return locale; },
    get direction() { return isArabic(locale) ? "rtl" : "ltr"; },
    setLocale: setLocale,
    ready: load(detect()),
    listLocales: listLocales,
    translateTree: translateTree,
    isArabic: isArabic
  };
  applyDirection();
  observe();
})(window);