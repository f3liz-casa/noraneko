// SPDX-License-Identifier: MPL-2.0

/**
 * Get all feature module entries.
 * Supports both legacy `index.ts` and new `mod.ts` entry points.
 */
export function getFeaturesCommonEntries() {
  // New mod.ts style (Julia/Kotlin DOP style)
  const modEntries = import.meta.glob("./*/mod.ts");
  // Legacy index.ts style
  const indexEntries = import.meta.glob("./*/index.ts");

  // Merge, preferring mod.ts if both exist
  return { ...indexEntries, ...modEntries };
}
