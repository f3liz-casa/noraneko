// SPDX-License-Identifier: MPL-2.0

/**
 * Module Initialization IO - Data-Oriented Programming Style
 *
 * Side-effectful operations for module initialization.
 */

import { validateDependencies, sortByDependencies } from "../ops/mod.ts";
import { registerModule } from "./registry.ts";
import {
  onModuleLoaded,
  registerModuleLoadState,
  rejectOtherLoadStates,
} from "./hooks.ts";
import type { LoadedModule } from "../types/mod.ts";

// ============================================================================
// Module Instance Registration
// ============================================================================

/**
 * Register module instance and event methods
 * Side effect: modifies global registry
 */
export const registerModuleInstance = (
  module: LoadedModule,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any,
  isHotfix: boolean,
): void => {
  if (!instance) return;

  registerModule(
    module.metadata.moduleName,
    instance,
    module.metadata,
    isHotfix,
  );
};

// ============================================================================
// Module Initialization
// ============================================================================

/**
 * Initialize a single module
 * Side effect: creates instances, calls init, logs
 */
export const initModule = async (module: LoadedModule): Promise<void> => {
  console.log("init " + module.name);

  // Wait for hard dependencies
  for (const dep of module.metadata.dependencies) {
    await onModuleLoaded(dep);
  }

  // Create instance (decorator auto-runs init via constructor)
  const instance = module?.default ? new module.default() : null;
  registerModuleInstance(module, instance, false);
  registerModuleLoadState(module.name, true);
};

/**
 * Initialize all modules
 * Side effect: validates, sorts, initializes modules, waits for SessionStore
 */
export const initializeModules = async (
  modules: LoadedModule[],
): Promise<void> => {
  validateDependencies(modules);
  const sortedModules = sortByDependencies(modules);

  // Run initBeforeSessionStoreInit
  for (const module of sortedModules) {
    try {
      await module?.initBeforeSessionStoreInit?.();
    } catch (e) {
      console.error(
        `[noraneko] initBeforeSessionStoreInit failed for ${module.name}:`,
        e,
      );
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
      registerModuleLoadState(module.name, false);
    }
  }

  registerModuleLoadState("__init_all__", true);
  rejectOtherLoadStates();
};

/**
 * Initialize modules during hotswap (no session store wait)
 * Side effect: validates, sorts, initializes modules
 */
export const initializeModulesForHotswap = async (
  modules: LoadedModule[],
): Promise<void> => {
  validateDependencies(modules);
  const sortedModules = sortByDependencies(modules);

  for (const module of sortedModules) {
    try {
      console.log("[noraneko] Hotswap init: " + module.name);
      const instance = module?.default ? new module.default() : null;
      // NMA modules are always from the primary source, not hotfixes
      registerModuleInstance(module, instance, false);
    } catch (e) {
      console.error(`[noraneko] Hotswap init failed for ${module.name}:`, e);
    }
  }
  console.log("[noraneko] Hotswap initialization complete");
};
