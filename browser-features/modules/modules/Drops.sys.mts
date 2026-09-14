// SPDX-License-Identifier: MPL-2.0
/**
 * Drops: コード一つで機能(webext-actor の xpi)が降ってくる。
 *
 * Git が使えない人にも試してもらえるように、機能の束を dl.f3liz.casa/drop/<uuid>/ に置く。
 * 正体は uuid、名前は札(Julia の General と同じ絵。別の registry に同じ名前があっても uuid が違えば別のもの)。
 * about:nora:settings で uuid を入れると、まず **見る**(inspectDrop: 落として sha256 を確かめ、
 * xpi の中の manifest / schema / source を zip として読む。JS は一切実行しない)、
 * それから本人が「入れる」を押して **入れる**(installDrop: ここで初めて xpi の中のコードが動き出す)。
 *
 * 入れかたは Firefox 自身の about:newtab(newtab@mozilla.org)と同じ形:
 * - xpi は入れ物。AddonManager には temporary add-on として入れる(about:debugging に見える。署名の要求が無い。
 *   再起動で消えるので、起動時に手元の xpi から入れ直す。同じ id の built-in より優先される)。
 * - ページに届く道は JSWindowActor(NoraActors.sys.mts)。resource://noraneko-drop-<uuid>-<版>/ の別名を
 *   xpi の root に張り、その actor.json のとおりに親(parent.sys.mjs)と子(child.sys.mjs)を登録する。
 *   同じ名前の built-in の actor は外れる(置き換え)。戻せば built-in を登録し直す。
 * WebExtension の content_scripts は使わない。stock Firefox では about:* / chrome:* に注入されないから
 * (webext-actors/README.md「addon 式が駄目だった理由」)。
 *
 * 作る側: tools/scripts/build-drop.rb(actor を xpi にして manifest.json を書く。source も同梱)。
 */

const PREF_REGISTRIES = "noraneko.drops.registries"; // JSON: Registry[]。空なら既定の一つ
const PREF_INSTALLED = "noraneko.drops.installed"; // JSON: { [uuid]: { name, ids, files, versions, at, note, registry } }
const ENV_UUID = "NORANEKO_DROP_UUID"; // dev build だけ: 起動時にこの env(uuid)があれば見ずに入れる(試験用)
const DIR_NAME = "noraneko-drops";
// tsdown の --env.MODE は import.meta.env.MODE の式をそのまま置き換えるので、cast や ?. を挟むと効かない
const IS_DEV = import.meta.env.MODE === "dev";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs",
);
const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs",
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs",
);

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
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(r.name)) throw new Error(`bad registry name: ${r.name}`);
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

/**
 * drop の正体は uuid(registry の drop.toml で一度振ったら変えない)。配る URL も、ここに入れる字も uuid。
 * registry の指定が無ければ、一覧に順に訊いて、持っているところから落とす(uuid は一つなので、取り違えは起きない)。
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function parseUuid(ref: string): string {
  const u = ref.trim().toLowerCase();
  if (!UUID.test(u)) throw new Error(`書きかたは uuid(例: ec4dfa7c-9e5a-4c1d-8d0d-771e3ee81030): ${ref}`);
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
/** 見た library drop。使う drop の一枚に一緒に出す */
export interface InspectedDep extends DepRef {
  attestations: import("./sigstore/Sigstore.sys.mjs").AttestationCheck[];
  manifest: DropManifest;
  entries: { file: string; version: string; sha256: string; files: { path: string; text: string }[] }[];
}
/** 使う library drop。registry の build が版を固定して manifest に写す(組み直さない限り古いまま) */
export interface DepRef {
  name: string;
  uuid: string;
  version: string; // semver(1.0.0)。dl の /drop/<uuid>/v/<semver>/ から落とす
  lib: boolean; // lib.js を持つ(content の scope に先に読む)
  wasm: boolean; // wasm/ を持つ(Tsubaki の runtime)
}
export interface InstalledDrop {
  name?: string; // 札(manifest の name)
  ids: string[];
  files: string[];
  versions: string[];
  actors?: string[]; // 登録した JSWindowActor の名前(外すときに使う)
  deps?: (DepRef & { file: string })[]; // 一緒に入れた library(profile の deps/<name>/<file>)
  at: number;
  note?: string;
  registry?: string;
}
/** 見るための情報。manifest / schema / source を読んだだけで、何も実行していない */
export interface DropInspection {
  uuid: string;
  name: string; // 札(manifest の name)
  /** manifest の icon を xpi から読んだもの(data: URI)。読めなければ null */
  icon?: string | null;
  /** manifest の shots を xpi から読んだもの(data: URI)。読めなかったものは並ばない */
  shots?: { file: string; dataUri: string }[];
  registry: Registry;
  attestations: import("./sigstore/Sigstore.sys.mjs").AttestationCheck[]; // registry の判
  manifest: DropManifest;
  deps: InspectedDep[];
  entries: {
    id: string;
    name: string;
    version: string;
    file: string;
    sha256: string;
    matches: string[]; // content.js が動くページ(actor.json の matches)
    chrome: boolean; // ブラウザの窓そのもの(browser.xhtml)にも効く(actor.json の includeChrome)
    webFrame: boolean; // view に <browser> を置ける = ページを読み込む窓(actor.json の webFrame)
    permissions: string[]; // (xpi の manifest に permissions があれば。いまの actor には無い)
    functions: string[]; // 親プロセスで呼べる関数(actor.json の methods)
    sources: { path: string; text: string }[]; // 書いたもの(source/)
    files: { path: string; text: string }[]; // 実際に実行される・読まれるもの(xpi の中の JS と JSON、source/ 以外)
  }[];
}

function readInstalled(): Record<string, InstalledDrop> {
  try {
    return JSON.parse(Services.prefs.getStringPref(PREF_INSTALLED, "{}"));
  } catch {
    return {};
  }
}
function writeInstalled(v: Record<string, InstalledDrop>): void {
  Services.prefs.setStringPref(PREF_INSTALLED, JSON.stringify(v));
}
/** profile/noraneko-drops/<uuid>/ */
function dropDir(uuid: string): string {
  return PathUtils.join(PathUtils.profileDir, DIR_NAME, uuid);
}
/**
 * profile/noraneko-drops/<uuid>/<version>/ — drop 自身の xpi の置き場。
 * 版が path に入る理由は depDir と同じ(別名には版が入っているのに file は
 * 上書きだったので、入れ替えた版の別名が、前の版の bytes を指していた)。
 */
function entryDir(uuid: string, version: string): string {
  if (!/^\d+(\.\d+){1,3}$/.test(version)) throw new Error(`bad version: ${version}`);
  return PathUtils.join(dropDir(uuid), version);
}
/**
 * profile/noraneko-drops/<uuid>/deps/<name>/<version>/
 *
 * 版が path に入る。入っていないと、版を上げても書き先が同じ file なので、
 * その session は前の版の jar handle が生きたまま = 中身は古いまま になる
 * (registry の docs/TRAPS.md「入れ替えた dep は、その session ではまだ古い bytes」。
 * std 1.1.0 の bytes が 1.2.0 として動いて半時間溶かした)。
 */
function depDir(uuid: string, name: string, version: string): string {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) throw new Error(`bad dep name: ${name}`);
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`bad dep version: ${version}`);
  return PathUtils.join(dropDir(uuid), "deps", name, version);
}
/** build.ts(child.sys.mjs)と同じ規則: "noraneko-dep-" + uuid + "-" + semver、[a-z0-9] 以外は "-"、小文字 */
function depAlias(d: DepRef): string {
  return `noraneko-dep-${d.uuid}-${d.version}`.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}
/** dl の path: <uuid>(最新)か <uuid>/v/<semver>(その版のまま) */
function dropPath(uuid: string, semver?: string): string {
  if (semver && !/^\d+\.\d+\.\d+$/.test(semver)) throw new Error(`bad version: ${semver}`);
  return semver ? `${uuid}/v/${semver}` : uuid;
}
/** build-drop.rb と同じ規則: "noraneko-drop-" + uuid + "-" + 版、[a-z0-9] 以外は "-"、小文字 */
function resAlias(uuid: string, version: string): string {
  return `noraneko-drop-${uuid}-${version}`.replace(/[^a-z0-9]/gi, "-").toLowerCase();
}

/** manifest.json は bytes のまま持つ(判はその bytes に対して押されている) */
async function fetchDropManifest(reg: Registry, uuid: string, semver?: string): Promise<{ manifest: DropManifest; bytes: Uint8Array }> {
  const resp = await fetch(`${reg.base}/${dropPath(uuid, semver)}/manifest.json`, { cache: "no-store" });
  if (!resp.ok) throw new Error(`no drop ${uuid} in ${reg.name} (${resp.status})`);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  const m = JSON.parse(new TextDecoder().decode(bytes)) as DropManifest;
  if (m.uuid !== uuid) throw new Error(`manifest の uuid(${m.uuid})が ${uuid} と違う`);
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(m.name ?? "")) throw new Error(`manifest の name の形が違う: ${m.name}`);
  if (!Array.isArray(m.entries) || m.entries.length === 0) {
    throw new Error(`drop ${uuid} has no entries`);
  }
  return { manifest: m, bytes };
}
/** registry の指定があればそこ。無ければ一覧に順に訊いて、最初に持っていたところ */
async function findDrop(uuid: string, registryName?: string): Promise<{ reg: Registry; manifest: DropManifest; bytes: Uint8Array }> {
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

/** 読める字のもの。それ以外(.wasm など)は中を開かず、大きさだけ見せる */
const TEXT_EXT = /\.(js|mjs|cjs|ts|tsx|json|md|css|html|xhtml|svg|txt|toml|tsubaki|jl)$/i;

/** xpi(zip)の中を文字列で読む。実行はしない */
/** xpi の中の絵を data: にする。512KB まで、中身の magic が PNG / JPEG / WebP のものだけ */
const SHOT_MAX = 512 * 1024;
function readZipImage(path: string, name: string): string | null {
  if (!/^(icon\.png|shots\/[A-Za-z0-9._-]+)$/.test(name)) return null;
  const zr = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  try {
    zr.open(new FileUtils.File(path));
    let entry;
    try {
      entry = zr.getEntry(name);
    } catch {
      return null; // 無い
    }
    if (!entry || entry.realSize > SHOT_MAX) return null;
    const stream = zr.getInputStream(name);
    const bin = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    bin.setInputStream(stream);
    const bytes = bin.readByteArray(entry.realSize) as number[];
    bin.close();
    stream.close();
    const type = imageType(bytes);
    if (!type) return null; // 名乗りではなく中身で見る
    let s = "";
    for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.slice(i, i + 8192));
    return `data:${type};base64,${btoa(s)}`;
  } catch (e) {
    console.warn(`[noraneko-drops] ${name} が読めない:`, e);
    return null;
  } finally {
    zr.close();
  }
}
function imageType(b: number[]): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

function readZipEntries(path: string): Map<string, string> {
  const zr = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  zr.open(new FileUtils.File(path));
  const out = new Map<string, string>();
  try {
    for (const name of zr.findEntries("*")) {
      if (name.endsWith("/")) continue;
      if (!TEXT_EXT.test(name)) {
        out.set(name, `(binary, ${zr.getEntry(name).realSize} bytes)`);
        continue;
      }
      const stream = zr.getInputStream(name);
      const text = NetUtil.readInputStreamToString(stream, stream.available(), { charset: "UTF-8" });
      stream.close();
      out.set(name, text);
    }
  } finally {
    zr.close();
  }
  return out;
}

/**
 * manifest が sha256 で指した file を、手元に用意する。
 *
 * 同じ bytes がもう置いてあれば、落とさない ── manifest が指しているのは名前では
 * なく **中身** なので、digest が合えばそれが「その file」。見るたびに何 MB も
 * 引き直していた(戻って、もう一度見る、を繰り返すとそのぶん待つ)。
 */
async function ensureFile(url: string, path: string, sha256: string, label: string): Promise<void> {
  if (await IOUtils.exists(path)) {
    if ((await IOUtils.computeHexDigest(path, "sha256")) === sha256) return;
    await IOUtils.remove(path, { ignoreAbsent: true }); // 違うものが残っていた
  }
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error(`download failed: ${url} (${resp.status})`);
  await IOUtils.write(path, new Uint8Array(await resp.arrayBuffer()), { tmpPath: `${path}.tmp` });
  if ((await IOUtils.computeHexDigest(path, "sha256")) !== sha256) {
    await IOUtils.remove(path);
    throw new Error(`sha256 mismatch: ${label}`);
  }
}

type Attestations = import("./sigstore/Sigstore.sys.mjs").AttestationCheck[];

/** 判の bundle を取ってくる(まだ確かめない)。manifest と**同時に**取り始められるように分けてある */
async function fetchBundle(reg: Registry, uuid: string, semver?: string): Promise<unknown | null> {
  const r = await fetch(`${reg.base}/${dropPath(uuid, semver)}/manifest.json.sigstore.json`, { cache: "no-store" });
  return r.ok ? await r.json() : null;
}

/** bundle を manifest の bytes に照らす。判が無ければ ok=false で理由を書く。止めはしない */
async function verifyBundle(reg: Registry, bundle: unknown | null, manifestBytes: Uint8Array): Promise<Attestations> {
  if (bundle === null) {
    return [{ who: "registry", identity: reg.identity, issuer: reg.issuer, ok: false, reason: "registry の判(manifest.json.sigstore.json)が無い" }];
  }
  const { verifyKeylessBundle } = ChromeUtils.importESModule("resource://noraneko/modules/sigstore/Sigstore.sys.mjs");
  return [await verifyKeylessBundle("registry", bundle, manifestBytes, reg.identity, reg.issuer)];
}

/** registry の判を確かめる。無ければ ok=false で理由を書く。止めはしない */
async function checkAttestations(reg: Registry, uuid: string, manifestBytes: Uint8Array, semver?: string): Promise<Attestations> {
  return verifyBundle(reg, await fetchBundle(reg, uuid, semver), manifestBytes);
}

/**
 * 版で固定された drop(dep が指すもの)を、一度だけ取って確かめる。
 *
 * `/v/<semver>/` が指す bytes は publish で書き換わらない ── 版を固定するとは
 * そういうこと。なので manifest も判も、この起動のあいだは覚えておいていい。
 * dep を七つ持つ drop を「見る」たびに、manifest と判で十四往復していた。
 * (xpi のほうは ensureFile が手元の sha256 で見ているので、ここには要らない)
 */
const pinned = new Map<string, Promise<{ manifest: DropManifest; bytes: Uint8Array; attestations: Attestations }>>();
function pinnedDrop(reg: Registry, uuid: string, version: string) {
  const key = `${reg.base}|${uuid}|${version}`;
  let p = pinned.get(key);
  if (!p) {
    // manifest と判は別の file。片方を待ってからもう片方、にする理由が無いので同時に
    p = (async () => {
      const [{ manifest, bytes }, bundle] = await Promise.all([
        fetchDropManifest(reg, uuid, version),
        fetchBundle(reg, uuid, version),
      ]);
      return { manifest, bytes, attestations: await verifyBundle(reg, bundle, bytes) };
    })().catch((e) => {
      pinned.delete(key); // 転んだものを覚えたままにしない
      throw e;
    });
    pinned.set(key, p);
  }
  return p;
}

/**
 * 1. 見る: 落として sha256 を確かめ、判を確かめ、中身を読む。実行はしない。
 * ref は uuid。registry は指定が無ければ一覧に順に訊く。
 */
export async function inspectDrop(ref: string, registryName?: string): Promise<DropInspection> {
  const uuid = parseUuid(ref);
  const { reg, manifest: m, bytes: manifestBytes } = await findDrop(uuid, registryName);
  console.log(`[noraneko-drops] inspect ${uuid} (${m.name}) @ ${reg.name}: manifest`);
  const dir = dropDir(uuid);
  await IOUtils.makeDirectory(dir, { createAncestors: true, ignoreExisting: true });

  // registry は publish のたびに `<uuid>/v/<semver>/` へ、その版のまま凍らせた写しも置く
  // (semver は entries[0] の版の頭三つ。registry 側の数えかたと同じ)。そちらを名指しで取る:
  // 凍っているので **いま読んだ manifest が約束した bytes そのもの** が返るし、動かないものと
  // 分かっている口なので、配る側も長く預かっておける。`<uuid>/<file>` は「最新」を指すので、
  // manifest を読んだ直後に publish が来ると、別のものが返ってくる。
  const frozen = (m.entries[0]?.version ?? "").match(/^(\d+\.\d+\.\d+)/)?.[1];
  const fileBase = `${reg.base}/${dropPath(uuid, frozen)}`;

  const oneEntry = async (e: DropManifest["entries"][number]): Promise<DropInspection["entries"][number]> => {
    if (!/^[A-Za-z0-9._-]+$/.test(e.file)) throw new Error(`bad file name: ${e.file}`);
    const edir = entryDir(uuid, e.version);
    await IOUtils.makeDirectory(edir, { createAncestors: true, ignoreExisting: true });
    const path = PathUtils.join(edir, e.file);
    await ensureFile(`${fileBase}/${e.file}`, path, e.sha256, e.file);
    console.log(`[noraneko-drops] inspect ${m.name}: ${e.file} sha256 ok, reading zip`);
    const files = readZipEntries(path);
    console.log(`[noraneko-drops] inspect ${m.name}: ${e.file} ${files.size} entries`);
    const wm = JSON.parse(files.get("manifest.json") ?? "{}");
    let actor: { matches?: string[]; methods?: string[]; includeChrome?: boolean; webFrame?: boolean } = {};
    try {
      actor = JSON.parse(files.get("actor.json") ?? "{}");
    } catch {
      // actor.json が壊れているなら空のまま(表示だけの話。入れるときに改めて読んで失敗する)
    }
    return {
      id: wm.browser_specific_settings?.gecko?.id ?? e.id,
      name: e.name,
      version: wm.version ?? e.version,
      file: e.file,
      sha256: e.sha256,
      matches: actor.matches ?? [],
      chrome: actor.includeChrome === true,
      webFrame: actor.webFrame === true,
      permissions: wm.permissions ?? [],
      functions: actor.methods ?? [],
      sources: [...files.entries()]
        .filter(([n]) => n.startsWith("source/"))
        .map(([n, text]) => ({ path: n.slice("source/".length), text })),
      files: [...files.entries()]
        .filter(([n]) => !n.startsWith("source/"))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([n, text]) => ({ path: n, text })),
    };
  };

  // 使う library も、同じように落として、sha と判を見て、中を読む(版は manifest に固定されたもの)
  const oneDep = async (d: DepRef): Promise<InspectedDep> => {
    const du = parseUuid(d.uuid);
    const { manifest: dm, attestations: dattest } = await pinnedDrop(reg, du, d.version);
    const ddir = depDir(uuid, d.name, d.version);
    await IOUtils.makeDirectory(ddir, { createAncestors: true, ignoreExisting: true });
    const dentries = await Promise.all(dm.entries.map(async (e) => {
      if (!/^[A-Za-z0-9._-]+$/.test(e.file)) throw new Error(`bad file name: ${e.file}`);
      const path = PathUtils.join(ddir, e.file);
      await ensureFile(`${reg.base}/${dropPath(du, d.version)}/${e.file}`, path, e.sha256, `${d.name}/${e.file}`);
      const files = readZipEntries(path);
      return {
        file: e.file,
        version: e.version,
        sha256: e.sha256,
        files: [...files.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, text]) => ({ path: p, text })),
      };
    }));
    console.log(`[noraneko-drops] inspect ${m.name}: dep ${d.name} ${d.version} ok`);
    return { ...d, attestations: dattest, manifest: dm, entries: dentries };
  };

  // 判・entry・dep は互いを待たない。前は manifest → 判 → entry → dep と一列だった
  // (それぞれが registry への往復)。Promise.all は並べても **順を保つ**
  const [attestations, entries, deps] = await Promise.all([
    checkAttestations(reg, uuid, manifestBytes),
    Promise.all(m.entries.map(oneEntry)),
    Promise.all((m.deps ?? []).map(oneDep)),
  ]);

  // 絵: manifest が「どの xpi の中か」を覚えている。落として sha を見たあとの file から読む。
  // 一枚を開いているときは xpi がもう手元にあるので、絵のために取りに行くことはしない
  let icon: string | null = null;
  if (m.icon) {
    const holder = m.entries.find((e) => e.file === m.icon!.in) ?? m.entries[0];
    if (holder) icon = readZipImage(PathUtils.join(entryDir(uuid, holder.version), holder.file), "icon.png");
  }
  const shots: { file: string; dataUri: string }[] = [];
  for (const shot of m.shots ?? []) {
    const holder = m.entries.find((e) => e.file === shot.in);
    if (!holder) continue;
    const dataUri = readZipImage(PathUtils.join(entryDir(uuid, holder.version), holder.file), shot.file);
    if (dataUri) shots.push({ file: shot.file, dataUri });
  }

  return { uuid, name: m.name, icon, shots, registry: reg, attestations, manifest: m, deps, entries };
}

/**
 * resource:// の別名を、その xpi の root に向ける(path が null なら外す)。
 * **いつも張り直す**: 同じ別名が、もう消えた file を指したまま残っていることがある。
 */
function setAlias(alias: string, path: string | null): void {
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
function mountDep(d: DepRef, path: string): void {
  setAlias(depAlias(d), path);
}

async function installFile(uuid: string, version: string, path: string): Promise<{ id: string; actor: string }> {
  const file = new FileUtils.File(path);
  // xpi の root に別名を張る。parent.sys.mjs / child.sys.mjs / actor.mjs / content.js はこの URL で読まれる
  // (importESModule は jar:file: を信用しない。content process にも同じ別名が届く)
  const alias = resAlias(uuid, version);
  const root = `resource://${alias}/`;
  setAlias(alias, path);
  try {
    const addon = await AddonManager.installTemporaryAddon(file);
    const NoraActors = ChromeUtils.importESModule("resource://noraneko/modules/NoraActors.sys.mjs");
    const reg = await NoraActors.readActorJson(root);
    NoraActors.register(root, reg);
    console.log(`[noraneko-drops] ${addon.id} ${addon.version}: actor ${reg.name} ← ${root}`);
    return { id: addon.id, actor: reg.name };
  } catch (e) {
    // "Extension is invalid" は manifest の error を additionalErrors に持っている。見えないと直せない
    const err = e as { message?: string; additionalErrors?: string[] };
    const details = Array.isArray(err?.additionalErrors) ? err.additionalErrors.join(" | ") : "";
    throw new Error(`${err?.message ?? e}${details ? `: ${details}` : ""}`);
  }
}

/** 2. 入れる: inspectDrop が落として確かめた xpi を入れる。ここで初めて拡張が動き出す。 */
/**
 * 入れる前に、落としてある bytes をもう一度照らす。
 *
 * `installDrop` が最初にすることと同じ照合を、**入れずに**やる ── 押した人に
 * 「何を許すのか」を見せているあいだ、それが本当にその bytes なのかを確かめておく。
 * 見たときから入れるまでのあいだに profile の file が入れ替わっていたら、ここで分かる。
 */
export async function verifyDrop(inspected: DropInspection): Promise<{ ok: boolean; checked: number; bad: string[] }> {
  const uuid = parseUuid(inspected.uuid);
  const bad: string[] = [];
  let checked = 0;
  for (const d of inspected.deps ?? []) {
    for (const e of d.entries) {
      const path = PathUtils.join(depDir(uuid, d.name, d.version), e.file);
      checked++;
      if (!(await IOUtils.exists(path)) || (await IOUtils.computeHexDigest(path, "sha256")) !== e.sha256) {
        bad.push(`${d.name}/${e.file}`);
      }
    }
  }
  for (const e of inspected.manifest.entries) {
    const path = PathUtils.join(entryDir(uuid, e.version), e.file);
    checked++;
    if (!(await IOUtils.exists(path)) || (await IOUtils.computeHexDigest(path, "sha256")) !== e.sha256) {
      bad.push(e.file);
    }
  }
  return { ok: bad.length === 0, checked, bad };
}

export async function installDrop(inspected: DropInspection): Promise<string[]> {
  const uuid = parseUuid(inspected.uuid);
  const m = inspected.manifest;
  const dir = dropDir(uuid);
  const ids: string[] = [];
  const files: string[] = [];
  const versions: string[] = [];
  const actors: string[] = [];
  const deps: InstalledDrop["deps"] = [];
  for (const d of inspected.deps ?? []) {
    for (const e of d.entries) {
      const path = PathUtils.join(depDir(uuid, d.name, d.version), e.file);
      // 無いときは、無いと言う。**戻すと、落としてあった dep の bytes も一緒に消える**ので、
      // 戻したあとに前の inspection のまま入れると、ここに来る(下の entries と同じ形に)
      if (!(await IOUtils.exists(path))) throw new Error(`見てから入れて: ${d.name}/${e.file} が無い`);
      if ((await IOUtils.computeHexDigest(path, "sha256")) !== e.sha256) throw new Error(`sha256 mismatch at install: ${d.name}/${e.file}`);
      mountDep(d, path);
      deps.push({ name: d.name, uuid: d.uuid, version: d.version, lib: d.lib, wasm: d.wasm, file: e.file });
      console.log(`[noraneko-drops] dep ${d.name} ${d.version} ← ${path}`);
    }
    // この drop が使わなくなった版は置いていかない(版が path に入るので、
    // 上書きされずに残る。消してよいのは、いま入れた版以外のもの)
    const kept = PathUtils.filename(depDir(uuid, d.name, d.version));
    for (const other of await IOUtils.getChildren(PathUtils.join(dir, "deps", d.name)).catch(() => [])) {
      if (PathUtils.filename(other) !== kept) await IOUtils.remove(other, { recursive: true, ignoreAbsent: true });
    }
  }
  for (const e of m.entries) {
    const path = PathUtils.join(entryDir(uuid, e.version), e.file);
    if (!(await IOUtils.exists(path))) throw new Error(`見てから入れて: ${e.file} が無い`);
    if ((await IOUtils.computeHexDigest(path, "sha256")) !== e.sha256) {
      throw new Error(`sha256 mismatch at install: ${e.file}`);
    }
    const r = await installFile(uuid, e.version, path);
    ids.push(r.id);
    actors.push(r.actor);
    files.push(e.file);
    versions.push(e.version);
    console.log(`[noraneko-drops] installed ${e.id} ${e.version} from ${m.name} (${uuid})`);
  }
  // 使わなくなった版は置いていかない(deps と同じ理由で、上書きされずに残るので)。
  // 版の無い path に置かれていた前の形のものも、ここで片づく
  const keep = new Set(versions);
  const flat = new Set(files);
  for (const child of await IOUtils.getChildren(dir).catch(() => [])) {
    const name = PathUtils.filename(child);
    if (name === "deps" || keep.has(name)) continue;
    if (!flat.has(name) && !/^\d+(\.\d+){1,3}$/.test(name)) continue;
    // file が消えるなら、それを指していた別名も外す
    if (/^\d+(\.\d+){1,3}$/.test(name)) setAlias(resAlias(uuid, name), null);
    await IOUtils.remove(child, { recursive: true, ignoreAbsent: true });
  }
  const all = readInstalled();
  all[uuid] = { name: m.name, ids, files, versions, actors, deps, at: Date.now(), note: m.note, registry: inspected.registry.name };
  writeInstalled(all);
  return ids;
}

/** コードの束を外す(built-in に戻る)。手元の xpi も消す。 */
export async function removeDrop(ref: string): Promise<void> {
  const uuid = parseUuid(ref);
  const all = readInstalled();
  const d = all[uuid];
  if (!d) return;
  const NoraActors = ChromeUtils.importESModule("resource://noraneko/modules/NoraActors.sys.mjs");
  for (const name of d.actors ?? []) NoraActors.unregister(name);
  for (const id of d.ids) {
    const addon = await AddonManager.getAddonByID(id);
    if (addon && addon.temporarilyInstalled) {
      await addon.uninstall();
      console.log(`[noraneko-drops] removed ${id} (${d.name ?? uuid})`);
    }
  }
  // installFile が張った別名を外す(版ごとに一つ。残すと次の版まで jar: を指したままになる)
  for (const v of d.versions ?? []) setAlias(resAlias(uuid, v), null);
  for (const dep of d.deps ?? []) {
    const stillUsed = Object.entries(all).some(([u, o]) => u !== uuid && (o.deps ?? []).some((x) => x.uuid === dep.uuid && x.version === dep.version));
    if (!stillUsed) setAlias(depAlias(dep), null);
  }
  await IOUtils.remove(dropDir(uuid), { recursive: true, ignoreAbsent: true });
  delete all[uuid];
  writeInstalled(all);
  // built-in の actor を登録し直す(同じ名前のものが戻る)
  await ChromeUtils.importESModule("resource://noraneko/modules/NoranekoStartup.sys.mjs").registerBuiltinWebExtActors();
}

/** 棚の一件(registry の /index.json が返す形に、どの registry のものかを足したもの) */
export interface CatalogItem {
  uuid: string;
  name: string;
  note: string;
  contact: string[];
  /** library(ほかの drop が使うもの)。棚には並べない */
  lib: boolean;
  /** 絵の URL(`<registry>/<uuid>/<file>`)。配る側が sha256 を照らしてから返す。無ければ null */
  icon: string | null;
  /** 絵の枚数(中身は「見る」で開いたときに xpi から読む) */
  shots: number;
  version: string | null;
  entries: { name?: string; version?: string; file?: string; size?: number }[];
  deps: { name?: string; version?: string }[];
  source: { repo?: string; commit?: string; commit_time?: string; path?: string } | null;
  /** registry の判が Rekor に載っている番号(registry が判を押していれば) */
  rekor: number | null;
  /** どの registry の棚か */
  registry: string;
}

/**
 * 店の棚: registry の一覧に順に `<base>/index.json` を訊いて、並べられるものを集める。
 *
 * 一つの registry が転んでも棚は出す(理由を添えて返す)。同じ uuid を二つの registry が
 * 持っていたら、先に並んでいる registry のものを採る(findDrop と同じ順)。
 * ここで返す字は **registry から来た字** なので、描くときは必ずテキストとして描く。
 */
/** index.json の icon(`{ file, sha256 }`)から、棚が <img> に渡せる URL を組む */
function iconUrlOf(reg: Registry, uuid: string, icon: unknown): string | null {
  const i = icon as { file?: unknown; sha256?: unknown } | null | undefined;
  if (!i || typeof i.file !== "string" || typeof i.sha256 !== "string") return null;
  if (!/^[A-Za-z0-9._-]+\.png$/.test(i.file) || !/^[0-9a-f]{64}$/.test(i.sha256)) return null;
  return `${reg.base}/${uuid}/${i.file}`;
}

export async function listCatalog(): Promise<{ items: CatalogItem[]; failed: { registry: string; reason: string }[] }> {
  // registry 同士は関係ないので、/index.json は並べて訊く。前は一つずつ待っていて、
  // 三つあれば三往復ぶん待たされた。**並べても順は listRegistries のまま** ──
  // 同じ uuid を二つが持っていたら、先に並んでいるほうを採る(findDrop と同じ順)
  const shelves = await Promise.all(listRegistries().map(async (reg) => {
    try {
      const resp = await fetch(`${reg.base}/index.json`, { cache: "no-store" });
      if (!resp.ok) throw new Error(`${resp.status}`);
      return { reg, body: (await resp.json()) as { drops?: unknown[] }, error: "" };
    } catch (e) {
      console.warn(`[noraneko-drops] ${reg.name} の棚が読めない:`, e);
      return { reg, body: null, error: String((e as Error)?.message ?? e) };
    }
  }));

  const items: CatalogItem[] = [];
  const seen = new Set<string>();
  const failed: { registry: string; reason: string }[] = [];
  for (const { reg, body, error } of shelves) {
    if (!body) {
      failed.push({ registry: reg.name, reason: error });
      continue;
    }
    for (const raw of body.drops ?? []) {
      const d = raw as Partial<CatalogItem>;
      const uuid = typeof d.uuid === "string" ? d.uuid.toLowerCase() : "";
      if (!UUID.test(uuid) || seen.has(uuid)) continue;
      if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(d.name ?? "")) continue;
      seen.add(uuid);
      items.push({
        uuid,
        name: d.name as string,
        note: typeof d.note === "string" ? d.note : "",
        lib: d.lib === true,
        // 棚は xpi を落とす前なので、絵は manifest の隣の一枚を指す。file の名前だけ見てから
        // 組み立てる(sha256 を照らすのは配る側。ここは URL を作るだけ)
        icon: iconUrlOf(reg, uuid, d.icon),
        shots: typeof d.shots === "number" ? d.shots : 0,
        contact: Array.isArray(d.contact) ? d.contact.filter((c) => typeof c === "string") : [],
        version: typeof d.version === "string" ? d.version : null,
        entries: Array.isArray(d.entries) ? d.entries : [],
        deps: Array.isArray(d.deps) ? d.deps : [],
        source: (d.source as CatalogItem["source"]) ?? null,
        rekor: typeof d.rekor === "number" ? d.rekor : null,
        registry: reg.name,
      });
    }
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  console.log(`[noraneko-drops] catalog: ${items.length} 件` + (failed.length ? `(${failed.length} の registry は読めなかった)` : ""));
  return { items, failed };
}

export function listDrops(): Record<string, InstalledDrop> {
  return readInstalled();
}

/** 起動時に一つ入れ直した結果(about:nora:drops の「入っている」が、これを行に出す) */
export interface DropStartupEntry {
  name: string;
  /** dep も file も全部通ったか */
  ok: boolean;
  /** かかった時間(ms) */
  ms: number;
  /** 転んだ理由。ok なら空 */
  error: string;
}
/** 起動時の入れ直し、ぜんぶ。console を読まなくても、画面がこれを見れば分かる */
export interface DropStartupReport {
  /** まだ入れ直している途中 */
  running: boolean;
  /** 全部でかかった時間(ms)。running のあいだは 0 */
  ms: number;
  entries: Record<string, DropStartupEntry>;
}

let startup: DropStartupReport = { running: false, ms: 0, entries: {} };

export function getStartupReport(): DropStartupReport {
  return { running: startup.running, ms: startup.ms, entries: { ...startup.entries } };
}

/** 一つ入れ直す。dep の別名を張ってから、その drop の file を入れる(この順は守る) */
async function restoreOne(uuid: string, d: InstalledDrop): Promise<void> {
  const began = Date.now();
  const errors: string[] = [];

  for (const dep of d.deps ?? []) {
    try {
      // 版の無い path で入っていたもの(この形より前)も、そのまま読む
      const versioned = PathUtils.join(depDir(uuid, dep.name, dep.version), dep.file);
      const flat = PathUtils.join(dropDir(uuid), "deps", dep.name, dep.file);
      mountDep(dep, (await IOUtils.exists(versioned)) ? versioned : flat);
    } catch (e) {
      errors.push(`dep ${dep.name}: ${(e as Error)?.message ?? e}`);
      console.error(`[noraneko-drops] restore ${d.name ?? uuid} dep ${dep.name} failed:`, e);
    }
  }
  for (const [i, f] of (d.files ?? []).entries()) {
    try {
      const version = d.versions?.[i] ?? "";
      // 版の無い path で入っていたもの(この形より前)も、そのまま読む
      const versioned = PathUtils.join(entryDir(uuid, version), f);
      const flat = PathUtils.join(dropDir(uuid), f);
      await installFile(uuid, version, (await IOUtils.exists(versioned)) ? versioned : flat);
    } catch (e) {
      errors.push(`${f}: ${(e as Error)?.message ?? e}`);
      console.error(`[noraneko-drops] restore ${d.name ?? uuid}/${f} failed:`, e);
    }
  }

  const ms = Date.now() - began;
  startup.entries[uuid] = { name: d.name ?? uuid, ok: errors.length === 0, ms, error: errors.join(" / ") };
  if (d.files?.length) console.log(`[noraneko-drops] restored ${d.name ?? uuid} (${d.ids.join(", ")}) in ${ms}ms`);
}

/**
 * 起動時: 一度「入れる」を押した drop を手元の xpi から入れ直す(承認は一回でいい。画面には常に出る)。
 * dev build だけ: NORANEKO_DROP_UUID があれば見ずに入れる(試験用。製品にはこの道は無い)。
 *
 * drop 同士は独立なので、並べて入れ直す ── 直列だと、一つ遅いものが後ろ全部を待たせる。
 * 一つの中だけは順のまま(dep の別名 → file)。
 */
export async function restoreDropsAtStartup(): Promise<void> {
  const all = readInstalled();

  // 古い形(key が uuid でない)は入れ直せない。一覧からは外す(手元の xpi も古い形で、もう入らない)
  for (const uuid of Object.keys(all)) {
    if (UUID.test(uuid)) continue;
    console.warn(`[noraneko-drops] dropping old entry "${uuid}" (形が古い。入れ直して)`);
    delete all[uuid];
    writeInstalled(all);
  }

  const began = Date.now();
  startup = { running: true, ms: 0, entries: {} };
  await Promise.all(Object.entries(all).map(([uuid, d]) => restoreOne(uuid, d)));
  startup = { running: false, ms: Date.now() - began, entries: startup.entries };

  const ref = IS_DEV ? Services.env.get(ENV_UUID) : ""; // uuid
  console.log(
    `[noraneko-drops] startup: dev=${IS_DEV} env=${ref || "-"} restored=${Object.keys(all).length} in ${startup.ms}ms`,
  );
  if (ref && !all[ref.trim().toLowerCase()]) {
    try {
      await installDrop(await inspectDrop(ref, Services.env.get("NORANEKO_DROP_REGISTRY") || undefined));
    } catch (e) {
      console.error(`[noraneko-drops] ${ENV_UUID}=${ref} failed:`, e);
    }
  }
}
