// SPDX-License-Identifier: MPL-2.0

/**
 * Module Loader - Data-Oriented Programming Style
 *
 * Main entry point for the module loader system.
 * Julia/Kotlin-like functional patterns:
 * - Pure functions for core logic
 * - Module-level data structures
 * - Pipeline-style composition
 */

import { MODULES_KEYS, buildModulesFromNMA } from "./data/mod.ts";
import {
  setPrefFeatures,
  getEnabledFeatures,
  loadEnabledModules,
  initNMASystem,
  initializeModules,
  initializeModulesForHotswap,
  cleanupAllModules,
  cleanupSelectiveModules,
  notifyHotswapStart,
  notifyHotswapComplete,
  getRegisteredModuleNames,
} from "./io/mod.ts";
import {
  analyzeNMAChanges,
  saveHashState,
  logHashComparison,
  HotswapMode,
  getCurrentNMAManifest,
} from "./nma/mod.ts";

console.debug("[noraneko] Initializing scripts...");

// ============================================================================
// Public API - Main Functions
// ============================================================================

/**
 * Initialize all scripts (main entry point)
 * Side effect: initializes entire module system
 */
export async function initScripts(): Promise<void> {
  // Import required modules and initialize i18n
  ChromeUtils.importESModule("resource://noraneko/modules/BrowserGlue.sys.mjs");
  const { NoranekoConstants } = ChromeUtils.importESModule(
    "resource://noraneko/modules/NoranekoConstants.sys.mjs",
  );
  console.debug(
    `[noraneko-buildid2]\nuuid: ${NoranekoConstants.buildID2}\ndate: ${new Date(
      Number.parseInt(
        NoranekoConstants.buildID2.slice(0, 13).replace("-", ""),
        16,
      ),
    ).toISOString()}`,
  );

  // Initialize NMA (Noraneko Module Archive) system first
  // NMA provides omni.ja-like module distribution alongside installation
  // Allow toggling NMA at runtime via preference `noraneko.nma.enabled` (default: true)
  try {
    const nmaEnabled = Services.prefs.getBoolPref("noraneko.nma.enabled", true);
    if (nmaEnabled) {
      await initNMASystem();
    } else {
      console.debug("[noraneko] NMA disabled by preference (noraneko.nma.enabled=false)");
    }
  } catch (e) {
    // If prefs API is unavailable for any reason, fall back to initializing NMA
    console.warn("[noraneko] Pref read failed, defaulting to enable NMA", e);
    await initNMASystem();
  }

  // Populate module registry from NMA manifest (replaces build-time #features-chrome dependency)
  const nmaManifest = getCurrentNMAManifest();
  if (nmaManifest) {
    buildModulesFromNMA(nmaManifest.modules);
  }

  setPrefFeatures(MODULES_KEYS);

  const enabledFeatures = getEnabledFeatures();
  const modules = await loadEnabledModules(enabledFeatures);
  await initializeModules(modules);
}

/**
 * Hotswap modules with new versions
 * Side effect: cleans up and reloads all modules
 */
export async function hotswapModules(): Promise<boolean> {
  console.debug("[noraneko] Starting module hotswap...");

  try {
    notifyHotswapStart();
    await cleanupAllModules();
    console.debug("[noraneko] All modules cleaned up");

    const enabledFeatures = getEnabledFeatures();
    const modules = await loadEnabledModules(enabledFeatures);
    await initializeModulesForHotswap(modules);

    console.debug("[noraneko] Module hotswap complete");
    notifyHotswapComplete(true);
    return true;
  } catch (error) {
    console.error("[noraneko] Module hotswap failed:", error);
    notifyHotswapComplete(false);
    return false;
  }
}

/**
 * Hotswap specific modules (selective reload)
 * Only cleans up and reloads the specified modules and their dependents
 */
export async function hotswapSelectiveModules(
  moduleNames: string[],
): Promise<boolean> {
  console.debug(
    `[noraneko] Starting selective hotswap for: ${moduleNames.join(", ")}`,
  );

  try {
    notifyHotswapStart();

    // Cleanup the specified modules and their dependents
    const cleanedUp = await cleanupSelectiveModules(moduleNames);
    console.debug(
      `[noraneko] Cleaned up ${cleanedUp.length} modules: ${cleanedUp.join(", ")}`,
    );

    const enabledFeatures = getEnabledFeatures();

    // Filter to only reload the cleaned up modules
    const cleanedUpSet = new Set(cleanedUp);
    const allModules = await loadEnabledModules(enabledFeatures);
    const modulesToReload = allModules.filter((m) => cleanedUpSet.has(m.name));

    await initializeModulesForHotswap(modulesToReload);

    console.debug(
      `[noraneko] Selective hotswap complete. Reloaded: ${modulesToReload.map((m) => m.name).join(", ")}`,
    );
    notifyHotswapComplete(true);
    return true;
  } catch (error) {
    console.error("[noraneko] Selective hotswap failed:", error);
    notifyHotswapComplete(false);
    return false;
  }
}

/**
 * Hotswap modules with hash-based change detection
 * Determines whether to do full reload or selective reload based on what changed
 */
export async function hotswapWithHashDetection(
  buildId: string,
  modulePaths: string[],
): Promise<boolean> {
  console.debug(`[noraneko] Starting hash-based hotswap for NMA build: ${buildId}`);

  try {
    const installDir = Services.dirsvc.get("GreD", Ci.nsIFile).path;

    // Analyze changes
    const { newState, comparison, recommendation } = await analyzeNMAChanges(
      installDir,
      buildId,
      modulePaths,
    );

    logHashComparison(comparison);
    console.debug(
      `[noraneko] Hotswap recommendation: ${recommendation.mode} - ${recommendation.reason}`,
    );

    let success = false;

    switch (recommendation.mode) {
      case HotswapMode.NONE:
        console.debug("[noraneko] No changes detected, skipping hotswap");
        success = true;
        break;

      case HotswapMode.FULL:
        console.debug("[noraneko] Full reload required, performing full hotswap");
        success = await hotswapModules();
        break;

      case HotswapMode.SELECTIVE:
        console.debug(
          `[noraneko] Selective hotswap for modules: ${recommendation.modulesToReload.join(", ")}`,
        );
        success = await hotswapSelectiveModules(recommendation.modulesToReload);
        break;
    }

    // Save new hash state on success
    if (success) {
      saveHashState(newState);
      console.debug("[noraneko] Hash state saved");
    }

    return success;
  } catch (error) {
    console.error("[noraneko] Hash-based hotswap failed:", error);
    return false;
  }
}

/**
 * Get current registered module names (for external use)
 */
export function getLoadedModuleNames(): string[] {
  return getRegisteredModuleNames();
}

// ============================================================================
// Re-exports - Public API
// ============================================================================

// Re-export types
export type {
  ModuleMetadata,
  LoadedModule,
  ModuleInfo,
  HotswapEvent,
  HotswapListener,
} from "./types/mod.ts";

// Re-export registry functions
export {
  registerModule,
  getModule,
  getAllModules,
  hasModule,
  cleanupModule,
  cleanupAllModules,
  cleanupSelectiveModules,
  getRegisteredModuleNames,
  addHotswapListener,
  removeHotswapListener,
  notifyHotswapStart,
  notifyHotswapComplete,
} from "./io/mod.ts";

// Re-export hash/hotswap utilities for external use
export {
  analyzeNMAChanges,
  analyzeHotfixChanges,
  compareHashStates,
  getHotswapRecommendation,
  getStoredHashState,
  saveHashState,
  clearHashState,
  HotswapMode,
  type HashState,
  type HashComparisonResult,
  type HotswapRecommendation,
  type ModuleHashInfo,
  computeFileHash,
  extractModuleName,
  computeNMAHashState,
  computeHotfixHashState,
  logHashComparison,
} from "./nma/mod.ts";

// Re-export NMA types and functions
export type {
  NMAManifest,
  NMAModule,
  NMAAsset,
  NMAVerificationResult,
  NMALoaderState,
  NMATrustedConfig,
  NMALoaderEvents,
} from "./nma/mod.ts";

export {
  NMAVerificationStatus,
  NMA_PATHS,
  DEFAULT_NMA_TRUSTED_CONFIG,
  UpdateChannel,
} from "./nma/mod.ts";

export {
  initializeNMALoader,
  isNMAActive,
  hasNMAModule,
  getNMAModule,
  loadNMAModule,
  getNMAModuleUrl,
  activateNMAModules,
  getCurrentNMAManifest,
  verifyNMAIdentity,
  verifyNMAManifest,
  computeNMAHash,
  findNMAFile,
  readTextFile,
} from "./nma/mod.ts";

// Re-export module hooks
export { onModuleLoaded } from "./io/mod.ts";

// Re-export data
export { MODULES, MODULES_KEYS } from "./data/mod.ts";
