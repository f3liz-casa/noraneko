// SPDX-License-Identifier: MPL-2.0
/**
 * 見る(inspect): 落として sha256 と判を確かめ、xpi(zip)の中を読む。実行はしない。
 *
 * xpi の中の manifest / schema / source を zip として読むだけで、JS は一切動かさない。
 * 入れる(install)は、ここで見たものを本人が押してから。
 */
import {
  dropPath,
  fetchDropManifest,
  findDrop,
  parseUuid,
  type DepRef,
  type DropEntry,
  type DropManifest,
  type Registry,
} from "./registry.sys.mjs";
import type { AttestationCheck } from "../sigstore/Sigstore.sys.mjs";
import { dropDir, ensureFile, entryDir, sharedDepDir } from "./storage.sys.mjs";

const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs",
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs",
);

/** 読める字のもの。それ以外(.wasm など)は中を開かず、大きさだけ見せる */
const TEXT_EXT = /\.(js|mjs|cjs|ts|tsx|json|md|css|html|xhtml|svg|txt|toml|tsubaki|jl)$/i;
/** xpi の中の file 名の形 */
const FILE_RE = /^[A-Za-z0-9._-]+$/;
/** xpi の中の絵。これより大きいものは読まない */
const SHOT_MAX = 512 * 1024;

/** 名乗りではなく、中身の magic で画像の種類を見る */
function imageType(b: number[]): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  return null;
}

/** xpi の中の絵を data: にする。512KB まで、中身の magic が PNG / JPEG / WebP のものだけ */
function readZipImage(path: string, name: string): string | null {
  if (!/^(icon\.png|shots\/[A-Za-z0-9._-]+)$/.test(name)) return null;
  const zr = Cc["@mozilla.org/libjar/zip-reader;1"].createInstance(Ci.nsIZipReader);
  try {
    zr.open(new FileUtils.File(path));
    let zipEntry;
    try {
      zipEntry = zr.getEntry(name);
    } catch {
      return null; // 無い
    }
    if (!zipEntry || zipEntry.realSize > SHOT_MAX) return null;
    const stream = zr.getInputStream(name);
    const bin = Cc["@mozilla.org/binaryinputstream;1"].createInstance(Ci.nsIBinaryInputStream);
    bin.setInputStream(stream);
    const bytes = bin.readByteArray(zipEntry.realSize) as number[];
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

/** xpi(zip)の中を文字列で読む。実行はしない */
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

/** registry の判を確かめる。無ければ ok=false で理由を書く。止めはしない */
async function checkAttestations(reg: Registry, uuid: string, manifestBytes: Uint8Array, semver?: string) {
  const { verifyKeylessBundle } = ChromeUtils.importESModule("resource://noraneko/modules/sigstore/Sigstore.sys.mjs");
  const r = await fetch(`${reg.base}/${dropPath(uuid, semver)}/manifest.json.sigstore.json`, { cache: "no-store" });
  if (!r.ok) {
    return [{ who: "registry", identity: reg.identity, issuer: reg.issuer, ok: false, reason: "registry の判(manifest.json.sigstore.json)が無い" }];
  }
  return [await verifyKeylessBundle("registry", await r.json(), manifestBytes, reg.identity, reg.issuer)];
}

/** 見た library drop。使う drop の一枚に一緒に出す */
export interface InspectedDep extends DepRef {
  attestations: AttestationCheck[];
  manifest: DropManifest;
  entries: { file: string; version: string; sha256: string; files: { path: string; text: string }[] }[];
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
  attestations: AttestationCheck[]; // registry の判
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

/** entry の xpi を落として確かめ、中を読む。実行はしない */
async function inspectEntry(reg: Registry, uuid: string, e: DropEntry, dropName: string): Promise<DropInspection["entries"][number]> {
  if (!FILE_RE.test(e.file)) throw new Error(`bad file name: ${e.file}`);
  const edir = entryDir(uuid, e.version);
  await IOUtils.makeDirectory(edir, { createAncestors: true, ignoreExisting: true });
  const path = PathUtils.join(edir, e.file);
  await ensureFile(`${reg.base}/${uuid}/${e.file}`, path, e.sha256, e.file);
  console.log(`[noraneko-drops] inspect ${dropName}: ${e.file} sha256 ok, reading zip`);
  const files = readZipEntries(path);
  console.log(`[noraneko-drops] inspect ${dropName}: ${e.file} ${files.size} entries`);
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
}

/**
 * 使う library も、同じように落として、sha と判を見て、中を読む(版は manifest に固定されたもの)。
 * **同じ uuid・同じ版が既に落ちてあれば、落とさない** — 置き場は uuid と版で一つ
 * (dedup。二枚目の drop は、一枚目が置いていったものをそのまま読む)。`ensureFile` が
 * 「同じ bytes が既にあれば落とさない」を見ている。
 */
async function inspectDep(reg: Registry, d: DepRef, dropName: string): Promise<InspectedDep> {
  const du = parseUuid(d.uuid);
  const { manifest: dm, bytes: dbytes } = await fetchDropManifest(reg, du, d.version);
  const dattest = await checkAttestations(reg, du, dbytes, d.version);
  const ddir = sharedDepDir(du, d.version);
  await IOUtils.makeDirectory(ddir, { createAncestors: true, ignoreExisting: true });
  const dentries = await Promise.all(dm.entries.map(async (e) => {
    if (!FILE_RE.test(e.file)) throw new Error(`bad file name: ${e.file}`);
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
  console.log(`[noraneko-drops] inspect ${dropName}: dep ${d.name} ${d.version} ok`);
  return { ...d, attestations: dattest, manifest: dm, entries: dentries };
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

  // 判・entry・dep は互いを待たない。前は manifest → 判 → entry → dep と一列だった
  // (それぞれが registry への往復)。Promise.all は並べても **順を保つ**
  const [attestations, entries, deps] = await Promise.all([
    checkAttestations(reg, uuid, manifestBytes),
    Promise.all(m.entries.map((e) => inspectEntry(reg, uuid, e, m.name))),
    Promise.all((m.deps ?? []).map((d) => inspectDep(reg, d, m.name))),
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
