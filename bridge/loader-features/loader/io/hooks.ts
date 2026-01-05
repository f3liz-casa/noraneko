// SPDX-License-Identifier: MPL-2.0

/**
 * Hooks IO - Data-Oriented Programming Style
 *
 * Side-effectful operations for module load hooks.
 */

import {
  getModuleLoadStatesMap,
  isInitCompleted,
  setInitCompleted,
} from "../state/mod.ts";
import { createDeferred } from "../ops/mod.ts";

// ============================================================================
// Module Load Hooks Operations
// ============================================================================

/**
 * Get or create deferred state for a module
 * Side effect: may modify global state map
 */
const getOrCreateDeferred = (module: string) => {
  const states = getModuleLoadStatesMap();
  if (!states.has(module)) {
    states.set(module, createDeferred());
  }
  return states.get(module)!;
};

/**
 * Wait for a module to be loaded
 * Returns a promise that resolves when the module loads
 * Side effect: reads from global state
 */
export const onModuleLoaded = (module: string): Promise<void> => {
  // If init is complete and module doesn't exist, reject immediately
  if (isInitCompleted() && !getModuleLoadStatesMap().has(module)) {
    return Promise.reject(new Error("Module Not Found"));
  }

  return getOrCreateDeferred(module).promise;
};

/**
 * Register a module's load state (success or failure)
 * Side effect: resolves or rejects deferred promises
 */
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

/**
 * Reject all pending module load promises that haven't resolved
 * Called after all modules are initialized
 * Side effect: modifies global state, rejects promises
 */
export const rejectOtherLoadStates = (): void => {
  const states = getModuleLoadStatesMap();
  // Efficiently check settlement state without creating new promises
  for (const [moduleName, state] of states) {
    if (!state.settled) {
      state.reject(new Error(`Module Not Found: ${moduleName}`));
    }
  }

  setInitCompleted(true);
};
