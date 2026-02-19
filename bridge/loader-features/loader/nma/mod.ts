// SPDX-License-Identifier: MPL-2.0

export * from "./types.ts";
export * from "./state.ts";
export * from "./loader.ts";
export {
  verifyNMAIdentity,
  verifyNMAManifest,
  computeSha256 as computeNMAHash,
  resolveNMAPath as findNMAFile,
  readTextFile,
  computeFileHash,
  getStoredHashState,
  saveHashState,
  clearHashState,
  analyzeNMAChanges,
  analyzeHotfixChanges,
  compareHashStates,
  getHotswapRecommendation,
  logHashComparison,
  extractModuleName,
  computeNMAHashState,
  computeHotfixHashState,
} from "./core.ts";
