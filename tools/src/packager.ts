// SPDX-License-Identifier: MPL-2.0

/**
 * Noraneko Package Builder
 *
 * Creates a distributable package format (.nora.zip) that contains:
 * - Built code from tsdown/vite
 * - Package manifest with metadata
 * - Integrity hashes for verification
 *
 * This package format is designed to be:
 * - Transferable through network
 * - Verifiable with sigstore/GPG on startup
 * - Hotswappable without heavy rebuilds
 */

import * as path from "@std/path";
import { PROJECT_ROOT, PATHS } from "./defines.ts";
import { Logger, exists, safeRemove } from "./utils.ts";
import { readBuildid2 } from "./update.ts";
import { packageVersion } from "./builder.ts";

const logger = new Logger("packager");

/**
 * Package manifest structure
 */
export interface NoraPackageManifest {
  /** Package format version */
  formatVersion: "1.0";
  /** Package name identifier */
  name: string;
  /** Version of the package (from package.json) */
  version: string;
  /** Build ID (UUIDv7) */
  buildId: string;
  /** ISO timestamp of build */
  buildTime: string;
  /** Repository information */
  repository: {
    owner: string;
    name: string;
    ref?: string;
    sha?: string;
  };
  /** File entries with integrity hashes */
  files: Record<
    string,
    {
      /** SHA-256 hash of file content */
      sha256: string;
      /** File size in bytes */
      size: number;
    }
  >;
  /** Overall package integrity */
  integrity: {
    /** SHA-256 hash of all file hashes concatenated and sorted */
    packageHash: string;
  };
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
 * Read all files recursively from a directory
 */
async function* walkDir(
  dir: string,
  base = dir,
): AsyncGenerator<{ relativePath: string; fullPath: string }> {
  for await (const entry of Deno.readDir(dir)) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory) {
      yield* walkDir(fullPath, base);
    } else if (entry.isFile) {
      const relativePath = path.relative(base, fullPath).replace(/\\/g, "/");
      yield { relativePath, fullPath };
    }
  }
}

/**
 * Create a manifest for the package
 */
async function createManifest(
  sourceDir: string,
  buildId: string,
): Promise<NoraPackageManifest> {
  const files: NoraPackageManifest["files"] = {};
  const hashes: string[] = [];

  for await (const { relativePath, fullPath } of walkDir(sourceDir)) {
    const content = await Deno.readFile(fullPath);
    const hash = await sha256Hash(content);
    files[relativePath] = {
      sha256: hash,
      size: content.byteLength,
    };
    hashes.push(hash);
  }

  // Sort hashes and compute package hash
  hashes.sort();
  const combinedHash = await sha256Hash(
    new TextEncoder().encode(hashes.join("")),
  );

  return {
    formatVersion: "1.0",
    name: "noraneko",
    version: packageVersion(),
    buildId,
    buildTime: new Date().toISOString(),
    repository: {
      owner: "f3liz-dev",
      name: "noraneko",
      ref: Deno.env.get("GITHUB_REF"),
      sha: Deno.env.get("GITHUB_SHA"),
    },
    files,
    integrity: {
      packageHash: combinedHash,
    },
  };
}

/**
 * Create the package zip file
 */
async function createPackageZip(
  sourceDir: string,
  manifest: NoraPackageManifest,
  outputPath: string,
): Promise<void> {
  // Create a temporary directory for package contents
  const tempDir = await Deno.makeTempDir({ prefix: "nora-package-" });

  try {
    // Copy all source files to temp directory preserving structure
    for await (const { relativePath, fullPath } of walkDir(sourceDir)) {
      const destPath = path.join(tempDir, "content", relativePath);
      await Deno.mkdir(path.dirname(destPath), { recursive: true });
      await Deno.copyFile(fullPath, destPath);
    }

    // Write manifest
    const manifestPath = path.join(tempDir, "manifest.json");
    await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));

    // Create zip using Deno's built-in compression (tar for now, or use external zip)
    // For cross-platform compatibility, we'll use the zip command if available
    // or fall back to a tar.gz format

    const zipCmd = new Deno.Command("zip", {
      args: ["-r", outputPath, "."],
      cwd: tempDir,
      stdout: "piped",
      stderr: "piped",
    });

    const result = await zipCmd.output();
    if (!result.success) {
      // Fall back to tar if zip is not available
      logger.warn("zip command failed, falling back to tar.gz format");
      const tarOutput = outputPath.replace(/\.zip$/, ".tar.gz");
      const tarCmd = new Deno.Command("tar", {
        args: ["-czf", tarOutput, "-C", tempDir, "."],
        stdout: "piped",
        stderr: "piped",
      });
      const tarResult = await tarCmd.output();
      if (!tarResult.success) {
        throw new Error(
          `Failed to create package archive: ${new TextDecoder().decode(tarResult.stderr)}`,
        );
      }
      logger.info(`Package created at ${tarOutput}`);
      return;
    }

    logger.info(`Package created at ${outputPath}`);
  } finally {
    // Cleanup temp directory
    await Deno.remove(tempDir, { recursive: true });
  }
}

/**
 * Main package creation function
 */
export async function createPackage(outputDir?: string): Promise<string> {
  const buildId = readBuildid2(PATHS.buildid2) || "unknown";
  const outDir = outputDir || path.join(PROJECT_ROOT, "_dist", "package");

  logger.info("Creating Noraneko package...");

  // Ensure output directory exists
  await Deno.mkdir(outDir, { recursive: true });

  // Define source directories that make up the package
  const packageSources = {
    content: path.join(PROJECT_ROOT, "bridge/loader-features/_dist"),
    startup: path.join(PROJECT_ROOT, "bridge/startup/_dist"),
    skin: path.join(PROJECT_ROOT, "browser-features/skin"),
    resource: path.join(PROJECT_ROOT, "bridge/loader-modules/_dist"),
  };

  // Verify all sources exist
  for (const [name, sourcePath] of Object.entries(packageSources)) {
    if (!exists(sourcePath)) {
      throw new Error(
        `Source directory not found: ${sourcePath}. Run 'feles-build build' first.`,
      );
    }
  }

  // Create a staging directory that mirrors the final package structure
  const stagingDir = await Deno.makeTempDir({ prefix: "nora-staging-" });

  try {
    // Copy all sources to staging
    for (const [name, sourcePath] of Object.entries(packageSources)) {
      const destDir = path.join(stagingDir, name);
      await copyDir(sourcePath, destDir);
    }

    // Create manifest from staging directory
    const manifest = await createManifest(stagingDir, buildId);

    // Create the package file
    const packageName = `noraneko-${manifest.version}-${buildId.substring(0, 8)}.nora.zip`;
    const packagePath = path.join(outDir, packageName);

    // Remove existing package if present
    if (exists(packagePath)) {
      safeRemove(packagePath);
    }

    await createPackageZip(stagingDir, manifest, packagePath);

    // Also write manifest separately for signing
    const manifestPath = path.join(outDir, `${packageName}.manifest.json`);
    await Deno.writeTextFile(manifestPath, JSON.stringify(manifest, null, 2));

    logger.success(`Package created: ${packagePath}`);
    return packagePath;
  } finally {
    await Deno.remove(stagingDir, { recursive: true });
  }
}

/**
 * Copy a directory recursively
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await Deno.mkdir(dest, { recursive: true });

  for await (const entry of Deno.readDir(src)) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory) {
      await copyDir(srcPath, destPath);
    } else if (entry.isFile) {
      await Deno.copyFile(srcPath, destPath);
    } else if (entry.isSymlink) {
      // Resolve symlink and copy the actual content
      const realPath = await Deno.realPath(srcPath);
      const stat = await Deno.stat(realPath);
      if (stat.isDirectory) {
        await copyDir(realPath, destPath);
      } else {
        await Deno.copyFile(realPath, destPath);
      }
    }
  }
}

/**
 * Run the packager from CLI
 */
export async function run(outputDir?: string): Promise<void> {
  try {
    await createPackage(outputDir);
  } catch (e: unknown) {
    const error = e as Error;
    logger.error(`Package creation failed: ${error?.message ?? e}`);
    throw e;
  }
}
