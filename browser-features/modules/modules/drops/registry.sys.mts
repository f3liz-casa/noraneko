// SPDX-License-Identifier: MPL-2.0
/**
 * registry(配布元)と、そこに置かれた drop の在りか。
 *
 * 正体は uuid、名前は札(Julia の General と同じ絵。別の registry に同じ名前があっても
 * uuid が違えば別のもの)。ここは「どこから来るか」だけを扱い、落とす・入れるは知らない。
 */

const PREF_REGISTRIES = "noraneko.drops.registries"; // JSON: Registry[]。空なら既定の一つ

/** drop を配る registry(iOS の代替ストアと同じ絵: 既定の一つ + 本人が足したもの) */
export interface Registry {
  name: string;
  base: string; // 例: https://dl.f3liz.casa/drop  → <base>/<uuid>/manifest.json
  identity: string; // 判を押す workflow(Fulcio の cert の SAN)
  issuer: string;
}
export const DEFAULT_REGISTRY: Registry = {
  name: "f3liz",
  base: "https://dl.f3liz.casa/drop",
  identity: "https://github.com/f3liz-casa/noraneko-registry/.github/workflows/verify-and-sign.yml@refs/heads/main",
  issuer: "https://token.actions.githubusercontent.com",
};
export function listRegistries(): Registry[] {
  try {
    const v = JSON.parse(Services.prefs.getStringPref(PREF_REGISTRIES, "[]")) as Registry[];
    return v.length ? v : [DEFAULT_REGISTRY];
  } catch {
    return [DEFAULT_REGISTRY];
  }
}
export function addRegistry(r: Registry): void {
  if (!REGISTRY_NAME_RE.test(r.name)) throw new Error(`bad registry name: ${r.name}`);
  if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(r.base)) throw new Error(`base は https の URL で: ${r.base}`);
  if (!/^https:\/\//.test(r.identity)) throw new Error(`identity は workflow の URL で: ${r.identity}`);
  const all = listRegistries().filter((x) => x.name !== r.name);
  all.push({ ...r, base: r.base.replace(/\/$/, ""), issuer: r.issuer || DEFAULT_REGISTRY.issuer });
  Services.prefs.setStringPref(PREF_REGISTRIES, JSON.stringify(all));
}
export function removeRegistry(name: string): void {
  const all = listRegistries().filter((x) => x.name !== name);
  Services.prefs.setStringPref(PREF_REGISTRIES, JSON.stringify(all));
}
function registryByName(name?: string): Registry {
  const all = listRegistries();
  const r = name ? all.find((x) => x.name === name) : all[0];
  if (!r) throw new Error(`registry "${name}" が無い(設定で足せる)`);
  return r;
}

/** registry の名前(短い)。drop / dep の名前(札)はもっと長い */
export const REGISTRY_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,31}$/;
/** drop / dep の名前(札)の形。正体は uuid で、これは人が読むためのもの */
export const DROP_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
/** drop の正体。この字が全部を引く */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** library(dep)の版。semver 三つ */
export const SEMVER_RE = /^\d+\.\d+\.\d+$/;

/**
 * drop の正体は uuid(registry の drop.toml で一度振ったら変えない)。配る URL も、ここに入れる字も uuid。
 */
export function parseUuid(ref: string): string {
  const u = ref.trim().toLowerCase();
  if (!UUID_RE.test(u)) throw new Error(`書きかたは uuid(例: ec4dfa7c-9e5a-4c1d-8d0d-771e3ee81030): ${ref}`);
  return u;
}

export interface DropEntry {
  id: string;
  name: string;
  version: string;
  file: string;
  sha256: string;
  size: number;
}
/** 絵の一枚。どの entry の xpi に入っているかを、manifest が覚えている */
export interface Shot {
  file: string;
  type?: string;
  size?: number;
  in: string;
}
export interface DropManifest {
  uuid: string;
  name: string; // 札(registry の中の dir の名前)
  note?: string;
  contact?: string[]; // 作者の連絡先。"gh/<user>" "mail/<addr>" "social/<@user@host か URL>" か URL(drop.toml から CI が写す)
  source?: { repo?: string; commit?: string; commit_time?: string; path?: string };
  entries: DropEntry[];
  lib?: boolean; // library drop(actor を持たない。使う drop の scope に読まれる)
  deps?: DepRef[];
  /**
   * 96px までの PNG。同じ bytes が **xpi の中**(`in` の xpi の `icon.png`)と、
   * **manifest の隣**(dl の `/drop/<uuid>/<file>`)の両方にある。
   * 一枚を見るときは落とした xpi から読む(取りに行かない)。棚は落とす前なので隣のほうを使い、
   * 配る側がこの sha256 を照らしてからでないと返さない。
   */
  icon?: { file: string; type?: string; size?: number; sha256: string; in?: string };
  /** xpi の中の絵。落として判を見たあと(= 一枚を開いたとき)だけ読む */
  shots?: Shot[];
}
/** 使う library drop。registry の build が版を固定して manifest に写す(組み直さない限り古いまま) */
export interface DepRef {
  name: string;
  uuid: string;
  version: string; // semver(1.0.0)。dl の /drop/<uuid>/v/<semver>/ から落とす
  lib: boolean; // lib.js を持つ(content の scope に先に読む)
  wasm: boolean; // wasm/ を持つ(Tsubaki の runtime)
}

/** dl の path: <uuid>(最新)か <uuid>/v/<semver>(その版のまま) */
export function dropPath(uuid: string, semver?: string): string {
  if (semver && !SEMVER_RE.test(semver)) throw new Error(`bad version: ${semver}`);
  return semver ? `${uuid}/v/${semver}` : uuid;
}

/** manifest.json は bytes のまま持つ(判はその bytes に対して押されている) */
export async function fetchDropManifest(reg: Registry, uuid: string, semver?: string): Promise<{ manifest: DropManifest; bytes: Uint8Array }> {
  const resp = await fetch(`${reg.base}/${dropPath(uuid, semver)}/manifest.json`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`no drop ${uuid} in ${reg.name} (${resp.status})`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const m = JSON.parse(new TextDecoder().decode(bytes)) as DropManifest;
  if (m.uuid !== uuid) throw new Error(`manifest の uuid(${m.uuid})が ${uuid} と違う`);
  if (!DROP_NAME_RE.test(m.name ?? "")) throw new Error(`manifest の name の形が違う: ${m.name}`);
  if (!Array.isArray(m.entries) || m.entries.length === 0) {
    throw new Error(`drop ${uuid} has no entries`);
  }
  return { manifest: m, bytes };
}
/**
 * registry の指定があればそこ。無ければ一覧に順に訊いて、最初に持っていたところ。
 * uuid は一つなので、取り違えは起きない。
 */
export async function findDrop(uuid: string, registryName?: string): Promise<{ reg: Registry; manifest: DropManifest; bytes: Uint8Array }> {
  if (registryName) {
    const reg = registryByName(registryName);
    return { reg, ...(await fetchDropManifest(reg, uuid)) };
  }
  const misses: string[] = [];
  for (const reg of listRegistries()) {
    try {
      return { reg, ...(await fetchDropManifest(reg, uuid)) };
    } catch (e) {
      misses.push(String((e as Error)?.message ?? e));
    }
  }
  throw new Error(`どの registry にも ${uuid} が無い(${misses.join(" / ")})`);
}

/** 手元の棚(127.0.0.1 / localhost)か。配られたものは、黙って入れ替えない */
export function isLocalRegistry(r: Registry): boolean {
  try {
    const h = new URL(r.base).hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "[::1]" || h === "::1";
  } catch {
    return false;
  }
}
