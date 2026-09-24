// SPDX-License-Identifier: MPL-2.0
/**
 * 手元の置き場(profile/noraneko-drops)と、xpi への resource:// の別名。
 *
 * - profile/noraneko-drops/<uuid>/<version>/        drop 自身の xpi
 * - profile/noraneko-drops/deps/<uuid>/<version>/   drop が使う library(共有)
 *
 * 版を path に入れる理由は docs/TRAPS.md「入れ替えた dep は、その session では
 * まだ古い bytes」: file を上書きすると、入れ替えた版の別名が前の版の bytes を指す。
 */
import { DROP_NAME_RE, SEMVER_RE, type DepRef } from "./registry.sys.mjs";

const DIR_NAME = "noraneko-drops";
const PREF_INSTALLED = "noraneko.drops.installed"; // JSON: { [uuid]: InstalledDrop }
/** drop 自身の版。手元の輪では四つ目まで(dep は SEMVER_RE の三つ) */
export const VERSION_RE = /^\d+(\.\d+){1,3}$/;

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs",
);

export interface InstalledDrop {
  name?: string; // 札(manifest の name)
  ids: string[];
  files: string[];
  versions: string[];
  actors?: string[]; // 登録した JSWindowActor の名前(外すときに使う)
  deps?: (DepRef & { file: string })[]; // 一緒に入れた library(profile の deps/<uuid>/<version>)
  at: number;
  note?: string;
  registry?: string;
}

export function readInstalled(): Record<string, InstalledDrop> {
  try {
    return JSON.parse(Services.prefs.getStringPref(PREF_INSTALLED, "{}"));
  } catch {
    return {};
  }
}
export function writeInstalled(v: Record<string, InstalledDrop>): void {
  Services.prefs.setStringPref(PREF_INSTALLED, JSON.stringify(v));
}
/** 入れた一覧。readInstalled と同じものを、外から見える名で */
export function listDrops(): Record<string, InstalledDrop> {
  return readInstalled();
}

/** profile/noraneko-drops/<uuid>/ */
export function dropDir(uuid: string): string {
  return PathUtils.join(PathUtils.profileDir, DIR_NAME, uuid);
}
/** profile/noraneko-drops/<uuid>/<version>/ — drop 自身の xpi の置き場 */
export function entryDir(uuid: string, version: string): string {
  if (!VERSION_RE.test(version)) throw new Error(`bad version: ${version}`);
  return PathUtils.join(dropDir(uuid), version);
}
/** profile/noraneko-drops/deps/ — 共有の library 置き場の root */
export function sharedDepsRoot(): string {
  return PathUtils.join(PathUtils.profileDir, DIR_NAME, "deps");
}
/**
 * profile/noraneko-drops/deps/<uuid>/<version>/ — 使う library の置き場。
 *
 * **drop ごとではなく、uuid と版で一つだけ。** 同じ `std-preact-xul` 1.2.2 を
 * 二枚の drop が使っていても、落ちるのは一度で、置き場は一つ(npm の flat
 * `node_modules` と同じ絵)。前は `dropDir(uuid)/deps/<name>/<version>` に
 * drop ごとに落としていたので、同じ版が枚数だけ降りていた。
 *
 * 名前は入れない。名前は札であって正体ではないので、同じ uuid に別の名札を
 * 書いた drop が混ざる(registry の README: 別の registry に同じ名前があっても、
 * uuid が違えば別のもの)。正体で引く。
 */
export function sharedDepDir(uuid: string, version: string): string {
  if (!SEMVER_RE.test(version)) throw new Error(`bad dep version: ${version}`);
  return PathUtils.join(sharedDepsRoot(), uuid, version);
}
/**
 * 前の形(drop ごとの置き場)。**読むためだけ**に残す — 前の版で入れた drop が
 * 手元にあるとき、restore がそこを読めるように(新しく落とす先は sharedDepDir)。
 */
export function legacyDepDir(uuid: string, name: string, version: string): string {
  if (!DROP_NAME_RE.test(name)) throw new Error(`bad dep name: ${name}`);
  if (!SEMVER_RE.test(version)) throw new Error(`bad dep version: ${version}`);
  return PathUtils.join(dropDir(uuid), "deps", name, version);
}

/** build.ts(child.sys.mjs)と同じ規則: "noraneko-dep-" + uuid + "-" + semver、[a-z0-9] 以外は "-"、小文字 */
export function depAlias(d: Pick<DepRef, "uuid" | "version">): string {
  return `noraneko-dep-${d.uuid}-${d.version}`.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}
/** build-drop.rb と同じ規則: "noraneko-drop-" + uuid + "-" + 版、[a-z0-9] 以外は "-"、小文字 */
export function resAlias(uuid: string, version: string): string {
  return `noraneko-drop-${uuid}-${version}`.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

/**
 * resource:// の別名を、その xpi の root に向ける(path が null なら外す)。
 * **いつも張り直す**: 同じ別名が、もう消えた file を指したまま残っていることがある。
 */
export function setAlias(alias: string, path: string | null): void {
  const res = Services.io.getProtocolHandler("resource").QueryInterface(Ci.nsIResProtocolHandler);
  if (res.hasSubstitution(alias)) res.setSubstitution(alias, null);
  if (path === null) return;
  res.setSubstitutionWithFlags(
    alias,
    Services.io.newURI(`jar:${Services.io.newFileURI(new FileUtils.File(path)).spec}!/`),
    Ci.nsISubstitutingProtocolHandler.ALLOW_CONTENT_ACCESS,
  );
}
/** library の xpi に別名を張る(addon にはしない。使う drop の child が resource://<alias>/lib.js を scope に読む) */
export function mountDep(d: DepRef, path: string): void {
  setAlias(depAlias(d), path);
}

/** path が無いか、中身が sha256 と違うなら false */
export async function fileHasSha256(path: string, sha256: string): Promise<boolean> {
  return (await IOUtils.exists(path)) && (await IOUtils.computeHexDigest(path, "sha256")) === sha256;
}

/**
 * manifest が sha256 で指した file を、手元に用意する。
 *
 * 同じ bytes がもう置いてあれば、落とさない ── manifest が指しているのは名前では
 * なく **中身** なので、digest が合えばそれが「その file」。見るたびに何 MB も
 * 引き直していた(戻って、もう一度見る、を繰り返すとそのぶん待つ)。
 */
export async function ensureFile(url: string, path: string, sha256: string, label: string): Promise<void> {
  if (await fileHasSha256(path, sha256)) return;
  await IOUtils.remove(path, { ignoreAbsent: true }); // 違うものが残っていた(無ければ何もしない)
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`download failed: ${url} (${resp.status})`);
  await IOUtils.write(path, new Uint8Array(await resp.arrayBuffer()), { tmpPath: `${path}.tmp` });
  if (!(await fileHasSha256(path, sha256))) {
    await IOUtils.remove(path);
    throw new Error(`sha256 mismatch: ${label}`);
  }
}

/**
 * 共有置き場に、その版の entry が全部そろっていて、sha256 も合っているか。
 * 一個でも欠けるか、合わなければ false(落とし直す)。
 * (いまは使い手が居ない。dedup の確認を一箇所にまとめるための置き場)
 */
export async function depEntriesMatch(dir: string, entries: { file: string; sha256: string }[]): Promise<boolean> {
  for (const e of entries) {
    if (!(await fileHasSha256(PathUtils.join(dir, e.file), e.sha256))) return false;
  }
  return true;
}
