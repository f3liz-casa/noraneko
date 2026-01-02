// SPDX-License-Identifier: MPL-2.0

/**
 * Module Loader - Data-Oriented Programming Style
 * 
 * Julia/Kotlin-like functional patterns:
 * - Pure functions for core logic
 * - Module-level data structures
 * - Pipeline-style composition
 */

import { initI18NForBrowserChrome } from "#i18n/config-browser-chrome.ts";

import { MODULES, MODULES_KEYS } from "./modules.ts";
import {
  onModuleLoaded,
  _registerModuleLoadState,
  _rejectOtherLoadStates,
} from "./modules-hooks.ts";
import { registerModuleEventDispatcher } from "./event-dispatcher-registry.ts";
import { 
  registerModule, 
  cleanupAllModules,
  cleanupSelectiveModules,
  notifyHotswapStart,
  notifyHotswapComplete,
  getRegisteredModuleNames,
  type ModuleMetadata,
} from "./module-registry.ts";
import {
  analyzeHotfixChanges,
  saveHashState,
  HotswapMode,
  logHashComparison,
  type HotswapRecommendation,
} from "./hash-registry.ts";

console.log("[noraneko] Initializing scripts...");

// ============================================================================
// Types - Data Structures
// ============================================================================

/** Loaded module with exports and metadata */
interface LoadedModule {
  name: string;
  metadata: ModuleMetadata;
  init?: typeof Function;
  initBeforeSessionStoreInit?: typeof Function;
  default?: any;
}

// ============================================================================
// Configuration - Constants
// ============================================================================

const PREF_HOTFIX_DISABLED_MODULES = "noraneko.hotfix.disabled_modules";

// ============================================================================
// Pure Functions - Helpers
// ============================================================================

/** Create default metadata for a module */
const defaultMetadata = (moduleName: string): ModuleMetadata => ({
  moduleName,
  dependencies: [],
  softDependencies: [],
});

/** Check if a module is disabled by hotfix */
const isModuleDisabledByHotfix = (moduleName: string): boolean => {
  try {
    const disabled = Services.prefs.getStringPref(PREF_HOTFIX_DISABLED_MODULES, "[]");
    return (JSON.parse(disabled) as string[]).includes(moduleName);
  } catch {
    return false;
  }
};

/** Get patched module path from hotfix loader */
const getPatchedModulePath = (moduleName: string): string | null => {
  try {
    const { hotfixLoader } = ChromeUtils.importESModule(
      "resource://noraneko/modules/HotfixLoader.sys.mjs",
    );
    return hotfixLoader.getPatchedModulePath(moduleName);
  } catch {
    return null;
  }
};

/** Initialize the hotfix system */
const initHotfixSystem = async (): Promise<void> => {
  try {
    const { hotfixLoader } = ChromeUtils.importESModule(
      "resource://noraneko/modules/HotfixLoader.sys.mjs",
    );
    await hotfixLoader.initialize();
    console.log("[noraneko] Hotfix system initialized");
  } catch (error) {
    console.error("[noraneko] Failed to initialize hotfix system:", error);
  }
};

/** Set up preferences for features */
const setPrefFeatures = (allFeaturesKeys: typeof MODULES_KEYS): void => {
  const prefs = Services.prefs.getDefaultBranch("");
  prefs.setStringPref("noraneko.features.all", JSON.stringify(allFeaturesKeys));
  Services.prefs.lockPref("noraneko.features.all");
  prefs.setStringPref("noraneko.features.enabled", JSON.stringify(allFeaturesKeys));
};

/** 
 * Load patched module with path traversal protection
 * Security: Validates path is within hotfix directory
 */
const loadPatchedModule = async (
  patchedPath: string,
  moduleName: string,
): Promise<LoadedModule | null> => {
  try {
    const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
    const hotfixBaseDir = PathUtils.join(profileDir, "noraneko-hotfixes");
    const normalizedPath = PathUtils.normalize(patchedPath);
    
    // Security: Ensure path doesn't escape hotfix directory
    if (!normalizedPath.startsWith(hotfixBaseDir)) {
      console.error(`[noraneko] Security: Path outside hotfix directory: ${patchedPath}`);
      return null;
    }

    const fileUrl = `file://${normalizedPath}`;
    const exports = ChromeUtils.importESModule(fileUrl);
    const metadata = (exports as any).default?._metadata?.() ?? defaultMetadata(moduleName);

    return {
      name: moduleName,
      metadata,
      ...(exports as {
        init?: typeof Function;
        initBeforeSessionStoreInit?: typeof Function;
        default?: any;
      }),
    };
  } catch (error) {
    console.error(`[noraneko] Failed to load patched module ${patchedPath}:`, error);
    return null;
  }
};

/** Load a single module (regular or patched) */
const loadSingleModule = async (
  categoryValue: Record<string, () => Promise<unknown>>,
  moduleName: string,
): Promise<LoadedModule | null> => {
  // Check if disabled by hotfix
  if (isModuleDisabledByHotfix(moduleName)) {
    console.log(`[noraneko] Module ${moduleName} disabled by hotfix`);
    const patchedPath = getPatchedModulePath(moduleName);
    
    if (patchedPath) {
      try {
        return await loadPatchedModule(patchedPath, moduleName);
      } catch (e) {
        console.error(`[noraneko] Failed to load patched ${moduleName}:`, e);
      }
    }
    console.warn(`[noraneko] No patched version for disabled module ${moduleName}`);
    return null;
  }

  try {
    const exports = await categoryValue[moduleName]();
    const metadata = (exports as any).default?._metadata?.() ?? defaultMetadata(moduleName);

    const module: LoadedModule = {
      name: moduleName,
      metadata,
      ...(exports as {
        init?: typeof Function;
        initBeforeSessionStoreInit?: typeof Function;
        default?: any;
      }),
    };
    console.debug(`[noraneko] Loaded module: ${moduleName}`);
    return module;
  } catch (e) {
    console.error(`[noraneko] Failed to load module ${moduleName}:`, e);
    return null;
  }
};

/** Load all enabled modules */
const loadEnabledModules = async (
  enabledFeatures: typeof MODULES_KEYS,
): Promise<LoadedModule[]> => {
  const promises = Object.entries(MODULES).flatMap(([categoryKey, categoryValue]) =>
    Object.keys(categoryValue)
      .filter(moduleName => 
        categoryKey in enabledFeatures &&
        enabledFeatures[categoryKey as keyof typeof enabledFeatures].includes(moduleName)
      )
      .map(moduleName => loadSingleModule(categoryValue, moduleName))
  );

  const results = await Promise.all(promises);
  return results.filter((m): m is LoadedModule => m !== null);
};

/** Validate module dependencies (no missing, no circular) */
const validateDependencies = (modules: LoadedModule[]): void => {
  const moduleNames = new Set(modules.map(m => m.name));
  const moduleMap = new Map(modules.map(m => [m.name, m]));
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const checkCircular = (name: string, deps: string[], path: string[] = []): void => {
    if (visiting.has(name)) {
      throw new Error(`Circular dependency: ${[...path, name].join(" -> ")}`);
    }
    if (visited.has(name)) return;

    visiting.add(name);
    for (const dep of deps) {
      const depModule = moduleMap.get(dep);
      if (depModule) {
        checkCircular(dep, depModule.metadata.dependencies, [...path, name]);
      }
    }
    visiting.delete(name);
    visited.add(name);
  };

  for (const module of modules) {
    // Check hard dependencies exist
    for (const dep of module.metadata.dependencies) {
      if (!moduleNames.has(dep)) {
        throw new Error(`Missing dependency: ${dep} required by ${module.name}`);
      }
    }
    checkCircular(module.name, module.metadata.dependencies);
  }
};

/** Topological sort by dependencies */
const sortByDependencies = (modules: LoadedModule[]): LoadedModule[] => {
  const sorted: LoadedModule[] = [];
  const processed = new Set<string>();
  const moduleMap = new Map(modules.map(m => [m.name, m]));

  const process = (module: LoadedModule): void => {
    if (processed.has(module.name)) return;

    for (const depName of module.metadata.dependencies) {
      const dep = moduleMap.get(depName);
      if (dep && !processed.has(depName)) process(dep);
    }

    sorted.push(module);
    processed.add(module.name);
  };

  modules.forEach(process);
  return sorted;
};

/** Register module instance and event methods */
const registerModuleInstance = (module: LoadedModule, instance: any, isHotfix: boolean): void => {
  if (!instance) return;

  registerModule(module.metadata.moduleName, instance, module.metadata, isHotfix);

  if (typeof instance.eventMethods === "function") {
    try {
      const eventMethods = instance.eventMethods();
      console.debug(`[noraneko] Event methods for ${module.metadata.moduleName}:`, Object.keys(eventMethods));
      registerModuleEventDispatcher(module.metadata.moduleName, eventMethods);
      console.debug(`[noraneko] Registered EventDispatcher for ${module.metadata.moduleName}`);
    } catch (e) {
      console.error(`[noraneko] Failed to register EventDispatcher for ${module.metadata.moduleName}:`, e);
    }
  }
};

/** Initialize a single module */
const initModule = async (module: LoadedModule): Promise<void> => {
  console.log("init " + module.name);

  // Wait for hard dependencies
  for (const dep of module.metadata.dependencies) {
    await onModuleLoaded(dep);
  }

  // Create instance (decorator auto-runs init via constructor)
  const instance = module?.default ? new module.default() : null;
  registerModuleInstance(module, instance, false);
  _registerModuleLoadState(module.name, true);
};

/** Initialize all modules */
const initializeModules = async (modules: LoadedModule[]): Promise<void> => {
  validateDependencies(modules);
  const sortedModules = sortByDependencies(modules);

  // Run initBeforeSessionStoreInit
  for (const module of sortedModules) {
    try {
      await module?.initBeforeSessionStoreInit?.();
    } catch (e) {
      console.error(`[noraneko] initBeforeSessionStoreInit failed for ${module.name}:`, e);
    }
  }

  // Wait for SessionStore
  // @ts-expect-error SessionStore type not defined
  await SessionStore.promiseInitialized;

  // Initialize each module
  for (const module of sortedModules) {
    try {
      await initModule(module);
    } catch (e) {
      console.error(`[noraneko] Failed to init module ${module.name}:`, e);
      _registerModuleLoadState(module.name, false);
    }
  }

  _registerModuleLoadState("__init_all__", true);
  _rejectOtherLoadStates();
};

/** Initialize modules during hotswap (no session store wait) */
const initializeModulesForHotswap = async (modules: LoadedModule[]): Promise<void> => {
  validateDependencies(modules);
  const sortedModules = sortByDependencies(modules);

  for (const module of sortedModules) {
    try {
      console.log("[noraneko] Hotswap init: " + module.name);
      const instance = module?.default ? new module.default() : null;
      registerModuleInstance(module, instance, isModuleDisabledByHotfix(module.name));
    } catch (e) {
      console.error(`[noraneko] Hotswap init failed for ${module.name}:`, e);
    }
  }
  console.log("[noraneko] Hotswap initialization complete");
};

// ============================================================================
// Public API - Main Functions
// ============================================================================

/** Initialize all scripts (main entry point) */
export async function initScripts(): Promise<void> {
  // Import required modules and initialize i18n
  ChromeUtils.importESModule("resource://noraneko/modules/BrowserGlue.sys.mjs");
  const { NoranekoConstants } = ChromeUtils.importESModule(
    "resource://noraneko/modules/NoranekoConstants.sys.mjs",
  );
  initI18NForBrowserChrome();
  console.debug(
    `[noraneko-buildid2]\nuuid: ${NoranekoConstants.buildID2}\ndate: ${new Date(
      Number.parseInt(NoranekoConstants.buildID2.slice(0, 13).replace("-", ""), 16),
    ).toISOString()}`,
  );

  await initHotfixSystem();
  setPrefFeatures(MODULES_KEYS);

  const enabledFeatures = JSON.parse(
    Services.prefs.getStringPref("noraneko.features.enabled", "{}"),
  ) as typeof MODULES_KEYS;

  const modules = await loadEnabledModules(enabledFeatures);
  await initializeModules(modules);
}

/** Hotswap modules with new versions */
export async function hotswapModules(_hotfixId?: string): Promise<boolean> {
  console.log("[noraneko] Starting module hotswap...");
  
  try {
    notifyHotswapStart();
    await cleanupAllModules();
    console.log("[noraneko] All modules cleaned up");
    
    const enabledFeatures = JSON.parse(
      Services.prefs.getStringPref("noraneko.features.enabled", "{}"),
    ) as typeof MODULES_KEYS;
    
    const modules = await loadEnabledModules(enabledFeatures);
    await initializeModulesForHotswap(modules);
    
    console.log("[noraneko] Module hotswap complete");
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
export async function hotswapSelectiveModules(moduleNames: string[]): Promise<boolean> {
  console.log(`[noraneko] Starting selective hotswap for: ${moduleNames.join(", ")}`);
  
  try {
    notifyHotswapStart();
    
    // Cleanup the specified modules and their dependents
    const cleanedUp = await cleanupSelectiveModules(moduleNames);
    console.log(`[noraneko] Cleaned up ${cleanedUp.length} modules: ${cleanedUp.join(", ")}`);
    
    const enabledFeatures = JSON.parse(
      Services.prefs.getStringPref("noraneko.features.enabled", "{}"),
    ) as typeof MODULES_KEYS;
    
    // Filter to only reload the cleaned up modules
    const cleanedUpSet = new Set(cleanedUp);
    const allModules = await loadEnabledModules(enabledFeatures);
    const modulesToReload = allModules.filter(m => cleanedUpSet.has(m.name));
    
    await initializeModulesForHotswap(modulesToReload);
    
    console.log(`[noraneko] Selective hotswap complete. Reloaded: ${modulesToReload.map(m => m.name).join(", ")}`);
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
  hotfixId: string,
  modulePaths: string[]
): Promise<boolean> {
  console.log(`[noraneko] Starting hash-based hotswap for hotfix: ${hotfixId}`);
  
  try {
    const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
    const hotfixDir = PathUtils.join(profileDir, "noraneko-hotfixes");
    
    // Analyze changes
    const { newState, comparison, recommendation } = await analyzeHotfixChanges(
      hotfixDir,
      hotfixId,
      modulePaths
    );
    
    logHashComparison(comparison);
    console.log(`[noraneko] Hotswap recommendation: ${recommendation.mode} - ${recommendation.reason}`);
    
    let success = false;
    
    switch (recommendation.mode) {
      case HotswapMode.NONE:
        console.log("[noraneko] No changes detected, skipping hotswap");
        success = true;
        break;
        
      case HotswapMode.FULL:
        console.log("[noraneko] deno.lock changed, performing full hotswap");
        success = await hotswapModules(hotfixId);
        break;
        
      case HotswapMode.SELECTIVE:
        console.log(`[noraneko] Selective hotswap for modules: ${recommendation.modulesToReload.join(", ")}`);
        success = await hotswapSelectiveModules(recommendation.modulesToReload);
        break;
    }
    
    // Save new hash state on success
    if (success) {
      saveHashState(newState);
      console.log("[noraneko] Hash state saved");
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
// Exports - Public API
// ============================================================================

// Main entry points
export { initScripts, hotswapModules, hotswapSelectiveModules, hotswapWithHashDetection, getLoadedModuleNames };

// Re-export for external use
export { 
  registerModule, 
  cleanupModule, 
  cleanupAllModules,
  cleanupSelectiveModules,
  notifyHotswapStart,
  notifyHotswapComplete,
  getRegisteredModuleNames,
  type ModuleMetadata,
  type HotswapEvent,
} from "./module-registry.ts";

// Re-export hash registry for external use
export {
  computeHash,
  computeFileHash,
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
} from "./hash-registry.ts";

// Re-export Result utilities from event-dispatcher-registry
export {
  type Result,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  mapResult,
} from "./event-dispatcher-registry.ts";
