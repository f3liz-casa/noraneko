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

import { MODULES_KEYS } from "./data/mod.ts";
import {
  setPrefFeatures,
  getEnabledFeatures,
  loadEnabledModules,
  initializeModules,
  initializeModulesForHotswap,
  cleanupAllModules,
  cleanupSelectiveModules,
  notifyHotswapStart,
  notifyHotswapComplete,
  getRegisteredModuleNames,
} from "./io/mod.ts";

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

// Re-export module hooks
export { onModuleLoaded } from "./io/mod.ts";

// Re-export data
export { MODULES, MODULES_KEYS } from "./data/mod.ts";
