// SPDX-License-Identifier: MPL-2.0

/**
 * Hooks State - Data-Oriented Programming Style
 *
 * Module-level state for module load hooks.
 * Julia/Kotlin-like module-level state management.
 */

import type { DeferredState } from "../types/mod.ts";

// ============================================================================
// Module State - Hooks Data
// ============================================================================

/** Map of module name -> deferred state for load tracking */
const _moduleLoadStates: Map<string, DeferredState> = new Map();

/** Flag: has initialization completed (for rejecting late module requests) */
let _initCompleted = false;

// ============================================================================
// State Access Functions
// ============================================================================

export const getModuleLoadStatesMap = (): Map<string, DeferredState> =>
  _moduleLoadStates;

export const isInitCompleted = (): boolean => _initCompleted;

export const setInitCompleted = (value: boolean): void => {
  _initCompleted = value;
};
