// SPDX-License-Identifier: MPL-2.0

/**
 * Registry IO - Data-Oriented Programming Style
 *
 * Side-effectful operations for module registry management.
 */

import { getModulesMap, getListenersSet } from "../state/mod.ts";
import {
  getSortedModulesForCleanup,
  getModulesForSelectiveCleanup,
} from "../ops/mod.ts";
import type {
  ModuleInfo,
  ModuleMetadata,
  HotswapEvent,
  HotswapListener,
} from "../types/mod.ts";

// ============================================================================
// Registry Operations
// ============================================================================

/**
 * Register a loaded module
 * Side effect: modifies global module registry state
 */
export const registerModule = (
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instance: any,
  metadata: ModuleMetadata,
  isNMAModule = true,
): void => {
  const modules = getModulesMap();
  modules.set(name, {
    name,
    instance,
    metadata,
    loadedAt: Date.now(),
    isNMAModule,
  });

  console.debug(`[noraneko] Registered module: ${name}`);
};

/**
 * Get a module's info
 * Side effect: reads from global state
 */
export const getModule = (name: string): ModuleInfo | undefined => {
  return getModulesMap().get(name);
};

/**
 * Get all registered modules (returns a copy)
 * Side effect: reads from global state
 */
export const getAllModules = (): Map<string, ModuleInfo> => {
  return new Map(getModulesMap());
};

/**
 * Check if a module is registered
 * Side effect: reads from global state
 */
export const hasModule = (name: string): boolean => {
  return getModulesMap().has(name);
};

/**
 * Unregister a module (after cleanup)
 * Side effect: modifies global registry state
 */
export const unregisterModule = (name: string): void => {
  const modules = getModulesMap();
  modules.delete(name);
  console.debug(`[noraneko] Unregistered module: ${name}`);
};

/**
 * Get list of all registered module names
 * Side effect: reads from global state
 */
export const getRegisteredModuleNames = (): string[] => {
  return Array.from(getModulesMap().keys());
};

// ============================================================================
// Cleanup Operations
// ============================================================================

/**
 * Run cleanup on a specific module
 * Side effect: calls module cleanup, modifies state, logs
 */
export const cleanupModule = async (name: string): Promise<boolean> => {
  const modules = getModulesMap();
  const moduleInfo = modules.get(name);

  if (!moduleInfo) {
    console.warn(`[noraneko] Module ${name} not found for cleanup`);
    return false;
  }

  try {
    // Call cleanup if available
    if (moduleInfo.instance?.cleanup) {
      console.debug(`[noraneko] Cleaning up module: ${name}`);
      await moduleInfo.instance.cleanup();
    }

    // Notify listeners
    notifyListeners({
      type: "cleanup",
      moduleName: name,
      success: true,
      timestamp: Date.now(),
    });

    return true;
  } catch (error) {
    console.error(`[noraneko] Cleanup failed for ${name}:`, error);
    notifyListeners({
      type: "cleanup",
      moduleName: name,
      success: false,
      timestamp: Date.now(),
    });
    return false;
  }
};

/**
 * Run cleanup on all modules
 * Side effect: calls cleanup on all modules in reverse dependency order
 */
export const cleanupAllModules = async (): Promise<void> => {
  const modules = getModulesMap();
  const sortedNames = getSortedModulesForCleanup(modules);

  for (const name of sortedNames) {
    await cleanupModule(name);
    unregisterModule(name);
  }

  console.log("[noraneko] All modules cleaned up");
};

/**
 * Run cleanup on specific modules and their dependents
 * Side effect: selective cleanup, returns list of cleaned modules
 */
export const cleanupSelectiveModules = async (
  moduleNames: string[],
): Promise<string[]> => {
  const modules = getModulesMap();
  const modulesToCleanup = getModulesForSelectiveCleanup(moduleNames, modules);

  console.debug(
    `[noraneko] Selective cleanup targets: ${modulesToCleanup.join(", ")}`,
  );

  for (const name of modulesToCleanup) {
    await cleanupModule(name);
    unregisterModule(name);
  }

  return modulesToCleanup;
};

// ============================================================================
// Hotswap Listener Operations
// ============================================================================

/**
 * Notify all listeners of a hotswap event
 * Side effect: calls all registered listeners
 */
const notifyListeners = (event: HotswapEvent): void => {
  const listeners = getListenersSet();
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("[noraneko] Hotswap listener error:", error);
    }
  }
};

/**
 * Add a listener for hotswap events
 * Side effect: modifies global listeners set
 */
export const addHotswapListener = (listener: HotswapListener): void => {
  getListenersSet().add(listener);
};

/**
 * Remove a hotswap listener
 * Side effect: modifies global listeners set
 */
export const removeHotswapListener = (listener: HotswapListener): void => {
  getListenersSet().delete(listener);
};

/**
 * Notify listeners that hotswap is starting
 * Side effect: broadcasts event to all listeners
 */
export const notifyHotswapStart = (): void => {
  notifyListeners({
    type: "hotswap_start",
    timestamp: Date.now(),
  });
};

/**
 * Notify listeners that hotswap has completed
 * Side effect: broadcasts event to all listeners
 */
export const notifyHotswapComplete = (success: boolean): void => {
  notifyListeners({
    type: "hotswap_complete",
    success,
    timestamp: Date.now(),
  });
};
