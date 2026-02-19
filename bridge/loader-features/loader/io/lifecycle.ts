// SPDX-License-Identifier: MPL-2.0

/**
 * Lifecycle IO - Data-Oriented Programming Style
 *
 * Side-effectful operations for module load hooks, initialization, and registry management.
 */

import {
  getModuleLoadStatesMap,
  isInitCompleted,
  setInitCompleted,
  getModulesMap,
  getListenersSet,
} from "../state/mod.ts";
import {
  createDeferred,
  getSortedModulesForCleanup,
  getModulesForSelectiveCleanup,
  validateDependencies,
  sortByDependencies,
} from "../ops/mod.ts";
import type {
  LoadedModule,
  ModuleInfo,
  ModuleMetadata,
  HotswapEvent,
  HotswapListener,
} from "../types/mod.ts";

// ============================================================================
// Hooks
// ============================================================================

const getOrCreateDeferred = (module: string) => {
  const states = getModuleLoadStatesMap();
  if (!states.has(module)) {
    states.set(module, createDeferred());
  }
  return states.get(module)!;
};

export const onModuleLoaded = (module: string): Promise<void> => {
  if (isInitCompleted() && !getModuleLoadStatesMap().has(module)) {
    return Promise.reject(new Error("Module Not Found"));
  }
  return getOrCreateDeferred(module).promise;
};

export const registerModuleLoadState = (
  module: string,
  isLoaded: boolean,
): void => {
  const state = getOrCreateDeferred(module);
  if (isLoaded) {
    state.resolve();
  } else {
    state.reject(new Error(`Module Not Found: ${module}`));
  }
};

export const rejectOtherLoadStates = (): void => {
  const states = getModuleLoadStatesMap();
  for (const [moduleName, state] of states) {
    if (!state.settled) {
      state.reject(new Error(`Module Not Found: ${moduleName}`));
    }
  }
  setInitCompleted(true);
};

// ============================================================================
// Registry
// ============================================================================

export const registerModule = (
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any,
  metadata: ModuleMetadata,
  isNMAModule = true,
): void => {
  getModulesMap().set(name, { name, instance, metadata, loadedAt: Date.now(), isNMAModule });
  console.debug(`[noraneko] Registered module: ${name}`);
};

export const getModule = (name: string): ModuleInfo | undefined =>
  getModulesMap().get(name);

export const getAllModules = (): Map<string, ModuleInfo> =>
  new Map(getModulesMap());

export const hasModule = (name: string): boolean =>
  getModulesMap().has(name);

export const unregisterModule = (name: string): void => {
  getModulesMap().delete(name);
  console.debug(`[noraneko] Unregistered module: ${name}`);
};

export const getRegisteredModuleNames = (): string[] =>
  Array.from(getModulesMap().keys());

// ============================================================================
// Cleanup
// ============================================================================

const notifyListeners = (event: HotswapEvent): void => {
  for (const listener of getListenersSet()) {
    try {
      listener(event);
    } catch (error) {
      console.error("[noraneko] Hotswap listener error:", error);
    }
  }
};

export const cleanupModule = async (name: string): Promise<boolean> => {
  const moduleInfo = getModulesMap().get(name);
  if (!moduleInfo) {
    console.warn(`[noraneko] Module ${name} not found for cleanup`);
    return false;
  }
  try {
    if (moduleInfo.instance?.cleanup) {
      console.debug(`[noraneko] Cleaning up module: ${name}`);
      await moduleInfo.instance.cleanup();
    }
    notifyListeners({ type: "cleanup", moduleName: name, success: true, timestamp: Date.now() });
    return true;
  } catch (error) {
    console.error(`[noraneko] Cleanup failed for ${name}:`, error);
    notifyListeners({ type: "cleanup", moduleName: name, success: false, timestamp: Date.now() });
    return false;
  }
};

export const cleanupAllModules = async (): Promise<void> => {
  const modules = getModulesMap();
  for (const name of getSortedModulesForCleanup(modules)) {
    await cleanupModule(name);
    unregisterModule(name);
  }
  console.log("[noraneko] All modules cleaned up");
};

export const cleanupSelectiveModules = async (
  moduleNames: string[],
): Promise<string[]> => {
  const modules = getModulesMap();
  const targets = getModulesForSelectiveCleanup(moduleNames, modules);
  console.debug(`[noraneko] Selective cleanup targets: ${targets.join(", ")}`);
  for (const name of targets) {
    await cleanupModule(name);
    unregisterModule(name);
  }
  return targets;
};

// ============================================================================
// Hotswap Listeners
// ============================================================================

export const addHotswapListener = (listener: HotswapListener): void => {
  getListenersSet().add(listener);
};

export const removeHotswapListener = (listener: HotswapListener): void => {
  getListenersSet().delete(listener);
};

export const notifyHotswapStart = (): void =>
  notifyListeners({ type: "hotswap_start", timestamp: Date.now() });

export const notifyHotswapComplete = (success: boolean): void =>
  notifyListeners({ type: "hotswap_complete", success, timestamp: Date.now() });

// ============================================================================
// Initialization
// ============================================================================

const registerModuleInstance = (
  module: LoadedModule,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any,
): void => {
  if (!instance) return;
  registerModule(module.metadata.moduleName, instance, module.metadata);
};

const isModuleHandle = (mod: LoadedModule): boolean =>
  mod?.default !== null &&
  typeof mod?.default === "object" &&
  typeof mod?.default?.create === "function";

export const initModule = async (module: LoadedModule): Promise<void> => {
  console.log("init " + module.name);
  for (const dep of module.metadata.dependencies) {
    await onModuleLoaded(dep);
  }
  const instance = !isModuleHandle(module) && module?.default
    ? new module.default()
    : null;
  registerModuleInstance(module, instance);
  registerModuleLoadState(module.name, true);
};

export const initializeModules = async (
  modules: LoadedModule[],
): Promise<void> => {
  const invalid = validateDependencies(modules);
  const validModules = modules.filter((m) => {
    if (invalid.has(m.name)) {
      console.warn(`[noraneko] Skipping module ${m.name} due to dependency issues`);
      registerModuleLoadState(m.name, false);
      return false;
    }
    return true;
  });
  const sorted = sortByDependencies(validModules);

  for (const module of sorted) {
    try {
      await module?.initBeforeSessionStoreInit?.();
    } catch (e) {
      console.error(`[noraneko] initBeforeSessionStoreInit failed for ${module.name}:`, e);
    }
  }

  // @ts-expect-error SessionStore type not defined
  await SessionStore.promiseInitialized;

  for (const module of sorted) {
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

export const initializeModulesForHotswap = async (
  modules: LoadedModule[],
): Promise<void> => {
  const invalid = validateDependencies(modules);
  const sorted = sortByDependencies(
    modules.filter((m) => {
      if (invalid.has(m.name)) {
        console.warn(`[noraneko] Hotswap skipping ${m.name}: dependency issues`);
        registerModuleLoadState(m.name, false);
        return false;
      }
      return true;
    }),
  );

  for (const module of sorted) {
    try {
      console.log("[noraneko] Hotswap init: " + module.name);
      const instance = !isModuleHandle(module) && module?.default
        ? new module.default()
        : null;
      registerModuleInstance(module, instance);
    } catch (e) {
      console.error(`[noraneko] Hotswap init failed for ${module.name}:`, e);
    }
  }
  console.log("[noraneko] Hotswap initialization complete");
};
