// SPDX-License-Identifier: MPL-2.0

/**
 * NMA Hashing Logic
 *
 * Pure functions for hash comparison and hotswap analysis.
 */

import {
  type ModuleHashInfo,
  type HashState,
  type HashComparisonResult,
  type HotswapRecommendation,
  HotswapMode,
} from "./types.ts";

import * as IO from "./io.ts";

// ============================================================================
// Logic
// ============================================================================

export const extractModuleName = (filePath: string): string => {
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1] || filePath;
  return fileName
    .replace(/\.sys\.mjs$/, "")
    .replace(/\.sys\.mts$/, "")
    .replace(/\.mjs$/, "")
    .replace(/\.mts$/, "")
    .replace(/\.js$/, "")
    .replace(/\.ts$/, "")
    .replace(/\.tsx$/, "");
};

export const computeNMAHashState = async (
  nmaDir: string,
  buildId: string,
  modulePaths: string[],
): Promise<HashState> => {
  const moduleHashes: Record<string, ModuleHashInfo> = {};
  const now = Date.now();

  for (const modulePath of modulePaths) {
    const fullPath = IO.getNMAModulePath(nmaDir, buildId, modulePath);
    const hash = await IO.computeFileHash(fullPath);

    if (hash) {
      const moduleName = extractModuleName(modulePath);
      moduleHashes[moduleName] = { moduleName, hash, lastComputed: now };
    }
  }

  return { denoLockHash: "", moduleHashes, computedAt: now };
};

/** @deprecated Use computeNMAHashState */
export const computeHotfixHashState = computeNMAHashState;

export const compareHashStates = (
  oldState: HashState | null,
  newState: HashState,
): HashComparisonResult => {
  if (!oldState) {
    return {
      denoLockChanged: true,
      changedModules: [],
      newModules: Object.keys(newState.moduleHashes),
      removedModules: [],
      hasChanges: true,
    };
  }

  const denoLockChanged = oldState.denoLockHash !== newState.denoLockHash;
  const oldModuleNames = new Set(Object.keys(oldState.moduleHashes));
  const newModuleNames = new Set(Object.keys(newState.moduleHashes));

  const changedModules: string[] = [];
  const newModules: string[] = [];
  const removedModules: string[] = [];

  for (const moduleName of newModuleNames) {
    if (!oldModuleNames.has(moduleName)) {
      newModules.push(moduleName);
    } else if (
      oldState.moduleHashes[moduleName].hash !==
      newState.moduleHashes[moduleName].hash
    ) {
      changedModules.push(moduleName);
    }
  }

  for (const moduleName of oldModuleNames) {
    if (!newModuleNames.has(moduleName)) {
      removedModules.push(moduleName);
    }
  }

  const hasChanges =
    denoLockChanged ||
    changedModules.length > 0 ||
    newModules.length > 0 ||
    removedModules.length > 0;

  return {
    denoLockChanged,
    changedModules,
    newModules,
    removedModules,
    hasChanges,
  };
};

export const getHotswapRecommendation = (
  comparison: HashComparisonResult,
): HotswapRecommendation => {
  if (!comparison.hasChanges) {
    return {
      mode: HotswapMode.NONE,
      modulesToReload: [],
      reason: "No changes detected",
    };
  }

  if (comparison.denoLockChanged) {
    return {
      mode: HotswapMode.FULL,
      modulesToReload: [],
      reason:
        "deno.lock changed - dependency updates require full module reload",
    };
  }

  const modulesToReload = [
    ...comparison.changedModules,
    ...comparison.newModules,
  ];

  return {
    mode: HotswapMode.SELECTIVE,
    modulesToReload,
    reason: `${modulesToReload.length} module(s) changed`,
  };
};

export const analyzeNMAChanges = async (
  nmaDir: string,
  buildId: string,
  modulePaths: string[],
): Promise<{
  newState: HashState;
  comparison: HashComparisonResult;
  recommendation: HotswapRecommendation;
}> => {
  const oldState = IO.getStoredHashState();
  const newState = await computeNMAHashState(nmaDir, buildId, modulePaths);
  const comparison = compareHashStates(oldState, newState);
  const recommendation = getHotswapRecommendation(comparison);

  return { newState, comparison, recommendation };
};

/** @deprecated Use analyzeNMAChanges */
export const analyzeHotfixChanges = analyzeNMAChanges;

export const logHashComparison = (comparison: HashComparisonResult): void => {
  console.log("[Hash] Comparison results:");
  console.log(`  - deno.lock changed: ${comparison.denoLockChanged}`);
  console.log(`  - Changed: ${comparison.changedModules.join(", ") || "none"}`);
  console.log(`  - New: ${comparison.newModules.join(", ") || "none"}`);
  console.log(`  - Removed: ${comparison.removedModules.join(", ") || "none"}`);
};

