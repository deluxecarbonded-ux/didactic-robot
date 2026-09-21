/* ==========================================================================
   Exotic — dom
   A 90-line hyperscript. Views compose strings/nodes, never innerHTML soup
   with user data, so helpers that take text always escape.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var util = X.util;

  var SVG_NS = "http://www.w3.org/2000/svg";
  var VOID_TAGS = { br: 1, hr: 1, img: 1, input: 1, meta: 1, link: 1, source: 1 };

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, attrs, children) {
    var parts = String(tag).split(/([.#])/);
    var name = parts[0] || "div";
    var node = document.createElement(name);
    for (var i = 1; i < parts.length; i += 2) {
      if (parts[i] === ".") node.classList.add(parts[i + 1]);
      else node.id = parts[i + 1];
    }
    apply(node, attrs);
    append(node, children);
    return node;
  }

  function svg(tag, attrs, children) {
    var node = document.createElementNS(SVG_NS, tag);
    apply(node, attrs, true);
    append(node, children);
    return node;
  }

  function apply(node, attrs, isSvg) {
    if (attrs == null) return;
    if (typeof attrs === "string" || typeof attrs === "number") {
      node.textContent = String(attrs);
      return;
    }
    if (Array.isArray(attrs) || attrs instanceof Node) {
      append(node, attrs);
      return;
    }
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class" || k === "className") {
        String(v).split(/\s+/).filter(Boolean).forEach(function (c) { node.classList.add(c); });
      } else if (k === "style" && typeof v === "object") {
        Object.keys(v).forEach(function (p) {
          if (p.indexOf("--") === 0) node.style.setProperty(p, v[p]);
          else node.style[p] = v[p];
        });
      } else if (k === "dataset" && typeof v === "object") {
        Object.keys(v).forEach(function (p) { node.dataset[p] = v[p]; });
      } else if (k === "text") {
        node.textContent = String(v);
      } else if (k === "html") {
        node.innerHTML = v;
      } else if (k === "ref" && typeof v === "function") {
        v(node);
      } else if (k.indexOf("on") === 0 && typeof v === "function") {
        node.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k === "value" && (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT")) {
        node.value = v;
      } else if (k === "checked" || k === "disabled" || k === "selected" || k === "readOnly" || k === "autofocus") {
        node[k] = !!v;
      } else {
        node.setAttribute(k, String(v));
      }
    });
  }

  function append(node, children) {
    if (children == null || children === false) return;
    if (Array.isArray(children)) {
      children.forEach(function (c) { append(node, c); });
      return;
    }
    if (children instanceof Node) { node.appendChild(children); return; }
    if (typeof children === "object" && children !== null) {
      if (children.html != null) { node.innerHTML = children.html; return; }
      if (children.text != null) { node.textContent = String(children.text); return; }
    }
    node.appendChild(document.createTextNode(String(children)));
  }

  function frag(children) {
    var f = document.createDocumentFragment();
    append(f, children);
    return f;
  }

  function mount(target, content) {
    var node = typeof target === "string" ? qs(target) : target;
    if (!node) return null;
    node.textContent = "";
    append(node, content);
    return node;
  }

  function clear(target) {
    var node = typeof target === "string" ? qs(target) : target;
    if (node) node.textContent = "";
    return node;
  }

  function show(node) { var n = typeof node === "string" ? qs(node) : node; if (n) n.classList.remove("hidden"); return n; }
  function hide(node) { var n = typeof node === "string" ? qs(node) : node; if (n) n.classList.add("hidden"); return n; }
  function toggleClass(node, cls, on) { var n = typeof node === "string" ? qs(node) : node; if (n) n.classList.toggle(cls, !!on); return n; }

  function delegate(root, eventName, selector, handler) {
    var node = typeof root === "string" ? qs(root) : root;
    if (!node) return function () {};
    function listener(e) {
      var target = e.target;
      while (target && target !== node) {
        if (target.matches && target.matches(selector)) {
          handler.call(target, e, target);
          return;
        }
        target = target.parentNode;
      }
    }
    node.addEventListener(eventName, listener);
    return function () { node.removeEventListener(eventName, listener); };
  }

  function on(node, eventName, handler, options) {
    var n = typeof node === "string" ? qs(node) : node;
    if (!n) return function () {};
    n.addEventListener(eventName, handler, options);
    return function () { n.removeEventListener(eventName, handler, options); };
  }

  function rect(node) {
    var n = typeof node === "string" ? qs(node) : node;
    return n ? n.getBoundingClientRect() : { top: 0, left: 0, width: 0, height: 0 };
  }

  function scrollIntoView(node, opts) {
    var n = typeof node === "string" ? qs(node) : node;
    if (n && n.scrollIntoView) n.scrollIntoView(util.merge({ behavior: "smooth", block: "nearest" }, opts || {}));
  }

  var dom = {
    qs: qs, qsa: qsa, el: el, svg: svg, frag: frag, mount: mount, clear: clear,
    show: show, hide: hide, toggleClass: toggleClass, delegate: delegate, on: on,
    rect: rect, scrollIntoView: scrollIntoView, VOID_TAGS: VOID_TAGS
  };

  /* Short alias used all over the view layer. */
  global.h = el;

  X.dom = dom;
})(window);
