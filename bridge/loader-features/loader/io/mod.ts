// SPDX-License-Identifier: MPL-2.0

/**
 * IO Module - Data-Oriented Programming Style
 *
 * Re-exports all side-effectful operations.
 */

export { setPrefFeatures, getEnabledFeatures } from "./prefs.ts";

export { loadSingleModule, loadEnabledModules } from "./modules.ts";

export {
  registerModule,
  getModule,
  getAllModules,
  hasModule,
  unregisterModule,
  getRegisteredModuleNames,
  cleanupModule,
  cleanupAllModules,
  cleanupSelectiveModules,
  addHotswapListener,
  removeHotswapListener,
  notifyHotswapStart,
  notifyHotswapComplete,
} from "./registry.ts";

export {
  onModuleLoaded,
  registerModuleLoadState,
  rejectOtherLoadStates,
} from "./hooks.ts";

export { initNMASystem } from "./nma.ts";

export {
  registerModuleInstance,
  initModule,
  initializeModules,
  initializeModulesForHotswap,
} from "./init.ts";
