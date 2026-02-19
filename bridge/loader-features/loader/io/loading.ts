// SPDX-License-Identifier: MPL-2.0

/**
 * Loading IO - Data-Oriented Programming Style
 *
 * Side-effectful operations for preferences, NMA initialization, and module loading.
 */

import { MODULES } from "../data/mod.ts";
import { defaultMetadata } from "../ops/mod.ts";
import {
  isNMAActive,
  hasNMAModule,
  loadNMAModule,
  initializeNMALoader,
  getCurrentNMAManifest,
} from "../nma/mod.ts";
import type { LoadedModule, ModulesKeys } from "../types/mod.ts";

// ============================================================================
// Preferences
// ============================================================================

export const setPrefFeatures = (allFeaturesKeys: ModulesKeys): void => {
  const prefs = Services.prefs.getDefaultBranch("");
  prefs.setStringPref("noraneko.features.all", JSON.stringify(allFeaturesKeys));
  Services.prefs.lockPref("noraneko.features.all");
  prefs.setStringPref("noraneko.features.enabled", JSON.stringify(allFeaturesKeys));
};

export const getEnabledFeatures = (): ModulesKeys =>
  JSON.parse(
    Services.prefs.getStringPref("noraneko.features.enabled", "{}"),
  ) as ModulesKeys;

// ============================================================================
// NMA System
// ============================================================================

export const initNMASystem = async (): Promise<void> => {
  try {
    const success = await initializeNMALoader();
    if (success) {
      console.log("[noraneko] NMA system initialized successfully");
      const manifest = getCurrentNMAManifest();
      if (manifest) {
        console.log(`[noraneko] NMA build: ${manifest.buildId}`);
        console.log(`[noraneko] NMA version: ${manifest.noranekoVersion}`);
      }
    } else {
      console.log("[noraneko] NMA not found, using built-in modules");
    }
  } catch (error) {
    console.error("[noraneko] Failed to initialize NMA system:", error);
  }
};

// ============================================================================
// Module Loading
// ============================================================================

export const loadSingleModule = async (
  categoryValue: Record<string, () => Promise<unknown>>,
  moduleName: string,
): Promise<LoadedModule | null> => {
  if (isNMAActive() && hasNMAModule(moduleName)) {
    try {
      const exports = await loadNMAModule(moduleName);
      if (exports) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metadata = (exports as any).default?._metadata?.() ?? defaultMetadata(moduleName);
        console.debug(`[noraneko] Loaded module from NMA: ${moduleName}`);
        return { name: moduleName, metadata, ...(exports as any) };
      }
    } catch (e) {
      console.warn(`[noraneko] Failed to load NMA module ${moduleName}, falling back:`, e);
    }
  }

  try {
    const exports = await categoryValue[moduleName]();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = (exports as any).default?._metadata?.() ?? defaultMetadata(moduleName);
    console.debug(`[noraneko] Loaded module: ${moduleName}`);
    return { name: moduleName, metadata, ...(exports as any) };
  } catch (e) {
    console.error(`[noraneko] Failed to load module ${moduleName}:`, e);
    return null;
  }
};

export const loadEnabledModules = async (
  enabledFeatures: ModulesKeys,
): Promise<LoadedModule[]> => {
  const promises = Object.entries(MODULES).flatMap(
    ([categoryKey, categoryValue]) =>
      Object.keys(categoryValue)
        .filter(
          (moduleName) =>
            categoryKey in enabledFeatures &&
            enabledFeatures[categoryKey as keyof typeof enabledFeatures].includes(moduleName),
        )
        .map((moduleName) => loadSingleModule(categoryValue, moduleName)),
  );

  const results = await Promise.all(promises);
  return results.filter((m): m is LoadedModule => m !== null);
};
