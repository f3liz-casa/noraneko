// SPDX-License-Identifier: MPL-2.0

/**
 * Operations Module - Data-Oriented Programming Style
 *
 * Re-exports all pure operations.
 */

export {
  validateDependencies,
  sortByDependencies,
  buildDependedByGraph,
  getSortedModulesForCleanup,
  getModulesForSelectiveCleanup,
} from "./validation.ts";

export { createDeferred } from "./hooks.ts";

export { defaultMetadata } from "./metadata.ts";
