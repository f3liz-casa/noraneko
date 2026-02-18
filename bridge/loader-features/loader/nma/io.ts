// SPDX-License-Identifier: MPL-2.0

/**
 * NMA IO Operations
 *
 * Handles all side-effectful operations:
 * - File system access (reading/writing manifests, NMA files)
 * - Browser API interactions (ChromeUtils, Services)
 */

import { NMA_PATHS } from "./state.ts";

import {
  type HashState,
  UpdateChannel,
} from "./types.ts";

import { computeSha256 } from "./verifier.ts";

// Preference Keys
const PREF_HASH_STATE = "noraneko.nma.hash_state";

// ============================================================================
// File System IO
// ============================================================================

export const getInstallDir = (): string => {
  const appDir = Services.dirsvc.get("GreD", Ci.nsIFile);
  return appDir.path;
};

/**
 * Register the directory containing the NMA file as resource://noraneko-nma/
 * so that jar:resource://noraneko-nma/<file>!/ URLs are trusted by ChromeUtils.importESModule.
 */
export const registerNMAResource = (nmaPath: string): void => {
  const resProto = Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler);

  const nmaFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  nmaFile.initWithPath(nmaPath);
  const jarURI = Services.io.newURI("jar:" + Services.io.newFileURI(nmaFile).spec + "!/");
  resProto.setSubstitution("noraneko-nma", jarURI);
};

export const getProfileDir = (): string => {
  return Services.dirsvc.get("ProfD", Ci.nsIFile).path;
};

export const resolveNMAPath = async (): Promise<string | null> => {
  const installDir = getInstallDir();
  const validFiles: {
    path: string;
    type: string;
    version: string;
    priority: number;
  }[] = [];

  try {
    const children = await IOUtils.getChildren(installDir);

    for (const path of children) {
      const filename = PathUtils.filename(path);
      const match = filename.match(NMA_PATHS.FILE_PATTERN);

      if (match) {
        const [, type, version] = match;
        // Priority: hotfix (100) > stable (50) > others (10)
        let priority = 10;
        if (type === "hotfix") priority = 100;
        else if (type === "stable") priority = 50;
        else if (type === "beta") priority = 40;
        else if (type === "nightly") priority = 30;

        validFiles.push({ path, type, version, priority });
      }
    }
  } catch (e) {
    console.error("[NMA] Failed to scan install dir:", e);
  }

  // Sort by Priority DESC, then Version DESC
  validFiles.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    try {
      return Services.vc.compare(b.version, a.version);
    } catch {
      return b.version.localeCompare(a.version);
    }
  });

  if (validFiles.length > 0) {
    return validFiles[0].path;
  }

  return null;
};

export const readTextFile = async (path: string): Promise<string> => {
  return await IOUtils.readUTF8(path);
};

export const writeTextFile = async (
  path: string,
  content: string,
): Promise<void> => {
  await IOUtils.writeUTF8(path, content);
};

export const makeDirectory = async (path: string): Promise<void> => {
  await IOUtils.makeDirectory(path, { ignoreExisting: true });
};

export const removeFileOrDir = async (path: string): Promise<void> => {
  if (await IOUtils.exists(path)) {
    await IOUtils.remove(path, { recursive: true });
  }
};

/** Use jar: protocol to read from ZIP archives (Firefox specific) */
export const readFromZip = async (
  zipPath: string,
  internalPath: string,
): Promise<string> => {
  const url = `jar:file://${PathUtils.normalize(zipPath)}!/${internalPath}`;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Failed to read from zip: ${response.status}`);
  return await response.text();
};

export const computeFileHash = async (
  filePath: string,
): Promise<string | null> => {
  try {
    const content = await readTextFile(filePath);
    return await computeSha256(content);
  } catch (error) {
    console.warn(`[NMA] Failed to read file for hashing: ${filePath}`, error);
    return null;
  }
};

export const getNMAModulePath = (
  nmaDir: string,
  buildId: string,
  modulePath: string,
): string => {
  return PathUtils.join(nmaDir, buildId, modulePath);
};

// ============================================================================
// Network IO
// ============================================================================

export const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return (await response.json()) as unknown as T;
};

export const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
  return await response.text();
};

// ============================================================================
// Preferences IO
// ============================================================================

export const getStoredHashState = (): HashState | null => {
  try {
    const stored = Services.prefs.getStringPref(PREF_HASH_STATE, "");
    if (!stored) return null;
    return JSON.parse(stored) as HashState;
  } catch {
    return null;
  }
};

export const saveHashState = (state: HashState): void => {
  Services.prefs.setStringPref(PREF_HASH_STATE, JSON.stringify(state));
};

export const clearHashState = (): void => {
  Services.prefs.clearUserPref(PREF_HASH_STATE);
};

// ============================================================================
// Browser API IO
// ============================================================================

export const detectUpdateChannel = (): UpdateChannel => {
  try {
    const { AppConstants } = ChromeUtils.importESModule(
      "resource://gre/modules/AppConstants.sys.mjs",
    ) as { AppConstants: { MOZ_UPDATE_CHANNEL?: string } };

    const channel = AppConstants.MOZ_UPDATE_CHANNEL || "default";
    const channelLower = String(channel).toLowerCase();

    if (channelLower.includes("nightly")) return UpdateChannel.NIGHTLY;
    if (channelLower.includes("beta")) return UpdateChannel.BETA;
    if (channelLower.includes("release")) return UpdateChannel.RELEASE;

    return UpdateChannel.DEFAULT;
  } catch {
    return UpdateChannel.DEFAULT;
  }
};

export const loadModule = (
  url: string,
): Record<string, unknown> => {
  return ChromeUtils.importESModule(url, { global: "current" });
};

export const restartBrowser = (): void => {
  Services.startup.quit(
    Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit,
  );
};

