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
): void => {
  if (!instance) return;

  registerModule(
    module.metadata.moduleName,
    instance,
    module.metadata,
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

  // Create instance - handle both old class-based and new ModuleHandle patterns.
  // ModuleHandle (from registerModule()) is a plain object with a `create` method;
  // it self-registers at import time, so we skip construction here.
  const isModuleHandle =
    module?.default !== null &&
    typeof module?.default === "object" &&
    typeof module?.default?.create === "function";
  const instance =
    !isModuleHandle && module?.default ? new module.default() : null;
  registerModuleInstance(module, instance);
  registerModuleLoadState(module.name, true);
};

/**
 * Initialize all modules
 * Side effect: validates, sorts, initializes modules, waits for SessionStore
 * Never throws - per-module errors are caught and logged.
 */
export const initializeModules = async (
  modules: LoadedModule[],
): Promise<void> => {
  const invalid = validateDependencies(modules);

  // Filter out modules with dependency issues and register them as failed so
  // dependents can fail fast via onModuleLoaded().
  const validModules = modules.filter((m) => {
    if (invalid.has(m.name)) {
      console.warn(`[noraneko] Skipping module ${m.name} due to dependency issues`);
      registerModuleLoadState(m.name, false);
      return false;
    }
    return true;
  });

  const sortedModules = sortByDependencies(validModules);

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
 * Never throws - per-module errors are caught and logged.
 */
export const initializeModulesForHotswap = async (
  modules: LoadedModule[],
): Promise<void> => {
  const invalid = validateDependencies(modules);

  const validModules = modules.filter((m) => {
    if (invalid.has(m.name)) {
      console.warn(`[noraneko] Hotswap skipping ${m.name}: dependency issues`);
      registerModuleLoadState(m.name, false);
      return false;
    }
    return true;
  });

  const sortedModules = sortByDependencies(validModules);

  for (const module of sortedModules) {
    try {
      console.log("[noraneko] Hotswap init: " + module.name);
      const isModuleHandle =
        module?.default !== null &&
        typeof module?.default === "object" &&
        typeof module?.default?.create === "function";
      const instance =
        !isModuleHandle && module?.default ? new module.default() : null;
      // NMA modules are always from the primary source
      registerModuleInstance(module, instance);
    } catch (e) {
      console.error(`[noraneko] Hotswap init failed for ${module.name}:`, e);
    }
  }
  console.log("[noraneko] Hotswap initialization complete");
};
