// SPDX-License-Identifier: MPL-2.0

/**
 * Hotfix System Types and Interfaces
 *
 * This module defines the core types for the Noraneko Hotfix System,
 * implementing non-destructive module patching with Sigstore-based
 * keyless signature verification.
 */

/**
 * Represents a hotfix manifest containing metadata about available patches
 */
export interface HotfixManifest {
  /** Unique identifier for the hotfix */
  id: string;
  /** Semantic version of the hotfix */
  version: string;
  /** User-facing description of what the hotfix fixes */
  description: string;
  /** The unlock code required to access this hotfix (e.g., "NK-7F2A") */
  unlockCode: string;
  /** List of module patches included in this hotfix */
  patches: HotfixPatch[];
  /** Sigstore bundle containing signature and verification data */
  sigstoreBundle: SigstoreBundle;
  /** Timestamp when the hotfix was created (ISO 8601) */
  createdAt: string;
  /** Minimum Noraneko version this hotfix applies to */
  minVersion: string;
  /** Maximum Noraneko version this hotfix applies to (optional) */
  maxVersion?: string;
}

/**
 * Represents a single module patch within a hotfix
 */
export interface HotfixPatch {
  /** Name of the module being patched */
  moduleName: string;
  /** Original module path to disable */
  originalModulePath: string;
  /** Path to the patched module file (relative to hotfix directory) */
  patchedModulePath: string;
  /** SHA-256 hash of the patched module for integrity verification */
  patchedModuleHash: string;
}

/**
 * Sigstore bundle containing cryptographic proof from keyless signing
 * This is generated during CI/CD and verified by the browser
 */
export interface SigstoreBundle {
  /** Base64-encoded Sigstore bundle JSON */
  bundle: string;
  /** OIDC identity that signed the bundle (GitHub Actions workflow) */
  signerIdentity: SignerIdentity;
  /** Rekor transparency log entry ID for public auditability */
  rekorLogId: string;
  /** Timestamp of the signature (from Rekor) */
  signedAt: string;
}

/**
 * OIDC identity information from the Sigstore signing process
 */
export interface SignerIdentity {
  /** The OIDC issuer (e.g., "https://token.actions.githubusercontent.com") */
  issuer: string;
  /** The subject (GitHub workflow identity) */
  subject: string;
  /** Repository where the signing occurred */
  repository: string;
  /** Workflow reference that performed the signing */
  workflowRef: string;
}

/**
 * Result of hotfix signature verification
 */
export interface VerificationResult {
  /** Whether the signature is valid */
  isValid: boolean;
  /** Detailed verification status */
  status: VerificationStatus;
  /** Error message if verification failed */
  errorMessage?: string;
  /** Verified signer identity (if valid) */
  verifiedIdentity?: SignerIdentity;
}

/**
 * Detailed status codes for verification
 */
export enum VerificationStatus {
  /** Signature is valid and identity verified */
  VALID = "VALID",
  /** Sigstore bundle is malformed or corrupted */
  INVALID_BUNDLE = "INVALID_BUNDLE",
  /** Signature does not match the content */
  SIGNATURE_MISMATCH = "SIGNATURE_MISMATCH",
  /** OIDC identity is not from trusted source */
  UNTRUSTED_IDENTITY = "UNTRUSTED_IDENTITY",
  /** Rekor transparency log verification failed */
  REKOR_VERIFICATION_FAILED = "REKOR_VERIFICATION_FAILED",
  /** Certificate has expired */
  CERTIFICATE_EXPIRED = "CERTIFICATE_EXPIRED",
  /** Network error during verification */
  NETWORK_ERROR = "NETWORK_ERROR",
  /** Unknown verification error */
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * User consent decision for installing a hotfix
 */
export interface HotfixConsentResult {
  /** Whether the user approved the installation */
  approved: boolean;
  /** Timestamp of the decision */
  decidedAt: string;
  /** Whether to remember this decision for this hotfix */
  rememberDecision: boolean;
}

/**
 * Status of a hotfix in the system
 */
export enum HotfixStatus {
  /** Hotfix is available but not installed */
  AVAILABLE = "AVAILABLE",
  /** Hotfix is pending user approval */
  PENDING_APPROVAL = "PENDING_APPROVAL",
  /** Hotfix is installed and active */
  INSTALLED = "INSTALLED",
  /** Hotfix installation failed */
  FAILED = "FAILED",
  /** Hotfix was reverted */
  REVERTED = "REVERTED",
}

/**
 * Installed hotfix record stored in preferences
 */
export interface InstalledHotfix {
  /** Hotfix manifest ID */
  id: string;
  /** Version of the installed hotfix */
  version: string;
  /** Current status */
  status: HotfixStatus;
  /** When the hotfix was installed */
  installedAt: string;
  /** Verified signer identity */
  signerIdentity: SignerIdentity;
  /** List of disabled original modules */
  disabledModules: string[];
  /** List of injected patched modules */
  injectedModules: string[];
}

/**
 * Configuration for trusted signers
 */
export interface TrustedSignerConfig {
  /** Allowed OIDC issuers */
  allowedIssuers: string[];
  /** Allowed repository patterns (glob-style) */
  allowedRepositories: string[];
  /** Allowed workflow patterns (glob-style) */
  allowedWorkflows: string[];
}

/**
 * Default trusted signer configuration for Noraneko
 */
export const DEFAULT_TRUSTED_SIGNER_CONFIG: TrustedSignerConfig = {
  allowedIssuers: ["https://token.actions.githubusercontent.com"],
  allowedRepositories: [
    "noraneko-browser/noraneko",
    "*/noraneko", // Allow forks with noraneko repo name
  ],
  allowedWorkflows: [
    ".github/workflows/hotfix*.yml",
    ".github/workflows/hotfix*.yaml",
  ],
};
