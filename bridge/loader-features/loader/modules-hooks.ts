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
// Types - Deferred Promise tuple [promise, resolve, reject]
// ============================================================================

type DeferredPromise = [Promise<void>, () => void, (reason: any) => void];

// ============================================================================
// Module State - Data (Julia-like module-level state)
// ============================================================================

/** Map of module name -> deferred promise for load state */
const _moduleLoadStates: Map<string, DeferredPromise> = new Map();

/** Flag: has initialization completed (for rejecting late module requests) */
let _initCompleted = false;

// ============================================================================
// Internal Functions - Helpers
// ============================================================================

/**
 * Create a deferred promise (Julia-like tuple pattern)
 * Returns [promise, resolve, reject]
 */
const createDeferred = (): DeferredPromise => {
  let resolve: (() => void) | null = null;
  let reject: ((reason: any) => void) | null = null;
  
  const promise = new Promise<void>((rs, rj) => {
    resolve = rs;
    reject = rj;
  });
  
  return [promise, resolve!, reject!];
};

/**
 * Get or create deferred promise for a module
 */
const getOrCreateDeferred = (module: string): DeferredPromise => {
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
  
  const [promise] = getOrCreateDeferred(module);
  return promise;
}

/**
 * Register a module's load state (success or failure)
 */
export function _registerModuleLoadState(module: string, isLoaded: boolean): void {
  const [, resolve, reject] = getOrCreateDeferred(module);
  
  if (isLoaded) {
    resolve();
  } else {
    reject(new Error(`Failed to load module: ${module}`));
  }
}

/**
 * Reject all pending module load promises that haven't resolved
 * Called after all modules are initialized
 */
export async function _rejectOtherLoadStates(): Promise<void> {
  // Check each module's promise to see if it's still pending
  for (const [, [promise, , reject]] of _moduleLoadStates) {
    // Race with an empty object to check if promise is pending
    const sentinel = {};
    const result = await Promise.race([promise, Promise.resolve(sentinel)]);
    
    if (result === sentinel) {
      // Promise is still pending, reject it
      reject(new Error("Module Not Found"));
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
  moduleRegistry,
  registerModule,
  getModule,
  getAllModules,
  hasModule,
  cleanupModule,
  cleanupAllModules,
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
