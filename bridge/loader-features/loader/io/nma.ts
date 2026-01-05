// SPDX-License-Identifier: MPL-2.0

/**
 * NMA IO - Data-Oriented Programming Style
 *
 * Side-effectful operations for NMA system initialization.
 */

import { initializeNMALoader, getCurrentNMAManifest } from "../nma/mod.ts";

// ============================================================================
// NMA System Operations
// ============================================================================

/**
 * Initialize the NMA (Noraneko Module Archive) system
 * Side effect: loads NMA, logs to console
 */
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
