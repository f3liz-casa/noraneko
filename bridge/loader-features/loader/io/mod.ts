// SPDX-License-Identifier: MPL-2.0

export {
  onModuleLoaded,
  registerModuleLoadState,
  rejectOtherLoadStates,
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
  initModule,
  initializeModules,
  initializeModulesForHotswap,
} from "./lifecycle.ts";

export {
  setPrefFeatures,
  getEnabledFeatures,
  initNMASystem,
  loadSingleModule,
  loadEnabledModules,
} from "./loading.ts";
