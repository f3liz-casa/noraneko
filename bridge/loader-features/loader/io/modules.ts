// SPDX-License-Identifier: MPL-2.0

/**
 * Module Loading IO - Data-Oriented Programming Style
 *
 * Side-effectful operations for loading modules from various sources.
 */

import { MODULES } from "../data/mod.ts";
import { defaultMetadata } from "../ops/mod.ts";
import { isNMAActive, hasNMAModule, loadNMAModule } from "../nma/mod.ts";
import type { LoadedModule, ModulesKeys } from "../types/mod.ts";

// ============================================================================
// Module Loading Operations
// ============================================================================

/**
 * Load a single module (NMA or built-in)
 * Side effect: dynamic import, console logging
 */
export const loadSingleModule = async (
  categoryValue: Record<string, () => Promise<unknown>>,
  moduleName: string,
): Promise<LoadedModule | null> => {
  // Priority 1: Check if module exists in NMA (primary module source)
  // NMA is the primary distribution format for browser-features/chrome modules
  if (isNMAActive() && hasNMAModule(moduleName)) {
    try {
      const exports = await loadNMAModule(moduleName);
      if (exports) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metadata =
          (exports as any).default?._metadata?.() ??
          defaultMetadata(moduleName);
        const module: LoadedModule = {
          name: moduleName,
          metadata,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(exports as {
            init?: typeof Function;
            initBeforeSessionStoreInit?: typeof Function;
            default?: any;
          }),
        };
        console.debug(`[noraneko] Loaded module from NMA: ${moduleName}`);
        return module;
      }
    } catch (e) {
      console.warn(
        `[noraneko] Failed to load NMA module ${moduleName}, falling back:`,
        e,
      );
    }
  }

  // Priority 2: Load from built-in modules (fallback)
  try {
    const exports = await categoryValue[moduleName]();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata =
      (exports as any).default?._metadata?.() ?? defaultMetadata(moduleName);

    const module: LoadedModule = {
      name: moduleName,
      metadata,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(exports as {
        init?: typeof Function;
        initBeforeSessionStoreInit?: typeof Function;
        default?: any;
      }),
    };
    console.debug(`[noraneko] Loaded module: ${moduleName}`);
    return module;
  } catch (e) {
    console.error(`[noraneko] Failed to load module ${moduleName}:`, e);
    return null;
  }
};

/**
 * Load all enabled modules
 * Side effect: dynamic imports from multiple sources
 */
export const loadEnabledModules = async (
  enabledFeatures: ModulesKeys,
): Promise<LoadedModule[]> => {
  const promises = Object.entries(MODULES).flatMap(
    ([categoryKey, categoryValue]) =>
      Object.keys(categoryValue)
        .filter(
          (moduleName) =>
            categoryKey in enabledFeatures &&
            enabledFeatures[
              categoryKey as keyof typeof enabledFeatures
            ].includes(moduleName),
        )
        .map((moduleName) => loadSingleModule(categoryValue, moduleName)),
  );

  const results = await Promise.all(promises);
  return results.filter((m): m is LoadedModule => m !== null);
};
