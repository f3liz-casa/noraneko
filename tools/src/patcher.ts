// SPDX-License-Identifier: MPL-2.0

import * as path from "@std/path";
import { runCommandChecked, Logger, exists, safeRemove } from "./utils.ts";
import { BIN_DIR } from "./defines.ts";
import JSZip from "jszip";
import { applyPatch, parsePatch, reversePatch } from "diff";
import type { ParsedDiff } from "diff";

const logger = new Logger("patcher");

const PATCHES_DIR = "tools/patches";
const PATCHES_TMP = "_dist/bin/applied_patches";

function binDir(): string {
  return BIN_DIR;
}

function isOmniMode(): boolean {
  return exists(path.join(binDir(), "browser", "omni.ja"));
}

type PatchTarget =
  | { kind: "omni"; jarFile: string; entryPath: string }
  | { kind: "flat"; filePath: string };

/** Map a patch file path (e.g. "./browser/modules/Foo.sys.mjs") to its location. */
function resolvePatchTarget(rawPath: string): PatchTarget {
  const normalized = rawPath.replace(/^\.\//, "").replace(/^[ab]\//, "");
  if (normalized.startsWith("browser/")) {
    return {
      kind: "omni",
      jarFile: path.join(binDir(), "browser", "omni.ja"),
      entryPath: normalized.slice("browser/".length),
    };
  }
  return {
    kind: "flat",
    filePath: path.join(binDir(), normalized),
  };
}

/**
 * Apply (or reverse) every hunk in a single .patch file using npm:diff.
 * Handles both files inside browser/omni.ja and flat files.
 */
async function applyPatchFileOmni(
  patchText: string,
  reverse: boolean,
): Promise<void> {
  const hunks: ParsedDiff[] = parsePatch(patchText);

  // Cache open jars so we only read/write each jar once per call
  const jarCache = new Map<string, JSZip>();

  for (const hunk of hunks) {
    const rawPath = hunk.oldFileName ?? "";
    if (!rawPath || rawPath === "/dev/null") continue;

    const target = resolvePatchTarget(rawPath);
    const actualHunk = reverse ? (reversePatch(hunk) as ParsedDiff) : hunk;

    if (target.kind === "omni") {
      if (!jarCache.has(target.jarFile)) {
        const data = await Deno.readFile(target.jarFile);
        jarCache.set(target.jarFile, await JSZip.loadAsync(data));
      }
      const zip = jarCache.get(target.jarFile)!;
      const entry = zip.file(target.entryPath);
      if (!entry) {
        throw new Error(`Entry not found in omni.ja: ${target.entryPath}`);
      }
      const original = await entry.async("string");
      const patched = applyPatch(original, actualHunk);
      if (patched === false) {
        throw new Error(`Failed to apply patch to omni.ja entry: ${target.entryPath}`);
      }
      zip.file(target.entryPath, patched, { compression: "STORE" });
    } else {
      if (!exists(target.filePath)) {
        throw new Error(`Flat file not found: ${target.filePath}`);
      }
      const original = Deno.readTextFileSync(target.filePath);
      const patched = applyPatch(original, actualHunk);
      if (patched === false) {
        throw new Error(`Failed to apply patch to flat file: ${target.filePath}`);
      }
      Deno.writeTextFileSync(target.filePath, patched as string);
    }
  }

  // Flush modified jars back to disk with STORE compression
  for (const [jarPath, zip] of jarCache) {
    const out = await zip.generateAsync({
      type: "uint8array",
      compression: "STORE",
      compressionOptions: { level: 0 },
    });
    await Deno.writeFile(jarPath, out);
  }
}

function gitInitialized(dir: string): boolean {
  return exists(path.join(dir, ".git"));
}

export function initializeBinGit(): void {
  const dir = binDir();
  if (gitInitialized(dir)) {
    logger.info("Git repository is already initialized in _dist/bin.");
    return;
  }
  logger.info("Initializing Git repository in _dist/bin.");
  Deno.mkdirSync(dir, { recursive: true });
  Deno.writeTextFileSync(
    path.join(dir, ".gitignore"),
    [
      "./noraneko-devdir/*",
      "./browser/chrome/browser/res/activity-stream/data/content/abouthomecache/*",
    ].join("\n"),
  );

  let res = runCommandChecked("git", ["init"], dir);
  if (!res.success) throw new Error("Failed to initialize git repo");

  res = runCommandChecked("git", ["add", "."], dir);
  if (!res.success) throw new Error("Failed to add files to git repo");

  res = runCommandChecked("git", ["commit", "-m", "initialize"], dir);
  if (!res.success) throw new Error("Failed to commit initial state");

  logger.success("Git repository initialization complete.");
}

export function patchNeeded(): boolean {
  if (!exists(PATCHES_DIR)) return false;
  if (!exists(PATCHES_TMP)) return true;

  const patchesDirFiles = Array.from(Deno.readDirSync(PATCHES_DIR))
    .map((e) => e.name)
    .sort();
  const patchesTmpFiles = Array.from(Deno.readDirSync(PATCHES_TMP))
    .map((e) => e.name)
    .sort();

  if (JSON.stringify(patchesDirFiles) !== JSON.stringify(patchesTmpFiles))
    return true;

  for (const patch of patchesDirFiles) {
    const patchInDir = Deno.readTextFileSync(path.join(PATCHES_DIR, patch));
    const patchInTmp = Deno.readTextFileSync(path.join(PATCHES_TMP, patch));
    if (patchInDir !== patchInTmp) return true;
  }

  return false;
}

export async function applyPatches(): Promise<void> {
  if (!patchNeeded()) {
    logger.info("No patches needed to apply.");
    return;
  }

  const omni = isOmniMode();

  // Reverse previously applied patches if any
  if (exists(PATCHES_TMP)) {
    logger.info("Reversing previously applied patches.");
    let reverseIsAborted = false;
    const entries = Array.from(Deno.readDirSync(PATCHES_TMP))
      .map((e) => e.name)
      .sort();
    for (const patch of entries) {
      const patchPath = path.join(PATCHES_TMP, patch);
      if (omni) {
        try {
          await applyPatchFileOmni(Deno.readTextFileSync(patchPath), true);
        } catch (e: any) {
          logger.warn(`Failed to reverse patch: ${patchPath}`);
          logger.warn(e?.message ?? String(e));
          reverseIsAborted = true;
        }
      } else {
        const result = runCommandChecked(
          "git",
          [
            "apply",
            "-R",
            "--reject",
            "--whitespace=fix",
            "--unsafe-paths",
            "--directory",
            binDir(),
            patchPath,
          ],
          undefined,
        );
        if (!result.success) {
          logger.warn(`Failed to reverse patch: ${patchPath}`);
          logger.warn(result.stderr);
          reverseIsAborted = true;
        }
      }
    }
    if (reverseIsAborted) throw new Error("Reverse Patch Failed: aborted");
    try {
      safeRemove(PATCHES_TMP);
    } catch {
      // ignore
    }
  }

  // Apply new patches
  logger.info("Applying new patches.");
  Deno.mkdirSync(PATCHES_TMP, { recursive: true });
  let aborted = false;
  const entries = exists(PATCHES_DIR)
    ? Array.from(Deno.readDirSync(PATCHES_DIR))
        .map((e) => e.name)
        .sort()
    : [];
  for (const patch of entries) {
    if (!patch.endsWith(".patch")) continue;
    const patchPath = path.join(PATCHES_DIR, patch);
    logger.info(`Applying patch: ${patchPath}`);
    if (omni) {
      try {
        await applyPatchFileOmni(Deno.readTextFileSync(patchPath), false);
        Deno.copyFileSync(patchPath, path.join(PATCHES_TMP, patch));
      } catch (e: any) {
        logger.warn(`Failed to apply patch: ${patchPath}`);
        logger.warn(e?.message ?? String(e));
        aborted = true;
      }
    } else {
      const result = runCommandChecked(
        "git",
        [
          "apply",
          "--reject",
          "--whitespace=fix",
          "--unsafe-paths",
          "--directory",
          binDir(),
          patchPath,
        ],
        undefined,
      );
      if (result.success) {
        try {
          Deno.copyFileSync(patchPath, path.join(PATCHES_TMP, patch));
        } catch (e: any) {
          logger.warn(`Failed to copy patch to tmp: ${e?.message ?? e}`);
          aborted = true;
        }
      } else {
        logger.warn(`Failed to apply patch: ${patchPath}`);
        logger.warn(result.stderr);
        aborted = true;
      }
    }
  }
  if (aborted) throw new Error("Patch failed: aborted");
  logger.success("All patches applied successfully.");
}

export function createPatches(): void {
  initializeBinGit();

  const dir = binDir();
  const stdoutRes = runCommandChecked("git", ["diff", "--name-only"], dir);
  if (!stdoutRes.success) throw new Error("Failed to get changed files");

  const changedFiles = stdoutRes.stdout
    .split("\n")
    .filter((f: string) => f.trim().length > 0);

  if (changedFiles.length === 0) {
    logger.info("No changes detected.");
    return;
  }

  Deno.mkdirSync(PATCHES_DIR, { recursive: true });

  for (const file of changedFiles) {
    const diffRes = runCommandChecked("git", ["diff", file], dir);
    if (!diffRes.success) {
      logger.warn(`Failed to create patch for: ${file}`);
      logger.warn(diffRes.stderr);
      continue;
    }

    let modifiedDiff =
      diffRes.stdout
        .replace(/^--- a\//gm, "--- ./")
        .replace(/^\+\+\+ b\//gm, "+++ ./")
        .trim() + "\n";

    const patchName =
      file.replace(/\//g, "-").replace(/\.[^/.]+$/, "") + ".patch";
    const patchPath = path.join(PATCHES_DIR, patchName);
    Deno.writeTextFileSync(patchPath, modifiedDiff);
    logger.info(`Created/Updated patch: ${patchPath}`);
  }
}

export async function run(action = "apply"): Promise<void> {
  switch (action) {
    case "apply":
      await applyPatches();
      break;
    case "create":
      createPatches();
      break;
    case "init":
      initializeBinGit();
      break;
    default:
      logger.error(`Unknown patcher action: ${action}`);
  }
}
