// SPDX-License-Identifier: MPL-2.0

/**
 * Module Data - Data-Oriented Programming Style
 *
 * Collects and exports all available feature modules.
 * Uses pure data structures (Records/Maps).
 */

import { getFeaturesCommonEntries } from "#features-chrome/features/mod.ts";
import { getFeaturesStaticEntries } from "#features-chrome/static/mod.ts";

import type {
  ModuleCategory,
  ModuleLoader,
  ModulesKeys,
  ModulesRegistry,
} from "../types/mod.ts";

// ============================================================================
// Data Collection - Module Registry
// ============================================================================

/** Collect common modules from glob imports */
const collectCommonModules = (): ModuleCategory => {
  const entries = getFeaturesCommonEntries();
  const modules: ModuleCategory = {};

  for (const [key, loader] of Object.entries(entries)) {
    modules[key] = loader as ModuleLoader;
  }

  return modules;
};

/** Collect static modules from glob imports */
const collectStaticModules = (): ModuleCategory => {
  return getFeaturesStaticEntries();
};

// ============================================================================
// Exported Data - Module Registry
// ============================================================================

/** All available modules by category */
export const MODULES: ModulesRegistry = {
  common: collectCommonModules(),
  static: collectStaticModules(),
};

/** Module keys by category (for preference management) */
export const MODULES_KEYS: ModulesKeys = {
  common: Object.keys(MODULES.common),
  static: Object.keys(MODULES.static),
};
