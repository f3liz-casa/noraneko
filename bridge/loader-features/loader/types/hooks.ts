// SPDX-License-Identifier: MPL-2.0

/**
 * Hooks Types - Data-Oriented Programming Style
 *
 * Type definitions for module load hooks.
 */

/** Deferred promise with settlement tracking */
export interface DeferredState {
  promise: Promise<void>;
  resolve: () => void;
  reject: (reason: any) => void;
  settled: boolean;
}
