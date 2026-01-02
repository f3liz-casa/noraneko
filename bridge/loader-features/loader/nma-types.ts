// SPDX-License-Identifier: MPL-2.0

/**
 * Noraneko Module Archive (NMA) Types
 *
 * NMA is the primary distribution format for browser-features/chrome modules.
 * It provides:
 * 1. ZIP-based archive format with .nma.zip extension
 * 2. Sigstore-based signature verification
 * 3. Hot-swappable module loading alongside omni.ja
 * 4. Secure distribution from f3liz-dev/noraneko
 *
 * The NMA file is placed alongside omni.ja in the Firefox installation
 * directory (not in profile), making it part of the core installation.
 * 
 * NMA enables lightweight updates independent of Mozilla's build system:
 * - Windows: Updated via noraneko-winupdater
 * - Linux: Included in deb, rpm, etc.
 * - macOS: Standard .app bundle updates
 */

import type { SignerIdentity, SigstoreBundle, UpdateChannel } from "./hotfix-types.ts";

/**
 * NMA file structure:
 * noraneko.nma.zip (ZIP archive)
 * ├── manifest.json     - Archive manifest with metadata and signatures
 * ├── modules/          - Built JavaScript modules
 * │   ├── core.js
 * │   ├── sidebar.js
 * │   └── ...
 * ├── assets/           - Static assets (CSS, images, etc.)
 * │   ├── css/
 * │   └── js/
 * └── signature-bundle.json - Sigstore signature bundle
 */

/**
 * NMA Manifest - Main metadata file in the archive
 */
export interface NMAManifest {
  /** NMA format version */
  formatVersion: "1.0";
  /** Unique identifier for this archive build */
  buildId: string;
  /** Noraneko version this archive is built for */
  noranekoVersion: string;
  /** Git commit SHA this was built from */
  commitSha: string;
  /** Build timestamp (ISO 8601) */
  builtAt: string;
  /** Update channel this archive targets */
  channel: UpdateChannel;
  /** List of modules included in this archive */
  modules: NMAModule[];
  /** Assets included in this archive */
  assets: NMAAsset[];
  /** Sigstore signature bundle for verification */
  sigstoreBundle: SigstoreBundle;
  /** SHA-256 hash of the entire archive (before signature) */
  archiveHash: string;
  /** Whether this is a delta update (only contains changed files) */
  isDelta: boolean;
  /** Previous build ID this delta is based on (if isDelta) */
  baseBuildId?: string;
  /** Minimum supported Noraneko version */
  minVersion: string;
  /** Maximum supported Noraneko version (optional) */
  maxVersion?: string;
}

/**
 * Module entry in NMA
 */
export interface NMAModule {
  /** Module name (e.g., "core", "sidebar") */
  name: string;
  /** Relative path within the archive */
  path: string;
  /** SHA-256 hash of the module file */
  hash: string;
  /** File size in bytes */
  size: number;
  /** Module dependencies */
  dependencies: string[];
  /** Whether this module is essential (failure to load is fatal) */
  essential: boolean;
}

/**
 * Asset entry in NMA
 */
export interface NMAAsset {
  /** Asset name or identifier */
  name: string;
  /** Relative path within the archive */
  path: string;
  /** SHA-256 hash of the asset */
  hash: string;
  /** File size in bytes */
  size: number;
  /** MIME type of the asset */
  mimeType: string;
}

/**
 * Result of NMA verification
 */
export interface NMAVerificationResult {
  /** Whether the archive is valid */
  isValid: boolean;
  /** Verification status code */
  status: NMAVerificationStatus;
  /** Error message if verification failed */
  errorMessage?: string;
  /** Verified signer identity */
  verifiedIdentity?: SignerIdentity;
  /** Archive manifest (if successfully parsed) */
  manifest?: NMAManifest;
}

/**
 * NMA verification status codes
 */
export enum NMAVerificationStatus {
  /** Archive is valid and trusted */
  VALID = "VALID",
  /** Archive file not found */
  NOT_FOUND = "NOT_FOUND",
  /** Archive is corrupted or invalid format */
  INVALID_ARCHIVE = "INVALID_ARCHIVE",
  /** Manifest is missing or malformed */
  INVALID_MANIFEST = "INVALID_MANIFEST",
  /** Signature verification failed */
  SIGNATURE_INVALID = "SIGNATURE_INVALID",
  /** Signer identity is not trusted */
  UNTRUSTED_SIGNER = "UNTRUSTED_SIGNER",
  /** Archive hash mismatch */
  HASH_MISMATCH = "HASH_MISMATCH",
  /** Version incompatibility */
  VERSION_MISMATCH = "VERSION_MISMATCH",
  /** Unknown error */
  UNKNOWN_ERROR = "UNKNOWN_ERROR",
}

/**
 * NMA loader state
 */
export interface NMALoaderState {
  /** Currently loaded NMA */
  currentNMA: NMAManifest | null;
  /** Path to the NMA file */
  nmaPath: string | null;
  /** Whether modules from NMA are active */
  isActive: boolean;
  /** Loaded module paths from NMA */
  loadedModules: string[];
  /** Last verification result */
  lastVerification: NMAVerificationResult | null;
}

/**
 * NMA configuration for trusted sources
 */
export interface NMATrustedConfig {
  /** Allowed OIDC issuers for signing */
  allowedIssuers: string[];
  /** Allowed repository patterns */
  allowedRepositories: string[];
  /** Allowed workflow patterns */
  allowedWorkflows: string[];
  /** Whether to allow unsigned NMA in development mode */
  allowUnsignedInDev: boolean;
}

/**
 * Default trusted configuration for NMA
 * Allows only official f3liz-dev/noraneko builds
 */
export const DEFAULT_NMA_TRUSTED_CONFIG: NMATrustedConfig = {
  allowedIssuers: ["https://token.actions.githubusercontent.com"],
  allowedRepositories: [
    "f3liz-dev/noraneko",
    "noraneko-browser/noraneko",
  ],
  allowedWorkflows: [
    ".github/workflows/package*.yml",
    ".github/workflows/build*.yml",
    ".github/workflows/nma*.yml",
  ],
  allowUnsignedInDev: true,
};

/**
 * NMA file paths relative to Firefox installation
 * 
 * NMA is the primary distribution format for browser-features/chrome modules.
 * It is included alongside omni.ja in the default build and updated by:
 * - Windows: noraneko-winupdater
 * - Linux: Package managers (deb, rpm, etc.)
 * - macOS: Standard .app bundle updates
 */
export const NMA_PATHS = {
  /** Name of the NMA file (ZIP format with .nma.zip extension) */
  NMA_FILENAME: "noraneko.nma.zip",
  /** Fallback name for the NMA file */
  NMA_FALLBACK_FILENAME: "noraneko-modules.nma.zip",
  /** Legacy filename without .zip extension (for backwards compatibility) */
  NMA_LEGACY_FILENAME: "noraneko.nma",
  /** Directory containing extracted modules (for verification) */
  EXTRACTED_DIR: "noraneko-modules",
} as const;

/**
 * Events emitted by NMA loader
 */
export interface NMALoaderEvents {
  /** Fired when NMA is loaded */
  "nma-loaded": { manifest: NMAManifest };
  /** Fired when NMA verification completes */
  "nma-verified": { result: NMAVerificationResult };
  /** Fired when NMA loading fails */
  "nma-error": { error: string; status: NMAVerificationStatus };
  /** Fired when NMA modules are activated */
  "nma-activated": { modules: string[] };
}
