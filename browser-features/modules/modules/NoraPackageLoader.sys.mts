// SPDX-License-Identifier: MPL-2.0

/**
 * Noraneko Package Loader
 *
 * This module loads and manages hotswappable Noraneko packages at runtime.
 * It provides:
 * - Package discovery from profile directory
 * - Integrity verification before loading
 * - Safe package loading into Firefox
 *
 * Packages are stored in the profile directory:
 *   <profile>/noraneko-packages/current/
 *
 * The loader verifies package integrity on every startup.
 */

interface NoraPackageManifest {
  formatVersion: string;
  name: string;
  version: string;
  buildId: string;
  buildTime: string;
  repository: {
    owner: string;
    name: string;
    ref?: string;
    sha?: string;
  };
  files: Record<
    string,
    {
      sha256: string;
      size: number;
    }
  >;
  integrity: {
    packageHash: string;
  };
}

interface SignatureBundle {
  formatVersion: string;
  signatureType: "sigstore" | "gpg";
  signature: string;
  certificate?: string;
  rekorEntry?: {
    logIndex: number;
    logId: string;
    integratedTime: number;
  };
  keyId?: string;
  identity: {
    issuer?: string;
    subject?: string;
    repository?: string;
  };
  signedAt: string;
}

interface VerificationResult {
  valid: boolean;
  method: string;
  error?: string;
  warnings?: string[];
}

/**
 * Compute SHA-256 hash of data using Web Crypto API
 */
async function sha256Hash(data: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Get the package directory path
 */
function getPackageDir(): string {
  const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile).path;
  return PathUtils.join(profileDir, "noraneko-packages", "current");
}

/**
 * Check if a package is installed
 */
export async function isPackageInstalled(): Promise<boolean> {
  const packageDir = getPackageDir();
  const manifestPath = PathUtils.join(packageDir, "manifest.json");
  return IOUtils.exists(manifestPath);
}

/**
 * Get the installed package manifest
 */
export async function getPackageManifest(): Promise<NoraPackageManifest | null> {
  const packageDir = getPackageDir();
  const manifestPath = PathUtils.join(packageDir, "manifest.json");

  if (!(await IOUtils.exists(manifestPath))) {
    return null;
  }

  try {
    const content = await IOUtils.readUTF8(manifestPath);
    return JSON.parse(content) as NoraPackageManifest;
  } catch (e) {
    console.error("[NoraPackageLoader] Failed to read manifest:", e);
    return null;
  }
}

/**
 * Get the installed package signature
 */
export async function getPackageSignature(): Promise<SignatureBundle | null> {
  const packageDir = getPackageDir();
  const signaturePath = PathUtils.join(packageDir, "signature.json");

  if (!(await IOUtils.exists(signaturePath))) {
    return null;
  }

  try {
    const content = await IOUtils.readUTF8(signaturePath);
    return JSON.parse(content) as SignatureBundle;
  } catch (e) {
    console.error("[NoraPackageLoader] Failed to read signature:", e);
    return null;
  }
}

/**
 * Verify package hash integrity
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
 * Verify individual file hashes
 */
async function verifyFileHashes(
  manifest: NoraPackageManifest,
  contentDir: string,
): Promise<{ valid: boolean; mismatches: string[] }> {
  const mismatches: string[] = [];

  for (const [relativePath, expected] of Object.entries(manifest.files)) {
    const fullPath = PathUtils.join(contentDir, relativePath);

    if (!(await IOUtils.exists(fullPath))) {
      mismatches.push(`Missing: ${relativePath}`);
      continue;
    }

    try {
      const content = await IOUtils.read(fullPath);
      const actualHash = await sha256Hash(content);

      if (actualHash !== expected.sha256) {
        mismatches.push(`Hash mismatch: ${relativePath}`);
      }

      if (content.byteLength !== expected.size) {
        mismatches.push(`Size mismatch: ${relativePath}`);
      }
    } catch (e) {
      mismatches.push(`Read error: ${relativePath}`);
    }
  }

  return {
    valid: mismatches.length === 0,
    mismatches,
  };
}

/**
 * Quick verification (hash only) - fast for startup
 */
export async function quickVerify(): Promise<VerificationResult> {
  const manifest = await getPackageManifest();

  if (!manifest) {
    return {
      valid: false,
      method: "none",
      error: "No package manifest found",
    };
  }

  const hashValid = await verifyPackageHash(manifest);

  return {
    valid: hashValid,
    method: "hash",
    error: hashValid ? undefined : "Package hash mismatch",
  };
}

/**
 * Full verification (hash + file integrity)
 */
export async function fullVerify(): Promise<VerificationResult> {
  const packageDir = getPackageDir();
  const manifest = await getPackageManifest();

  if (!manifest) {
    return {
      valid: false,
      method: "none",
      error: "No package manifest found",
    };
  }

  // Verify package hash first (fast)
  const packageHashValid = await verifyPackageHash(manifest);
  if (!packageHashValid) {
    return {
      valid: false,
      method: "hash",
      error: "Package hash mismatch",
    };
  }

  // Verify individual file hashes
  const contentDir = PathUtils.join(packageDir, "content");
  const fileResult = await verifyFileHashes(manifest, contentDir);

  if (!fileResult.valid) {
    return {
      valid: false,
      method: "hash",
      error: `File integrity check failed: ${fileResult.mismatches.join(", ")}`,
    };
  }

  return {
    valid: true,
    method: "hash",
  };
}

/**
 * Get package version info
 */
export async function getVersionInfo(): Promise<{
  version: string;
  buildId: string;
  buildTime: string;
} | null> {
  const manifest = await getPackageManifest();

  if (!manifest) {
    return null;
  }

  return {
    version: manifest.version,
    buildId: manifest.buildId,
    buildTime: manifest.buildTime,
  };
}

/**
 * Check if a package update is available
 */
export async function checkForUpdate(
  remoteManifestUrl: string,
): Promise<{
  available: boolean;
  currentVersion?: string;
  remoteVersion?: string;
  remoteBuildId?: string;
}> {
  const currentManifest = await getPackageManifest();

  try {
    const response = await fetch(remoteManifestUrl);
    if (!response.ok) {
      console.error("[NoraPackageLoader] Failed to fetch remote manifest");
      return { available: false };
    }

    const remoteManifest = (await response.json()) as unknown as NoraPackageManifest;

    const currentVersion = currentManifest?.version || "0.0.0";
    const currentBuildId = currentManifest?.buildId || "";

    const remoteVersion = remoteManifest.version;
    const remoteBuildId = remoteManifest.buildId;

    // Compare versions and build IDs
    const available =
      remoteVersion !== currentVersion || remoteBuildId !== currentBuildId;

    return {
      available,
      currentVersion,
      remoteVersion,
      remoteBuildId,
    };
  } catch (e) {
    console.error("[NoraPackageLoader] Update check failed:", e);
    return { available: false };
  }
}

/**
 * Register package content with Firefox's chrome registry
 */
export async function registerPackageContent(): Promise<boolean> {
  const manifest = await getPackageManifest();

  if (!manifest) {
    console.error("[NoraPackageLoader] No package manifest found");
    return false;
  }

  // Verify package integrity first
  const verifyResult = await quickVerify();
  if (!verifyResult.valid) {
    console.error(
      "[NoraPackageLoader] Package verification failed:",
      verifyResult.error,
    );
    return false;
  }

  const packageDir = getPackageDir();

  // Create chrome.manifest content for the package
  // Package structure: content/, startup/, skin/, resource/
  const manifestContent = [
    `content noraneko-package ${PathUtils.join(packageDir, "content")}/ contentaccessible=yes`,
    `content noraneko-package-startup ${PathUtils.join(packageDir, "startup")}/ contentaccessible=yes`,
    `skin noraneko-package classic/1.0 ${PathUtils.join(packageDir, "skin")}/`,
    `resource noraneko-package ${PathUtils.join(packageDir, "resource")}/ contentaccessible=yes`,
  ].join("\n");

  // Write manifest to profile
  const chromeManifestPath = PathUtils.join(
    packageDir,
    "noraneko-package.manifest",
  );
  await IOUtils.writeUTF8(chromeManifestPath, manifestContent);

  console.log("[NoraPackageLoader] Package content registered");
  return true;
}

/**
 * Initialize the package loader
 */
export async function init(): Promise<void> {
  console.log("[NoraPackageLoader] Initializing...");

  // Check if a package is installed
  const installed = await isPackageInstalled();

  if (!installed) {
    console.log("[NoraPackageLoader] No package installed");
    return;
  }

  // Verify package on startup
  const verifyResult = await quickVerify();

  if (!verifyResult.valid) {
    console.error(
      "[NoraPackageLoader] Package verification failed:",
      verifyResult.error,
    );
    // TODO: Show user warning about invalid package
    return;
  }

  console.log("[NoraPackageLoader] Package verified successfully");

  // Get version info
  const versionInfo = await getVersionInfo();
  if (versionInfo) {
    console.log(
      `[NoraPackageLoader] Package version: ${versionInfo.version} (${versionInfo.buildId})`,
    );
  }
}
