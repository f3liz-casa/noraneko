#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run
// SPDX-License-Identifier: MPL-2.0

/**
 * NMA (Noraneko Module Archive) Builder
 *
 * Creates NMA packages from built Noraneko modules.
 * The NMA is a ZIP-based archive containing:
 * - manifest.json - Archive metadata and signature
 * - modules/ - Built JavaScript modules
 * - assets/ - Static assets (CSS, images, etc.)
 *
 * Usage:
 *   deno task nma:build [options]
 *
 * Options:
 *   --output <path>    Output NMA file path (default: noraneko.nma)
 *   --source <path>    Source directory with built modules
 *   --version <ver>    Noraneko version
 *   --channel <ch>     Update channel (nightly, beta, release)
 *   --sign             Sign with Sigstore (requires cosign)
 */

import { parseArgs } from "@std/cli/parse-args";
import { join, basename, relative, dirname as _dirname } from "@std/path";
import { exists, walk } from "@std/fs";
import { encodeHex } from "@std/encoding/hex";

// ============================================================================
// Types
// ============================================================================

interface NMABuildConfig {
  outputPath: string;
  sourceDir: string;
  version: string;
  channel: "nightly" | "beta" | "release" | "default";
  commitSha: string;
  sign: boolean;
}

interface ModuleEntry {
  name: string;
  path: string;
  hash: string;
  size: number;
  dependencies: string[];
  essential: boolean;
  sourceFiles?: { path: string; hash: string }[];
}

interface AssetEntry {
  name: string;
  path: string;
  hash: string;
  size: number;
  mimeType: string;
}

// ============================================================================
// Hash Computation
// ============================================================================

async function computeFileHash(filePath: string): Promise<string> {
  const content = await Deno.readFile(filePath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", content);
  return encodeHex(new Uint8Array(hashBuffer));
}

async function computeContentHash(content: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", content);
  return encodeHex(new Uint8Array(hashBuffer));
}

// ============================================================================
// MIME Type Detection
// ============================================================================

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeTypes: Record<string, string> = {
    js: "application/javascript",
    mjs: "application/javascript",
    json: "application/json",
    css: "text/css",
    html: "text/html",
    xhtml: "application/xhtml+xml",
    svg: "image/svg+xml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

// ============================================================================
// Module Discovery
// ============================================================================

// ============================================================================
// Module Discovery
// ============================================================================

async function discoverModules(sourceDir: string): Promise<ModuleEntry[]> {
  const metadataPath = join(sourceDir, "nma-metadata.json");

  if (!(await exists(metadataPath))) {
    console.warn(`[NMABuilder] Metadata not found: ${metadataPath}`);
    return [];
  }

  const metadataContent = await Deno.readTextFile(metadataPath);
  const metadata = JSON.parse(metadataContent);
  const modules: ModuleEntry[] = [];

  for (const mod of metadata.modules) {
    const fullPath = join(sourceDir, mod.path);
    if (await exists(fullPath)) {
      const content = await Deno.readFile(fullPath);
      // Use source hash from metadata if available (to avoid Vite artifact noise), otherwise fallback to content hash
      const hash = mod.hash || (await computeContentHash(content));
      const stat = await Deno.stat(fullPath);

      modules.push({
        name: mod.name,
        path: mod.path,
        hash,
        size: stat.size,
        dependencies: mod.dependencies,
        essential: mod.essential,
        sourceFiles: mod.sourceFiles,
      });
    } else {
      console.warn(`[NMABuilder] Module file missing: ${fullPath}`);
    }
  }

  console.log(
    `[NMABuilder] Discovered ${modules.length} modules from metadata`,
  );
  return modules;
}

/** List of essential module names that are required for browser startup */
const ESSENTIAL_MODULES = new Set([
  "core",
  "index",
  "main",
  "startup",
  "bootstrap",
]);

// ============================================================================
// Asset Discovery
// ============================================================================

async function discoverAssets(sourceDir: string): Promise<AssetEntry[]> {
  const assets: AssetEntry[] = [];
  const assetsDir = join(sourceDir, "assets");

  if (!(await exists(assetsDir))) {
    console.warn(`[NMABuilder] Assets directory not found: ${assetsDir}`);
    return assets;
  }

  for await (const entry of walk(assetsDir, {
    includeDirs: false,
  })) {
    const relativePath = relative(sourceDir, entry.path);
    const content = await Deno.readFile(entry.path);
    const hash = await computeContentHash(content);
    const stat = await Deno.stat(entry.path);

    assets.push({
      name: entry.name,
      path: relativePath.replace(/\\/g, "/"),
      hash,
      size: stat.size,
      mimeType: getMimeType(entry.path),
    });
  }

  console.log(`[NMABuilder] Discovered ${assets.length} assets`);
  return assets;
}

// ============================================================================
// Manifest Generation
// ============================================================================

function generateBuildId(): string {
  // UUID v7-like format: timestamp-random
  const timestamp = Date.now().toString(16).padStart(12, "0");
  const random = crypto.getRandomValues(new Uint8Array(4));
  const randomHex = encodeHex(random);
  return `${timestamp}-${randomHex}`;
}

async function getGitCommitSha(): Promise<string> {
  try {
    const process = new Deno.Command("git", {
      args: ["rev-parse", "HEAD"],
      stdout: "piped",
      stderr: "null",
    });
    const output = await process.output();
    if (output.success) {
      return new TextDecoder().decode(output.stdout).trim();
    }
  } catch {
    // Ignore git errors
  }
  return "unknown";
}

interface UnsignedManifest {
  formatVersion: "1.0";
  buildId: string;
  noranekoVersion: string;
  commitSha: string;
  builtAt: string;
  channel: string;
  modules: ModuleEntry[];
  assets: AssetEntry[];
  archiveHash: string;
  isDelta: boolean;
  minVersion: string;
}

function createUnsignedManifest(
  config: NMABuildConfig,
  modules: ModuleEntry[],
  assets: AssetEntry[],
): UnsignedManifest {
  return {
    formatVersion: "1.0",
    buildId: generateBuildId(),
    noranekoVersion: config.version,
    commitSha: config.commitSha,
    builtAt: new Date().toISOString(),
    channel: config.channel,
    modules,
    assets,
    archiveHash: "", // Will be computed after archive creation
    isDelta: false,
    minVersion: "0.0.0",
  };
}

// ============================================================================
// ZIP Archive Creation
// ============================================================================

// @ts-types="npm:@types/jszip"
import JSZip from "npm:jszip";

async function createNMAArchive(
  outputPath: string,
  sourceDir: string,
  manifest: UnsignedManifest,
): Promise<void> {
  console.log(`[NMABuilder] Creating NMA archive: ${outputPath}`);

  const zip = new JSZip();

  // Add modules
  for (const module of manifest.modules) {
    const srcPath = join(sourceDir, module.path);
    const content = await Deno.readFile(srcPath);
    zip.file(module.path, content);
  }

  // Add assets
  for (const asset of manifest.assets) {
    const srcPath = join(sourceDir, asset.path);
    const content = await Deno.readFile(srcPath);
    zip.file(asset.path, content);
  }

  // Add manifest
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));

  // Generate zip file
  const content = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  // Write to file
  await Deno.writeFile(outputPath, content);
  console.log(`[NMABuilder] Archive created: ${outputPath}`);
}

// ============================================================================
// Signing
// ============================================================================

async function signNMAArchive(
  _archivePath: string,
  manifestPath: string,
): Promise<void> {
  console.log(`[NMABuilder] Signing NMA archive with Sigstore...`);

  // Check if cosign is available
  const cosignCheck = new Deno.Command("which", {
    args: ["cosign"],
    stdout: "null",
    stderr: "null",
  });
  const cosignCheckResult = await cosignCheck.output();

  if (!cosignCheckResult.success) {
    console.warn("[NMABuilder] cosign not found, skipping signing");
    console.warn(
      "[NMABuilder] Install cosign for production signing: https://docs.sigstore.dev/cosign/installation/",
    );
    return;
  }

  // Sign the manifest using cosign
  const bundlePath = manifestPath.replace(".json", "-signature-bundle.json");

  const signProcess = new Deno.Command("cosign", {
    args: [
      "sign-blob",
      "--yes",
      "--oidc-issuer",
      "https://token.actions.githubusercontent.com",
      "--bundle",
      bundlePath,
      manifestPath,
    ],
    stdout: "piped",
    stderr: "piped",
    env: {
      ...Deno.env.toObject(),
      COSIGN_EXPERIMENTAL: "1",
    },
  });

  const signOutput = await signProcess.output();
  if (!signOutput.success) {
    const stderr = new TextDecoder().decode(signOutput.stderr);
    console.error(`[NMABuilder] Signing failed: ${stderr}`);
    console.warn("[NMABuilder] Archive created without signature");
    return;
  }

  console.log(`[NMABuilder] Archive signed successfully`);
  console.log(`[NMABuilder] Signature bundle: ${bundlePath}`);
}

// ============================================================================
// Main Builder
// ============================================================================

async function buildNMA(config: NMABuildConfig): Promise<void> {
  console.log("\n🔨 NMA Builder - Noraneko Module Archive\n");
  console.log(`Source: ${config.sourceDir}`);
  console.log(`Output: ${config.outputPath}`);
  console.log(`Version: ${config.version}`);
  console.log(`Channel: ${config.channel}`);
  console.log(`Sign: ${config.sign}`);
  console.log("");

  // Verify source directory exists
  if (!(await exists(config.sourceDir))) {
    throw new Error(`Source directory not found: ${config.sourceDir}`);
  }

  // Discover modules and assets
  const modules = await discoverModules(config.sourceDir);
  const assets = await discoverAssets(config.sourceDir);

  if (modules.length === 0) {
    console.warn("[NMABuilder] No modules found, creating empty archive");
  }

  // Create unsigned manifest
  const manifest = createUnsignedManifest(config, modules, assets);

  // Create the archive
  await createNMAArchive(config.outputPath, config.sourceDir, manifest);

  // Compute archive hash and update manifest
  const archiveHash = await computeFileHash(config.outputPath);
  manifest.archiveHash = archiveHash;
  console.log(`[NMABuilder] Archive hash: ${archiveHash.substring(0, 16)}...`);

  // Sign if requested
  if (config.sign) {
    // Extract manifest, sign, and re-archive
    const tempManifestPath = config.outputPath.replace(
      ".nma",
      "-manifest.json",
    );
    await Deno.writeTextFile(
      tempManifestPath,
      JSON.stringify(manifest, null, 2),
    );
    await signNMAArchive(config.outputPath, tempManifestPath);

    // Cleanup temp files
    try {
      await Deno.remove(tempManifestPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  console.log("\n✅ NMA build complete!\n");
  console.log(`Archive: ${config.outputPath}`);
  console.log(`Build ID: ${manifest.buildId}`);
  console.log(`Modules: ${modules.length}`);
  console.log(`Assets: ${assets.length}`);
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(Deno.args, {
    string: ["output", "source", "version", "channel", "type", "commit"],
    boolean: ["help", "sign"],
    alias: {
      h: "help",
      o: "output",
      s: "source",
      v: "version",
      c: "channel",
      t: "type",
    },
    default: {
      source: "browser-features/chrome/_dist",
      version: "0.0.0",
      channel: "nightly",
      sign: false,
    },
  });

  if (args.help) {
    console.log(`
NMA Builder - Noraneko Module Archive

Creates NMA packages from built Noraneko modules.
NMA is the primary distribution format for browser-features/chrome modules.

Usage:
  deno task nma:build [options]

Options:
  --output, -o <path>    Output NMA file path (default: <type>_<version>_noraneko.nma.zip)
  --source, -s <path>    Source directory with built modules
  --version, -v <ver>    Noraneko version (default: 0.0.0)
  --channel, -c <ch>     Update channel: nightly, beta, release (default: nightly)
  --type, -t <type>      Module type: stable, hotfix, beta, nightly (auto-detected from channel if not set)
  --commit <sha>         Git commit SHA (auto-detected if not provided)
  --sign                 Sign with Sigstore (requires cosign)
  --help, -h             Show this help message

Examples:
  # Build default (nightly_0.0.0_noraneko.nma.zip)
  deno task nma:build

  # Build basic release
  deno task nma:build --channel release --version 1.0.0
  # Output: stable_1.0.0_noraneko.nma.zip

  # Build hotfix
  deno task nma:build --type hotfix --version 1.0.1
  # Output: hotfix_1.0.1_noraneko.nma.zip
    `);
    return;
  }

  const commitSha = args.commit || (await getGitCommitSha());

  // Resolve type from argument or channel
  let type = args.type;
  if (!type) {
    switch (args.channel) {
      case "release":
        type = "stable";
        break;
      case "beta":
        type = "beta";
        break;
      case "nightly":
        type = "nightly";
        break;
      default:
        type = "stable";
    }
  }

  // Generate default output path if not specified
  let outputPath = args.output;
  if (!outputPath) {
    outputPath = `${type}_${args.version}_noraneko.nma.zip`;
  }

  const config: NMABuildConfig = {
    outputPath,
    sourceDir: args.source,
    version: args.version,
    channel: args.channel as "nightly" | "beta" | "release" | "default",
    commitSha,
    sign: args.sign,
  };

  try {
    await buildNMA(config);
  } catch (error) {
    console.error(`\n❌ Build failed: ${(error as Error).message}`);
    Deno.exit(1);
  }
}

// Run main function
if (import.meta.main) {
  main();
}

// Export for programmatic use
export { buildNMA, type NMABuildConfig };
