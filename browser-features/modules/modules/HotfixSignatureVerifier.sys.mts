// SPDX-License-Identifier: MPL-2.0

/**
 * Hotfix Signature Verifier Module
 *
 * Implements Sigstore-based keyless signature verification for hotfix modules.
 * This module verifies that hotfixes are signed by the official Noraneko
 * GitHub Actions workflow using OIDC-based identity verification.
 *
 * Key Security Properties:
 * - No private keys to manage or leak
 * - Verification is based on OIDC identity (GitHub Actions)
 * - All signatures are recorded in Rekor transparency log
 * - Only official repository workflows can sign valid hotfixes
 *
 * This implementation uses @freedomofpress/sigstore-browser for robust
 * Sigstore verification with TUF-based trusted root management.
 */

import type {
  HotfixManifest,
  SignerIdentity,
  SigstoreBundle,
  TrustedSignerConfig,
  VerificationResult,
} from "../common/hotfix-types.ts";
import {
  DEFAULT_TRUSTED_SIGNER_CONFIG,
  VerificationStatus,
} from "../common/hotfix-types.ts";

// Import SigstoreVerifier from @freedomofpress/sigstore-browser
// This will be processed by tsdown and bundled appropriately
import { SigstoreVerifier } from "@freedomofpress/sigstore-browser";

// Lazy-loaded verifier instance
let verifierInstance: SigstoreVerifier | null = null;

/**
 * HotfixSignatureVerifier provides cryptographic verification of hotfix signatures
 * using Sigstore's keyless signing infrastructure via @freedomofpress/sigstore-browser.
 */
export class HotfixSignatureVerifier {
  private trustedConfig: TrustedSignerConfig;

  constructor(config?: TrustedSignerConfig) {
    this.trustedConfig = config ?? DEFAULT_TRUSTED_SIGNER_CONFIG;
  }

  /**
   * Lazy load and initialize the sigstore-browser verifier
   */
  private async getVerifier(): Promise<SigstoreVerifier> {
    if (verifierInstance) {
      return verifierInstance;
    }

    try {
      verifierInstance = new SigstoreVerifier({
        tlogThreshold: 1, // Require at least one transparency log entry
        ctlogThreshold: 1, // Require at least one SCT
        tsaThreshold: 0, // TSA timestamps are optional
      });

      // Load the Sigstore trusted root via TUF for secure updates
      await verifierInstance.loadSigstoreRootWithTUF();

      console.log("[HotfixVerifier] Sigstore verifier initialized successfully");
      return verifierInstance;
    } catch (error) {
      console.error("[HotfixVerifier] Failed to initialize sigstore verifier:", error);
      throw new Error("Failed to initialize Sigstore verifier");
    }
  }

  /**
   * Verify a hotfix manifest's signature and signer identity
   *
   * @param manifest - The hotfix manifest to verify
   * @param manifestContent - The raw manifest content that was signed
   * @returns VerificationResult with status and verified identity
   */
  async verifyManifest(
    manifest: HotfixManifest,
    manifestContent: string,
  ): Promise<VerificationResult> {
    try {
      // Step 1: Parse and validate the Sigstore bundle
      const bundle = this.parseSigstoreBundle(manifest.sigstoreBundle);
      if (!bundle) {
        return {
          isValid: false,
          status: VerificationStatus.INVALID_BUNDLE,
          errorMessage: "Failed to parse Sigstore bundle",
        };
      }

      // Step 2: Verify the signer identity is trusted
      const identityResult = this.verifySignerIdentity(
        manifest.sigstoreBundle.signerIdentity,
      );
      if (!identityResult.isValid) {
        return identityResult;
      }

      // Step 3: Use @freedomofpress/sigstore-browser for full verification
      try {
        const verifier = await this.getVerifier();
        const manifestBytes = new TextEncoder().encode(manifestContent);

        // Extract identity from the certificate extensions
        // The library will verify the certificate chain, transparency logs, and signature
        await verifier.verifyArtifact(
          manifest.sigstoreBundle.signerIdentity.subject,
          manifest.sigstoreBundle.signerIdentity.issuer,
          bundle,
          manifestBytes,
        );

        // All checks passed
        return {
          isValid: true,
          status: VerificationStatus.VALID,
          verifiedIdentity: manifest.sigstoreBundle.signerIdentity,
        };
      } catch (verificationError: any) {
        console.error("[HotfixVerifier] Sigstore verification failed:", verificationError);
        
        // Map verification errors to our status codes
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
        errorMessage:
          error instanceof Error ? error.message : "Unknown verification error",
      };
    }
  }

  /**
   * Parse the base64-encoded Sigstore bundle
   */
  private parseSigstoreBundle(
    sigstoreBundle: SigstoreBundle,
  ): Record<string, unknown> | null {
    try {
      const bundleJson = atob(sigstoreBundle.bundle);
      return JSON.parse(bundleJson);
    } catch (error) {
      console.error("[HotfixVerifier] Failed to parse Sigstore bundle:", error);
      return null;
    }
  }

  /**
   * Verify that the signer identity is from a trusted source
   */
  private verifySignerIdentity(identity: SignerIdentity): VerificationResult {
    // Check OIDC issuer
    if (!this.trustedConfig.allowedIssuers.includes(identity.issuer)) {
      return {
        isValid: false,
        status: VerificationStatus.UNTRUSTED_IDENTITY,
        errorMessage: `Untrusted OIDC issuer: ${identity.issuer}`,
      };
    }

    // Check repository pattern
    const repoMatches = this.trustedConfig.allowedRepositories.some((pattern) =>
      this.matchGlobPattern(pattern, identity.repository),
    );
    if (!repoMatches) {
      return {
        isValid: false,
        status: VerificationStatus.UNTRUSTED_IDENTITY,
        errorMessage: `Untrusted repository: ${identity.repository}`,
      };
    }

    // Check workflow pattern
    const workflowMatches = this.trustedConfig.allowedWorkflows.some(
      (pattern) => this.matchGlobPattern(pattern, identity.workflowRef),
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
  }

  /**
   * Simple glob pattern matching
   */
  private matchGlobPattern(pattern: string, value: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape special chars
      .replace(/\*/g, ".*") // Convert * to .*
      .replace(/\?/g, "."); // Convert ? to .

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(value);
  }

  /**
   * Compute SHA-256 hash of content for integrity verification
   */
  async computeHash(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }
}

// Export singleton instance
export const hotfixSignatureVerifier = new HotfixSignatureVerifier();
