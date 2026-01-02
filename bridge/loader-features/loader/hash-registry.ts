// SPDX-License-Identifier: MPL-2.0

/**
 * Hash Registry - Tracks file hashes for hotswap detection
 * 
 * This module provides functionality to:
 * 1. Compute SHA-256 hashes for deno.lock and module files
 * 2. Store and compare hashes to detect changes
 * 3. Determine whether a full reload or selective reload is needed
 * 
 * Julia/Kotlin-like functional patterns:
 * - Pure functions for hash computation
 * - Module-level state for hash storage
 */

// ============================================================================
// Types - Data Structures
// ============================================================================

/** Hash information for a single module */
export interface ModuleHashInfo {
  moduleName: string;
  hash: string;
  lastComputed: number;
}

/** Hash state for the entire system */
export interface HashState {
  /** Hash of deno.lock file */
  denoLockHash: string;
  /** Hash map of module name -> hash */
  moduleHashes: Record<string, ModuleHashInfo>;
  /** Timestamp when hashes were computed */
  computedAt: number;
}

/** Result of hash comparison */
export interface HashComparisonResult {
  /** Whether deno.lock has changed */
  denoLockChanged: boolean;
  /** List of modules that have changed */
  changedModules: string[];
  /** List of modules that are new (not in previous state) */
  newModules: string[];
  /** List of modules that were removed */
  removedModules: string[];
  /** Whether any change was detected */
  hasChanges: boolean;
}

/** Hotswap mode based on hash comparison */
export enum HotswapMode {
  /** No changes detected, no hotswap needed */
  NONE = "none",
  /** Full reload needed (deno.lock changed) */
  FULL = "full",
  /** Selective reload (only specific modules changed) */
  SELECTIVE = "selective",
}

/** Hotswap recommendation based on hash comparison */
export interface HotswapRecommendation {
  mode: HotswapMode;
  modulesToReload: string[];
  reason: string;
}

// ============================================================================
// Module State - Data
// ============================================================================

/** Preference key for stored hash state */
const PREF_HASH_STATE = "noraneko.hotfix.hash_state";

// ============================================================================
// Pure Functions - Hash Computation
// ============================================================================

/**
 * Compute SHA-256 hash of a string
 */
export async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compute SHA-256 hash of a file
 * @param filePath - Path to the file
 * @returns Hash string or null if file doesn't exist
 */
export async function computeFileHash(filePath: string): Promise<string | null> {
  try {
    const content = await IOUtils.readUTF8(filePath);
    return await computeHash(content);
  } catch (error) {
    console.warn(`[HashRegistry] Failed to read file for hashing: ${filePath}`, error);
    return null;
  }
}

/**
 * Get the path to deno.lock in the hotfix directory
 * @param hotfixDir - Base hotfix directory
 * @param hotfixId - Hotfix ID
 */
export function getHotfixDenoLockPath(hotfixDir: string, hotfixId: string): string {
  return PathUtils.join(hotfixDir, hotfixId, "deno.lock");
}

/**
 * Get the path to a module file in the hotfix directory
 * @param hotfixDir - Base hotfix directory
 * @param hotfixId - Hotfix ID
 * @param modulePath - Relative module path
 */
export function getHotfixModulePath(
  hotfixDir: string,
  hotfixId: string,
  modulePath: string
): string {
  return PathUtils.join(hotfixDir, hotfixId, modulePath);
}

// ============================================================================
// Public API - Hash State Management
// ============================================================================

/**
 * Get stored hash state from preferences
 */
export function getStoredHashState(): HashState | null {
  try {
    const stored = Services.prefs.getStringPref(PREF_HASH_STATE, "");
    if (!stored) return null;
    return JSON.parse(stored) as HashState;
  } catch {
    return null;
  }
}

/**
 * Save hash state to preferences
 */
export function saveHashState(state: HashState): void {
  Services.prefs.setStringPref(PREF_HASH_STATE, JSON.stringify(state));
}

/**
 * Clear stored hash state
 */
export function clearHashState(): void {
  Services.prefs.clearUserPref(PREF_HASH_STATE);
}

/**
 * Compute hash state for a hotfix
 * @param hotfixDir - Base hotfix directory
 * @param hotfixId - Hotfix ID
 * @param modulePaths - List of module file paths (relative to hotfix dir)
 */
export async function computeHotfixHashState(
  hotfixDir: string,
  hotfixId: string,
  modulePaths: string[]
): Promise<HashState> {
  // Compute deno.lock hash
  const denoLockPath = getHotfixDenoLockPath(hotfixDir, hotfixId);
  const denoLockHash = await computeFileHash(denoLockPath) ?? "";

  // Compute module hashes
  const moduleHashes: Record<string, ModuleHashInfo> = {};
  const now = Date.now();

  for (const modulePath of modulePaths) {
    const fullPath = getHotfixModulePath(hotfixDir, hotfixId, modulePath);
    const hash = await computeFileHash(fullPath);
    
    if (hash) {
      // Extract module name from path
      const moduleName = extractModuleName(modulePath);
      moduleHashes[moduleName] = {
        moduleName,
        hash,
        lastComputed: now,
      };
    }
  }

  return {
    denoLockHash,
    moduleHashes,
    computedAt: now,
  };
}

/**
 * Extract module name from file path
 * e.g., "patches/sidebar.sys.mjs" -> "sidebar"
 */
export function extractModuleName(filePath: string): string {
  // Get the filename from the path (use string manipulation for cross-platform compatibility)
  const parts = filePath.split("/");
  const fileName = parts[parts.length - 1] || filePath;
  // Remove common extensions
  return fileName
    .replace(/\.sys\.mjs$/, "")
    .replace(/\.sys\.mts$/, "")
    .replace(/\.mjs$/, "")
    .replace(/\.mts$/, "")
    .replace(/\.js$/, "")
    .replace(/\.ts$/, "")
    .replace(/\.tsx$/, "");
}

/**
 * Compare two hash states and determine what changed
 */
export function compareHashStates(
  oldState: HashState | null,
  newState: HashState
): HashComparisonResult {
  // If no old state, everything is new
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

  // Find changed and new modules
  for (const moduleName of newModuleNames) {
    if (!oldModuleNames.has(moduleName)) {
      newModules.push(moduleName);
    } else if (oldState.moduleHashes[moduleName].hash !== newState.moduleHashes[moduleName].hash) {
      changedModules.push(moduleName);
    }
  }

  // Find removed modules
  for (const moduleName of oldModuleNames) {
    if (!newModuleNames.has(moduleName)) {
      removedModules.push(moduleName);
    }
  }

  const hasChanges = denoLockChanged || 
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
}

/**
 * Get hotswap recommendation based on hash comparison
 */
export function getHotswapRecommendation(
  comparison: HashComparisonResult
): HotswapRecommendation {
  if (!comparison.hasChanges) {
    return {
      mode: HotswapMode.NONE,
      modulesToReload: [],
      reason: "No changes detected",
    };
  }

  // If deno.lock changed, we need full reload because dependencies changed
  if (comparison.denoLockChanged) {
    return {
      mode: HotswapMode.FULL,
      modulesToReload: [],
      reason: "deno.lock changed - dependency updates require full module reload",
    };
  }

  // If only specific modules changed, selective reload
  const modulesToReload = [
    ...comparison.changedModules,
    ...comparison.newModules,
  ];

  return {
    mode: HotswapMode.SELECTIVE,
    modulesToReload,
    reason: `${modulesToReload.length} module(s) changed`,
  };
}

/**
 * Full workflow: compute hashes, compare with stored, and get recommendation
 */
export async function analyzeHotfixChanges(
  hotfixDir: string,
  hotfixId: string,
  modulePaths: string[]
): Promise<{
  newState: HashState;
  comparison: HashComparisonResult;
  recommendation: HotswapRecommendation;
}> {
  const oldState = getStoredHashState();
  const newState = await computeHotfixHashState(hotfixDir, hotfixId, modulePaths);
  const comparison = compareHashStates(oldState, newState);
  const recommendation = getHotswapRecommendation(comparison);

  return {
    newState,
    comparison,
    recommendation,
  };
}

/**
 * Log hash comparison results for debugging
 */
export function logHashComparison(comparison: HashComparisonResult): void {
  console.log("[HashRegistry] Hash comparison results:");
  console.log(`  - deno.lock changed: ${comparison.denoLockChanged}`);
  console.log(`  - Changed modules: ${comparison.changedModules.join(", ") || "none"}`);
  console.log(`  - New modules: ${comparison.newModules.join(", ") || "none"}`);
  console.log(`  - Removed modules: ${comparison.removedModules.join(", ") || "none"}`);
  console.log(`  - Has changes: ${comparison.hasChanges}`);
}
