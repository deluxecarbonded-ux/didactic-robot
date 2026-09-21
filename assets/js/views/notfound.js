/* ==========================================================================
   Exotic — not found
   The hash router's dead end. Graceful, on-brand, and one tap from home.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var W = X.Widgets;
  var h = dom.el;

  X.views = X.views || {};
  X.views.notfound = {
    mount: function (outlet, ctx) {
      dom.mount(outlet, this.render(ctx));
    },
    render: function (ctx) {
      return h("div", { class: "stack-6" }, [
        W.pageHead({ eyebrow: "Error", title: "Outside the vault" }),
        h("div", { class: "setup-card" }, [
          W.empty({
            icon: "skull",
            title: "No such chamber",
            message: "The route '" + (ctx && ctx.path ? ctx.path : "?") + "' does not exist in this vault.",
            action: W.btn("Back to the front door", { icon: "house", onClick: function () { X.Router.go("/"); } })
          })
        ])
      ]);
    },
    unmount: function () { return true; }
  };
})(window);