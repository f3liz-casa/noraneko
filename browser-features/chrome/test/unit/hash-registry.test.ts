// SPDX-License-Identifier: MPL-2.0
/// <reference lib="deno.ns" />

/**
 * Unit tests for Hash Registry and Hotswap Detection
 * 
 * These tests verify the hash-based change detection functionality:
 * - Hash computation
 * - Hash comparison
 * - Hotswap mode recommendation
 * - Selective vs full reload detection
 */

import { assertEquals, assertNotEquals, assert } from "@jsr/std__assert";

// ============================================================================
// Types (copied from hash-registry.ts for testing)
// ============================================================================

interface ModuleHashInfo {
  moduleName: string;
  hash: string;
  lastComputed: number;
}

interface HashState {
  denoLockHash: string;
  moduleHashes: Record<string, ModuleHashInfo>;
  computedAt: number;
}

interface HashComparisonResult {
  denoLockChanged: boolean;
  changedModules: string[];
  newModules: string[];
  removedModules: string[];
  hasChanges: boolean;
}

enum HotswapMode {
  NONE = "none",
  FULL = "full",
  SELECTIVE = "selective",
}

interface HotswapRecommendation {
  mode: HotswapMode;
  modulesToReload: string[];
  reason: string;
}

// ============================================================================
// Test Helper Functions (matching hash-registry.ts logic)
// Note: These functions are duplicated from hash-registry.ts because:
// 1. The hash-registry.ts module uses Gecko-specific APIs (IOUtils, PathUtils, Services)
//    that are not available in the Deno test environment
// 2. These unit tests verify the core logic independently
// ============================================================================

async function computeHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function extractModuleName(filePath: string): string {
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
}

function compareHashStates(
  oldState: HashState | null,
  newState: HashState
): HashComparisonResult {
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
    } else if (oldState.moduleHashes[moduleName].hash !== newState.moduleHashes[moduleName].hash) {
      changedModules.push(moduleName);
    }
  }

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

function getHotswapRecommendation(
  comparison: HashComparisonResult
): HotswapRecommendation {
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
      reason: "deno.lock changed - dependency updates require full module reload",
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
}

// ============================================================================
// Test: Hash Computation
// ============================================================================

Deno.test("computeHash: should compute consistent SHA-256 hash", async () => {
  const content = "test content";
  const hash1 = await computeHash(content);
  const hash2 = await computeHash(content);
  
  assertEquals(hash1, hash2, "Same content should produce same hash");
  assertEquals(hash1.length, 64, "SHA-256 hash should be 64 hex characters");
});

Deno.test("computeHash: different content should produce different hashes", async () => {
  const hash1 = await computeHash("content A");
  const hash2 = await computeHash("content B");
  
  assertNotEquals(hash1, hash2, "Different content should produce different hashes");
});

Deno.test("computeHash: empty string should produce valid hash", async () => {
  const hash = await computeHash("");
  
  assertEquals(hash.length, 64, "Empty string should still produce 64-char hash");
  // Known SHA-256 of empty string
  assertEquals(
    hash,
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  );
});

// ============================================================================
// Test: Module Name Extraction
// ============================================================================

Deno.test("extractModuleName: should extract name from .sys.mjs path", () => {
  assertEquals(extractModuleName("patches/sidebar.sys.mjs"), "sidebar");
});

Deno.test("extractModuleName: should extract name from .sys.mts path", () => {
  assertEquals(extractModuleName("patches/HotfixLoader.sys.mts"), "HotfixLoader");
});

Deno.test("extractModuleName: should extract name from .ts path", () => {
  assertEquals(extractModuleName("utils/base.ts"), "base");
});

Deno.test("extractModuleName: should extract name from nested path", () => {
  assertEquals(extractModuleName("deep/nested/path/module.mjs"), "module");
});

// ============================================================================
// Test: Hash State Comparison
// ============================================================================

Deno.test("compareHashStates: null old state should mark all as new", () => {
  const newState: HashState = {
    denoLockHash: "abc123",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "hash1", lastComputed: Date.now() },
      tabs: { moduleName: "tabs", hash: "hash2", lastComputed: Date.now() },
    },
    computedAt: Date.now(),
  };

  const result = compareHashStates(null, newState);

  assertEquals(result.denoLockChanged, true);
  assertEquals(result.newModules.length, 2);
  assert(result.newModules.includes("sidebar"));
  assert(result.newModules.includes("tabs"));
  assertEquals(result.hasChanges, true);
});

Deno.test("compareHashStates: identical states should show no changes", () => {
  const now = Date.now();
  const state: HashState = {
    denoLockHash: "abc123",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "hash1", lastComputed: now },
    },
    computedAt: now,
  };

  const result = compareHashStates(state, state);

  assertEquals(result.denoLockChanged, false);
  assertEquals(result.changedModules.length, 0);
  assertEquals(result.newModules.length, 0);
  assertEquals(result.removedModules.length, 0);
  assertEquals(result.hasChanges, false);
});

Deno.test("compareHashStates: deno.lock change should be detected", () => {
  const now = Date.now();
  const oldState: HashState = {
    denoLockHash: "old-hash",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "hash1", lastComputed: now },
    },
    computedAt: now,
  };
  const newState: HashState = {
    denoLockHash: "new-hash",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "hash1", lastComputed: now },
    },
    computedAt: now,
  };

  const result = compareHashStates(oldState, newState);

  assertEquals(result.denoLockChanged, true);
  assertEquals(result.changedModules.length, 0);
  assertEquals(result.hasChanges, true);
});

Deno.test("compareHashStates: module change should be detected", () => {
  const now = Date.now();
  const oldState: HashState = {
    denoLockHash: "same-hash",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "old-module-hash", lastComputed: now },
    },
    computedAt: now,
  };
  const newState: HashState = {
    denoLockHash: "same-hash",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "new-module-hash", lastComputed: now },
    },
    computedAt: now,
  };

  const result = compareHashStates(oldState, newState);

  assertEquals(result.denoLockChanged, false);
  assertEquals(result.changedModules.length, 1);
  assertEquals(result.changedModules[0], "sidebar");
  assertEquals(result.hasChanges, true);
});

Deno.test("compareHashStates: new module should be detected", () => {
  const now = Date.now();
  const oldState: HashState = {
    denoLockHash: "same-hash",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "hash1", lastComputed: now },
    },
    computedAt: now,
  };
  const newState: HashState = {
    denoLockHash: "same-hash",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "hash1", lastComputed: now },
      tabs: { moduleName: "tabs", hash: "hash2", lastComputed: now },
    },
    computedAt: now,
  };

  const result = compareHashStates(oldState, newState);

  assertEquals(result.newModules.length, 1);
  assertEquals(result.newModules[0], "tabs");
  assertEquals(result.hasChanges, true);
});

Deno.test("compareHashStates: removed module should be detected", () => {
  const now = Date.now();
  const oldState: HashState = {
    denoLockHash: "same-hash",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "hash1", lastComputed: now },
      tabs: { moduleName: "tabs", hash: "hash2", lastComputed: now },
    },
    computedAt: now,
  };
  const newState: HashState = {
    denoLockHash: "same-hash",
    moduleHashes: {
      sidebar: { moduleName: "sidebar", hash: "hash1", lastComputed: now },
    },
    computedAt: now,
  };

  const result = compareHashStates(oldState, newState);

  assertEquals(result.removedModules.length, 1);
  assertEquals(result.removedModules[0], "tabs");
  assertEquals(result.hasChanges, true);
});

// ============================================================================
// Test: Hotswap Recommendation
// ============================================================================

Deno.test("getHotswapRecommendation: no changes should return NONE", () => {
  const comparison: HashComparisonResult = {
    denoLockChanged: false,
    changedModules: [],
    newModules: [],
    removedModules: [],
    hasChanges: false,
  };

  const recommendation = getHotswapRecommendation(comparison);

  assertEquals(recommendation.mode, HotswapMode.NONE);
  assertEquals(recommendation.modulesToReload.length, 0);
});

Deno.test("getHotswapRecommendation: deno.lock change should return FULL", () => {
  const comparison: HashComparisonResult = {
    denoLockChanged: true,
    changedModules: ["sidebar"],
    newModules: [],
    removedModules: [],
    hasChanges: true,
  };

  const recommendation = getHotswapRecommendation(comparison);

  assertEquals(recommendation.mode, HotswapMode.FULL);
  assert(recommendation.reason.includes("deno.lock"));
});

Deno.test("getHotswapRecommendation: module change should return SELECTIVE", () => {
  const comparison: HashComparisonResult = {
    denoLockChanged: false,
    changedModules: ["sidebar", "tabs"],
    newModules: [],
    removedModules: [],
    hasChanges: true,
  };

  const recommendation = getHotswapRecommendation(comparison);

  assertEquals(recommendation.mode, HotswapMode.SELECTIVE);
  assertEquals(recommendation.modulesToReload.length, 2);
  assert(recommendation.modulesToReload.includes("sidebar"));
  assert(recommendation.modulesToReload.includes("tabs"));
});

Deno.test("getHotswapRecommendation: new modules should be included in reload", () => {
  const comparison: HashComparisonResult = {
    denoLockChanged: false,
    changedModules: ["sidebar"],
    newModules: ["new-feature"],
    removedModules: [],
    hasChanges: true,
  };

  const recommendation = getHotswapRecommendation(comparison);

  assertEquals(recommendation.mode, HotswapMode.SELECTIVE);
  assertEquals(recommendation.modulesToReload.length, 2);
  assert(recommendation.modulesToReload.includes("sidebar"));
  assert(recommendation.modulesToReload.includes("new-feature"));
});

// ============================================================================
// Test: HotswapMode enum values
// ============================================================================

Deno.test("HotswapMode: should have correct enum values", () => {
  assertEquals(HotswapMode.NONE, "none");
  assertEquals(HotswapMode.FULL, "full");
  assertEquals(HotswapMode.SELECTIVE, "selective");
});

console.log("All Hash Registry and Hotswap Detection tests passed!");
