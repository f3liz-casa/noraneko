// SPDX-License-Identifier: MPL-2.0

import * as path from "@std/path";
import {
  runCommandChecked,
  Logger,
  exists,
  safeRemove,
  createFeatureSymlinks,
} from "./utils.ts";
import { BIN_DIR, PROD_BIN_DIR, PROJECT_ROOT } from "./defines.ts";
// @ts-types="npm:@types/jszip"
import JSZip from "npm:jszip";

const logger = new Logger("injector");

// Sentinels for idempotent noraneko section inside a jar's chrome.manifest
const OMNI_SECTION_BEGIN = "# begin noraneko";
const OMNI_SECTION_END = "# end noraneko";

/**
 * Build the manifest lines that register noraneko's chrome packages.
 *
 * Flat mode  – uses relative paths (resolved against the noraneko-devdir).
 * Omni mode  – uses absolute file:// URIs so they resolve even when the
 *               manifest is read from inside browser/omni.ja.
 *   (From FileLocation.cpp: manifest directives inside a zip stay inside the
 *    zip, but content/resource directives use NS_NewURI which accepts absolute
 *    URIs regardless of the jar base, and CanLoadResource passes for file://.)
 */
function buildFlatManifestContent(_mode: string): string {
  return [
    "content noraneko content/ contentaccessible=yes",
    "content noraneko-startup startup/ contentaccessible=yes",
    `content noraneko-newtab pages-newtab contentaccessible=yes`,
    "skin noraneko classic/1.0 skin/",
    "resource noraneko resource/ contentaccessible=yes",
    "resource noraneko-builtin resource-builtin/ contentaccessible=yes",
    "resource noraneko-loader loader/ contentaccessible=yes",
    "content noraneko-pages-aboutdialog aboutdialog/ contentaccessible=yes",
    "override chrome://browser/content/aboutDialog.xhtml chrome://noraneko-pages-aboutdialog/content/aboutDialog.xhtml",
    "content noraneko-settings settings/ contentaccessible=yes",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildOmniManifestLines(_mode: string): string[] {
  // Convert project-relative source dirs to absolute file:// URIs.
  // toFileUrl handles the platform differences (Windows drive letters, etc.).
  const toUri = (rel: string) =>
    path.toFileUrl(path.resolve(PROJECT_ROOT, rel)).href + "/";

  const lines = [
    OMNI_SECTION_BEGIN,
    `content noraneko ${toUri("browser-features/chrome/_dist")} contentaccessible=yes`,
    `content noraneko-startup ${toUri("bridge/startup/_dist")} contentaccessible=yes`,
    `content noraneko-newtab ${toUri("browser-features/pages-newtab/_dist")} contentaccessible=yes`,
    `skin noraneko classic/1.0 ${toUri("browser-features/skin")}`,
    `resource noraneko ${toUri("bridge/loader-modules/_dist")} contentaccessible=yes`,
    `resource noraneko-builtin ${toUri("browser-features/webext-actors/_dist")} contentaccessible=yes`,
    `resource noraneko-loader ${toUri("bridge/loader-features/_dist")} contentaccessible=yes`,
    `content noraneko-pages-aboutdialog ${toUri("browser-features/pages-aboutDialog/_dist")} contentaccessible=yes`,
    `override chrome://browser/content/aboutDialog.xhtml chrome://noraneko-pages-aboutdialog/content/aboutDialog.html`,
    `content noraneko-settings ${toUri("browser-features/settings/_dist")} contentaccessible=yes`,
  ];
  lines.push(OMNI_SECTION_END);
  return lines;
}

/**
 * Patch chrome.manifest inside browser/omni.ja to register noraneko packages
 * using absolute file:// URIs.  Idempotent: removes a previous noraneko
 * section (if any) before inserting the new one.
 */
async function patchChromeManifestInOmni(
  mode: string,
  omniJaPath: string,
): Promise<void> {
  const jarData = await Deno.readFile(omniJaPath);
  const zip = await JSZip.loadAsync(jarData);

  const entry = zip.file("chrome.manifest");
  if (!entry) {
    throw new Error(`chrome.manifest not found inside ${omniJaPath}`);
  }

  let manifest = await entry.async("string");

  // Remove any previous noraneko section (idempotency)
  const beginIdx = manifest.indexOf(OMNI_SECTION_BEGIN);
  const endIdx = manifest.indexOf(OMNI_SECTION_END);
  if (beginIdx !== -1 && endIdx !== -1) {
    manifest =
      manifest.slice(0, beginIdx).trimEnd() +
      manifest.slice(endIdx + OMNI_SECTION_END.length);
  }

  manifest = manifest.trimEnd() + "\n" + buildOmniManifestLines(mode).join("\n") + "\n";

  zip.file("chrome.manifest", manifest, { compression: "STORE" });

  await mergeBuiltinAddonsInOmni(zip);

  const updated = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
  await Deno.writeFile(omniJaPath, updated);

  logger.success(`Patched chrome.manifest inside ${path.basename(omniJaPath)}.`);
}

/**
 * Register noraneko's built-in WebExtensions the way Firefox registers its own:
 * add them to built_in_addons.json inside omni.ja. This is build-time
 * registration (no startup race for early pages like about:newtab), and is the
 * upstream-faithful counterpart to the runtime maybeInstallBuiltinAddon
 * fallback used in the flat dev layout.
 *
 * Idempotent: replaces any previously-added noraneko entries (matched by id).
 */
async function mergeBuiltinAddonsInOmni(zip: any): Promise<void> {
  const builtinsPath = path.join(
    PROJECT_ROOT,
    "browser-features/webext-actors/_dist/builtins.json",
  );
  if (!exists(builtinsPath)) {
    logger.warn("webext-actors builtins.json not found; skipping built-in registration.");
    return;
  }

  const ours: Array<{ id: string; version: string; res_url: string }> =
    JSON.parse(Deno.readTextFileSync(builtinsPath));
  if (ours.length === 0) {
    return;
  }

  // Find the built_in_addons.json entry by name (avoid hard-coding the jar path).
  const entryName = Object.keys(zip.files).find((n) =>
    n.endsWith("built_in_addons.json"),
  );
  if (!entryName) {
    logger.warn("built_in_addons.json not found inside omni.ja; skipping.");
    return;
  }

  const data = JSON.parse(await zip.file(entryName).async("string"));
  const ourIds = new Set(ours.map((o) => o.id));
  const builtins = (data.builtins ?? []).filter(
    (b: { addon_id: string }) => !ourIds.has(b.addon_id),
  );
  for (const o of ours) {
    builtins.push({
      addon_id: o.id,
      addon_version: o.version,
      res_url: o.res_url,
    });
  }
  data.builtins = builtins;

  zip.file(entryName, JSON.stringify(data), { compression: "STORE" });
  logger.success(
    `Registered ${ours.length} noraneko built-in addon(s) in ${entryName}.`,
  );
}

/**
 * Flat-layout injection: write a flat chrome.manifest entry and create the
 * noraneko-devdir with a noraneko.manifest and symlinks.
 */
function runFlat(mode: string, dirName: string): void {
  const manifestPath = path.join(BIN_DIR, "chrome.manifest");

  if (mode !== "production") {
    let manifest = "";
    if (exists(manifestPath)) {
      manifest = Deno.readTextFileSync(manifestPath);
    }
    const entry = `manifest ${dirName}/noraneko.manifest`;
    if (!manifest.includes(entry)) {
      Deno.writeTextFileSync(manifestPath, `${manifest}\n${entry}`);
    }
  }

  const dirPath = path.join(BIN_DIR, dirName);
  try {
    if (exists(dirPath)) {
      safeRemove(dirPath);
    }
    Deno.mkdirSync(dirPath, { recursive: true });
  } catch (e: any) {
    logger.error(`Failed to prepare directory ${dirPath}: ${e?.message ?? e}`);
    throw e;
  }

  Deno.writeTextFileSync(
    path.join(dirPath, "noraneko.manifest"),
    buildFlatManifestContent(mode),
  );

  createFeatureSymlinks(dirPath);
}

export async function injectXhtmlFromTs(
  isDev = false,
  isCI = false,
): Promise<void> {
  const scriptPath = path.join(PROJECT_ROOT, "tools", "scripts", "xhtml.ts");
  const binPath = !isCI ? BIN_DIR : PROD_BIN_DIR;

  const args = ["run", "--allow-read", "--allow-write", scriptPath, binPath];
  if (isDev) args.push("--dev");

  const result = runCommandChecked("deno", args);
  if (!result.success) {
    throw new Error(`Failed to inject XHTML: ${result.stderr}`);
  }
  logger.success("XHTML injection complete.");
}

/**
 * Register noraneko's chrome packages with the binary.
 *
 * Omni layout (browser/omni.ja present):
 *   Patches chrome.manifest inside the jar using absolute file:// URIs.
 *   No on-disk directories or symlinks are created.
 *
 * Flat layout (no browser/omni.ja):
 *   Writes a flat chrome.manifest entry and creates noraneko-devdir/ with
 *   a noraneko.manifest and symlinks to the built source directories.
 */
export async function run(mode: string, dirName = "noraneko-devdir"): Promise<void> {
  const browserOmniJa = path.join(BIN_DIR, "browser", "omni.ja");

  if (exists(browserOmniJa)) {
    logger.info("Omni layout detected – patching browser/omni.ja chrome.manifest.");
    await patchChromeManifestInOmni(mode, browserOmniJa);
  } else {
    logger.info("Flat layout detected – writing chrome.manifest and noraneko-devdir.");
    runFlat(mode, dirName);
  }

  logger.success("Manifest injected successfully.");
}
