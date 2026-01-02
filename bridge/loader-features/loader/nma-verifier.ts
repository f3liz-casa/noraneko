// SPDX-License-Identifier: MPL-2.0

/**
 * NMA (Noraneko Module Archive) Verifier
 *
 * Handles Sigstore-based signature verification for NMA files.
 * Uses the same verification infrastructure as the hotfix system
 * but with NMA-specific trusted configuration.
 *
 * Security Model:
 * - Verifies NMA is signed by trusted GitHub Actions workflow
 * - Validates signer identity (f3liz-dev/noraneko or noraneko-browser/noraneko)
 * - Checks archive hash integrity
 * - Records all signatures in Rekor transparency log
 */

import { SigstoreVerifier } from "@freedomofpress/sigstore-browser";

import {
  type NMAManifest,
  type NMATrustedConfig,
  type NMAVerificationResult,
  DEFAULT_NMA_TRUSTED_CONFIG,
  NMAVerificationStatus,
} from "./nma-types.ts";
import type { SignerIdentity, SigstoreBundle } from "./hotfix-types.ts";

// ============================================================================
// Module State
// ============================================================================

/** Lazy-loaded Sigstore verifier instance */
let _verifierInstance: SigstoreVerifier | null = null;

/** Trusted configuration */
let _trustedConfig: NMATrustedConfig = DEFAULT_NMA_TRUSTED_CONFIG;

// ============================================================================
// Configuration Functions
// ============================================================================

/** Set trusted configuration for NMA verification */
export const setNMATrustedConfig = (config: NMATrustedConfig): void => {
  _trustedConfig = config;
};

/** Get current trusted configuration */
export const getNMATrustedConfig = (): NMATrustedConfig => _trustedConfig;

// ============================================================================
// Verifier Instance Management
// ============================================================================

/** Get or create Sigstore verifier instance */
const getVerifier = async (): Promise<SigstoreVerifier> => {
  if (_verifierInstance) {
    return _verifierInstance;
  }

  try {
    _verifierInstance = new SigstoreVerifier({
      tlogThreshold: 1,
      ctlogThreshold: 1,
      tsaThreshold: 0,
    });

    await _verifierInstance.loadSigstoreRootWithTUF();
    console.log("[NMAVerifier] Sigstore verifier initialized");
    return _verifierInstance;
  } catch (error) {
    console.error("[NMAVerifier] Failed to initialize verifier:", error);
    throw new Error("Failed to initialize Sigstore verifier");
  }
};

// ============================================================================
// Helper Functions
// ============================================================================

/** Simple glob pattern matching */
const matchGlobPattern = (pattern: string, value: string): boolean => {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(value);
};

/** Compute SHA-256 hash of content */
export const computeNMAHash = async (content: string | Uint8Array): Promise<string> => {
  const data = typeof content === "string"
    ? new TextEncoder().encode(content)
    : content;
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

/** Validate base64 string format */
const isValidBase64 = (str: string): boolean => {
  if (!str || typeof str !== "string") return false;
  // Check for valid base64 characters (standard or URL-safe)
  const base64Regex = /^[A-Za-z0-9+/=]+$|^[A-Za-z0-9_-]+=*$/;
  // Check length is valid (multiple of 4 after padding)
  const stripped = str.replace(/=+$/, "");
  return base64Regex.test(str) && stripped.length % 4 !== 1;
};

/** Parse Sigstore bundle from base64 with validation */
const parseSigstoreBundle = (bundle: SigstoreBundle): Record<string, unknown> | null => {
  try {
    // Security: Validate base64 format before decoding
    if (!bundle.bundle || !isValidBase64(bundle.bundle)) {
      console.error("[NMAVerifier] Invalid base64 format in Sigstore bundle");
      return null;
    }
    
    const bundleJson = atob(bundle.bundle);
    const parsed = JSON.parse(bundleJson);
    
    // Validate it's an object
    if (!parsed || typeof parsed !== "object") {
      console.error("[NMAVerifier] Sigstore bundle is not a valid object");
      return null;
    }
    
    return parsed;
  } catch (error) {
    console.error("[NMAVerifier] Failed to parse Sigstore bundle:", error);
    return null;
  }
};

// ============================================================================
// Identity Verification
// ============================================================================

/** Verify signer identity is trusted for NMA */
const verifyNMASignerIdentity = (identity: SignerIdentity): NMAVerificationResult => {
  // Check OIDC issuer
  if (!_trustedConfig.allowedIssuers.includes(identity.issuer)) {
    return {
      isValid: false,
      status: NMAVerificationStatus.UNTRUSTED_SIGNER,
      errorMessage: `Untrusted OIDC issuer: ${identity.issuer}`,
    };
  }

  // Check repository pattern
  const repoMatches = _trustedConfig.allowedRepositories.some(pattern =>
    matchGlobPattern(pattern, identity.repository)
  );
  if (!repoMatches) {
    return {
      isValid: false,
      status: NMAVerificationStatus.UNTRUSTED_SIGNER,
      errorMessage: `Untrusted repository: ${identity.repository}`,
    };
  }

  // Check workflow pattern
  const workflowMatches = _trustedConfig.allowedWorkflows.some(pattern =>
    matchGlobPattern(pattern, identity.workflowRef)
  );
  if (!workflowMatches) {
    return {
      isValid: false,
      status: NMAVerificationStatus.UNTRUSTED_SIGNER,
      errorMessage: `Untrusted workflow: ${identity.workflowRef}`,
    };
  }

  return {
    isValid: true,
    status: NMAVerificationStatus.VALID,
    verifiedIdentity: identity,
  };
};

// ============================================================================
// Main Verification API
// ============================================================================

/**
 * Verify an NMA manifest's signature
 *
 * @param manifest - The NMA manifest to verify
 * @param manifestContent - Raw manifest content that was signed
 * @returns Verification result
 */
export const verifyNMAManifest = async (
  manifest: NMAManifest,
  manifestContent: string,
): Promise<NMAVerificationResult> => {
  try {
    // Step 1: Parse the Sigstore bundle
    const bundle = parseSigstoreBundle(manifest.sigstoreBundle);
    if (!bundle) {
      return {
        isValid: false,
        status: NMAVerificationStatus.INVALID_MANIFEST,
        errorMessage: "Failed to parse Sigstore bundle",
      };
    }

    // Step 2: Verify signer identity is trusted
    const identityResult = verifyNMASignerIdentity(manifest.sigstoreBundle.signerIdentity);
    if (!identityResult.isValid) {
      return identityResult;
    }

    // Step 3: Use Sigstore verifier for full verification
    try {
      const verifier = await getVerifier();
      const manifestBytes = new TextEncoder().encode(manifestContent);

      await verifier.verifyArtifact(
        manifest.sigstoreBundle.signerIdentity.subject,
        manifest.sigstoreBundle.signerIdentity.issuer,
        bundle,
        manifestBytes,
      );

      return {
        isValid: true,
        status: NMAVerificationStatus.VALID,
        verifiedIdentity: manifest.sigstoreBundle.signerIdentity,
        manifest,
      };
    } catch (verificationError: any) {
      console.error("[NMAVerifier] Sigstore verification failed:", verificationError);

      const errorMessage = verificationError.message || "Verification failed";

      if (errorMessage.includes("certificate")) {
        return {
          isValid: false,
          status: NMAVerificationStatus.SIGNATURE_INVALID,
          errorMessage: `Certificate verification failed: ${errorMessage}`,
        };
      } else if (errorMessage.includes("signature")) {
        return {
          isValid: false,
          status: NMAVerificationStatus.SIGNATURE_INVALID,
          errorMessage: `Signature verification failed: ${errorMessage}`,
        };
      } else {
        return {
          isValid: false,
          status: NMAVerificationStatus.UNKNOWN_ERROR,
          errorMessage,
        };
      }
    }
  } catch (error) {
    console.error("[NMAVerifier] Verification error:", error);
    return {
      isValid: false,
      status: NMAVerificationStatus.UNKNOWN_ERROR,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

/**
 * Verify NMA module hash integrity
 * Supports both filesystem paths and jar: URLs
 *
 * @param moduleUrl - jar: URL or filesystem path to the module
 * @param expectedHash - Expected SHA-256 hash
 * @returns True if hash matches
 */
export const verifyNMAModuleHash = async (
  moduleUrl: string,
  expectedHash: string,
): Promise<boolean> => {
  try {
    let content: string;
    
    // Handle jar: URLs (modules in NMA archive)
    if (moduleUrl.startsWith("jar:")) {
      const response = await fetch(moduleUrl);
      if (!response.ok) {
        console.error(`[NMAVerifier] Failed to fetch module: ${response.status}`);
        return false;
      }
      content = await response.text();
    } else {
      // Handle filesystem paths (fallback for extracted modules)
      content = await IOUtils.readUTF8(moduleUrl);
    }
    
    const actualHash = await computeNMAHash(content);
    return actualHash === expectedHash;
  } catch (error) {
    console.error(`[NMAVerifier] Failed to verify module hash: ${moduleUrl}`, error);
    return false;
  }
};

/**
 * Check if NMA is from a development build (unsigned allowed)
 */
export const isDevModeNMAAllowed = (): boolean => {
  try {
    const { AppConstants } = ChromeUtils.importESModule(
      "resource://gre/modules/AppConstants.sys.mjs",
    ) as { AppConstants: { MOZ_UPDATE_CHANNEL?: string; DEBUG?: boolean } };

    // Allow unsigned in debug builds or nightly channel
    const isDebug = AppConstants.DEBUG ?? false;
    const channel = AppConstants.MOZ_UPDATE_CHANNEL?.toLowerCase() ?? "";

    return _trustedConfig.allowUnsignedInDev && (isDebug || channel.includes("nightly"));
  } catch {
    return false;
  }
};

/**
 * Quick validation of NMA manifest structure
 */
export const validateNMAManifestStructure = (manifest: unknown): manifest is NMAManifest => {
  if (!manifest || typeof manifest !== "object") return false;

  const m = manifest as Record<string, unknown>;

  return (
    m.formatVersion === "1.0" &&
    typeof m.buildId === "string" &&
    typeof m.noranekoVersion === "string" &&
    typeof m.commitSha === "string" &&
    typeof m.builtAt === "string" &&
    Array.isArray(m.modules) &&
    Array.isArray(m.assets) &&
    typeof m.sigstoreBundle === "object" &&
    typeof m.archiveHash === "string"
  );
};
