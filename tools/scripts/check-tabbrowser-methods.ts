// SPDX-License-Identifier: MPL-2.0

/**
 * Build-time twin of the runtime warning in TabbrowserCompat.initCompat():
 * gecko-compat modules are merged onto one prototype, later modules win, and
 * a name defined twice is silently shadowed. This scans the module sources
 * and fails when
 *   - two modules define the same member, or
 *   - a class *instance field* in TabbrowserCompat.ts has the same name as a
 *     module getter/setter (the own property would hide the accessor).
 * Class *methods* may be overridden by modules on purpose; those are not
 * reported.
 *
 *   deno run -A tools/scripts/check-tabbrowser-methods.ts
 */

import * as path from "@std/path";

const ROOT = path.resolve(path.dirname(path.fromFileUrl(import.meta.url)), "../..");
const DIR = path.join(ROOT, "browser-features/chrome/features/tabbrowser/gecko-compat");
const CLASS_FILE = path.join(DIR, "TabbrowserCompat.ts");

// Known, intentional clashes (see the analysis note); remove once merged.
const ALLOW = new Set(["addTabGroup", "removeTabGroup"]);

/** `  name(`, `  async name(`, `  get name(`, `  set name(` at two-space indent. */
const MEMBER_RE = /^  (?:async )?(get |set )?(_?[A-Za-z][A-Za-z0-9]*)\s*\(/gm;
/** `  name: T = …;` or `  private name = …;` (instance fields, not `declare`). */
const FIELD_RE = /^  (?!declare |static |readonly )(?:private |protected |public )?(_?[A-Za-z][A-Za-z0-9]*)(?:\??: [^=;\n]+)? = /gm;

const owners = new Map<string, string[]>();
const accessors = new Set<string>();

for await (const entry of Deno.readDir(path.join(DIR, "modules"))) {
  if (!entry.name.endsWith(".ts")) continue;
  const src = await Deno.readTextFile(path.join(DIR, "modules", entry.name));
  const mod = entry.name.replace(/\.ts$/, "");
  const seen = new Set<string>();
  for (const m of src.matchAll(MEMBER_RE)) {
    const [, kind, name] = m;
    if (kind) accessors.add(name);
    if (seen.has(name)) continue; // get/set pair in one module
    seen.add(name);
    owners.set(name, [...(owners.get(name) ?? []), mod]);
  }
}

const problems: string[] = [];

for (const [name, mods] of owners) {
  if (mods.length > 1 && !ALLOW.has(name)) {
    problems.push(`${name}: defined in ${mods.join(", ")} (last one wins)`);
  }
}

const classSrc = await Deno.readTextFile(CLASS_FILE);
for (const m of classSrc.matchAll(FIELD_RE)) {
  const name = m[1];
  if (accessors.has(name)) {
    problems.push(`${name}: instance field in TabbrowserCompat.ts hides a module accessor (use \`declare\`)`);
  }
}

if (problems.length) {
  console.error("[check-tabbrowser-methods] duplicate members:");
  for (const p of problems) console.error("  - " + p);
  Deno.exit(1);
}
console.log(`[check-tabbrowser-methods] ok (${owners.size} members, ${accessors.size} accessors)`);
