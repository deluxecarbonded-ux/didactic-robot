/* ==========================================================================
   Exotic — modal
   The one modal stack for the whole app. Every dialog, confirm and prompt in
   the game funnels through here so focus, escape handling and the body lock
   stay predictable. Content is real DOM, never HTML strings with user data.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;

  var STACK = [];

  function root() {
    return document.getElementById("modal-root");
  }

  function lockBody() {
    document.body.classList.add("is-locked");
  }
  function unlockBody() {
    if (!STACK.length) document.body.classList.remove("is-locked");
  }

  function onKeydown(e) {
    if (e.key === "Escape" && STACK.length) {
      var top = STACK[STACK.length - 1];
      if (top.opts.dismissible !== false) top.close();
    }
  }

  if (!global.__exoticModalBound) {
    global.__exoticModalBound = true;
    document.addEventListener("keydown", onKeydown);
  }

  /**
   * @param {{title?:string, body?:Node|Array, foot?:Node|Array, size?:string,
   *          dismissible?:boolean, onClose?:Function, widthClass?:string}} opts
   * @returns {{el:HTMLElement, setBody:Function, setFoot:Function, close:Function, opts:object}}
   */
  function open(opts) {
    var o = util.merge({ title: "", size: "", dismissible: true }, opts || {});
    var r = root();
    if (!r) return { el: null, setBody: function () {}, setFoot: function () {}, close: function () {}, opts: o };

    var closeBtn = dom.el("button", {
      class: "btn btn-icon btn-sm",
      "aria-label": "Close",
      html: X.icons.icon("x", { size: 16 })
    });

    var head = dom.el("div", { class: "modal-head" }, [
      dom.el("h3", {}, o.title || ""),
      o.dismissible !== false ? closeBtn : null
    ]);

    var body = dom.el("div", { class: "modal-body" });
    var foot = dom.el("div", { class: "modal-foot" });

    var modal = dom.el("div", {
      class: "modal" + (o.size === "wide" ? " modal-wide" : o.size === "narrow" ? " modal-narrow" : ""),
      role: "dialog",
      "aria-modal": "true"
    }, [head, body, foot]);

    var wrapClass = "modal-root" + (STACK.length === 0 ? " is-open" : "");
    r.textContent = "";
    r.className = wrapClass;
    r.appendChild(modal);

    function setBody(n) {
      dom.mount(body, n);
      return handle;
    }
    function setFoot(n) {
      dom.mount(foot, n);
      return handle;
    }
    function close() {
      var i = STACK.indexOf(handle);
      if (i >= 0) STACK.splice(i, 1);
      unlockBody();
      if (STACK.length) {
        var prev = STACK[STACK.length - 1].__rootEl;
        if (prev) {
          r.textContent = "";
          r.appendChild(prev);
          r.classList.add("is-open");
        }
      } else {
        r.classList.remove("is-open");
        r.textContent = "";
      }
      if (typeof o.onClose === "function") {
        try { o.onClose(); } catch (e) { /* noop */ }
      }
    }

    var handle = {
      el: modal,
      __rootEl: modal,
      opts: o,
      setBody: setBody,
      setFoot: setFoot,
      close: close
    };

    if (o.dismissible !== false) {
      dom.on(r, "click", function (e) {
        if (e.target === r && !e.defaultPrevented) close();
      });
    }
    dom.on(closeBtn, "click", close);

    closeBtn.addEventListener("click", function (e) { e.stopPropagation(); close(); });

    STACK.push(handle);
    lockBody();

    if (o.body) setBody(o.body);
    if (o.foot) setFoot(o.foot);
    return handle;
  }

  /** Drop the topmost modal. */
  function close() {
    if (STACK.length) STACK[STACK.length - 1].close();
  }

  /** Confirm dialog. Resolves true on confirm, false on cancel/escape/backdrop. */
  function confirm(opts) {
    var o = util.merge({
      title: "Are you sure?",
      message: "",
      confirmLabel: "Confirm",
      cancelLabel: "Cancel"
    }, opts || {});
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) { if (!settled) { settled = true; resolve(v); } }
      var h = open({
        title: o.title,
        size: "narrow",
        dismissible: true,
        onClose: function () { done(false); },
        body: dom.el("p", { class: "muted" }, o.message),
        foot: [
          dom.el("button", { class: "btn btn-ghost", onclick: function () { h.close(); } }, o.cancelLabel),
          dom.el("button", {
            class: "btn" + (o.tone === "danger" ? " btn-danger" : ""),
            onclick: function () { done(true); h.close(); }
          }, o.confirmLabel)
        ]
      });
    });
  }

  /** Text prompt. Resolves the string, or null on cancel. */
  function prompt(opts) {
    var o = util.merge({
      title: "Enter something",
      label: "",
      placeholder: "",
      value: "",
      confirmLabel: "Save",
      cancelLabel: "Cancel",
      validate: null
    }, opts || {});
    return new Promise(function (resolve) {
      var settled = false;
      function done(v) { if (!settled) { settled = true; resolve(v); } }
      var input = dom.el("input", { class: "input input-mono", value: o.value, placeholder: o.placeholder });
      var err = dom.el("div", { class: "error-text" });
      function confirmNow() {
        var v = input.value.trim();
        if (o.validate) {
          var problem = o.validate(v);
          if (problem) { err.textContent = problem; return; }
        }
        done(v);
        h.close();
      }
      dom.on(input, "keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); confirmNow(); }
      });
      var h = open({
        title: o.title,
        size: "narrow",
        dismissible: true,
        onClose: function () { done(null); },
        body: [
          o.label ? dom.el("div", { class: "field-label" }, o.label) : null,
          input,
          err
        ],
        foot: [
          dom.el("button", { class: "btn btn-ghost", onclick: function () { h.close(); } }, o.cancelLabel),
          dom.el("button", { class: "btn", onclick: confirmNow }, o.confirmLabel)
        ]
      });
      setTimeout(function () {
        input.focus();
        input.select();
      }, 30);
    });
  }

  X.Modal = { open: open, close: close, confirm: confirm, prompt: prompt, isOpen: function () { return STACK.length > 0; } };
})(window);