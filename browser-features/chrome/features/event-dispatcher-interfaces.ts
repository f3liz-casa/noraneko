// SPDX-License-Identifier: MPL-2.0

/**
 * EventDispatcher type definitions with automatic type inference
 *
 * Types are automatically inferred from module metadata via declaration merging.
 * See features-event-dispatcher.d.ts for the inference system.
 *
 * All event methods automatically return Either<Error, T> for error safety.
 * Both hard and soft dependencies use Either - no distinction needed!
 * 
 * Note: Payloads don't need to be serializable as everything runs in one process.
 * This is an event dispatching system, not traditional RPC.
 */

import type {
  InferredEventDispatcherDependencies,
  FeatureEventMethods,
} from "./features-event-dispatcher.d.ts";

/**
 * Helper type to create typed event dispatcher object based on dependencies
 * Usage: EventDispatcherDependencies<["sidebar", "other-module"]>
 *
 * Types are automatically inferred from module metadata!
 * No manual interface declarations needed.
 *
 * All methods return Either<Error, T> for error-safe handling:
 * - Available modules: Either<Error, T>
 * - Missing modules: Either<Error, undefined>
 *
 * No distinction between hard and soft dependencies - Either handles both!
 */
export type EventDispatcherDependencies<T extends readonly (keyof FeatureEventMethods)[]> =
  InferredEventDispatcherDependencies<T, T>;

// Re-export for convenience
export type { FeatureEventMethods, InferredEventDispatcherDependencies };
