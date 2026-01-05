// SPDX-License-Identifier: MPL-2.0

/**
 * NMA Orchestrator (Loader)
 *
 * Facade that orchestrates data flow between IO, Verifier, and State.
 * This is the high-level API exposed to the rest of the application.
 */

import {
  NMAManifest,
  HotfixManifest,
  HotfixStatus,
  InstalledHotfix,
  UpdateChannel,
  NMAVerificationStatus,
  HotfixConsentResult,
  NMAVerificationResult,
} from "./types.ts";

import { state, emitEvent, getNMATrustedConfig } from "./state.ts";

import * as IO from "./io.ts";
import * as Verifier from "./verifier.ts";

// ============================================================================
// NMA Initialization
// ============================================================================

export const initializeNMALoader = async (): Promise<boolean> => {
  console.log("[NMA] Initializing...");

  // 1. Initialize Hotfix System (parallel/prep)
  await initializeHotfixSystem();

  // 2. Locate NMA File
  const nmaPath = await IO.resolveNMAPath();
  if (!nmaPath) {
    console.log("[NMA] No NMA file found, using built-in modules");
    return false;
  }

  state.loader.nmaPath = nmaPath;
  console.log(`[NMA] Found archive: ${nmaPath}`);

  // 3. Verify NMA
  const verificationResult = await verifyNMA(nmaPath);
  if (!verificationResult.isValid) {
    console.error(
      "[NMA] Verification failed:",
      verificationResult.errorMessage,
    );
    emitEvent("nma-error", {
      error: verificationResult.errorMessage,
      status: verificationResult.status,
    });
    state.loader.nmaPath = null;
    return false;
  }

  // 4. Load Manifest
  const manifest = await readNMAManifest(nmaPath);
  if (!manifest) {
    console.error("[NMA] Failed to read manifest");
    state.loader.nmaPath = null;
    return false;
  }

  state.loader.currentNMA = manifest;
  state.loader.isActive = true;

  console.log(
    `[NMA] Loaded: ${manifest.buildId} (v${manifest.noranekoVersion})`,
  );
  emitEvent("nma-loaded", { manifest });

  return true;
};

// ============================================================================
// NMA Logic
// ============================================================================

export const verifyNMA = async (
  path: string,
): Promise<NMAVerificationResult> => {
  try {
    const rawManifest = await IO.readFromZip(path, "manifest.json");
    const manifest = JSON.parse(rawManifest) as NMAManifest;

    // Dev mode check
    const isDev = isDevModeNMAAllowed();
    if (isDev && !manifest.sigstoreBundle?.bundle) {
      console.warn("[NMA] Allowing unsigned NMA in dev mode");
      return { isValid: true, status: NMAVerificationStatus.VALID, manifest };
    }

    const result = await Verifier.verifyNMAManifest(manifest, rawManifest);
    state.loader.lastVerification = result;
    emitEvent("nma-verified", { result });
    return result;
  } catch (error) {
    return {
      isValid: false,
      status: NMAVerificationStatus.UNKNOWN_ERROR,
      errorMessage: String(error),
    };
  }
};

const readNMAManifest = async (path: string): Promise<NMAManifest | null> => {
  try {
    const raw = await IO.readFromZip(path, "manifest.json");
    return JSON.parse(raw) as NMAManifest;
  } catch {
    return null;
  }
};

export const verifyNMAModuleHash = async (
  moduleUrl: string,
  expectedHash: string,
): Promise<boolean> => {
  try {
    let content: string;
    if (moduleUrl.startsWith("jar:")) {
      const response = await fetch(moduleUrl);
      if (!response.ok) return false;
      content = await response.text();
    } else {
      content = await IO.readTextFile(moduleUrl);
    }
    const hash = await Verifier.computeSha256(content);
    return hash === expectedHash;
  } catch {
    return false;
  }
};

export const isDevModeNMAAllowed = (): boolean => {
  try {
    const { AppConstants } = ChromeUtils.importESModule(
      "resource://gre/modules/AppConstants.sys.mjs",
    ) as any;
    const isDebug = AppConstants.DEBUG ?? false;
    const channel = (AppConstants.MOZ_UPDATE_CHANNEL || "").toLowerCase();
    const config = getNMATrustedConfig();
    return (
      config.allowUnsignedInDev && (isDebug || channel.includes("nightly"))
    );
  } catch {
    return false;
  }
};

// ============================================================================
// Module Loading
// ============================================================================

export const getNMAModuleUrl = (modulePath: string): string => {
  if (!state.loader.nmaPath) throw new Error("NMA not loaded");
  return `jar:file://${state.loader.nmaPath}!/${modulePath}`;
};

export const hasNMAModule = (moduleName: string): boolean => {
  return (
    state.loader.currentNMA?.modules.some((m) => m.name === moduleName) ?? false
  );
};

export const getNMAModule = (moduleName: string) => {
  return (
    state.loader.currentNMA?.modules.find((m) => m.name === moduleName) ?? null
  );
};

export const loadNMAModule = async (
  moduleName: string,
): Promise<Record<string, unknown> | null> => {
  const module = getNMAModule(moduleName);
  if (!module) return null;

  try {
    const url = getNMAModuleUrl(module.path);
    const exports = await IO.loadModule(url);
    state.loader.loadedModules.push(moduleName);
    return exports;
  } catch (e) {
    console.error(`[NMA] Failed to load module ${moduleName}:`, e);
    return null;
  }
};

export const activateNMAModules = async (): Promise<string[]> => {
  if (!state.loader.currentNMA || !state.loader.isActive) return [];

  const activated: string[] = [];
  const essential = state.loader.currentNMA.modules.filter((m) => m.essential);

  for (const mod of essential) {
    if (await loadNMAModule(mod.name)) {
      activated.push(mod.name);
    }
  }
  emitEvent("nma-activated", { modules: activated });
  return activated;
};

// ============================================================================
// Hotswap Support
// ============================================================================

// ============================================================================
// Hotswap Support
// ============================================================================

const getCoreLib = async () => {
  try {
    const url = getNMAModuleUrl("lib/core/mod.ts");
    return await IO.loadModule(url);
  } catch (e) {
    console.error("[NMA] Failed to load Core Lib:", e);
    return null;
  }
};

/**
 * Cleanup a module instance using Core registry
 */
const cleanupModuleInstance = async (name: string): Promise<void> => {
  const core = await getCoreLib();
  if (core && typeof core.unregister === "function") {
    try {
      // Core unregister handles lifecycle cleanup
      core.unregister(name);
      emitEvent("nma-module-cleanup", { name });
    } catch (e) {
      console.error(`[NMA] Error cleaning up module ${name}:`, e);
    }
  }
};

/**
 * Hotswap a single module (unload + reload)
 * Side effect: cleans up old instance, invalidates cache, loads new instance
 */
export const hotswapModule = async (moduleName: string): Promise<boolean> => {
  const module = getNMAModule(moduleName);
  if (!module) {
    console.error(`[NMA] Module ${moduleName} not found in manifest`);
    return false;
  }

  console.log(`[NMA] Hotswapping module: ${moduleName}`);

  // 1. Cleanup existing instance via Core
  await cleanupModuleInstance(moduleName);

  // 2. Reload module with cache busting
  // Since Cu.unload is not available, we use a query parameter to force a fresh load.
  // The old module remains in memory until browser restart.
  const moduleUrl = getNMAModuleUrl(module.path);
  const bustUrl = `${moduleUrl}?t=${Date.now()}`;

  try {
    // We bypass loadNMAModule wrapper here to use the busted URL directly
    // but we still need to register it as loaded.
    await IO.loadModule(bustUrl);

    if (!state.loader.loadedModules.includes(moduleName)) {
      state.loader.loadedModules.push(moduleName);
    }

    emitEvent("nma-module-reload", { name: moduleName });
    return true;
  } catch (e) {
    console.error(`[NMA] Failed to reload module ${moduleName}:`, e);
    return false;
  }
};

/**
 * Hotswap multiple modules based on recommendation
 * Side effect: hotswaps modules according to HotswapRecommendation
 */
export const hotswapByRecommendation = async (
  recommendation: import("./types.ts").HotswapRecommendation,
): Promise<{ swapped: string[]; failed: string[] }> => {
  const { HotswapMode } = await import("./types.ts");

  if (recommendation.mode === HotswapMode.NONE) {
    return { swapped: [], failed: [] };
  }

  if (recommendation.mode === HotswapMode.FULL) {
    // Full reload required - return all loaded modules as "failed"
    console.warn(`[NMA] Full reload required: ${recommendation.reason}`);
    return { swapped: [], failed: [...state.loader.loadedModules] };
  }

  // Selective hotswap
  const swapped: string[] = [];
  const failed: string[] = [];

  emitEvent("nma-hotswap-start", { modules: recommendation.modulesToReload });

  for (const moduleName of recommendation.modulesToReload) {
    const success = await hotswapModule(moduleName);
    if (success) {
      swapped.push(moduleName);
    } else {
      failed.push(moduleName);
    }
  }

  emitEvent("nma-hotswap-complete", { swapped, failed });

  if (swapped.length > 0) {
    console.log(
      `[NMA] Hotswapped ${swapped.length} modules: ${swapped.join(", ")}`,
    );
  }
  if (failed.length > 0) {
    console.error(
      `[NMA] Failed to hotswap ${failed.length} modules: ${failed.join(", ")}`,
    );
  }

  return { swapped, failed };
};

/**
 * Check for module changes and get hotswap recommendation
 */
export const checkModuleChanges = async (): Promise<
  import("./types.ts").HotswapRecommendation
> => {
  const { analyzeHotfixChanges } = await import("./hashing.ts");
  const { getHotfixDir } = await import("./io.ts");

  if (!state.loader.currentNMA) {
    const { HotswapMode } = await import("./types.ts");
    return {
      mode: HotswapMode.NONE,
      modulesToReload: [],
      reason: "No NMA loaded",
    };
  }

  // Analyze changes
  const modulePaths = state.loader.currentNMA.modules.map((m) => m.path);
  const analysis = await analyzeHotfixChanges(
    getHotfixDir(),
    state.loader.currentNMA.buildId,
    modulePaths,
  );

  return analysis.recommendation;
};

// ============================================================================
// Hotfix System
// ============================================================================

export const initializeHotfixSystem = async (): Promise<void> => {
  state.currentChannel = IO.detectUpdateChannel();
  await IO.ensureHotfixDir();

  // Apply installed hotfixes
  const installed = IO.getInstalledHotfixes();
  for (const hf of installed) {
    if (hf.status === HotfixStatus.INSTALLED) {
      await applyHotfix(hf.id);
    }
  }

  // Auto-update check
  if (state.currentChannel === UpdateChannel.NIGHTLY) {
    await startAutoUpdateChecking();
  }
};

// --- Hotfix Actions ---

export const fetchAvailableHotfixes = async (): Promise<HotfixManifest[]> => {
  try {
    const url = IO.getManifestUrl();
    const manifests = await IO.fetchJson<HotfixManifest[]>(url);
    return filterApplicableHotfixes(manifests);
  } catch (e) {
    console.error("[Hotfix] Fetch failed:", e);
    return [];
  }
};

export const downloadHotfix = async (
  manifest: HotfixManifest,
): Promise<boolean> => {
  console.log(`[Hotfix] Downloading ${manifest.id}`);
  const hotfixPath = PathUtils.join(IO.getHotfixDir(), manifest.id);

  try {
    await IO.makeDirectory(hotfixPath);

    // Verify Manifest
    const content = JSON.stringify(manifest);
    const result = await Verifier.verifyHotfixManifest(manifest, content);
    if (!result.isValid) throw new Error(result.errorMessage);

    // Download Patches
    for (const patch of manifest.patches) {
      const patchUrl = new URL(
        patch.patchedModulePath,
        IO.getManifestUrl(),
      ).toString();
      const patchContent = await IO.fetchText(patchUrl);

      const hash = await Verifier.computeSha256(patchContent);
      if (hash !== patch.patchedModuleHash)
        throw new Error(`Hash mismatch for ${patch.moduleName}`);

      const patchFilePath = PathUtils.join(hotfixPath, patch.patchedModulePath);
      await IO.makeDirectory(PathUtils.parent(patchFilePath));
      await IO.writeTextFile(patchFilePath, patchContent);
    }

    await IO.writeTextFile(
      PathUtils.join(hotfixPath, "manifest.json"),
      content,
    );
    return true;
  } catch (e) {
    console.error(`[Hotfix] Download failed for ${manifest.id}:`, e);
    await IO.removeFileOrDir(hotfixPath);
    return false;
  }
};

export const installHotfix = async (
  manifest: HotfixManifest,
): Promise<boolean> => {
  console.log(`[Hotfix] Installing ${manifest.id}`);
  const hotfixPath = PathUtils.join(
    IO.getHotfixDir(),
    manifest.id,
    "manifest.json",
  );

  try {
    const content = await IO.readTextFile(hotfixPath);
    const storedManifest = JSON.parse(content) as HotfixManifest;

    // Verify again before install
    const result = await Verifier.verifyHotfixManifest(storedManifest, content);
    let verified = result.isValid;

    if (!verified) {
      const proceed = IO.showConfirmDialog(
        "⚠️ Verification Failed",
        `Hotfix ${manifest.id} verification failed: ${result.errorMessage}. Install anyway?`,
        "Install (Unsafe)",
        "Cancel",
      );
      if (!proceed) return false;
    }

    // Consent
    const consent = await requestUserConsent(
      storedManifest,
      result.verifiedIdentity,
      verified,
    );
    if (!consent.approved) return false;

    // Apply Logic
    for (const patch of storedManifest.patches) {
      // Logic to disable module handled via state/prefs
      disableModule(patch.moduleName);
    }

    const record: InstalledHotfix = {
      id: storedManifest.id,
      version: storedManifest.version,
      status: HotfixStatus.INSTALLED,
      installedAt: new Date().toISOString(),
      signerIdentity: result.verifiedIdentity || {
        issuer: "?",
        subject: "?",
        repository: "?",
        workflowRef: "?",
      },
      disabledModules: storedManifest.patches.map((p) => p.moduleName),
      injectedModules: storedManifest.patches.map((p) => p.patchedModulePath),
    };

    const installed = IO.getInstalledHotfixes().filter(
      (h) => h.id !== record.id,
    );
    installed.push(record);
    IO.saveInstalledHotfixes(installed);

    notifyRestartRequired(storedManifest);
    return true;
  } catch (e) {
    console.error(`[Hotfix] Install failed for ${manifest.id}:`, e);
    return false;
  }
};

export const applyHotfix = async (id: string): Promise<boolean> => {
  const path = PathUtils.join(IO.getHotfixDir(), id, "manifest.json");
  if (!(await IOUtils.exists(path))) return false;
  console.log(`[Hotfix] Applied ${id}`);
  return true;
};

// --- Helpers ---

const filterApplicableHotfixes = (
  manifests: HotfixManifest[],
): HotfixManifest[] => {
  // Version comparison logic omitted for brevity, assuming generic filter
  return manifests.filter((m) => {
    if (m.targetChannels && !m.targetChannels.includes(state.currentChannel))
      return false;
    return true; // Expand version check if needed
  });
};

const disableModule = (name: string) => {
  const list = IO.getDisabledModules();
  if (!list.includes(name)) {
    list.push(name);
    IO.saveDisabledModules(list);
  }
};

const requestUserConsent = async (
  manifest: HotfixManifest,
  identity: any,
  verified: boolean,
): Promise<HotfixConsentResult> => {
  if (verified && IO.getTrustedDecisions()[manifest.id]) {
    return {
      approved: true,
      decidedAt: new Date().toISOString(),
      rememberDecision: true,
    };
  }

  const approved = IO.showConfirmDialog(
    "Install Hotfix?",
    `Install hotfix ${manifest.id} v${manifest.version}?\n\n${manifest.description}`,
    "Install",
    "Cancel",
  );

  return {
    approved,
    decidedAt: new Date().toISOString(),
    rememberDecision: false,
  };
};

const notifyRestartRequired = (manifest: HotfixManifest) => {
  const restart = IO.showConfirmDialog(
    "Restart Required",
    `Hotfix ${manifest.id} installed. Restart now?`,
    "Restart Now",
    "Later",
  );
  if (restart) IO.restartBrowser();
};

const startAutoUpdateChecking = async () => {
  const config = IO.getAutoUpdateConfig();
  if (!config.enabled) return;

  console.log("[Hotfix] Auto-update started");
  const checkForUpdates = async () => {
    const manifests = await fetchAvailableHotfixes();
    const installedIds = IO.getInstalledHotfixes().map((h) => h.id);
    const newOnes = manifests.filter((m) => !installedIds.includes(m.id));

    for (const m of newOnes) {
      if (await downloadHotfix(m)) {
        await installHotfix(m);
      }
    }
  };

  if (
    Date.now() - new Date(config.lastCheckTime).getTime() >
    config.checkInterval
  ) {
    await checkForUpdates();
    config.lastCheckTime = new Date().toISOString();
    IO.saveAutoUpdateConfig(config);
  }

  state.autoUpdateTimer = setInterval(checkForUpdates, config.checkInterval);
};

export const stopAutoUpdateChecking = () => {
  if (state.autoUpdateTimer) {
    clearInterval(state.autoUpdateTimer);
    state.autoUpdateTimer = null;
  }
};
