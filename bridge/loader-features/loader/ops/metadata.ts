// SPDX-License-Identifier: MPL-2.0

/**
 * Module Metadata Operations - Data-Oriented Programming Style
 *
 * Pure functions for creating module metadata.
 */

import type { ModuleMetadata } from "../types/mod.ts";

// ============================================================================
// Metadata Creation
// ============================================================================

/**
 * Create default metadata for a module
 * Pure function with no side effects
 */
export const defaultMetadata = (moduleName: string): ModuleMetadata => ({
  moduleName,
  dependencies: [],
  softDependencies: [],
});
