/* ==========================================================================
   Exotic — guide view
   Rules, tips and hotkeys. Pure content: how a slot narrows, how a wrong
   guess is punished, what each power-up does, and the keyboard map.
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

  var STEPS = [
    { no: "01", title: "Four puzzles, one code", text: "A vault has four slots. Each slot is a puzzle that resolves to exactly one digit, 0–9. The four digits are your password." },
    { no: "02", title: "Narrow the candidates", text: "Answer puzzles, take hints, spend a Fifty-Fifty — every move strikes wrong digits from a slot's candidate set. Nothing ever changes the code." },
    { no: "03", title: "Unlock", text: "Once all four slots are cracked you know the code. Enter it to win before the clock runs out and before your attempts run dry." },
    { no: "04", title: "Wrong guesses sting", text: "A wrong full guess costs an attempt and time. Committing a wrong digit to a slot costs time but no attempt. The clock is the referee." }
  ];

  var FAQ = [
    { q: "How does a hint work?", a: "Each slot offers three progressive hints. Level one points at parity and range, level two halves the candidates to a pair, level three gives the digit away. Hints cost shards (or cores in multiplayer) that scale with the tier. The Exotic tier allows no hints at all." },
    { q: "What is a perfect run?", a: "Win without a single wrong full guess. You may still commit wrong digits. A perfect run pays the Flawless bonus and checks the Immaculate badge progression." },
    { q: "Do the two realms share anything?", a: "No. Shards never become cores, a streak in the Shard realm does not touch the Core ladder, and the shops are sealed. They share only your device." },
    { q: "Can I pause a run?", a: "Pausing is a power-up, not a right. Hold The Clock freezes the countdown for twenty seconds, Extra Time simply adds forty-five. Leaving mid-run saves the snapshot so the same vault can be resumed later." },
    { q: "What makes the Exotic tier different?", a: "Difficulty five puzzles, three attempts, ninety-five seconds, and a hard rule: no hints, no oracles, no mercy." },
    { q: "Does anything work without the internet?", a: "Everything local does — your profiles, shops, history, badges and runs live on-device under the exotic.v1.* keys. Supabase and OpenRouter are optional upgrades you enable in Settings." }
  ];

  var KEYS = [
    { keys: ["1–9"], what: "Press a puzzle digit" },
    { keys: ["Backspace"], what: "Delete the last digit" },
    { keys: ["Enter"], what: "Submit the entry / unlock the vault" },
    { keys: ["Tab"], what: "Move between puzzle slots" }
  ];

  function steps() {
    return h("section", { class: "stack-5" }, [
      h("div", { class: "section-head" }, [h("h2", {}, "How the vault works"), h("span", { class: "muted" }, "Four rules, learned once")]),
      h("div", { class: "step-grid" },
        STEPS.map(function (s) {
          return h("div", { class: "step" }, [
            h("div", { class: "step-no" }, s.no),
            h("div", {}, [
              h("h4", {}, s.title),
              h("p", {}, s.text)
            ])
          ]);
        })
      )
    ]);
  }

  function faq() {
    return h("section", { class: "stack-5" }, [
      h("div", { class: "section-head" }, [h("h2", {}, "Questions"), h("span", { class: "muted" }, "Honest answers")]),
      h("div", { class: "faq" },
        FAQ.map(function (item) {
          var body = h("div", { class: "faq-a" }, [h("div", { class: "faq-a-inner" }, item.a)]);
          var row = h("div", { class: "faq-item" }, [
            h("button", {
              type: "button",
              class: "faq-q",
              onclick: function () {
                var isOpen = row.classList.contains("is-open");
                row.classList.toggle("is-open", !isOpen);
                if (!isOpen) body.style.maxHeight = body.scrollHeight + "px";
                else body.style.maxHeight = "0px";
              }
            }, [item.q, { html: X.icons.icon("plus", { size: 16 }) }]),
            body
          ]);
          return row;
        })
      )
    ]);
  }

  function keyboard() {
    return h("section", { class: "stack-5" }, [
      h("div", { class: "section-head" }, [h("h2", {}, "Keyboard"), h("span", { class: "muted" }, "When the keypad has focus")]),
      h("div", { class: "kbd-grid" },
        KEYS.map(function (row) {
          return h("div", { class: "kbd-row" }, [
            h("span", { class: "hint" }, row.what),
            h("span", {}, row.keys.map(function (k) { return h("kbd", { class: "kbd" }, k); }))
          ]);
        })
      )
    ]);
  }

  X.views.guide = {
    mount: function (outlet, ctx) {
      dom.mount(outlet, this.render(ctx));
    },
    render: function () {
      return h("div", { class: "stack-7" }, [
        W.pageHead({
          eyebrow: "Field manual",
          title: "Know your vault",
          sub: "Everything the game does, in under two minutes of reading.",
          back: { label: "Home", href: "#/" }
        }),
        steps(),
        keyboard(),
        faq()
      ]);
    },
    unmount: function () { return true; }
  };
})(window);