#!/usr/bin/env node
/* Fail CI when generated locale catalogs drift from the scanned UI references. */
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const manifest = JSON.parse(await readFile(path.join(root, "assets/locales/index.json"), "utf8"));
const expected = new Set(manifest.references || []);
const failures = [];
for (const locale of manifest.locales) {
  const pack = JSON.parse(await readFile(path.join(root, "assets/locales", locale.file), "utf8"));
  const actual = new Set(Object.keys(pack.translations || {}));
  const missing = [...expected].filter((value) => !actual.has(value));
  if (missing.length) failures.push(`${locale.code}: ${missing.length} missing`);
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`i18n coverage ok: ${manifest.locales.length} locales x ${expected.size} references`);