/* ==========================================================================
   Exotic — widgets
   Every view composes its markup from these small builders. They are the
   only place that knows the exact CSS surface: cards, buttons per the
   inverted shadcn cadence, meters, slots, keycaps, toasts-feed, dialogs.
   Keeping that knowledge in one file is what keeps views terse.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;

  var h = dom.el;

  /* -------------------------------------------------------------- icons -- */

  function icon(name, opts) {
    var o = util.merge({ size: 18, className: "" }, opts || {});
    return h("span", { class: "icon-wrap" + (o.className ? " " + o.className : ""), html: X.icons.icon(name, o) });
  }

  function iconBtn(name, opts) {
    var o = opts || {};
    return X.icons.button(name, { className: o.className, label: o.label, size: o.size, stroke: o.stroke });
  }

  /* ------------------------------------------------------------- button -- */

  function btn(label, opts) {
    var o = util.merge({ size: "", variant: "", block: false, disabled: false, type: "button" }, opts || {});
    var cls = "btn";
    if (o.variant === "soft") cls += " btn-soft";
    else if (o.variant === "ghost") cls += " btn-ghost";
    else if (o.variant === "danger") cls += " btn-danger";
    if (o.size === "sm") cls += " btn-sm";
    else if (o.size === "lg") cls += " btn-lg";
    if (o.block) cls += " btn-block";
    if (o.className) cls += " " + o.className;
    var attrs = {
      type: o.type,
      class: cls,
      onclick: o.onClick,
      title: o.title,
      disabled: o.disabled || o.busy
    };
    var children = [];
    if (o.busy) children.push(h("span", { class: "spinner" }));
    if (o.icon) children.push({ html: X.icons.icon(o.icon, { size: o.size === "sm" ? 14 : 17 }) });
    if (label != null && label !== "") children.push(label);
    return h("button", attrs, children);
  }

  /* ------------- chip / tag / dot / avatar --------------------------------- */

  function chip(label, opts) {
    var o = opts || {};
    var cls = "chip" + (o.solid ? " chip-solid" : o.quiet ? " chip-quiet" : "");
    var children = [];
    if (o.icon) children.push({ html: X.icons.icon(o.icon, { size: 12 }) });
    if (o.dot) children.push(h("span", { class: "dot" + (o.live ? " dot-live" : "") }));
    children.push(label);
    return h("span", { class: cls }, children);
  }

  function tag(label, opts) {
    var o = opts || {};
    var children = [];
    if (o.icon) children.push({ html: X.icons.icon(o.icon, { size: 12 }) });
    children.push(label);
    return h("span", { class: "tag", title: o.title }, children);
  }

  function avatar(name, opts) {
    var o = opts || {};
    var cls = "avatar";
    if (o.size === "sm") cls += " avatar-sm";
    else if (o.size === "lg") cls += " avatar-lg";
    else if (o.size === "xl") cls += " avatar-xl";
    if (o.solid) cls += " avatar-solid";
    if (o.ring) cls += " avatar-ring";
    return h("span", { class: cls, "aria-hidden": "true" }, util.initials(name || "?"));
  }

  function stat(label, value, opts) {
    var o = opts || {};
    var children = [
      h("div", { class: "stat-label" }, label),
      h("div", { class: "stat-value" }, o.sub ? [value, h("small", {}, o.sub)] : value)
    ];
    if (o.icon) children.unshift({ html: X.icons.icon(o.icon, { size: 16, className: "stat-icon" }) });
    return h("div", { class: "stat" }, children);
  }

  /* --------------------------------------------------------------- bars --- */

  function bar(pct, opts) {
    var o = opts || {};
    var cls = "bar";
    if (o.thin) cls += " bar-thin";
    if (o.lg) cls += " bar-lg";
    var fill = h("div", { class: "bar-fill", style: { width: util.clamp(Number(pct) || 0, 0, 1) * 100 + "%" } });
    return h("div", { class: cls + (o.invert ? " bar-invert" : "") }, fill);
  }

  function meter(opts) {
    var o = opts || {};
    return h("div", { class: "meter" }, [
      h("div", { class: "meter-head" }, [
        o.label != null ? h("span", { class: "field-label" }, o.label) : null,
        o.value != null ? h("span", { class: "mono", style: { fontSize: "var(--fs-xs)" } }, o.value) : null
      ]),
      bar(o.pct, o)
    ]);
  }

  /* --------------------------------------------------------------- slots -- */

  /**
   * @param {Array<{index?:number, solved?:boolean, digit?:number|string|null, current?:boolean}>} list
   */
  function slots(list, opts) {
    var o = opts || {};
    var wrap = h("div", { class: "slots" + (o.sm ? " slots-sm" : "") });
    (list || []).forEach(function (s, i) {
      var cls = "slot";
      var face = "";
      if (s.solved) cls += " is-locked";
      else if (s.current) cls += " is-cursor";
      else if (s.digit == null) cls += " is-empty";
      if (s.shake) cls += " is-shaking";
      if (s.solved) face = String(s.digit == null ? "" : s.digit);
      else face = s.digit == null ? "·" : String(s.digit);
      var children = [h("span", { class: "slot-idx" }, String(o.offset != null ? o.offset + i : i))];
      children.push(h("span", { class: "slot-face" }, face));
      if (s.solved) children.push({ html: X.icons.icon("check", { size: 14, className: "mono" }) });
      wrap.appendChild(h("div", { class: cls, "data-slot": s.index == null ? i : s.index }, children));
    });
    return wrap;
  }

  function slotTimer(seconds, opts) {
    var o = opts || {};
    return h("span", {
      class: "slot-timer" + (o.critical ? " is-critical" : ""),
      "data-role": "slot-timer"
    }, formatClock(seconds));
  }

  function formatClock(seconds) {
    var s = Math.max(0, Math.ceil(Number(seconds) || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return (m < 10 ? "0" + m : m) + ":" + (r < 10 ? "0" + r : r);
  }

  function timerRing(seconds, pct, opts) {
    var o = opts || {};
    var r = 26;
    var C = 2 * Math.PI * r;
    var p = util.clamp(Number(pct) || 0, 0, 1);
    var svg = dom.svg("svg", { viewBox: "0 0 62 62" }, [
      dom.svg("circle", { class: "track", cx: 31, cy: 31, r: r }),
      dom.svg("circle", {
        class: "fill", cx: 31, cy: 31, r: r,
        "stroke-dasharray": C,
        "stroke-dashoffset": C * (1 - p)
      })
    ]);
    return h("div", {
      class: "timer-ring" + (o.critical ? " is-critical" : "")
    }, [
      svg,
      h("span", { class: "label" }, formatClock(seconds))
    ]);
  }

  /* --------------------------------------------------------------- heads -- */

  function pageHead(opts) {
    var o = opts || {};
    var kids = [];
    if (o.back) {
      kids.push(h("div", { class: "back-link-row" }, [
        h("a", {
          class: "back-link",
          href: o.back.href || "#/",
          onclick: o.back.onClick || undefined
        }, [
          { html: X.icons.icon("arrowLeft", { size: 14 }) },
          o.back.label || "Back"
        ])
      ]));
    }
    var content = [];
    if (o.eyebrow) content.push(h("div", { class: "eyebrow" }, o.eyebrow));
    if (o.title) content.push(h("h1", {}, o.title));
    if (o.sub) content.push(h("p", { class: "muted", style: { maxWidth: "62ch" } }, o.sub));
    if (o.actions) content.push(h("div", { class: "profile-actions" }, o.actions));
    kids.push(h("div", { class: "page-head-row" }, content));
    return h("div", { class: "page-head" }, kids);
  }

  function empty(opts) {
    var o = opts || {};
    return h("div", { class: "empty" }, [
      o.icon ? { html: X.icons.icon(o.icon, { size: 34 }) } : null,
      o.title ? h("h3", {}, o.title) : null,
      o.message ? h("p", { class: "muted" }, o.message) : null,
      o.action || null
    ]);
  }

  /* --------------------------------------------------------------- forms -- */

  function field(opts) {
    var o = opts || {};
    var kids = [];
    if (o.label) kids.push(h("label", { class: "field-label", for: o.for }, o.label));
    if (o.control) kids.push(o.control);
    else if (o.input) kids.push(o.input);
    if (o.hint) kids.push(h("span", { class: "hint" }, o.hint));
    return h("div", { class: "field" }, kids);
  }

  function input(opts) {
    var o = util.merge({ type: "text" }, opts || {});
    var attrs = {
      type: o.type,
      class: "input" + (o.mono ? " input-mono" : ""),
      placeholder: o.placeholder,
      value: o.value,
      disabled: o.disabled,
      maxlength: o.maxlength,
      inputmode: o.inputmode,
      autocomplete: o.autocomplete,
      oninput: o.onInput
    };
    return h("input", attrs);
  }

  function select(opts) {
    var o = opts || {};
    return h("select", {
      class: "select",
      onchange: o.onChange
    }, (o.options || []).map(function (opt) {
      return h("option", { value: opt.value, selected: o.value === opt.value }, opt.label);
    }));
  }

  function switchRow(opts) {
    var o = opts || {};
    var on = !!o.checked;
    var toggle = h("button", {
      type: "button",
      class: "switch",
      role: "switch",
      "aria-checked": on,
      "aria-label": o.label,
      onclick: function () {
        on = !on;
        toggle.setAttribute("aria-checked", String(on));
        if (o.onChange) o.onChange(on);
      }
    });
    return h("div", { class: "switch-row" }, [
      h("div", { class: "switch-row-text" }, [
        o.title ? h("strong", {}, o.title) : null,
        o.sub ? h("span", {}, o.sub) : null
      ]),
      toggle
    ]);
  }

  function segment(opts) {
    var o = opts || {};
    return h("div", { class: "segment" }, (o.options || []).map(function (opt) {
      return h("button", {
        type: "button",
        class: "segment-item" + (o.value === opt.value ? " is-active" : ""),
        onclick: function () { if (o.onChange) o.onChange(opt.value); }
      }, opt.label);
    }));
  }

  function tabs(opts) {
    var o = opts || {};
    return h("div", { class: "tabs" }, (o.tabs || []).map(function (t) {
      var kids = [];
      if (t.icon) kids.push({ html: X.icons.icon(t.icon, { size: 13 }) });
      kids.push(t.label);
      return h("button", {
        type: "button",
        class: "tab" + (o.value === t.id ? " is-active" : ""),
        onclick: function () { if (o.onChange) o.onChange(t.id); }
      }, kids);
    }));
  }

  function puzzleDots(total, current, solvedCount) {
    var dots = [];
    for (var i = 0; i < total; i++) {
      var cls = "pdot";
      if (i < solvedCount) cls += " on";
      if (i === current) cls += " cur";
      dots.push(h("span", { class: cls }));
    }
    return h("div", { class: "puzzle-dots" }, dots);
  }

  /* -------------------------------------------------------------- rows --- */

  function listRow(opts) {
    var o = opts || {};
    var kids = [];
    if (o.avatar != null) {
      if (typeof o.avatar === "string") kids.push(avatar(o.avatar, { size: o.avatarSize, solid: o.avatarSolid }));
      else kids.push(o.avatar);
    } else if (o.icon) {
      kids.push(h("span", { class: "setup-glyph" }, { html: X.icons.icon(o.icon, { size: 20 }) }));
    }
    var main = h("div", { class: "list-row-main" }, [
      o.title != null ? h("div", { class: "list-row-title" }, o.title) : null,
      o.sub != null ? h("div", { class: "list-row-sub" }, o.sub) : null
    ]);
    kids.push(main);
    if (o.right != null) kids.push(o.right);
    if (o.href) {
      return h("a", { class: "list-row", href: o.href }, kids);
    }
    var attrs = { class: "list-row" };
    if (o.onClick) attrs.onclick = o.onClick;
    return h("button", util.merge(attrs, { type: "button", style: { width: "100%", textAlign: "left" } }), kids);
  }

  function kbd(keys) {
    var list = Array.isArray(keys) ? keys : [keys];
    return h("span", { class: "kbd-grid-single" }, list.map(function (k) { return h("kbd", { class: "kbd" }, k); }));
  }

  function spinner(size) {
    return h("span", { class: "spinner", style: size ? { width: size + "px", height: size + "px" } : null });
  }

  X.Widgets = {
    icon: icon,
    iconBtn: iconBtn,
    btn: btn,
    chip: chip,
    tag: tag,
    avatar: avatar,
    stat: stat,
    bar: bar,
    meter: meter,
    slots: slots,
    slotTimer: slotTimer,
    timerRing: timerRing,
    pageHead: pageHead,
    empty: empty,
    field: field,
    input: input,
    select: select,
    switchRow: switchRow,
    segment: segment,
    tabs: tabs,
    puzzleDots: puzzleDots,
    listRow: listRow,
    kbd: kbd,
    spinner: spinner,
    formatClock: formatClock
  };
})(window);