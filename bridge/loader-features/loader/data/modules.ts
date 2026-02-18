// SPDX-License-Identifier: MPL-2.0

/**
 * Module Data - Data-Oriented Programming Style
 *
 * Module registry populated at runtime from the NMA manifest.
 * This removes the build-time dependency on browser-features/chrome.
 */

import type {
  ModuleCategory,
  ModulesKeys,
  ModulesRegistry,
} from "../types/mod.ts";
import type { NMAModule } from "../nma/types.ts";

// ============================================================================
// Module Registry - Runtime populated from NMA manifest
// ============================================================================

/** All available modules by category */
export const MODULES: ModulesRegistry = { common: {}, static: {} };

/** Module keys by category (for preference management) */
export const MODULES_KEYS: ModulesKeys = { common: [], static: [] };

// Prefixes used to identify and categorise NMA feature modules
const NMA_STATIC_PREFIX = "modules/static/";
const NMA_COMMON_PREFIX = "modules/";
const NMA_SKIP_PREFIXES = ["modules/external/", "modules/svg/"];

function isFeatureModule(name: string): boolean {
  if (!name.startsWith(NMA_COMMON_PREFIX)) return false;
  return !NMA_SKIP_PREFIXES.some((p) => name.startsWith(p));
}

/**
 * Populate the module registry from NMA manifest modules.
 * Must be called after the NMA system is initialized.
 * Noop loaders are provided as fallback; NMA handles actual loading.
 */
export function buildModulesFromNMA(nmaModules: NMAModule[]): void {
  const common: ModuleCategory = {};
  const staticMods: ModuleCategory = {};

  for (const mod of nmaModules) {
    if (!isFeatureModule(mod.name)) continue;
    const noop = async () => ({});
    if (mod.name.startsWith(NMA_STATIC_PREFIX)) {
      staticMods[mod.name] = noop;
    } else {
      common[mod.name] = noop;
    }
  }

  MODULES.common = common;
  MODULES.static = staticMods;
  MODULES_KEYS.common = Object.keys(common);
  MODULES_KEYS.static = Object.keys(staticMods);
}
