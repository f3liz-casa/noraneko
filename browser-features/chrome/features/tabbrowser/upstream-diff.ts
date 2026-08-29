// SPDX-License-Identifier: MPL-2.0
/// <reference lib="deno.ns" />
//
// Compare two versions of Firefox's tabbrowser.js member by member, and say
// which of the changed members this compat layer has ported (and where).
//
//   deno task upstream-diff --to FIREFOX_154_0_RELEASE          # from the pin
//   deno task upstream-diff --from FIREFOX_143_0_1_RELEASE --to /path/to/tabbrowser.js --diff
//   deno task upstream-diff --to FIREFOX_154_0_RELEASE --diff --only addTab
//
// `--from` defaults to the tag in ./UPSTREAM. A spec is a git tag of the
// mozilla-firefox/firefox mirror (fetched and cached) or a local path.
// Members are the 4-space-indented entries of `window.Tabbrowser = class`;
// `this.x` references inside a member are followed so that a change in an
// unported helper still points at the ported members that lean on it.

const UPSTREAM_PATH = "browser/components/tabbrowser/content/tabbrowser.js";
const here = new URL(".", import.meta.url).pathname;

// ---------------------------------------------------------------- arguments
const args = new Map<string, string | true>();
for (let i = 0; i < Deno.args.length; i++) {
  const a = Deno.args[i];
  if (!a.startsWith("--")) continue;
  const next = Deno.args[i + 1];
  if (next && !next.startsWith("--")) { args.set(a.slice(2), next); i++; }
  else args.set(a.slice(2), true);
}
const fromSpec = (args.get("from") as string) ?? (await Deno.readTextFile(here + "UPSTREAM")).trim();
const toSpec = args.get("to") as string | undefined;
const showDiff = args.get("diff") === true;
const only = args.get("only") as string | undefined;
if (!toSpec) {
  console.error("usage: upstream-diff [--from <tag|path>] --to <tag|path> [--diff] [--only <member>]");
  Deno.exit(2);
}

// ----------------------------------------------------------------- sources
async function resolve(spec: string): Promise<string> {
  try { return await Deno.readTextFile(spec); } catch { /* not a path */ }
  const cacheDir = `${Deno.env.get("HOME")}/.cache/noraneko`;
  const cached = `${cacheDir}/tabbrowser.js@${spec}`;
  try { return await Deno.readTextFile(cached); } catch { /* fetch below */ }
  const url = `https://raw.githubusercontent.com/mozilla-firefox/firefox/${spec}/${UPSTREAM_PATH}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`);
  const text = await res.text();
  await Deno.mkdir(cacheDir, { recursive: true });
  await Deno.writeTextFile(cached, text);
  return text;
}

// ------------------------------------------------------------------ parsing
type Member = { name: string; line: number; text: string; deps: Set<string> };
type Parsed = { members: Map<string, Member>; outside: string };

const MEMBER_START = /^ {4}(?=\S)(?:static\s+)?(?:async\s+)?(?:(get|set)\s+)?\*?(#?[A-Za-z_$][\w$]*)\s*[(=]/;

function parseClass(text: string): Parsed {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.startsWith("  window.Tabbrowser = class"));
  if (start < 0) throw new Error("window.Tabbrowser = class not found");
  let end = lines.findIndex((l, i) => i > start && l === "  };");
  if (end < 0) end = lines.length;

  const starts: { name: string; line: number }[] = [];
  for (let i = start + 1; i < end; i++) {
    const m = MEMBER_START.exec(lines[i]);
    if (m) starts.push({ name: m[1] ? `${m[1]} ${m[2]}` : m[2], line: i });
  }

  const members = new Map<string, Member>();
  starts.forEach((s, k) => {
    let last = (starts[k + 1]?.line ?? end) - 1;
    // the comment block just before the next member belongs to that member
    while (last > s.line && /^\s*(\/\/|\/?\*|$)/.test(lines[last])) last--;
    const body = lines.slice(s.line, last + 1);
    members.set(s.name, { name: s.name, line: s.line + 1, text: body.join("\n"), deps: new Set() });
  });
  for (const m of members.values()) {
    for (const ref of m.text.matchAll(/\bthis\.(#?[A-Za-z_$][\w$]*)/g)) {
      const n = ref[1];
      if (n === m.name) continue;
      if (members.has(n)) m.deps.add(n);
      if (members.has(`get ${n}`)) m.deps.add(`get ${n}`);
      if (members.has(`set ${n}`)) m.deps.add(`set ${n}`);
    }
  }
  const outside = [...lines.slice(0, start), ...lines.slice(end + 1)].join("\n");
  return { members, outside };
}

const normalize = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");

// ------------------------------------------------------------ compat index
async function indexCompat(): Promise<Map<string, string[]>> {
  const index = new Map<string, string[]>();
  const root = here + "gecko-compat";
  const DEF = /^ {2}(?=\S)(?:static\s+|async\s+|override\s+|readonly\s+)*(?:get\s+|set\s+)?(#?[A-Za-z_$][\w$]*)\s*[(=:<]/;
  const SKIP = /^(const|let|var|return|if|for|while|switch|case|export|import|type|interface|declare|private|protected|public)$/;
  async function walk(dir: string) {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) await walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
        const lines = (await Deno.readTextFile(p)).split("\n");
        lines.forEach((l, i) => {
          const m = DEF.exec(l);
          if (!m || SKIP.test(m[1])) return;
          const name = m[1];
          const loc = `${p.slice(here.length)}:${i + 1}`;
          index.set(name, [...(index.get(name) ?? []), loc]);
        });
      }
    }
  }
  await walk(root);
  return index;
}

// ------------------------------------------------------------------- report
const [fromText, toText, compat] = await Promise.all([resolve(fromSpec), resolve(toSpec), indexCompat()]);
const { members: from, outside: fromOutside } = parseClass(fromText);
const { members: to, outside: toOutside } = parseClass(toText);

type Change = { name: string; kind: "changed" | "added" | "removed" };
const changes: Change[] = [];
for (const name of new Set([...from.keys(), ...to.keys()])) {
  const a = from.get(name), b = to.get(name);
  if (a && !b) changes.push({ name, kind: "removed" });
  else if (!a && b) changes.push({ name, kind: "added" });
  else if (normalize(a!.text) !== normalize(b!.text)) changes.push({ name, kind: "changed" });
}

// compat is indexed by bare name: `get selectedTab` upstream ↔ `selectedTab` here
const bare = (name: string) => name.replace(/^(get|set) /, "");
const locs = (name: string) => compat.get(bare(name));

// ported members that reach a changed member through this.* references
const changedNames = new Set(changes.map((c) => c.name));
const usersOf = new Map<string, Set<string>>();
for (const m of [...from.values(), ...to.values()]) {
  for (const d of m.deps) {
    if (!changedNames.has(d) || changedNames.has(m.name) || !locs(m.name)) continue;
    usersOf.set(d, (usersOf.get(d) ?? new Set()).add(m.name));
  }
}

const ported = changes.filter((c) => locs(c.name));
const unported = changes.filter((c) => !locs(c.name));
const mark = { changed: "~", added: "+", removed: "-" };

console.log(`tabbrowser.js  ${fromSpec}  →  ${toSpec}`);
console.log(`members: ${from.size} → ${to.size}, changed ${changes.length} (ported ${ported.length}, not ported ${unported.length})`);
console.log(`compat defines ${compat.size} members\n`);

console.log("## ported members that changed upstream");
for (const c of ported) console.log(`${mark[c.kind]} ${c.name.padEnd(40)} → ${locs(c.name)!.join(", ")}`);
if (!ported.length) console.log("(none)");

console.log("\n## not ported, but used by ported members");
let any = false;
for (const c of unported) {
  const users = usersOf.get(c.name);
  if (!users) continue;
  any = true;
  console.log(`${mark[c.kind]} ${c.name.padEnd(40)} ← ${[...users].join(", ")}`);
}
if (!any) console.log("(none)");

console.log("\n## not ported, nothing ported reaches it");
console.log(unported.filter((c) => !usersOf.has(c.name)).map((c) => `${mark[c.kind]} ${c.name}`).join("\n") || "(none)");

if (normalize(fromOutside) !== normalize(toOutside)) {
  console.log("\n(note) text outside the Tabbrowser class also differs (TabProgressListener, URILoadingWrapper, TabContextMenu…); not analysed here.");
}

if (showDiff) {
  const tmp = await Deno.makeTempDir();
  for (const c of ported) {
    if (c.kind !== "changed" || (only && bare(c.name) !== only)) continue;
    const a = `${tmp}/a`, b = `${tmp}/b`;
    await Deno.writeTextFile(a, from.get(c.name)!.text + "\n");
    await Deno.writeTextFile(b, to.get(c.name)!.text + "\n");
    const out = await new Deno.Command("diff", {
      args: ["-u", "--label", `${fromSpec}:${c.name}`, "--label", `${toSpec}:${c.name}`, a, b],
    }).output();
    console.log(`\n### ${c.name}  (compat: ${locs(c.name)!.join(", ")})`);
    console.log(new TextDecoder().decode(out.stdout));
  }
  await Deno.remove(tmp, { recursive: true });
}
