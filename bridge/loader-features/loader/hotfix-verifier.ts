// SPDX-License-Identifier: MPL-2.0

/**
 * Hotfix Signature Verifier - Data-Oriented Programming Style
 * 
 * Julia/Kotlin-like functional patterns:
 * - Pure functions for verification logic
 * - No classes, just functions
 * 
 * Implements Sigstore-based keyless signature verification.
 */

import {
  type HotfixManifest,
  type SignerIdentity,
  type SigstoreBundle,
  type TrustedSignerConfig,
  type VerificationResult,
  DEFAULT_TRUSTED_SIGNER_CONFIG,
  VerificationStatus,
} from "./hotfix-types.ts";

// Import SigstoreVerifier from @freedomofpress/sigstore-browser
import { SigstoreVerifier } from "@freedomofpress/sigstore-browser";

// ============================================================================
// Module State - Data
// ============================================================================

/** Lazy-loaded verifier instance */
let _verifierInstance: SigstoreVerifier | null = null;

/** Trusted signer configuration */
let _trustedConfig: TrustedSignerConfig = DEFAULT_TRUSTED_SIGNER_CONFIG;

// ============================================================================
// Pure Functions - Configuration
// ============================================================================

/** Set trusted signer configuration */
export const setTrustedConfig = (config: TrustedSignerConfig): void => {
  _trustedConfig = config;
};

/** Get current trusted configuration */
export const getTrustedConfig = (): TrustedSignerConfig => _trustedConfig;

// ============================================================================
// Pure Functions - Verifier Instance
// ============================================================================

/** Get or create the Sigstore verifier instance */
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

    console.log("[HotfixVerifier] Sigstore verifier initialized successfully");
    return _verifierInstance;
  } catch (error) {
    console.error("[HotfixVerifier] Failed to initialize sigstore verifier:", error);
    throw new Error("Failed to initialize Sigstore verifier");
  }
};

// ============================================================================
// Pure Functions - Glob Pattern Matching
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

// ============================================================================
// Pure Functions - Identity Verification
// ============================================================================

/** Verify that the signer identity is from a trusted source */
const verifySignerIdentity = (identity: SignerIdentity): VerificationResult => {
  // Check OIDC issuer
  if (!_trustedConfig.allowedIssuers.includes(identity.issuer)) {
    return {
      isValid: false,
      status: VerificationStatus.UNTRUSTED_IDENTITY,
      errorMessage: `Untrusted OIDC issuer: ${identity.issuer}`,
    };
  }

  // Check repository pattern
  const repoMatches = _trustedConfig.allowedRepositories.some((pattern) =>
    matchGlobPattern(pattern, identity.repository),
  );
  if (!repoMatches) {
    return {
      isValid: false,
      status: VerificationStatus.UNTRUSTED_IDENTITY,
      errorMessage: `Untrusted repository: ${identity.repository}`,
    };
  }

  // Check workflow pattern
  const workflowMatches = _trustedConfig.allowedWorkflows.some((pattern) =>
    matchGlobPattern(pattern, identity.workflowRef),
  );
  if (!workflowMatches) {
    return {
      isValid: false,
      status: VerificationStatus.UNTRUSTED_IDENTITY,
      errorMessage: `Untrusted workflow: ${identity.workflowRef}`,
    };
  }

  return {
    isValid: true,
    status: VerificationStatus.VALID,
    verifiedIdentity: identity,
  };
};

// ============================================================================
// Pure Functions - Bundle Parsing
// ============================================================================

/** Parse the base64-encoded Sigstore bundle */
const parseSigstoreBundle = (sigstoreBundle: SigstoreBundle): Record<string, unknown> | null => {
  try {
    const bundleJson = atob(sigstoreBundle.bundle);
    return JSON.parse(bundleJson);
  } catch (error) {
    console.error("[HotfixVerifier] Failed to parse Sigstore bundle:", error);
    return null;
  }
};

// ============================================================================
// Pure Functions - Hash Computation
// ============================================================================

/** Compute SHA-256 hash of content */
export const computeHash = async (content: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

// ============================================================================
// Public API - Manifest Verification
// ============================================================================

/**
 * Verify a hotfix manifest's signature and signer identity
 */
export const verifyManifest = async (
  manifest: HotfixManifest,
  manifestContent: string,
): Promise<VerificationResult> => {
  try {
    // Step 1: Parse and validate the Sigstore bundle
    const bundle = parseSigstoreBundle(manifest.sigstoreBundle);
    if (!bundle) {
      return {
        isValid: false,
        status: VerificationStatus.INVALID_BUNDLE,
        errorMessage: "Failed to parse Sigstore bundle",
      };
    }

    // Step 2: Verify the signer identity is trusted
    const identityResult = verifySignerIdentity(manifest.sigstoreBundle.signerIdentity);
    if (!identityResult.isValid) {
      return identityResult;
    }

    // Step 3: Use @freedomofpress/sigstore-browser for full verification
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
        status: VerificationStatus.VALID,
        verifiedIdentity: manifest.sigstoreBundle.signerIdentity,
      };
    } catch (verificationError: any) {
      console.error("[HotfixVerifier] Sigstore verification failed:", verificationError);

      const errorMessage = verificationError.message || "Verification failed";

      if (errorMessage.includes("certificate")) {
        return {
          isValid: false,
          status: VerificationStatus.INVALID_BUNDLE,
          errorMessage: `Certificate verification failed: ${errorMessage}`,
        };
      } else if (errorMessage.includes("signature")) {
        return {
          isValid: false,
          status: VerificationStatus.SIGNATURE_MISMATCH,
          errorMessage: `Signature verification failed: ${errorMessage}`,
        };
      } else if (errorMessage.includes("transparency") || errorMessage.includes("rekor")) {
        return {
          isValid: false,
          status: VerificationStatus.REKOR_VERIFICATION_FAILED,
          errorMessage: `Transparency log verification failed: ${errorMessage}`,
        };
      } else {
        return {
          isValid: false,
          status: VerificationStatus.UNKNOWN_ERROR,
          errorMessage,
        };
      }
    }
  } catch (error) {
    console.error("[HotfixVerifier] Verification error:", error);
    return {
      isValid: false,
      status: VerificationStatus.UNKNOWN_ERROR,
      errorMessage: error instanceof Error ? error.message : "Unknown verification error",
    };
  }
};
