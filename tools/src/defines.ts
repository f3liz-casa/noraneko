// SPDX-License-Identifier: MPL-2.0

import * as path from "@std/path";

/**
 * Branding and platform-related constants used by build tools.
 * Modernized for ESNext + latest TypeScript while preserving Deno APIs.
 */

export const BRANDING = {
  base_name: "noraneko",
  display_name: "Noraneko",
  dev_suffix: "noraneko-dev",
} as const;

export type Platform = "windows" | "darwin" | "linux";

/** Resolve runtime platform (Deno-only) */
const detectPlatform = (): Platform => {
  const raw = Deno.build.os;
  switch (raw) {
    case "windows":
      return "windows";
    case "darwin":
      return "darwin";
    default:
      return "linux";
  }
};

export const PLATFORM: Platform = detectPlatform();

export const VERSION = ["windows", "linux"].includes(PLATFORM) ? "002" : "000";

/**
 * Develop against a stock Firefox binary instead of the noraneko-runtime build.
 * The dev pipeline only patches a prebuilt binary's omni.ja, so stock Firefox
 * works — the divergences in noraneko-runtime are build/packaging plus two tiny
 * C++ deltas (MatchPattern about:, nsAppRunner buildid2) that the injected JS
 * layer does not depend on. Enable with NORANEKO_STOCK_FIREFOX=1; pin the
 * version (must match the gecko-dev base the patches target).
 */
export const STOCK_FIREFOX = !!Deno.env.get("NORANEKO_STOCK_FIREFOX");
export const STOCK_FIREFOX_VERSION =
  Deno.env.get("NORANEKO_STOCK_FIREFOX_VERSION") ?? "149.0.2";

// Binary naming differs between stock Firefox and the noraneko-runtime build.
const APP_NAME = STOCK_FIREFOX ? "Firefox" : BRANDING.display_name; // <name>.app (darwin)
const EXE_NAME = STOCK_FIREFOX ? "firefox" : BRANDING.base_name; // executable file
const NONMAC_DIR = STOCK_FIREFOX ? "firefox" : BRANDING.base_name; // extracted dir (linux/win)

export const PROJECT_ROOT = path.resolve(
  path.dirname(path.fromFileUrl(import.meta.url)),
  "..",
  "..",
);

export const PATHS = {
  root: PROJECT_ROOT,
  bin_root: path.join(PROJECT_ROOT, "_dist", "bin"),
  noraneko_out: path.join(PROJECT_ROOT, "_dist", "noraneko"),
  buildid2: path.join(PROJECT_ROOT, "_dist", "buildid2"),
  profile_test: path.join(PROJECT_ROOT, "_dist", "profile", "test"),
  loader_features: path.join(PROJECT_ROOT, "bridge/loader-features"),
  features_chrome: path.join(PROJECT_ROOT, "browser-features/chrome"),
  i18n: path.join(PROJECT_ROOT, "i18n"),
  loader_modules: path.join(PROJECT_ROOT, "bridge/loader-modules"),
  modules: path.join(PROJECT_ROOT, "browser-features/modules"),
  mozbuild_output: path.join(PROJECT_ROOT, "obj-artifact-build-output/dist"),
} as const;

/**
 * Feature output dirs symlinked into the binary's resource/content packages.
 * `[subdir, project-relative target]`. Used by the dev (flat) and production
 * symlink layouts; keep in sync with the chrome.manifest entries in injector.ts.
 */
export const FEATURE_MOUNTS: ReadonlyArray<readonly [string, string]> = [
  ["content", "browser-features/chrome/_dist"],
  ["startup", "bridge/startup/_dist"],
  ["skin", "browser-features/skin"],
  ["resource", "bridge/loader-modules/_dist"],
  ["resource-builtin", "browser-features/webext-actors/_dist"],
  ["loader", "bridge/loader-features/_dist"],
  ["aboutdialog", "browser-features/pages-aboutDialog/_dist"],
  ["newtab", "browser-features/pages-newtab/_dist"],
  ["settings", "browser-features/settings/_dist"],
];

// On darwin the .app always lives under bin_root/<base_name>/ (the dmg is copied
// there); only the .app and executable names differ for stock Firefox.
export const APP_DIR = path.join(
  PATHS.bin_root,
  BRANDING.base_name,
  `${APP_NAME}.app`,
);

export const BIN_DIR =
  PLATFORM !== "darwin"
    ? path.join(PATHS.bin_root, NONMAC_DIR)
    : path.join(APP_DIR, "Contents", "Resources");

export const BIN_ROOT_DIR = PATHS.bin_root;
export const BIN_PATH = path.join(BIN_DIR, BRANDING.base_name);

export const PROD_BIN_DIR = "../obj-artifact-build-output/dist/bin";

export const BIN_PATH_EXE =
  PLATFORM !== "darwin"
    ? path.join(
        BIN_DIR,
        STOCK_FIREFOX
          ? EXE_NAME + (PLATFORM === "windows" ? ".exe" : "")
          : BRANDING.base_name + (PLATFORM === "windows" ? ".exe" : "-bin"),
      )
    : path.join(APP_DIR, "Contents", "MacOS", EXE_NAME);

export const BIN_VERSION = path.join(BIN_DIR, "nora.version.txt");

export const DEV_SERVER = {
  ready_string: "nora-{bbd11c51-3be9-4676-b912-ca4c0bdcab94}-dev",
  default_port: 8080,
} as const;

export type BinArchive =
  | {
      filename: string;
      format: "zip";
      platform: "windows";
      architecture: "x86_64";
    }
  | {
      filename: string;
      format: "tar.xz";
      platform: "linux";
      architecture: "x86_64" | "aarch64";
    }
  | {
      filename: string;
      format: "dmg";
      platform: "darwin";
      architecture: "universal";
    };

export function getBinArchive(): BinArchive {
  if (PLATFORM === "windows") {
    return {
      filename: `${BRANDING.base_name}-windows-x86_64-moz-artifact.zip`,
      format: "zip",
      platform: "windows",
      architecture: "x86_64",
    };
  }

  if (PLATFORM === "linux") {
    // Map Deno arch to expected strings
    const denoArch = Deno.build.arch;
    return {
      filename: `${BRANDING.base_name}-linux-${denoArch}-moz-artifact.tar.xz`,
      format: "tar.xz",
      platform: "linux",
      architecture: denoArch as "x86_64" | "aarch64",
    };
  }

  if (PLATFORM === "darwin") {
    return {
      filename: `${BRANDING.base_name}-macOS-universal-moz-artifact.dmg`,
      format: "dmg",
      platform: "darwin",
      architecture: "universal",
    };
  }

  throw new Error(
    `Unsupported platform: ${PLATFORM}. Supported: windows (x86_64), linux (x86_64, aarch64), darwin (universal)`,
  );
}

export function platformSupported(): boolean {
  try {
    return !!getBinArchive();
  } catch {
    return false;
  }
}

/**
 * Stock Firefox archive (filename + download URL) for STOCK_FIREFOX mode.
 * Uses Mozilla's release redirector, pinned to STOCK_FIREFOX_VERSION.
 */
export function getStockArchive(): { filename: string; url: string } {
  const v = STOCK_FIREFOX_VERSION;
  const base = "https://download.mozilla.org/?lang=en-US&product=firefox-" + v;

  if (PLATFORM === "darwin") {
    return { filename: `firefox-${v}.dmg`, url: `${base}&os=osx` };
  }
  if (PLATFORM === "linux") {
    if (Deno.build.arch !== "x86_64") {
      throw new Error(
        `Stock Firefox: only linux x86_64 is wired up (got ${Deno.build.arch}).`,
      );
    }
    return { filename: `firefox-${v}.tar.xz`, url: `${base}&os=linux64` };
  }
  // Windows stock ships as an installer .exe (not a plain archive); needs a
  // separate extraction path (e.g. 7z) — left as a follow-up.
  throw new Error("Stock Firefox is not wired up for Windows yet.");
}
