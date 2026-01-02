// SPDX-License-Identifier: MPL-2.0

/**
 * Noraneko Package Signer
 *
 * Signs packages using Sigstore for transparent, verifiable signatures.
 * Sigstore provides:
 * - Keyless signing using OIDC identity
 * - Transparency log (Rekor) for signature verification
 * - Integration with GitHub Actions for identity
 *
 * This ensures packages are:
 * - Verifiably from f3liz-dev/noraneko
 * - Tamper-evident through transparency logs
 * - Verifiable without heavy infrastructure
 */

import { Logger, exists } from "./utils.ts";
import type { NoraPackageManifest } from "./packager.ts";

const logger = new Logger("signer");

/**
 * Signature bundle structure
 */
export interface SignatureBundle {
  /** Signature format version */
  formatVersion: "1.0";
  /** Type of signature */
  signatureType: "sigstore" | "gpg";
  /** Base64-encoded signature */
  signature: string;
  /** Certificate chain (for sigstore) */
  certificate?: string;
  /** Rekor log entry (for sigstore) */
  rekorEntry?: {
    logIndex: number;
    logId: string;
    integratedTime: number;
  };
  /** GPG key ID (for gpg) */
  keyId?: string;
  /** Identity used for signing */
  identity: {
    issuer?: string;
    subject?: string;
    repository?: string;
  };
  /** Timestamp of signing */
  signedAt: string;
}

/**
 * Check if a command is available in PATH (cross-platform)
 */
function commandExists(command: string): boolean {
  try {
    // Try to run the command with --version or --help to check if it exists
    const cmd = new Deno.Command(command, {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    });
    const result = cmd.outputSync();
    return result.success || result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Check if sigstore tools are available
 */
function hasSigstoreTools(): boolean {
  return commandExists("cosign");
}

/**
 * Check if GPG is available
 */
function hasGpg(): boolean {
  return commandExists("gpg");
}

/**
 * Sign a package manifest using Sigstore (keyless)
 *
 * This uses OIDC identity from GitHub Actions or other providers.
 * In CI, it will use the GitHub Actions OIDC token.
 * Locally, it will prompt for authentication.
 */
async function signWithSigstore(
  manifestPath: string,
  outputPath: string,
): Promise<SignatureBundle | null> {
  if (!hasSigstoreTools()) {
    logger.warn(
      "Sigstore tools (cosign) not found. Install with: go install github.com/sigstore/cosign/v2/cmd/cosign@latest",
    );
    return null;
  }

  logger.info("Signing with Sigstore (keyless)...");

  // Read manifest for identity info
  const manifest: NoraPackageManifest = JSON.parse(
    await Deno.readTextFile(manifestPath),
  );

  // Sign the manifest file using cosign
  const signaturePath = `${outputPath}.sig`;
  const certPath = `${outputPath}.cert`;

  // Use cosign sign-blob for signing arbitrary files
  // In GitHub Actions, this will automatically use the OIDC token
  const signCmd = new Deno.Command("cosign", {
    args: [
      "sign-blob",
      manifestPath,
      "--output-signature",
      signaturePath,
      "--output-certificate",
      certPath,
      "--yes", // Skip confirmation prompts
    ],
    env: {
      ...Object.fromEntries(
        Object.entries(Deno.env.toObject()).filter(([k]) => k.startsWith("GITHUB_") || k.startsWith("ACTIONS_")),
      ),
    },
    stdout: "piped",
    stderr: "piped",
  });

  const result = await signCmd.output();
  const stderr = new TextDecoder().decode(result.stderr);

  if (!result.success) {
    logger.error(`Sigstore signing failed: ${stderr}`);
    return null;
  }

  // Read signature and certificate
  const signature = await Deno.readTextFile(signaturePath);
  const certificate = exists(certPath)
    ? await Deno.readTextFile(certPath)
    : undefined;

  // Parse Rekor entry from cosign output if available
  let rekorEntry: SignatureBundle["rekorEntry"] | undefined;
  const rekorMatch = stderr.match(/tlog entry created with index: (\d+)/);
  if (rekorMatch) {
    rekorEntry = {
      logIndex: parseInt(rekorMatch[1], 10),
      logId: "rekor.sigstore.dev",
      integratedTime: Math.floor(Date.now() / 1000),
    };
  }

  // Extract identity from certificate if available
  let identity: SignatureBundle["identity"] = {
    repository: `${manifest.repository.owner}/${manifest.repository.name}`,
  };

  if (Deno.env.get("GITHUB_ACTIONS") === "true") {
    identity = {
      issuer: "https://token.actions.githubusercontent.com",
      subject: `https://github.com/${manifest.repository.owner}/${manifest.repository.name}`,
      repository: `${manifest.repository.owner}/${manifest.repository.name}`,
    };
  }

  const bundle: SignatureBundle = {
    formatVersion: "1.0",
    signatureType: "sigstore",
    signature: signature.trim(),
    certificate,
    rekorEntry,
    identity,
    signedAt: new Date().toISOString(),
  };

  // Cleanup temp files
  try {
    await Deno.remove(signaturePath);
    if (exists(certPath)) await Deno.remove(certPath);
  } catch {
    // Ignore cleanup errors
  }

  return bundle;
}

/**
 * Sign a package manifest using GPG
 *
 * This is a fallback for environments without Sigstore support.
 */
async function signWithGpg(
  manifestPath: string,
  keyId?: string,
): Promise<SignatureBundle | null> {
  if (!hasGpg()) {
    logger.warn("GPG not found");
    return null;
  }

  logger.info("Signing with GPG...");

  const args = ["--armor", "--detach-sign"];
  if (keyId) {
    args.push("--default-key", keyId);
  }
  args.push(manifestPath);

  const signCmd = new Deno.Command("gpg", {
    args,
    stdout: "piped",
    stderr: "piped",
  });

  const result = await signCmd.output();
  if (!result.success) {
    logger.error(
      `GPG signing failed: ${new TextDecoder().decode(result.stderr)}`,
    );
    return null;
  }

  // Read the signature file
  const sigPath = `${manifestPath}.asc`;
  if (!exists(sigPath)) {
    logger.error("GPG signature file not created");
    return null;
  }

  const signature = await Deno.readTextFile(sigPath);

  // Get the key ID used
  const keyInfoCmd = new Deno.Command("gpg", {
    args: ["--list-keys", "--keyid-format", "long", keyId || ""],
    stdout: "piped",
    stderr: "piped",
  });
  const keyInfoResult = await keyInfoCmd.output();
  const keyInfo = new TextDecoder().decode(keyInfoResult.stdout);
  const usedKeyId = keyId || keyInfo.match(/pub\s+\w+\/([A-F0-9]+)/)?.[1];

  const bundle: SignatureBundle = {
    formatVersion: "1.0",
    signatureType: "gpg",
    signature: signature.trim(),
    keyId: usedKeyId,
    identity: {
      repository: "f3liz-dev/noraneko",
    },
    signedAt: new Date().toISOString(),
  };

  // Cleanup
  try {
    await Deno.remove(sigPath);
  } catch {
    // Ignore cleanup errors
  }

  return bundle;
}

/**
 * Sign a package manifest
 *
 * Tries Sigstore first, falls back to GPG if available.
 */
export async function signManifest(
  manifestPath: string,
  options: {
    preferGpg?: boolean;
    gpgKeyId?: string;
  } = {},
): Promise<SignatureBundle | null> {
  if (!exists(manifestPath)) {
    logger.error(`Manifest file not found: ${manifestPath}`);
    return null;
  }

  const outputPath = manifestPath.replace(/\.json$/, "");

  if (options.preferGpg) {
    const gpgBundle = await signWithGpg(manifestPath, options.gpgKeyId);
    if (gpgBundle) return gpgBundle;
  }

  // Try Sigstore first (preferred for CI)
  const sigstoreBundle = await signWithSigstore(manifestPath, outputPath);
  if (sigstoreBundle) return sigstoreBundle;

  // Fall back to GPG
  const gpgBundle = await signWithGpg(manifestPath, options.gpgKeyId);
  if (gpgBundle) return gpgBundle;

  logger.error("No signing method available. Install cosign or gpg.");
  return null;
}

/**
 * Create a signed package bundle
 *
 * Takes a package manifest and creates a complete signature bundle file.
 */
export async function createSignedBundle(
  packagePath: string,
  options: {
    preferGpg?: boolean;
    gpgKeyId?: string;
  } = {},
): Promise<string | null> {
  const manifestPath = `${packagePath}.manifest.json`;

  if (!exists(manifestPath)) {
    logger.error(`Manifest not found: ${manifestPath}`);
    return null;
  }

  const bundle = await signManifest(manifestPath, options);
  if (!bundle) {
    return null;
  }

  // Write the signature bundle
  const bundlePath = `${packagePath}.signature.json`;
  await Deno.writeTextFile(bundlePath, JSON.stringify(bundle, null, 2));

  logger.success(`Signature bundle created: ${bundlePath}`);
  return bundlePath;
}

/**
 * Run the signer from CLI
 */
export async function run(
  packagePath: string,
  options: {
    preferGpg?: boolean;
    gpgKeyId?: string;
  } = {},
): Promise<void> {
  try {
    const bundlePath = await createSignedBundle(packagePath, options);
    if (!bundlePath) {
      Deno.exit(1);
    }
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`Signing failed: ${error?.message ?? e}`);
    throw e;
  }
}
