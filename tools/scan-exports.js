/* Static analysis: dump which keys each module assigns onto X (window.Exotic),
   so the remaining view/game modules can be built against exact contracts. */
"use strict";
const fs = require("fs");
const path = require("path");

const base = process.argv[2] || "D:\\GTP\\GTP2\\assets\\js";
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".js")) files.push(p);
  }
})(baseopera);

files.sort();

/* patterns that assign an exported symbol on the namespace */
const KEYS = [
  /^\s*(?:X|var X)\.([A-Za-z_$][\w$]*)\s*=\s*/,
  /^\s*X\.([A-Za-z_$][\w$]*)\s*=\s*(?:function|new|\(|\{|\{|\[)/,
  /(?:^|\n)\s*X\.([A-Za-z_$][\w$]*)\s*=\s*function\b/,
  /(?:^|\n)\s*X\.([A-Za-z_$][\w$]*)\s*=\s*\{/,
  /(?:^|\n)\s*X\.([A-Za-z_$][\w$]*)\s*=\s*new\s+/
];

function exportsOf(src) {
  const keys = new Set();
  const importMeta = [];
  const lines = src.split("\n");
  lines.forEach((ln, i) => {
    // any X.Key = ... assignment
    const m = ln.match(/^\s*X\.([A-Za-z_$][\w$]*)\s*=\s*(.*)$/);
    if (m) {
      keys.add(m[1]);
      const rhs = m[2].replace(/;$/, "").trim();
      if (rhs.length < 90) importMeta.push(`  ${m[1]} = ${rhs}`);
      else importMeta.push(`  ${m[1]} = <large>`);
    }
    // var Foo = ... / var Foo = function  (common internal, but some aliased)
    const v = ln.match(/^\s*var\s+([A-Za-z_$][\w$]*)\s*=\s*(.*)$/);
    if (v) {
      const inner = keys.has(v[1]);
      // track any X.<Alias> = varName pattern directly below
      void inner;
    }
  });
  return { keys: [...keys].sort(), meta: importMeta };
}

let out = "";
files.forEach((f) => {
  const src = fs.readFileSync(f, "utf8");
  const rel = path.relative(base, f);
  const { keys, meta } = exportsOf(src);
  out += "\n=== " + rel + " (" + src.split("\n").length + " lines) ===\n";
  if (!keys.length) out += "  (no X.<Key> assignments at line start)\n";
  else out += keys.map((k) => "  " + k).join("\n") + "\n";
  if (meta.length) out += meta.join("\n") + "\n";
});

fs.writeFileSync(path.join(path.dirname(base), "..", "exports.txt"), out);
process.stdout.write("wrote exports to " + path.join(path.dirname(base), "..", "exports.txt") + "\n");
process.stdout.write("total files: " + files.length + "\n");
