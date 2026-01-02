// SPDX-License-Identifier: MPL-2.0

/**
 * Noraneko Package Verifier
 *
 * Lightweight verification module for Noraneko packages.
 * Designed to be:
 * - Fast for startup verification
 * - Secure with multiple verification methods
 * - Minimal dependencies
 *
 * Verification methods:
 * 1. Sigstore: Verify signatures through transparency log
 * 2. GPG: Verify with trusted public keys
 * 3. Hash: Quick integrity check using package hash
 */

import * as path from "@std/path";
import { Logger, exists, runCommandChecked } from "./utils.ts";
import type { NoraPackageManifest } from "./packager.ts";
import type { SignatureBundle } from "./signer.ts";

const logger = new Logger("verifier");

/**
 * Verification result
 */
export interface VerificationResult {
  /** Whether verification passed */
  valid: boolean;
  /** Verification method used */
  method: "sigstore" | "gpg" | "hash" | "none";
  /** Detailed verification status */
  details: {
    /** Hash integrity check passed */
    hashValid?: boolean;
    /** Signature valid */
    signatureValid?: boolean;
    /** Certificate chain valid (sigstore) */
    certificateValid?: boolean;
    /** Rekor log entry verified (sigstore) */
    rekorVerified?: boolean;
    /** Identity verified against expected */
    identityValid?: boolean;
  };
  /** Error message if verification failed */
  error?: string;
  /** Warning messages */
  warnings?: string[];
}

/**
 * Expected identity for verification
 */
export interface ExpectedIdentity {
  /** Expected repository (e.g., "f3liz-dev/noraneko") */
  repository: string;
  /** Expected OIDC issuer (for sigstore) */
  issuer?: string;
}

/**
 * Compute SHA-256 hash of data
 */
async function sha256Hash(data: Uint8Array): Promise<string> {
  // Create a copy as ArrayBuffer to satisfy the crypto API types
  const buffer = new ArrayBuffer(data.length);
  new Uint8Array(buffer).set(data);
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Verify file hashes match the manifest
 */
async function verifyHashes(
  contentDir: string,
  manifest: NoraPackageManifest,
): Promise<{ valid: boolean; mismatches: string[] }> {
  const mismatches: string[] = [];

  for (const [relativePath, expected] of Object.entries(manifest.files)) {
    const fullPath = path.join(contentDir, relativePath);

    if (!exists(fullPath)) {
      mismatches.push(`Missing: ${relativePath}`);
      continue;
    }

    const content = await Deno.readFile(fullPath);
    const actualHash = await sha256Hash(content);

    if (actualHash !== expected.sha256) {
      mismatches.push(`Hash mismatch: ${relativePath}`);
    }

    if (content.byteLength !== expected.size) {
      mismatches.push(`Size mismatch: ${relativePath}`);
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Verify package hash
 */
async function verifyPackageHash(
  manifest: NoraPackageManifest,
): Promise<boolean> {
  const hashes = Object.values(manifest.files)
    .map((f) => f.sha256)
    .sort();

  const combinedHash = await sha256Hash(
    new TextEncoder().encode(hashes.join("")),
  );

  return combinedHash === manifest.integrity.packageHash;
}

/**
 * Verify Sigstore signature using cosign
 */
async function verifySigstore(
  manifestPath: string,
  signature: SignatureBundle,
  expectedIdentity: ExpectedIdentity,
): Promise<{
  valid: boolean;
  certificateValid: boolean;
  rekorVerified: boolean;
  identityValid: boolean;
  error?: string;
}> {
  // Check if cosign is available
  const cosignCheck = runCommandChecked("which", ["cosign"]);
  if (!cosignCheck.success) {
    return {
      valid: false,
      certificateValid: false,
      rekorVerified: false,
      identityValid: false,
      error: "cosign not available",
    };
  }

  // Write signature and certificate to temp files
  const tempDir = await Deno.makeTempDir({ prefix: "nora-verify-" });
  const sigPath = path.join(tempDir, "signature.sig");
  const certPath = path.join(tempDir, "certificate.pem");

  try {
    await Deno.writeTextFile(sigPath, signature.signature);
    if (signature.certificate) {
      await Deno.writeTextFile(certPath, signature.certificate);
    }

    // Build verification command
    const args = [
      "verify-blob",
      manifestPath,
      "--signature",
      sigPath,
    ];

    if (signature.certificate) {
      args.push("--certificate", certPath);
    }

    // Add identity verification
    if (expectedIdentity.issuer) {
      args.push("--certificate-oidc-issuer", expectedIdentity.issuer);
    }

    args.push(
      "--certificate-identity-regexp",
      `^https://github.com/${expectedIdentity.repository}`,
    );

    const verifyCmd = new Deno.Command("cosign", {
      args,
      stdout: "piped",
      stderr: "piped",
    });

    const result = await verifyCmd.output();
    const stderr = new TextDecoder().decode(result.stderr);

    if (result.success) {
      return {
        valid: true,
        certificateValid: true,
        rekorVerified: stderr.includes("tlog entry verified"),
        identityValid: true,
      };
    }

    return {
      valid: false,
      certificateValid: !stderr.includes("certificate"),
      rekorVerified: stderr.includes("tlog entry verified"),
      identityValid: !stderr.includes("identity"),
      error: stderr,
    };
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

/**
 * Verify GPG signature
 */
async function verifyGpg(
  manifestPath: string,
  signature: SignatureBundle,
  trustedKeyIds?: string[],
): Promise<{ valid: boolean; keyId?: string; error?: string }> {
  // Check if gpg is available
  const gpgCheck = runCommandChecked("which", ["gpg"]);
  if (!gpgCheck.success) {
    return { valid: false, error: "gpg not available" };
  }

  // Write signature to temp file
  const tempDir = await Deno.makeTempDir({ prefix: "nora-verify-" });
  const sigPath = path.join(tempDir, "signature.asc");

  try {
    await Deno.writeTextFile(sigPath, signature.signature);

    const verifyCmd = new Deno.Command("gpg", {
      args: ["--verify", sigPath, manifestPath],
      stdout: "piped",
      stderr: "piped",
    });

    const result = await verifyCmd.output();
    const stderr = new TextDecoder().decode(result.stderr);

    if (!result.success) {
      return {
        valid: false,
        error: stderr,
      };
    }

    // Extract key ID from output
    const keyIdMatch = stderr.match(/key\s+([A-F0-9]+)/i);
    const keyId = keyIdMatch?.[1];

    // Check if key is trusted
    if (trustedKeyIds && trustedKeyIds.length > 0) {
      if (!keyId || !trustedKeyIds.includes(keyId)) {
        return {
          valid: false,
          keyId,
          error: `Key ${keyId} not in trusted list`,
        };
      }
    }

    return {
      valid: true,
      keyId,
    };
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

/**
 * Verify a package manifest and signature
 */
export async function verifyPackage(
  manifestPath: string,
  signaturePath: string,
  options: {
    expectedIdentity?: ExpectedIdentity;
    trustedGpgKeys?: string[];
    verifyHashes?: boolean;
    contentDir?: string;
  } = {},
): Promise<VerificationResult> {
  const warnings: string[] = [];

  // Check files exist
  if (!exists(manifestPath)) {
    return {
      valid: false,
      method: "none",
      details: {},
      error: "Manifest file not found",
    };
  }

  if (!exists(signaturePath)) {
    return {
      valid: false,
      method: "none",
      details: {},
      error: "Signature file not found",
    };
  }

  // Parse manifest and signature
  let manifest: NoraPackageManifest;
  let signature: SignatureBundle;

  try {
    manifest = JSON.parse(await Deno.readTextFile(manifestPath));
    signature = JSON.parse(await Deno.readTextFile(signaturePath));
  } catch (e) {
    return {
      valid: false,
      method: "none",
      details: {},
      error: `Failed to parse files: ${e}`,
    };
  }

  const expectedIdentity = options.expectedIdentity || {
    repository: "f3liz-dev/noraneko",
    issuer: "https://token.actions.githubusercontent.com",
  };

  // Verify based on signature type
  if (signature.signatureType === "sigstore") {
    const sigstoreResult = await verifySigstore(
      manifestPath,
      signature,
      expectedIdentity,
    );

    if (!sigstoreResult.valid) {
      return {
        valid: false,
        method: "sigstore",
        details: {
          signatureValid: false,
          certificateValid: sigstoreResult.certificateValid,
          rekorVerified: sigstoreResult.rekorVerified,
          identityValid: sigstoreResult.identityValid,
        },
        error: sigstoreResult.error,
        warnings,
      };
    }

    // Verify package hash
    const hashValid = await verifyPackageHash(manifest);
    if (!hashValid) {
      return {
        valid: false,
        method: "sigstore",
        details: {
          signatureValid: true,
          certificateValid: true,
          rekorVerified: sigstoreResult.rekorVerified,
          identityValid: true,
          hashValid: false,
        },
        error: "Package hash mismatch",
        warnings,
      };
    }

    // Optionally verify individual file hashes
    if (options.verifyHashes && options.contentDir) {
      const hashResult = await verifyHashes(options.contentDir, manifest);
      if (!hashResult.valid) {
        return {
          valid: false,
          method: "sigstore",
          details: {
            signatureValid: true,
            certificateValid: true,
            rekorVerified: sigstoreResult.rekorVerified,
            identityValid: true,
            hashValid: false,
          },
          error: `File hash mismatches: ${hashResult.mismatches.join(", ")}`,
          warnings,
        };
      }
    }

    return {
      valid: true,
      method: "sigstore",
      details: {
        signatureValid: true,
        certificateValid: true,
        rekorVerified: sigstoreResult.rekorVerified,
        identityValid: true,
        hashValid: true,
      },
      warnings,
    };
  }

  if (signature.signatureType === "gpg") {
    const gpgResult = await verifyGpg(
      manifestPath,
      signature,
      options.trustedGpgKeys,
    );

    if (!gpgResult.valid) {
      return {
        valid: false,
        method: "gpg",
        details: {
          signatureValid: false,
        },
        error: gpgResult.error,
        warnings,
      };
    }

    // Verify package hash
    const hashValid = await verifyPackageHash(manifest);

    return {
      valid: hashValid,
      method: "gpg",
      details: {
        signatureValid: true,
        hashValid,
      },
      error: hashValid ? undefined : "Package hash mismatch",
      warnings,
    };
  }

  return {
    valid: false,
    method: "none",
    details: {},
    error: `Unknown signature type: ${signature.signatureType}`,
    warnings,
  };
}

/**
 * Quick hash-only verification (for startup)
 */
export async function quickVerify(
  manifestPath: string,
): Promise<{ valid: boolean; error?: string }> {
  if (!exists(manifestPath)) {
    return { valid: false, error: "Manifest not found" };
  }

  try {
    const manifest: NoraPackageManifest = JSON.parse(
      await Deno.readTextFile(manifestPath),
    );
    const valid = await verifyPackageHash(manifest);
    return { valid, error: valid ? undefined : "Hash mismatch" };
  } catch (e) {
    return { valid: false, error: `Parse error: ${e}` };
  }
}

/**
 * Run the verifier from CLI
 */
export async function run(
  manifestPath: string,
  signaturePath: string,
  options: {
    expectedIdentity?: ExpectedIdentity;
    trustedGpgKeys?: string[];
  } = {},
): Promise<void> {
  try {
    const result = await verifyPackage(manifestPath, signaturePath, options);

    if (result.valid) {
      logger.success(`Verification passed (${result.method})`);
    } else {
      logger.error(`Verification failed: ${result.error}`);
      Deno.exit(1);
    }
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`Verification error: ${error?.message ?? e}`);
    throw e;
  }
}
