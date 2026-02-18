// SPDX-License-Identifier: MPL-2.0

/**
 * NMA Verifier
 *
 * Handles Sigstore-based signature verification for NMA archives.
 * Pure logic + crypto operations. Separated from IO.
 */

import { SigstoreVerifier } from "@freedomofpress/sigstore-browser";
import {
  type NMAVerificationResult,
  NMAVerificationStatus,
  type SignerIdentity,
  type SigstoreBundle,
  type NMATrustedConfig,
  type NMAManifest,
} from "./types.ts";

import { getNMATrustedConfig } from "./state.ts";

// ============================================================================
// Core Verifier Instance
// ============================================================================

let _verifierInstance: SigstoreVerifier | null = null;

const getVerifier = async (): Promise<SigstoreVerifier> => {
  if (_verifierInstance) return _verifierInstance;

  try {
    _verifierInstance = new SigstoreVerifier({
      tlogThreshold: 1,
      ctlogThreshold: 1,
      tsaThreshold: 0,
    });
    await _verifierInstance.loadSigstoreRootWithTUF();
    return _verifierInstance;
  } catch (error) {
    console.error("[NMA] Failed to initialize verifier:", error);
    throw new Error("Failed to initialize Sigstore verifier");
  }
};

// ============================================================================
// Crypto Helpers
// ============================================================================

export const computeSha256 = async (
  content: string | Uint8Array,
): Promise<string> => {
  const data =
    typeof content === "string" ? new TextEncoder().encode(content) : content;
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const matchGlobPattern = (pattern: string, value: string): boolean => {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${regexPattern}$`).test(value);
};

const isValidBase64 = (str: string): boolean => {
  if (!str || typeof str !== "string") return false;
  const base64Regex = /^[A-Za-z0-9+/=]+$|^[A-Za-z0-9_-]+=*$/;
  const stripped = str.replace(/=+$/, "");
  return base64Regex.test(str) && stripped.length % 4 !== 1;
};

const parseSigstoreBundle = (
  bundle: SigstoreBundle,
): Record<string, unknown> | null => {
  try {
    if (!bundle.bundle || !isValidBase64(bundle.bundle)) return null;
    const bundleJson = atob(bundle.bundle);
    const parsed = JSON.parse(bundleJson);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

// ============================================================================
// Identity Logic
// ============================================================================

const checkIdentity = (
  identity: SignerIdentity,
  config: {
    allowedIssuers: string[];
    allowedRepositories: string[];
    allowedWorkflows: string[];
  },
): { isValid: boolean; error?: string } => {
  if (!config.allowedIssuers.includes(identity.issuer)) {
    return {
      isValid: false,
      error: `Untrusted OIDC issuer: ${identity.issuer}`,
    };
  }
  if (
    !config.allowedRepositories.some((p) =>
      matchGlobPattern(p, identity.repository),
    )
  ) {
    return {
      isValid: false,
      error: `Untrusted repository: ${identity.repository}`,
    };
  }
  if (
    !config.allowedWorkflows.some((p) =>
      matchGlobPattern(p, identity.workflowRef),
    )
  ) {
    return {
      isValid: false,
      error: `Untrusted workflow: ${identity.workflowRef}`,
    };
  }
  return { isValid: true };
};

// ============================================================================
// NMA Verification
// ============================================================================

export const verifyNMAIdentity = (
  identity: SignerIdentity,
  config: NMATrustedConfig,
): NMAVerificationResult => {
  const result = checkIdentity(identity, config);
  if (!result.isValid) {
    return {
      isValid: false,
      status: NMAVerificationStatus.UNTRUSTED_SIGNER,
      errorMessage: result.error,
    };
  }
  return {
    isValid: true,
    status: NMAVerificationStatus.VALID,
    verifiedIdentity: identity,
  };
};

export const verifyNMAManifest = async (
  manifest: NMAManifest,
  manifestContent: string,
): Promise<NMAVerificationResult> => {
  try {
    const bundle = parseSigstoreBundle(manifest.sigstoreBundle);
    if (!bundle) {
      return {
        isValid: false,
        status: NMAVerificationStatus.INVALID_MANIFEST,
        errorMessage: "Failed to parse Sigstore bundle",
      };
    }

    const config = getNMATrustedConfig();
    const identityResult = verifyNMAIdentity(
      manifest.sigstoreBundle.signerIdentity,
      config,
    );
    if (!identityResult.isValid) return identityResult;

    const verifier = await getVerifier();
    const manifestBytes = new TextEncoder().encode(manifestContent);

    try {
      await verifier.verifyArtifact(
        manifest.sigstoreBundle.signerIdentity.subject,
        manifest.sigstoreBundle.signerIdentity.issuer,
        // @ts-expect-error: Bundle type mismatch in lib
        bundle,
        manifestBytes,
      );

      return {
        isValid: true,
        status: NMAVerificationStatus.VALID,
        verifiedIdentity: manifest.sigstoreBundle.signerIdentity,
        manifest,
      };
    } catch (e: unknown) {
      const error = e as Error;
      if (error.message?.includes("certificate")) {
        return {
          isValid: false,
          status: NMAVerificationStatus.SIGNATURE_INVALID,
          errorMessage: "Certificate error",
        };
      }
      return {
        isValid: false,
        status: NMAVerificationStatus.SIGNATURE_INVALID,
        errorMessage: error.message,
      };
    }
  } catch (error) {
    return {
      isValid: false,
      status: NMAVerificationStatus.UNKNOWN_ERROR,
      errorMessage: String(error),
    };
  }
};

