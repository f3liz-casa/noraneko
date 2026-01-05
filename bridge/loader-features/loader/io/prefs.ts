// SPDX-License-Identifier: MPL-2.0

/**
 * Preferences IO - Data-Oriented Programming Style
 *
 * Side-effectful operations for preference management.
 */

import type { ModulesKeys } from "../types/mod.ts";

// ============================================================================
// Preference Operations
// ============================================================================

/**
 * Set up preferences for features
 * Side effect: modifies Firefox preferences
 */
export const setPrefFeatures = (allFeaturesKeys: ModulesKeys): void => {
  const prefs = Services.prefs.getDefaultBranch("");
  prefs.setStringPref("noraneko.features.all", JSON.stringify(allFeaturesKeys));
  Services.prefs.lockPref("noraneko.features.all");
  prefs.setStringPref(
    "noraneko.features.enabled",
    JSON.stringify(allFeaturesKeys),
  );
};

/**
 * Get enabled features from preferences
 * Side effect: reads from Firefox preferences
 */
export const getEnabledFeatures = (): ModulesKeys => {
  return JSON.parse(
    Services.prefs.getStringPref("noraneko.features.enabled", "{}"),
  ) as ModulesKeys;
};
