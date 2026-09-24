// SPDX-License-Identifier: MPL-2.0
/**
 * 入れる(install)・外す(remove)。
 *
 * inspectDrop が落として確かめた xpi を、Firefox 自身の about:newtab(newtab@mozilla.org)と
 * 同じ形で temporary add-on として入れる。ここで初めて xpi の中のコードが動き出す。
 * 外すと built-in の actor に戻る。
 */
import { parseUuid } from "./registry.sys.mjs";
import { inspectDrop, type DropInspection } from "./inspect.sys.mjs";
import {
  depAlias,
  dropDir,
  entryDir,
  fileHasSha256,
  mountDep,
  readInstalled,
  resAlias,
  setAlias,
  sharedDepDir,
  sharedDepsRoot,
  VERSION_RE,
  writeInstalled,
  type InstalledDrop,
} from "./storage.sys.mjs";

const { AddonManager } = ChromeUtils.importESModule(
  "resource://gre/modules/AddonManager.sys.mjs",
);
const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs",
);

/** 一つの xpi を入れて、その actor を登録する(restore からも使う) */
export async function installFile(uuid: string, version: string, path: string): Promise<{ id: string; actor: string }> {
  const file = new FileUtils.File(path);
  // xpi の root に別名を張る。parent.sys.mjs / child.sys.mjs / actor.mjs / content.js はこの URL で読まれる
  // (importESModule は jar:file: を信用しない。content process にも同じ別名が届く)
  const alias = resAlias(uuid, version);
  const root = `resource://${alias}/`;
  setAlias(alias, path);
  try {
    const addon = await AddonManager.installTemporaryAddon(file);
    const NoraActors = ChromeUtils.importESModule("resource://noraneko/modules/NoraActors.sys.mjs");
    const actorJson = await NoraActors.readActorJson(root);
    NoraActors.register(root, actorJson);
    console.log(`[noraneko-drops] ${addon.id} ${addon.version}: actor ${actorJson.name} ← ${root}`);
    return { id: addon.id, actor: actorJson.name };
  } catch (e) {
    // "Extension is invalid" は manifest の error を additionalErrors に持っている。見えないと直せない
    const err = e as { message?: string; additionalErrors?: string[] };
    const details = Array.isArray(err?.additionalErrors) ? err.additionalErrors.join(" | ") : "";
    throw new Error(`${err?.message ?? e}${details ? `: ${details}` : ""}`);
  }
}

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
      const path = PathUtils.join(sharedDepDir(parseUuid(d.uuid), d.version), e.file);
      checked++;
      if (!(await fileHasSha256(path, e.sha256))) bad.push(`${d.name}/${e.file}`);
    }
  }
  for (const e of inspected.manifest.entries) {
    const path = PathUtils.join(entryDir(uuid, e.version), e.file);
    checked++;
    if (!(await fileHasSha256(path, e.sha256))) bad.push(e.file);
  }
  return { ok: bad.length === 0, checked, bad };
}

/** 2. 入れる: inspectDrop が落として確かめた xpi を入れる。ここで初めて拡張が動き出す。 */
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
      const path = PathUtils.join(sharedDepDir(parseUuid(d.uuid), d.version), e.file);
      // 無いときは、無いと言う。**戻すと、落としてあった dep の bytes も一緒に消える**ので、
      // 戻したあとに前の inspection のまま入れると、ここに来る(下の entries と同じ形に)
      if (!(await IOUtils.exists(path))) throw new Error(`見てから入れて: ${d.name}/${e.file} が無い`);
      if ((await IOUtils.computeHexDigest(path, "sha256")) !== e.sha256) throw new Error(`sha256 mismatch at install: ${d.name}/${e.file}`);
      mountDep(d, path);
      deps.push({ name: d.name, uuid: d.uuid, version: d.version, lib: d.lib, wasm: d.wasm, file: e.file });
      console.log(`[noraneko-drops] dep ${d.name} ${d.version} ← ${path}`);
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
  const keptVersions = new Set(versions);
  const entryFileNames = new Set(files);
  for (const child of await IOUtils.getChildren(dir).catch(() => [])) {
    const name = PathUtils.filename(child);
    if (name === "deps" || keptVersions.has(name)) continue;
    if (!entryFileNames.has(name) && !VERSION_RE.test(name)) continue;
    // file が消えるなら、それを指していた別名も外す
    if (VERSION_RE.test(name)) setAlias(resAlias(uuid, name), null);
    await IOUtils.remove(child, { recursive: true, ignoreAbsent: true });
  }
  const all = readInstalled();
  all[uuid] = { name: m.name, ids, files, versions, actors, deps, at: Date.now(), note: m.note, registry: inspected.registry.name };
  writeInstalled(all);
  // この drop が使わなくなった共有の dep 版を片づける。**writeInstalled の後**に呼ぶ ──
  // 先に呼ぶと、今入れた dep がまだ一覧に無く「誰も使っていない」と見えて、落としたばかりの
  // dep を消してしまう(置き場は共有なので、他の drop が使っているなら残す)。
  await collectSharedDeps();
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
  // 誰も使わなくなった共有の dep を片づける(この drop が最後の使い手かもしれない)
  await collectSharedDeps();
  // built-in の actor を登録し直す(同じ名前のものが戻る)
  await ChromeUtils.importESModule("resource://noraneko/modules/NoranekoStartup.sys.mjs").registerBuiltinWebExtActors();
}

/**
 * 共有置き場(deps/<uuid>/<version>)のうち、**もうどの入れた drop も使っていない版**
 * を消す。使っているかは、いま入っている drop の `deps` を全部集めて突き合わせるだけ
 * (参照カウントは持たない — 入れた一覧が既にその真実を持っている)。
 *
 * 誰かが使っていれば、その版は置いていく(別の drop の共有物)。入れた drop が
 * 一枚も無ければ、deps/ ごと空になる。
 */
async function collectSharedDeps(): Promise<void> {
  const used = new Set<string>();
  for (const d of Object.values(readInstalled())) {
    for (const dep of d.deps ?? []) used.add(`${dep.uuid}/${dep.version}`);
  }
  const root = sharedDepsRoot();
  for (const uuidDir of await IOUtils.getChildren(root).catch(() => [])) {
    const du = PathUtils.filename(uuidDir);
    for (const verDir of await IOUtils.getChildren(uuidDir).catch(() => [])) {
      const version = PathUtils.filename(verDir);
      if (!used.has(`${du}/${version}`)) {
        await IOUtils.remove(verDir, { recursive: true, ignoreAbsent: true });
        setAlias(depAlias({ uuid: du, version }), null);
      }
    }
    // 版が一つも残らなければ、uuid の箱ごと畳む
    const left = await IOUtils.getChildren(uuidDir).catch(() => []);
    if (left.length === 0) await IOUtils.remove(uuidDir, { recursive: true, ignoreAbsent: true });
  }
}

/**
 * 入れ直す: 戻して、見直して、また入れる。
 *
 * 手元で組み直したものを見るときの道。戻すと落としてあった bytes も一緒に消えるので、
 * 前の inspection のまま入れると「見てから入れて」に落ちる -- だから必ず見直してから。
 *
 * 版が同じまま bytes だけ替わっていると、その session では **古い module が動く**
 * (`.sys.mjs` は ESM として URL で cache されていて、その URL に版が入っている)。
 * registry の `scripts/build.rb --dev` は版に四つ目を足すので、手元の輪ではそこに
 * 落ちない。判が押された版なら、そもそも同じ版で bytes は変わらない。
 */
export async function reinstallDrop(ref: string, registryName?: string): Promise<string[]> {
  const uuid = parseUuid(ref);
  const from = registryName ?? readInstalled()[uuid]?.registry;
  await removeDrop(uuid);
  return await installDrop(await inspectDrop(uuid, from));
}
