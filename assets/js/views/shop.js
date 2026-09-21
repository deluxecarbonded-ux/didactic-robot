/* ==========================================================================
   Exotic — shop view
   One sealed shop per realm. Consumables stack, perks turn on once, and
   cosmetics equip. The balance lives in the realm ledger — buying here
   spends Shards ⬡ or Cores ◈ and never the other realm's.
   ========================================================================== */
(function (global) {
  "use strict";
  var X = (global.Exotic = global.Exotic || {});
  var dom = X.dom;
  var util = X.util;
  var W = X.Widgets;

  var h = dom.el;
  X.views = X.views || {};

  function realmOf(ctx) { return ctx.query.realm === "multi" ? "multi" : "single"; }
  function glyph(realm) { return realm === "multi" ? "orbit" : "gem"; }
  function currencyName(realm) { return realm === "multi" ? "cores" : "shards"; }

  X.views.shop = {
    mount: function (outlet, ctx) {
      dom.mount(outlet, this.render(ctx));
      this.bind(ctx);
    },
    render: function (ctx) {
      var realm = realmOf(ctx);
      var R = X.Cloud.realm(realm);
      var balance = realm === "multi" ? (R.profile ? R.profile.cores : 0) : (R.profile ? R.profile.shards : 0);
      return h("div", { class: "stack-6" }, [
        W.pageHead({
          eyebrow: realm === "multi" ? "Core realm market" : "Shard realm market",
          title: "The vault exchange",
          sub: "Everything is bought with winnings, never real money. The other realm's shop is behind a sealed door.",
          back: { href: "#/" }
        }),
        h("div", { class: "shop-hero" }, [
          h("div", { class: "balance-block" }, [
            h("span", { class: "hud-label" }, "Your " + currencyName(realm)),
            h("div", { class: "balance-num", "data-role": "balance" }, [
              { html: X.icons.icon(glyph(realm), { size: 24 }) },
              util.fmtNum(balance)
            ])
          ]),
          h("div", { class: "hint" }, "Earned at the board. Spent here. Never traded across realms.")
        ]),
        h("div", { class: "tabs", "data-role": "shop-tabs" },
          ["all", "consume", "perk", "cosmetic"].map(function (t) {
            return h("button", {
              type: "button",
              class: "tab" + (t === "all" ? " is-active" : ""),
              "data-type": t
            }, [X.Shop.type(t) ? X.Shop.type(t).name : "All"]);
          })
        ),
        h("div", { class: "shop-grid", "data-role": "shop-grid" })
      ]);
    },

    bind: function (ctx) {
      var self = this;
      this._realm = realmOf(ctx);
      this._type = "all";
      this._subs = [];
      this._subs.push(this._listen(X.Cloud.realm(this._realm), "profile", util.debounce(function () { self.renderBalance(); }, 50)));
      this._subs.push(this._listen(X.Cloud.realm(this._realm), "inventory", function () { self.renderGrid(); }));

      var tabs = dom.qs('[data-role="shop-tabs"]');
      tabs.addEventListener("click", function (e) {
        var btn = e.target.closest(".tab");
        if (!btn) return;
        self._type = btn.getAttribute("data-type");
        dom.qsa(".tab", tabs).forEach(function (t) { t.classList.toggle("is-active", t === btn); });
        self.renderGrid();
      });

      this.renderGrid();
    },

    _listen: function (em, ev, fn) {
      em.on(ev, fn);
      return function () { em.off(ev, fn); };
    },

    renderBalance: function () {
      var R = X.Cloud.realm(this._realm);
      var bal = dom.qs('[data-role="balance"]');
      if (!bal) return;
      var v = this._realm === "multi" ? (R.profile ? R.profile.cores : 0) : (R.profile ? R.profile.shards : 0);
      bal.textContent = "";
      bal.appendChild(h("span", { html: X.icons.icon(glyph(this._realm), { size: 24 }) }));
      bal.appendChild(document.createTextNode(util.fmtNum(v)));
    },

    renderGrid: function () {
      var self = this;
      var realm = this._realm;
      var R = X.Cloud.realm(realm);
      var grid = dom.qs('[data-role="shop-grid"]');
      if (!grid) return;
      var items = this._type === "all" ? X.Shop.items(realm) : X.Shop.byType(realm, this._type);
      grid.textContent = "";
      items.forEach(function (item) {
        grid.appendChild(self.itemCard(R, item));
      });
      if (!items.length) {
        grid.appendChild(W.empty({ icon: "ghost", title: "Nothing on this shelf", message: "Try another section." }));
      }
    },

    itemCard: function (R, item) {
      var self = this;
      var qty = R.quantityOf(item.id);
      var isPerk = item.type === "perk";
      var isCosmetic = item.type === "cosmetic";
      var owned = qty > 0;
      var equipped = false;
      if (isCosmetic && R.profile && R.profile.equipped) {
        equipped = R.profile.equipped[item.effect.key] === item.effect.value;
      }

      var control;
      if ((isPerk || isCosmetic) && owned) {
        control = W.btn(equipped ? "Equipped" : "Equip", {
          size: "sm",
          variant: equipped ? "" : "ghost",
          disabled: equipped,
          onClick: isCosmetic && !equipped ? function () {
            R.equip(item.effect.key, item.effect.value).then(function () {
              X.Toast.success("Equipped " + item.name + ".");
              self.renderGrid();
            }).catch(function (err) {
              X.Toast.error(err && err.message ? err.message : "Could not equip that.");
            });
          } : null
        });
      } else {
        control = W.btn(owned ? "Buy more" : "Buy", {
          size: "sm",
          onClick: function () {
            R.purchase(item.id).then(function () {
              X.Toast.success(item.name + " added to your vault.");
            }).catch(function (err) {
              X.Toast.error(err && err.message ? err.message : "Purchase failed.");
            });
          }
        });
      }

      return h("div", { class: "item" + (owned ? " is-owned" : "") }, [
        h("div", { class: "item-top" }, [
          h("span", { class: "item-glyph" }, { html: X.icons.icon(item.icon, { size: 22 }) }),
          h("span", { class: "rarity" + (item.rarity === "rare" || item.rarity === "epic" ? " rarity-" + item.rarity : "") }, item.rarityName)
        ]),
        h("div", { class: "item-name" }, item.name),
        h("div", { class: "item-desc" }, item.desc),
        h("div", { class: "item-foot" }, [
          h("span", { class: "item-price" }, [
            { html: X.icons.icon(glyph(this._realm), { size: 15 }) },
            util.fmtNum(item.price) + (owned && !isPerk && qty > 1 ? "  ·  ×" + qty : "")
          ]),
          control
        ])
      ]);
    },

    unmount: function () {
      if (this._subs) { this._subs.forEach(function (off) { off(); }); this._subs = []; }
      return true;
    }
  };
})(window);