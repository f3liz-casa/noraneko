// SPDX-License-Identifier: MPL-2.0
/// <reference lib="deno.ns" />

/**
 * Unit tests for Hotfix System Types and Verification Logic
 *
 * These tests verify the core hotfix functionality including:
 * - Manifest structure validation
 * - Signer identity verification
 * - Glob pattern matching for trusted sources
 */

import { assertEquals, assertNotEquals } from "@jsr/std__assert";
import {
  DEFAULT_TRUSTED_SIGNER_CONFIG,
  HotfixStatus,
  VerificationStatus,
  type HotfixManifest,
  type SignerIdentity,
  type TrustedSignerConfig,
} from "../../../modules/common/hotfix-types.ts";

// Test helper: Create a mock manifest
function createMockManifest(overrides: Partial<HotfixManifest> = {}): HotfixManifest {
  return {
    id: "test-hotfix",
    version: "1.0.0",
    description: "Test hotfix for unit tests",
    unlockCode: "NK-TEST",
    patches: [
      {
        moduleName: "sidebar",
        originalModulePath: "resource://noraneko/modules/sidebar.sys.mjs",
        patchedModulePath: "patches/sidebar.sys.mjs",
        patchedModuleHash: "abc123def456",
      },
    ],
    sigstoreBundle: {
      bundle: btoa("{}"),
      signerIdentity: {
        issuer: "https://token.actions.githubusercontent.com",
        subject: "https://github.com/noraneko-browser/noraneko/.github/workflows/hotfix_sign.yml@refs/heads/main",
        repository: "noraneko-browser/noraneko",
        workflowRef: ".github/workflows/hotfix_sign.yml@refs/heads/main",
      },
      rekorLogId: "test-log-id",
      signedAt: new Date().toISOString(),
    },
    createdAt: new Date().toISOString(),
    minVersion: "0.1.0",
    ...overrides,
  };
}

// Test helper: Glob pattern matching (copied from verifier for testing)
function matchGlobPattern(pattern: string, value: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
}

// Tests for Manifest Structure

Deno.test("HotfixManifest: should have required fields", () => {
  const manifest = createMockManifest();
  
  assertNotEquals(manifest.id, undefined, "id should be defined");
  assertNotEquals(manifest.version, undefined, "version should be defined");
  assertNotEquals(manifest.unlockCode, undefined, "unlockCode should be defined");
  assertNotEquals(manifest.patches, undefined, "patches should be defined");
  assertNotEquals(manifest.sigstoreBundle, undefined, "sigstoreBundle should be defined");
});

Deno.test("HotfixManifest: unlock code format should be valid", () => {
  const manifest = createMockManifest();
  
  // Unlock code should match pattern NK-XXXX
  const unlockCodePattern = /^NK-[A-Z0-9]{4}$/;
  assertEquals(
    unlockCodePattern.test(manifest.unlockCode),
    true,
    `Unlock code ${manifest.unlockCode} should match NK-XXXX pattern`,
  );
});

// Tests for Signer Identity Verification

Deno.test("SignerIdentity: should accept trusted GitHub Actions issuer", () => {
  const identity: SignerIdentity = {
    issuer: "https://token.actions.githubusercontent.com",
    subject: "test-subject",
    repository: "noraneko-browser/noraneko",
    workflowRef: ".github/workflows/hotfix_sign.yml@refs/heads/main",
  };
  
  assertEquals(
    DEFAULT_TRUSTED_SIGNER_CONFIG.allowedIssuers.includes(identity.issuer),
    true,
    "GitHub Actions issuer should be trusted",
  );
});

Deno.test("SignerIdentity: should reject untrusted issuer", () => {
  const identity: SignerIdentity = {
    issuer: "https://malicious-issuer.example.com",
    subject: "test-subject",
    repository: "noraneko-browser/noraneko",
    workflowRef: ".github/workflows/hotfix_sign.yml@refs/heads/main",
  };
  
  assertEquals(
    DEFAULT_TRUSTED_SIGNER_CONFIG.allowedIssuers.includes(identity.issuer),
    false,
    "Untrusted issuer should be rejected",
  );
});

// Tests for Glob Pattern Matching

Deno.test("GlobPattern: should match exact repository name", () => {
  const pattern = "noraneko-browser/noraneko";
  const value = "noraneko-browser/noraneko";
  
  assertEquals(matchGlobPattern(pattern, value), true);
});

Deno.test("GlobPattern: should match wildcard repository pattern", () => {
  const pattern = "*/noraneko";
  
  assertEquals(matchGlobPattern(pattern, "fork-user/noraneko"), true);
  assertEquals(matchGlobPattern(pattern, "another-org/noraneko"), true);
  assertEquals(matchGlobPattern(pattern, "noraneko-browser/different-repo"), false);
});

Deno.test("GlobPattern: should match workflow patterns", () => {
  const pattern = ".github/workflows/hotfix*.yml";
  
  assertEquals(matchGlobPattern(pattern, ".github/workflows/hotfix_sign.yml"), true);
  assertEquals(matchGlobPattern(pattern, ".github/workflows/hotfix.yml"), true);
  assertEquals(matchGlobPattern(pattern, ".github/workflows/hotfix_test.yml"), true);
  assertEquals(matchGlobPattern(pattern, ".github/workflows/package.yml"), false);
});

// Tests for Hotfix Status

Deno.test("HotfixStatus: should have correct status values", () => {
  assertEquals(HotfixStatus.AVAILABLE, "AVAILABLE");
  assertEquals(HotfixStatus.PENDING_APPROVAL, "PENDING_APPROVAL");
  assertEquals(HotfixStatus.INSTALLED, "INSTALLED");
  assertEquals(HotfixStatus.FAILED, "FAILED");
  assertEquals(HotfixStatus.REVERTED, "REVERTED");
});

// Tests for Verification Status

Deno.test("VerificationStatus: should have correct status values", () => {
  assertEquals(VerificationStatus.VALID, "VALID");
  assertEquals(VerificationStatus.INVALID_BUNDLE, "INVALID_BUNDLE");
  assertEquals(VerificationStatus.SIGNATURE_MISMATCH, "SIGNATURE_MISMATCH");
  assertEquals(VerificationStatus.UNTRUSTED_IDENTITY, "UNTRUSTED_IDENTITY");
  assertEquals(VerificationStatus.REKOR_VERIFICATION_FAILED, "REKOR_VERIFICATION_FAILED");
});

// Tests for Default Trusted Config

Deno.test("TrustedSignerConfig: should have GitHub Actions as default issuer", () => {
  assertEquals(
    DEFAULT_TRUSTED_SIGNER_CONFIG.allowedIssuers.length,
    1,
    "Should have exactly one allowed issuer",
  );
  assertEquals(
    DEFAULT_TRUSTED_SIGNER_CONFIG.allowedIssuers[0],
    "https://token.actions.githubusercontent.com",
  );
});

Deno.test("TrustedSignerConfig: should allow official and fork repositories", () => {
  const repos = DEFAULT_TRUSTED_SIGNER_CONFIG.allowedRepositories;
  
  assertEquals(repos.includes("noraneko-browser/noraneko"), true, "Should allow official repo");
  assertEquals(repos.includes("*/noraneko"), true, "Should allow forks");
});

Deno.test("TrustedSignerConfig: should only allow hotfix workflows", () => {
  const workflows = DEFAULT_TRUSTED_SIGNER_CONFIG.allowedWorkflows;
  
  assertEquals(
    workflows.some((w) => w.includes("hotfix")),
    true,
    "Should have hotfix workflow pattern",
  );
});

// Tests for Version Comparison (helper for testing)

function compareVersions(a: string, b: string): number {
  const aParts = a.split(".").map(Number);
  const bParts = b.split(".").map(Number);
  const maxLen = Math.max(aParts.length, bParts.length);

  for (let i = 0; i < maxLen; i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

Deno.test("VersionComparison: should compare versions correctly", () => {
  assertEquals(compareVersions("1.0.0", "1.0.0"), 0);
  assertEquals(compareVersions("1.0.0", "2.0.0"), -1);
  assertEquals(compareVersions("2.0.0", "1.0.0"), 1);
  assertEquals(compareVersions("1.1.0", "1.0.0"), 1);
  assertEquals(compareVersions("1.0.1", "1.0.0"), 1);
  assertEquals(compareVersions("1.0", "1.0.0"), 0);
});
