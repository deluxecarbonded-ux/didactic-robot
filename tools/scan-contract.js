/* Static scan: report every namespace export (`X.Name = ...`) each module
   attaches, plus function-returning methods (prototype assignments) so the
   remaining views can be written against the exact contracts. Prints sorted,
   grouped output. */
"use strict";
const fs = require("fs");
const path = require("path");

const base = "D:/GTP/GTP2/assets/js";
const out = [];

function walk(dir, list) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, list);
    else if (e.name.endsWith(".js")) list.push(p);
  }
  return list;
}

const files = walk(base, []);
files.sort();

const keys = /(?:^|\n)\s*X\.([A-Za-z_$][\w$]*)\s*=\s*/g;
const proto = /Realm\.prototype\.([A-Za-z_$][\w$]*)\s*=\s*function/;

for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const rel = path.relative(base, f);
  const sec = [];
  const lines = src.split("\n");

  lines.forEach((ln, i) => {
    const m = ln.match(/^\s*X\.([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$(]?)/);
    if (m) sec.push(`exp  ${m[1]} = ${m[2]}`);
    const ob = ln.match(/^\s*X\.([A-Za-z_$][\w$]*)\s*=\s*\{\s*$/);
    if (ob) sec.push(`exp  ${ob[1]} = { obj }`);
    const p = ln.match(/^\s*([A-Za-z_$][\w$]*)\.prototype\.([A-Za-z_$][\w$]*)\s*=\s*function/);
    if (p) sec.push(`mt   ${p[1]}.${p[2]}()`);
  });

  out.push(`=== ${rel} (${lines.length} lines) ===`);
  out.push(sec.length ? sec.join("\n") : "  (no X.* exports / prototypes)");
  out.push("");
}

fs.writeFileSync("D:/GTP/GTP2/contract.txt", out.join("\n"), "utf8");
process.stdout.write(`wrote contract.txt (${files.length} files)\n`);
