// SPDX-License-Identifier: MPL-2.0

/**
 * Module Data - Data-Oriented Programming Style
 *
 * Static module registry for build-time module loading.
 */

import type {
  ModulesKeys,
  ModulesRegistry,
} from "../types/mod.ts";

// ============================================================================
// Module Registry - Build-time static
// ============================================================================

/** All available modules by category */
export const MODULES: ModulesRegistry = { common: {}, static: {} };

/** Module keys by category (for preference management) */
export const MODULES_KEYS: ModulesKeys = { common: [], static: [] };
