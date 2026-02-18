// SPDX-License-Identifier: MPL-2.0

/**
 * NMA Module
 *
 * Re-exports the public API from the NMA subsystem.
 */

export * from "./types.ts";
export * from "./state.ts";
export * from "./loader.ts";
export {
  verifyNMAIdentity,
  verifyNMAManifest,
  computeSha256 as computeNMAHash,
} from "./verifier.ts";
export {
  resolveNMAPath as findNMAFile,
  readTextFile,
  computeFileHash,
  getStoredHashState,
  saveHashState,
  clearHashState,
} from "./io.ts";
export {
  analyzeNMAChanges,
  analyzeHotfixChanges,
  compareHashStates,
  getHotswapRecommendation,
  logHashComparison,
  extractModuleName,
  computeNMAHashState,
  computeHotfixHashState,
} from "./hashing.ts";

