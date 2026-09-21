/* ==========================================================================
   Exotic — toast
   A single non-blocking queue in the corner of the viewport. Success is
   inverted (solid), everything else sits on the quiet surface. No strokes,
   no colors: tone is expressed through inversion alone.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;

  var ACTIVE = [];

  function root() {
    return document.getElementById("toast-root");
  }

  function dismiss(node, handle) {
    if (handle._out) return;
    handle._out = true;
    node.classList.add("is-out");
    setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
      var i = ACTIVE.indexOf(handle);
      if (i >= 0) ACTIVE.splice(i, 1);
    }, 240);
  }

  /**
   * @param {{title?:string, message?:string, icon?:string, tone?:string,
   *          timeout?:number, solid?:boolean, action?:{label:string,onClick:Function}}} opts
   * @returns {{close:Function, el:HTMLElement}}
   */
  function show(opts) {
    var o = opts || {};
    var r = root();
    if (!r) return { close: function () {}, el: null };

    var iconName = o.icon || (o.tone === "error" ? "xCircle"
      : o.tone === "success" ? "checkCircle"
      : o.tone === "warn" ? "alert" : "info");

    var node = dom.el("div", {
      class: "toast" + (o.solid || o.tone === "success" ? " toast-solid" : ""),
      role: "alert"
    }, [
      { html: X.icons.icon(iconName, { size: 17, stroke: 2 }) },
      dom.el("div", { class: "toast-body" }, [
        o.title ? dom.el("div", { class: "toast-title" }, o.title) : null,
        o.message ? dom.el("div", { class: "toast-msg" }, o.message) : null
      ])
    ]);

    if (o.action) {
      var actionBtn = dom.el("button", {
        class: "btn btn-sm",
        onclick: function (e) {
          e.preventDefault();
          if (o.action.onClick) o.action.onClick();
          dismiss(node, handle);
        }
      }, o.action.label);
      node.querySelector(".toast-body").appendChild(actionBtn);
    }

    var handle = {
      close: function () { dismiss(node, handle); },
      el: node,
      _out: false
    };
    r.appendChild(node);
    ACTIVE.push(handle);

    if (o.timeout !== 0) {
      setTimeout(function () { dismiss(node, handle); }, o.timeout == null ? 3400 : o.timeout);
    }
    return handle;
  }

  function success(message, title) { return show({ tone: "success", message: message, title: title }); }
  function error(message, title) { return show({ tone: "error", message: message, title: title }); }
  function info(message, title) { return show({ tone: "info", message: message, title: title }); }
  function warn(message, title) { return show({ tone: "warn", message: message, title: title }); }

  X.Toast = {
    show: show,
    success: success,
    error: error,
    info: info,
    warn: warn,
    dismissAll: function () {
      ACTIVE.slice().forEach(function (h) { h.close(); });
    }
  };
})(window);