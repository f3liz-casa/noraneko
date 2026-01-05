// SPDX-License-Identifier: MPL-2.0

/**
 * NMA Module (DOP/FP Style)
 *
 * Re-exports the API from the new organized structure.
 */

export * from "./types.ts";
export * from "./state.ts";
export * from "./loader.ts";
export {
  verifyNMAIdentity,
  verifyNMAManifest,
  verifyHotfixIdentity,
  verifyHotfixManifest,
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
  analyzeHotfixChanges,
  compareHashStates,
  getHotswapRecommendation,
  logHashComparison,
} from "./hashing.ts";
