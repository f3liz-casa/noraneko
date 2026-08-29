// SPDX-License-Identifier: MPL-2.0
/// <reference lib="deno.ns" />
//
// Where does this port stand against Firefox's tabbrowser.js?
//
// A ported member in gecko-compat can carry a stamp on the line above it:
//
//   // upstream: addTab@1f3a9c0b2e FIREFOX_154_0_RELEASE
//
// meaning "last reconciled with upstream's addTab as of that tag". The hash
// covers the member's body (comments stripped) plus the bodies of the
// members it calls through `this.x`, so a change in a helper we never
// ported still shows on the members that lean on it. One level only: with
// the whole closure, one change to `set selectedTab` rings the entire class.
//
//   deno task upstream-diff --to FIREFOX_154_0_RELEASE                   # what drifted since the stamps
//   deno task upstream-diff --to FIREFOX_154_0_RELEASE --diff --only addTab
//   deno task upstream-diff --stamp FIREFOX_143_0_1_RELEASE              # stamp the unstamped members
//   deno task upstream-diff --stamp FIREFOX_154_0_RELEASE --only addTab  # re-stamp one after reconciling it
//
// Tags are fetched from the mozilla-firefox mirror and cached under
// ~/.cache/noraneko; `--to` also takes a local path. Members are keyed
// `Container.name` (`Tabbrowser.` may be left off; getters and setters are
// `get name` / `set name`). Unstamped members are compared from ./UPSTREAM.

import { parseSync } from "oxc-parser";

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
const pin = (await Deno.readTextFile(here + "UPSTREAM")).trim();
const toSpec = args.get("to") as string | undefined;
const stampArg = args.get("stamp");
const only = args.get("only") as string | undefined;
const showDiff = args.get("diff") === true;
if (!toSpec && !stampArg) {
  console.error("usage: upstream-diff --to <tag|path> [--diff] [--only <member>]\n       upstream-diff --stamp [<tag>] [--only <member>]");
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
type Member = {
  key: string;        // Tabbrowser.addTab, TabProgressListener.onStateChange
  raw: string;        // source as written (for --diff)
  own: string;        // hash of the body, comments stripped
  full: string;       // own + the bodies it reaches through this.x
  deps: Set<string>;  // keys, same container
};
type Upstream = Map<string, Member>;

async function sha(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}

function memberName(node: any): string | null {
  const key = node.key;
  if (!key) return null;
  const base = key.type === "Identifier" ? key.name : key.type === "PrivateIdentifier" ? `#${key.name}` : null;
  if (!base) return null;
  return node.kind === "get" || node.kind === "set" ? `${node.kind} ${base}` : base;
}

// The name a class/object is known by: `class Foo`, `let Foo = {…}`, `window.Foo = class {…}`.
function containerName(node: any, parent: any): string | null {
  if (node.id?.name) return node.id.name;
  if (parent?.type === "VariableDeclarator") return parent.id?.name ?? null;
  if (parent?.type === "AssignmentExpression") {
    const l = parent.left;
    return l.type === "Identifier" ? l.name : l.type === "MemberExpression" ? l.property?.name ?? null : null;
  }
  return null;
}

function walk(node: any, parent: any, visit: (n: any, p: any) => boolean | void) {
  if (!node || typeof node.type !== "string") return;
  if (visit(node, parent) === false) return;
  for (const k of Object.keys(node)) {
    if (k === "type" || k === "start" || k === "end") continue;
    const v = node[k];
    if (Array.isArray(v)) { for (const c of v) if (c && typeof c === "object") walk(c, node, visit); }
    else if (v && typeof v === "object") walk(v, node, visit);
  }
}

async function parseUpstream(source: string): Promise<Upstream> {
  const { program, comments, errors } = parseSync("tabbrowser.js", source);
  if (errors.length) throw new Error(`upstream does not parse: ${errors[0].message}`);
  const commentRanges = comments.map((c) => [c.start, c.end] as const);

  const stripped = (start: number, end: number) => {
    let out = "", at = start;
    for (const [s, e] of commentRanges) {
      if (e <= start || s >= end) continue;
      out += source.slice(at, s);
      at = e;
    }
    return (out + source.slice(at, end)).replace(/\s+/g, " ").trim();
  };

  const found: { key: string; container: string; node: any }[] = [];
  walk(program, null, (node, parent) => {
    let items: any[] | null = null;
    if (node.type === "ClassDeclaration" || node.type === "ClassExpression") items = node.body?.body;
    else if (node.type === "ObjectExpression" && node.properties?.some((p: any) => /Function/.test(p.value?.type ?? ""))) items = node.properties;
    if (!items) return;
    const container = containerName(node, parent);
    if (!container) return;
    for (const item of items) {
      const name = memberName(item);
      if (name) found.push({ key: `${container}.${name}`, container, node: item });
    }
  });

  const members: Upstream = new Map();
  const rawDeps = new Map<string, Set<string>>();
  for (const { key, container, node } of found) {
    const deps = new Set<string>();
    walk(node, null, (n) => {
      if (n.type === "MemberExpression" && n.object?.type === "ThisExpression") {
        const p = n.property;
        const name = p?.type === "Identifier" ? p.name : p?.type === "PrivateIdentifier" ? `#${p.name}` : null;
        if (name) for (const v of [name, `get ${name}`, `set ${name}`]) deps.add(`${container}.${v}`);
      }
    });
    rawDeps.set(key, deps);
    members.set(key, {
      key,
      raw: source.slice(node.start, node.end),
      own: await sha(stripped(node.start, node.end)),
      full: "",
      deps: new Set(),
    });
  }
  for (const m of members.values()) {
    for (const d of rawDeps.get(m.key)!) if (d !== m.key && members.has(d)) m.deps.add(d);
  }
  // full = own + the direct dependencies' own hashes (one level: a helper
  // change reaches its callers, and each caller reconciles its own step)
  for (const m of members.values()) {
    const direct = [...m.deps].sort().map((k) => `${k}:${members.get(k)!.own}`);
    m.full = await sha([`${m.key}:${m.own}`, ...direct].join("\n"));
  }
  return members;
}

const upstreamCache = new Map<string, Promise<Upstream>>();
const upstream = (spec: string) => {
  if (!upstreamCache.has(spec)) upstreamCache.set(spec, resolve(spec).then(parseUpstream));
  return upstreamCache.get(spec)!;
};

// ------------------------------------------------------------ compat index
type Entry = {
  name: string;       // as defined here: addTab, get selectedTab
  container: string;  // upstream container this file's members stand for
  file: string;       // relative to this directory
  line: number;       // 0-based, the definition line
  stamp?: { key: string; hash: string; tag: string; line: number };
};

const DEF = /^ {2}(?=\S)(?:static\s+|async\s+|override\s+|readonly\s+)*(?:(get|set)\s+)?(#?[A-Za-z_$][\w$]*)\s*[(=:<]/;
const SKIP = /^(const|let|var|return|if|for|while|switch|case|export|import|type|interface|declare|private|protected|public)$/;
const STAMP = /^\s*\/\/ upstream: ((?:get |set )?\S+?)@([0-9a-f]+) (\S+)\s*$/;
const qualify = (key: string) => key.includes(".") ? key : `Tabbrowser.${key}`;
const bare = (name: string) => name.replace(/^(get|set) /, "");

async function indexCompat(): Promise<Map<string, Entry[]>> {
  const byFile = new Map<string, Entry[]>();
  async function walkDir(dir: string) {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) await walkDir(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
        const file = p.slice(here.length);
        const lines = (await Deno.readTextFile(p)).split("\n");
        const entries: Entry[] = [];
        // `export const methods = {` and `class TabbrowserCompat` both stand
        // for Tabbrowser; a class or object with another name at column 0
        // (TabProgressListener, URILoadingWrapper) stands for its namesake.
        let container = "Tabbrowser";
        lines.forEach((l, i) => {
          const c = /^(?:export\s+)?(?:class|const|let)\s+([A-Za-z_$][\w$]*)/.exec(l);
          if (c) container = c[1] === "methods" || c[1] === "TabbrowserCompat" ? "Tabbrowser" : c[1];
          const m = DEF.exec(l);
          if (!m || SKIP.test(m[2])) return;
          const entry: Entry = { name: m[1] ? `${m[1]} ${m[2]}` : m[2], container, file, line: i };
          const s = i > 0 ? STAMP.exec(lines[i - 1]) : null;
          if (s) entry.stamp = { key: qualify(s[1]), hash: s[2], tag: s[3], line: i - 1 };
          entries.push(entry);
        });
        if (entries.length) byFile.set(p, entries);
      }
    }
  }
  await walkDir(here + "gecko-compat");
  return byFile;
}

// Which upstream member does an unstamped entry stand for? Exact name first,
// then a field here may stand for a getter/setter there.
function guessKey(entry: Entry, up: Upstream): string | undefined {
  const b = bare(entry.name), c = entry.container;
  for (const k of [`${c}.${entry.name}`, `${c}.${b}`, `${c}.get ${b}`, `${c}.set ${b}`]) if (up.has(k)) return k;
}

const wanted = (entry: Entry) =>
  !only || entry.name === only || bare(entry.name) === only || entry.stamp?.key === qualify(only) || entry.stamp?.key.endsWith(`.${only}`);

const loc = (e: Entry) => `${e.file}:${e.line + 1}`;

// -------------------------------------------------------------------- stamp
if (stampArg) {
  const tag = stampArg === true ? pin : stampArg;
  if (/[/.]/.test(tag)) { console.error("--stamp wants a tag name, not a path (the stamp records it)"); Deno.exit(2); }
  const up = await upstream(tag);
  let written = 0;
  for (const [path, entries] of await indexCompat()) {
    const lines = (await Deno.readTextFile(path)).split("\n");
    const edits: { at: number; replace: boolean; text: string }[] = [];
    for (const e of entries) {
      if (!wanted(e)) continue;
      if (e.stamp && !only) continue;                 // already stamped; --only re-stamps
      const key = e.stamp?.key ?? guessKey(e, up);
      const m = key && up.get(key);
      if (!m) continue;
      const indent = /^\s*/.exec(lines[e.line])![0];
      const text = `${indent}// upstream: ${key.replace(/^Tabbrowser\./, "")}@${m.full} ${tag}`;
      edits.push(e.stamp ? { at: e.stamp.line, replace: true, text } : { at: e.line, replace: false, text });
    }
    for (const ed of edits.sort((a, b) => b.at - a.at)) lines.splice(ed.at, ed.replace ? 1 : 0, ed.text);
    if (edits.length) { await Deno.writeTextFile(path, lines.join("\n")); written += edits.length; }
  }
  console.log(`stamped ${written} member(s) at ${tag}`);
  Deno.exit(0);
}

// ------------------------------------------------------------------- report
const to = await upstream(toSpec!);
const from = await upstream(pin);
const entries = [...(await indexCompat()).values()].flat().filter(wanted);

type Drift = { entry: Entry; key: string; since: string; kind: "changed" | "removed"; via: string[] };
const drifted: Drift[] = [];
const covered = new Set<string>();

for (const e of entries) {
  const key = e.stamp?.key ?? guessKey(e, from) ?? guessKey(e, to);
  if (!key) continue;
  covered.add(key);
  const since = e.stamp?.tag ?? pin;
  const base = e.stamp ? await upstream(since) : from;
  const was = e.stamp?.hash ?? base.get(key)?.full;
  const now = to.get(key);
  if (!now) { if (was) drifted.push({ entry: e, key, since, kind: "removed", via: [] }); continue; }
  if (was === now.full) continue;
  // where to look: the member itself, and the direct dependencies whose own
  // closure moved (the reader can follow those one step at a time)
  const via = [...now.deps]
    .filter((k) => base.get(k)?.full !== to.get(k)!.full)
    .map((k) => k.replace(/^Tabbrowser\./, ""));
  const ownChanged = !base.get(key) || base.get(key)!.own !== now.own;
  drifted.push({ entry: e, key, since, kind: "changed", via: ownChanged ? ["(itself)", ...via] : via });
}

const stamped = entries.filter((e) => e.stamp).length;
console.log(`tabbrowser.js → ${toSpec}   (unstamped members measured from ${pin})`);
console.log(`compat: ${entries.length} members, ${stamped} stamped; upstream: ${from.size} → ${to.size} members\n`);

console.log("## ported members that drifted");
for (const d of drifted) {
  const mark = d.kind === "removed" ? "-" : "~";
  const stamp = d.entry.stamp ? `since ${d.since}` : `unstamped, since ${d.since}`;
  const via = d.via.length ? `  via ${d.via.join(", ")}` : "";
  console.log(`${mark} ${d.key.replace(/^Tabbrowser\./, "").padEnd(36)} ${loc(d.entry).padEnd(44)} ${stamp}${via}`);
}
if (!drifted.length) console.log("(none)");

if (!only) {
  const rest = { changed: [] as string[], added: [] as string[], removed: [] as string[] };
  for (const k of new Set([...from.keys(), ...to.keys()])) {
    if (covered.has(k)) continue;
    const a = from.get(k), b = to.get(k);
    if (a && !b) rest.removed.push(k);
    else if (!a && b) rest.added.push(k);
    else if (a!.own !== b!.own) rest.changed.push(k);
  }
  console.log(`\n## upstream members nothing here stands for (${pin} → ${toSpec})`);
  for (const [kind, mark] of [["changed", "~"], ["removed", "-"], ["added", "+"]] as const) {
    const names = rest[kind].sort();
    if (names.length) console.log(`${mark} ${names.length}: ${names.join(", ")}`);
  }
}

if (showDiff) {
  const tmp = await Deno.makeTempDir();
  for (const d of drifted) {
    if (d.kind !== "changed") continue;
    const base = d.entry.stamp ? await upstream(d.since) : from;
    const a = `${tmp}/a`, b = `${tmp}/b`;
    await Deno.writeTextFile(a, (base.get(d.key)?.raw ?? "") + "\n");
    await Deno.writeTextFile(b, to.get(d.key)!.raw + "\n");
    const out = await new Deno.Command("diff", {
      args: ["-u", "--label", `${d.since}:${d.key}`, "--label", `${toSpec}:${d.key}`, a, b],
    }).output();
    console.log(`\n### ${d.key}  (${loc(d.entry)})`);
    console.log(new TextDecoder().decode(out.stdout));
  }
  await Deno.remove(tmp, { recursive: true });
}
