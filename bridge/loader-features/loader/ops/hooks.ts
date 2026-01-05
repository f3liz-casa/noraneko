// SPDX-License-Identifier: MPL-2.0

/**
 * Hooks Operations - Data-Oriented Programming Style
 *
 * Pure functions for creating and managing deferred promises.
 */

import type { DeferredState } from "../types/mod.ts";

// ============================================================================
// Deferred Promise Creation
// ============================================================================

/**
 * Create a deferred promise with settlement tracking
 * Pure function that creates a new DeferredState object
 */
export const createDeferred = (): DeferredState => {
  let resolve: (() => void) | null = null;
  let reject: ((reason: any) => void) | null = null;
  const state: DeferredState = {
    promise: null as any,
    resolve: null as any,
    reject: null as any,
    settled: false,
  };

  state.promise = new Promise<void>((rs, rj) => {
    resolve = () => {
      state.settled = true;
      rs();
    };
    reject = (reason) => {
      state.settled = true;
      rj(reason);
    };
  });

  state.resolve = resolve!;
  state.reject = reject!;

  return state;
};
