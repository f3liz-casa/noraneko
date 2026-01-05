// SPDX-License-Identifier: MPL-2.0

/**
 * NMA IO Operations
 *
 * Handles all side-effectful operations:
 * - File system access (reading/writing manifests, patches)
 * - Network requests (fetching hotfixes)
 * - Browser API interactions (Preferences, ChromeUtils)
 */

import { NMA_PATHS, DEFAULT_AUTO_UPDATE_CONFIG } from "./state.ts";

import {
  type HotfixAutoUpdateConfig,
  type InstalledHotfix,
  UpdateChannel,
  type HashState,
} from "./types.ts";

import { computeSha256 } from "./verifier.ts";

// Preference Keys
const PREF_HOTFIX_INSTALLED = "noraneko.hotfix.installed";
const PREF_HOTFIX_DISABLED_MODULES = "noraneko.hotfix.disabled_modules";
const PREF_HOTFIX_UNLOCK_CODES = "noraneko.hotfix.unlock_codes";
const PREF_HOTFIX_TRUSTED_DECISIONS = "noraneko.hotfix.trusted_decisions";
const PREF_HOTFIX_AUTO_UPDATE_CONFIG = "noraneko.hotfix.auto_update_config";
const PREF_HOTFIX_MANIFEST_URL = "noraneko.hotfix.manifest_url";
const PREF_HASH_STATE = "noraneko.hotfix.hash_state";
const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/noraneko-browser/noraneko/main/hotfixes/manifest.json";

// ============================================================================
// File System IO
// ============================================================================

export const getInstallDir = (): string => {
  const appDir = Services.dirsvc.get("GreD", Ci.nsIFile);
  return appDir.path;
};

export const getProfileDir = (): string => {
  return Services.dirsvc.get("ProfD", Ci.nsIFile).path;
};

export const getHotfixDir = (): string => {
  return PathUtils.join(getProfileDir(), "noraneko-hotfixes");
};

export const ensureHotfixDir = async (): Promise<void> => {
  await IOUtils.makeDirectory(getHotfixDir(), { ignoreExisting: true });
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
      // Use Mozilla's native version comparator
      return Services.vc.compare(b.version, a.version);
    } catch {
      // Fallback if Services.vc fails (unlikely)
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

export const getHotfixDenoLockPath = (
  hotfixDir: string,
  hotfixId: string,
): string => {
  return PathUtils.join(hotfixDir, hotfixId, "deno.lock");
};

export const getHotfixModulePath = (
  hotfixDir: string,
  hotfixId: string,
  modulePath: string,
): string => {
  return PathUtils.join(hotfixDir, hotfixId, modulePath);
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

export const getManifestUrl = (): string => {
  return Services.prefs.getStringPref(
    PREF_HOTFIX_MANIFEST_URL,
    DEFAULT_MANIFEST_URL,
  );
};

// ============================================================================
// Preferences IO
// ============================================================================

export const getInstalledHotfixes = (): InstalledHotfix[] => {
  try {
    const stored = Services.prefs.getStringPref(PREF_HOTFIX_INSTALLED, "[]");
    return JSON.parse(stored) as InstalledHotfix[];
  } catch {
    return [];
  }
};

export const saveInstalledHotfixes = (hotfixes: InstalledHotfix[]): void => {
  Services.prefs.setStringPref(PREF_HOTFIX_INSTALLED, JSON.stringify(hotfixes));
};

export const getDisabledModules = (): string[] => {
  try {
    const stored = Services.prefs.getStringPref(
      PREF_HOTFIX_DISABLED_MODULES,
      "[]",
    );
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
};

export const saveDisabledModules = (modules: string[]): void => {
  Services.prefs.setStringPref(
    PREF_HOTFIX_DISABLED_MODULES,
    JSON.stringify(modules),
  );
};

export const getUnlockedCodes = (): string[] => {
  try {
    const stored = Services.prefs.getStringPref(PREF_HOTFIX_UNLOCK_CODES, "[]");
    return JSON.parse(stored) as string[];
  } catch {
    return [];
  }
};

export const saveUnlockedCodes = (codes: string[]): void => {
  Services.prefs.setStringPref(PREF_HOTFIX_UNLOCK_CODES, JSON.stringify(codes));
};

export const getTrustedDecisions = (): Record<string, boolean> => {
  try {
    const stored = Services.prefs.getStringPref(
      PREF_HOTFIX_TRUSTED_DECISIONS,
      "{}",
    );
    return JSON.parse(stored) as Record<string, boolean>;
  } catch {
    return {};
  }
};

export const getAutoUpdateConfig = (): HotfixAutoUpdateConfig => {
  try {
    const stored = Services.prefs.getStringPref(
      PREF_HOTFIX_AUTO_UPDATE_CONFIG,
      JSON.stringify(DEFAULT_AUTO_UPDATE_CONFIG),
    );
    return JSON.parse(stored) as HotfixAutoUpdateConfig;
  } catch {
    return DEFAULT_AUTO_UPDATE_CONFIG;
  }
};

export const saveAutoUpdateConfig = (config: HotfixAutoUpdateConfig): void => {
  Services.prefs.setStringPref(
    PREF_HOTFIX_AUTO_UPDATE_CONFIG,
    JSON.stringify(config),
  );
};

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

export const loadModule = async (
  url: string,
): Promise<Record<string, unknown>> => {
  return await ChromeUtils.importESModule(url);
};

export const restartBrowser = (): void => {
  Services.startup.quit(
    Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit,
  );
};

// ============================================================================
// UI IO (Prompts)
// ============================================================================

export const showConfirmDialog = (
  title: string,
  message: string,
  button0: string,
  button1: string,
): boolean => {
  const promptService = Services.prompt;
  const buttonFlags =
    Ci.nsIPromptService.BUTTON_POS_0 *
      Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
    Ci.nsIPromptService.BUTTON_POS_1 *
      Ci.nsIPromptService.BUTTON_TITLE_IS_STRING +
    Ci.nsIPromptService.BUTTON_POS_0_DEFAULT;

  const result = promptService.confirmEx(
    null,
    title,
    message,
    buttonFlags,
    button0,
    button1,
    "",
    null,
    {},
  );

  return result === 0;
};
