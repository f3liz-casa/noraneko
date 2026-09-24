// SPDX-License-Identifier: MPL-2.0
/**
 * 起動時の入れ直し: 一度「入れる」を押した drop を、手元の xpi から入れ直す
 * (承認は一回でいい。画面には常に出る)。
 */
import { parseUuid, UUID_RE } from "./registry.sys.mjs";
import {
  dropDir,
  entryDir,
  legacyDepDir,
  mountDep,
  readInstalled,
  sharedDepDir,
  writeInstalled,
  type InstalledDrop,
} from "./storage.sys.mjs";
import { installDrop, installFile } from "./install.sys.mjs";
import { inspectDrop } from "./inspect.sys.mjs";

const ENV_UUID = "NORANEKO_DROP_UUID"; // dev build だけ: 起動時にこの env(uuid)があれば見ずに入れる(試験用)
// tsdown の --env.MODE は import.meta.env.MODE の式をそのまま置き換えるので、cast や ?. を挟むと効かない
const IS_DEV = import.meta.env.MODE === "dev";

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
      // 共有置き場が本番。前の形(drop ごと)や、版の無い path で入っていたものも、
      // そのまま読む — 入れ直すまでは古い場所に居る
      const sharedPath = PathUtils.join(sharedDepDir(parseUuid(dep.uuid), dep.version), dep.file);
      const legacyPath = PathUtils.join(legacyDepDir(uuid, dep.name, dep.version), dep.file);
      const flatPath = PathUtils.join(dropDir(uuid), "deps", dep.name, dep.file);
      mountDep(dep, (await IOUtils.exists(sharedPath)) ? sharedPath : (await IOUtils.exists(legacyPath)) ? legacyPath : flatPath);
    } catch (e) {
      errors.push(`dep ${dep.name}: ${(e as Error)?.message ?? e}`);
      console.error(`[noraneko-drops] restore ${d.name ?? uuid} dep ${dep.name} failed:`, e);
    }
  }
  for (const [i, f] of (d.files ?? []).entries()) {
    try {
      const version = d.versions?.[i] ?? "";
      // 版の無い path で入っていたもの(この形より前)も、そのまま読む
      const versionedPath = PathUtils.join(entryDir(uuid, version), f);
      const flatPath = PathUtils.join(dropDir(uuid), f);
      await installFile(uuid, version, (await IOUtils.exists(versionedPath)) ? versionedPath : flatPath);
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
    if (UUID_RE.test(uuid)) continue;
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
