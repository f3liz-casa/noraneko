// SPDX-License-Identifier: MPL-2.0

/**
 * Module Hooks - Data-Oriented Programming Style
 * 
 * Julia/Kotlin-like functional patterns:
 * - Module-level state (data) + pure functions
 * - Deferred promises for module load coordination
 * - No classes, just data and functions
 */

// ============================================================================
// Types - Deferred Promise with settlement tracking
// ============================================================================

interface DeferredState {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: any) => void;
  settled: boolean;
}

// ============================================================================
// Module State - Data (Julia-like module-level state)
// ============================================================================

/** Map of module name -> deferred state for load tracking */
const _moduleLoadStates: Map<string, DeferredState> = new Map();

/** Flag: has initialization completed (for rejecting late module requests) */
let _initCompleted = false;

// ============================================================================
// Internal Functions - Helpers
// ============================================================================

/**
 * Create a deferred promise with settlement tracking
 */
const createDeferred = (): DeferredState => {
  let resolve: (() => void) | null = null;
  let reject: ((reason: any) => void) | null = null;
  const state: DeferredState = {
    promise: null as any,
    resolve: null as any,
    reject: null as any,
    settled: false,
  };
  
  state.promise = new Promise<void>((rs, rj) => {
    resolve = () => { state.settled = true; rs(); };
    reject = (reason) => { state.settled = true; rj(reason); };
  });
  
  state.resolve = resolve!;
  state.reject = reject!;
  
  return state;
};

/**
 * Get or create deferred state for a module
 */
const getOrCreateDeferred = (module: string): DeferredState => {
  if (!_moduleLoadStates.has(module)) {
    _moduleLoadStates.set(module, createDeferred());
  }
  return _moduleLoadStates.get(module)!;
};

// ============================================================================
// Public API - Module Load Hooks
// ============================================================================

/**
 * Wait for a module to be loaded
 * Returns a promise that resolves when the module loads
 */
export function onModuleLoaded(module: string): Promise<void> {
  // If init is complete and module doesn't exist, reject immediately
  if (_initCompleted && !_moduleLoadStates.has(module)) {
    return Promise.reject(new Error("Module Not Found"));
  }
  
  return getOrCreateDeferred(module).promise;
}

/**
 * Register a module's load state (success or failure)
 */
export function _registerModuleLoadState(module: string, isLoaded: boolean): void {
  const state = getOrCreateDeferred(module);
  
  if (isLoaded) {
    state.resolve();
  } else {
    state.reject(new Error(`Module Not Found: ${module}`));
  }
}

/**
 * Reject all pending module load promises that haven't resolved
 * Called after all modules are initialized
 */
export function _rejectOtherLoadStates(): void {
  // Efficiently check settlement state without creating new promises
  for (const [moduleName, state] of _moduleLoadStates) {
    if (!state.settled) {
      state.reject(new Error(`Module Not Found: ${moduleName}`));
    }
  }
  
  _initCompleted = true;
}

// ============================================================================
// Re-exports - Convenient access from single module
// ============================================================================

// Re-export EventDispatcher registry functions
export {
  registerModuleEventDispatcher,
  unregisterModuleEventDispatcher,
  isModuleRegistered,
  createDependencyEventDispatchers,
  // New Result type utilities
  type Result,
  ok,
  err,
  isOk,
  isErr,
  unwrap,
  unwrapOr,
  mapResult,
  toEither,
  fromEither,
} from "./event-dispatcher-registry.ts";

// Re-export module registry functions for hotswapping support
export {
  registerModule,
  getModule,
  getAllModules,
  hasModule,
  cleanupModule,
  cleanupAllModules,
  cleanupSelectiveModules,
  getModulesForSelectiveCleanup,
  getRegisteredModuleNames,
  unregisterModule,
  addHotswapListener,
  removeHotswapListener,
  notifyHotswapStart,
  notifyHotswapComplete,
} from "./module-registry.ts";

export type { 
  HotswapEvent, 
  HotswapListener, 
  ModuleInfo, 
  ModuleMetadata 
} from "./module-registry.ts";

// Re-export hash registry functions for change detection
export {
  computeHash,
  computeFileHash,
  extractModuleName,
  getStoredHashState,
  saveHashState,
  clearHashState,
  computeHotfixHashState,
  compareHashStates,
  getHotswapRecommendation,
  analyzeHotfixChanges,
  logHashComparison,
  HotswapMode,
} from "./hash-registry.ts";

export type {
  HashState,
  ModuleHashInfo,
  HashComparisonResult,
  HotswapRecommendation,
} from "./hash-registry.ts";

// Re-export hotfix loader functions
export {
  initializeHotfixSystem,
  getInstalledHotfixes,
  isModuleDisabled,
  fetchAvailableHotfixes,
  downloadHotfix,
  installHotfix,
  applyHotfix,
  revertHotfix,
  getPatchedModulePath,
  validateUnlockCode,
  requestUserConsent,
  stopAutoUpdateChecking,
  hotswapModules as hotfixHotswapModules,
  getCurrentChannel,
} from "./hotfix-loader.ts";

// Re-export hotfix verifier
export {
  verifyManifest,
  computeHash as computeSignatureHash,
  setTrustedConfig,
  getTrustedConfig,
} from "./hotfix-verifier.ts";

// Re-export hotfix types
export {
  type HotfixManifest,
  type HotfixPatch,
  type SignerIdentity,
  type VerificationResult,
  type InstalledHotfix,
  HotfixStatus,
  UpdateChannel,
  VerificationStatus,
} from "./hotfix-types.ts";
