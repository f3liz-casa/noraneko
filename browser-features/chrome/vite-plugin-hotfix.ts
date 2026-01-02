// SPDX-License-Identifier: MPL-2.0

/**
 * Vite Plugin: Hotfix Creator
 * 
 * Julia/Kotlin-like functional patterns:
 * - Pure functions for hotfix generation
 * - Pipeline-style composition
 * 
 * This plugin enables hotfix creation as part of the Vite build process.
 * It can be triggered via build mode or dev server commands.
 */

import type { Plugin, ResolvedConfig } from "vite";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir, stat, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, extname, basename } from "node:path";

// ============================================================================
// Types - Data Structures
// ============================================================================

/** Hotfix configuration */
export interface HotfixConfig {
  id: string;
  version: string;
  description: string;
  modules: string[];
  minVersion: string;
  maxVersion?: string;
  targetChannels?: string[];
}

/** Patch info for a module */
interface PatchInfo {
  moduleName: string;
  originalModulePath: string;
  patchedModulePath: string;
  patchedModuleHash: string;
}

/** Plugin options */
export interface HotfixPluginOptions {
  /** Output directory for hotfixes (relative to project root) */
  outputDir?: string;
  /** Enable hotfix generation on build */
  enableOnBuild?: boolean;
}

// ============================================================================
// Pure Functions - Hash Computation
// ============================================================================

/** Compute SHA-256 hash of content */
const computeHash = (content: string | Buffer): string => {
  const hash = createHash("sha256");
  hash.update(content);
  return hash.digest("hex");
};

/** Compute hash of a file */
const computeFileHash = async (filePath: string): Promise<string> => {
  const content = await readFile(filePath);
  return computeHash(content);
};

// ============================================================================
// Pure Functions - File Discovery
// ============================================================================

/** Directories to exclude from search */
const EXCLUDED_DIRS = [".git", "node_modules", ".deno", "_dist", "dist"];

/** Recursively search for a file */
const findFileRecursive = async (dir: string, fileName: string): Promise<string | null> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isFile() && entry.name === fileName) {
        return fullPath;
      }
      
      if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name) && !entry.name.startsWith(".")) {
        const found = await findFileRecursive(fullPath, fileName);
        if (found) return found;
      }
    }
  } catch {
    // Directory might not exist
  }
  return null;
};

/** Find module source file */
const findModuleFile = async (repoRoot: string, moduleName: string): Promise<string | null> => {
  // Common locations
  const possiblePaths = [
    join(repoRoot, "browser-features", "modules", "modules", `${moduleName}.sys.mts`),
    join(repoRoot, "browser-features", "modules", "actors", `${moduleName}.sys.mts`),
    join(repoRoot, "bridge", "loader-features", "loader", `${moduleName}.ts`),
    join(repoRoot, "bridge", "loader-features", `${moduleName}.ts`),
    join(repoRoot, "bridge", "loader-modules", `${moduleName}.ts`),
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) return path;
  }

  // Search chrome subdirectories
  const chromeSearchDirs = [
    join(repoRoot, "browser-features", "chrome", "static"),
    join(repoRoot, "browser-features", "chrome", "utils"),
    join(repoRoot, "browser-features", "chrome", "common"),
    join(repoRoot, "browser-features", "chrome", "experiment"),
  ];

  for (const searchDir of chromeSearchDirs) {
    if (existsSync(searchDir)) {
      const extensions = [".ts", ".tsx", ".mts"];
      for (const ext of extensions) {
        const found = await findFileRecursive(searchDir, `${moduleName}${ext}`);
        if (found) return found;
      }
    }
  }

  // Chrome root
  const chromeRoot = join(repoRoot, "browser-features", "chrome");
  const extensions = [".ts", ".tsx", ".mts"];
  for (const ext of extensions) {
    const topLevelFile = join(chromeRoot, `${moduleName}${ext}`);
    if (existsSync(topLevelFile)) return topLevelFile;
  }

  return null;
};

/** Get target extension for compiled file */
const getTargetExtension = (sourceFile: string): string => {
  if (sourceFile.endsWith(".sys.mts")) return ".sys.mjs";
  if (sourceFile.endsWith(".mts")) return ".mjs";
  if (sourceFile.endsWith(".tsx")) return ".jsx";
  if (sourceFile.endsWith(".ts")) return ".js";
  return ".js";
};

// ============================================================================
// Pure Functions - Manifest Generation
// ============================================================================

/** Copy module files to hotfix directory */
const copyModuleFiles = async (
  repoRoot: string,
  modules: string[],
  patchesDir: string,
): Promise<PatchInfo[]> => {
  const patchInfos: PatchInfo[] = [];

  await mkdir(patchesDir, { recursive: true });

  for (const moduleName of modules) {
    const sourceFile = await findModuleFile(repoRoot, moduleName);
    
    if (!sourceFile) {
      console.error(`❌ Module file not found for: ${moduleName}`);
      throw new Error(`Module file not found: ${moduleName}`);
    }

    const targetExt = getTargetExtension(sourceFile);
    const targetFile = join(patchesDir, `${moduleName}${targetExt}`);

    await copyFile(sourceFile, targetFile);
    console.log(`✅ Copied: ${sourceFile} → ${targetFile}`);

    const hash = await computeFileHash(targetFile);

    patchInfos.push({
      moduleName,
      originalModulePath: `resource://noraneko/modules/${moduleName}${targetExt}`,
      patchedModulePath: `patches/${moduleName}${targetExt}`,
      patchedModuleHash: hash,
    });
  }

  return patchInfos;
};

/** Generate manifest template */
const generateManifestTemplate = async (
  config: HotfixConfig,
  patches: PatchInfo[],
  repoRoot: string,
): Promise<string> => {
  const denoLockPath = join(repoRoot, "deno.lock");
  let denoLockHash = "";
  
  if (existsSync(denoLockPath)) {
    denoLockHash = await computeFileHash(denoLockPath);
    console.log(`✅ Computed deno.lock hash: ${denoLockHash.substring(0, 16)}...`);
  }

  const manifest: Record<string, any> = {
    id: config.id,
    version: config.version,
    description: config.description,
    unlockCode: "WILL_BE_GENERATED_BY_WORKFLOW",
    patches,
    sigstoreBundle: {
      bundle: "WILL_BE_GENERATED_BY_WORKFLOW",
      signerIdentity: {
        issuer: "https://token.actions.githubusercontent.com",
        subject: "WILL_BE_GENERATED_BY_WORKFLOW",
        repository: "WILL_BE_GENERATED_BY_WORKFLOW",
        workflowRef: ".github/workflows/hotfix_sign.yml@refs/heads/main",
      },
      rekorLogId: "WILL_BE_GENERATED_BY_WORKFLOW",
      signedAt: "WILL_BE_GENERATED_BY_WORKFLOW",
    },
    createdAt: new Date().toISOString(),
    minVersion: config.minVersion,
  };

  if (config.maxVersion) manifest.maxVersion = config.maxVersion;
  if (config.targetChannels?.length) manifest.targetChannels = config.targetChannels;
  if (denoLockHash) manifest.denoLockHash = denoLockHash;

  return JSON.stringify(manifest, null, 2);
};

/** Generate README content */
const generateReadme = (config: HotfixConfig, patches: PatchInfo[]): string => {
  return `# Hotfix: ${config.id}

**Version:** ${config.version}  
**Description:** ${config.description}

## Modules Patched

${patches.map((p) => `- \`${p.moduleName}\` (hash: \`${p.patchedModuleHash.substring(0, 16)}...\`)`).join("\n")}

## Next Steps

1. Edit patch files in \`hotfixes/source/patches/\`
2. Test changes locally with \`deno task feles-build\`
3. Sign via GitHub Actions workflow

## Security Notes

- All hotfixes are signed using Sigstore keyless signing
- Signatures are recorded in the Rekor transparency log
`;
};

// ============================================================================
// Public API - Hotfix Creation
// ============================================================================

/** Create a hotfix from configuration */
export const createHotfix = async (
  config: HotfixConfig,
  repoRoot: string,
  outputDir: string = "hotfixes/source",
): Promise<void> => {
  console.log("\n🔨 Creating hotfix...\n");

  const patchesDir = join(repoRoot, outputDir, "patches");
  const patches = await copyModuleFiles(repoRoot, config.modules, patchesDir);

  const manifestTemplate = await generateManifestTemplate(config, patches, repoRoot);
  const manifestPath = join(repoRoot, outputDir, `${config.id}-manifest-template.json`);
  await writeFile(manifestPath, manifestTemplate, "utf-8");
  console.log(`✅ Generated manifest template: ${manifestPath}`);

  const readme = generateReadme(config, patches);
  const readmePath = join(repoRoot, outputDir, `${config.id}-README.md`);
  await writeFile(readmePath, readme, "utf-8");
  console.log(`✅ Generated README: ${readmePath}`);

  console.log("\n✅ Hotfix created successfully!\n");
};

// ============================================================================
// Vite Plugin
// ============================================================================

/**
 * Vite plugin for hotfix creation
 * 
 * Usage in vite.config.ts:
 * ```typescript
 * import { hotfixPlugin } from "./vite-plugin-hotfix.ts";
 * 
 * export default defineConfig({
 *   plugins: [
 *     hotfixPlugin({
 *       outputDir: "hotfixes/source",
 *       enableOnBuild: false,
 *     }),
 *   ],
 * });
 * ```
 * 
 * Create hotfix via dev server command:
 * ```
 * /__hotfix/create?id=fix-crash&version=1.0.0&modules=sidebar,tabs&description=Fix%20crash
 * ```
 */
export const hotfixPlugin = (options: HotfixPluginOptions = {}): Plugin => {
  const { outputDir = "hotfixes/source", enableOnBuild = false } = options;
  let config: ResolvedConfig;
  let projectRoot: string;

  return {
    name: "noraneko-hotfix",
    
    configResolved(resolvedConfig) {
      config = resolvedConfig;
      projectRoot = config.root;
    },

    configureServer(server) {
      // Add route for hotfix creation via dev server
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__hotfix/create")) {
          return next();
        }

        try {
          const url = new URL(req.url, `http://${req.headers.host}`);
          const params = url.searchParams;

          const id = params.get("id");
          const version = params.get("version") || "1.0.0";
          const modules = params.get("modules")?.split(",").map((m) => m.trim()) || [];
          const description = params.get("description") || "";
          const minVersion = params.get("minVersion") || "0.0.0";
          const maxVersion = params.get("maxVersion") || undefined;
          const targetChannels = params.get("targetChannels")?.split(",").map((c) => c.trim()) || undefined;

          if (!id || modules.length === 0) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: "Missing required parameters: id, modules" }));
            return;
          }

          const hotfixConfig: HotfixConfig = {
            id,
            version,
            description,
            modules,
            minVersion,
            maxVersion,
            targetChannels,
          };

          await createHotfix(hotfixConfig, projectRoot, outputDir);

          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true, hotfixId: id }));
        } catch (error: any) {
          console.error("[HotfixPlugin] Error:", error);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message }));
        }
      });
    },

    async buildEnd() {
      if (!enableOnBuild) return;

      // Check for hotfix config in environment
      const hotfixId = process.env.HOTFIX_ID;
      const hotfixModules = process.env.HOTFIX_MODULES?.split(",");
      
      if (!hotfixId || !hotfixModules) {
        return;
      }

      const hotfixConfig: HotfixConfig = {
        id: hotfixId,
        version: process.env.HOTFIX_VERSION || "1.0.0",
        description: process.env.HOTFIX_DESCRIPTION || "",
        modules: hotfixModules,
        minVersion: process.env.HOTFIX_MIN_VERSION || "0.0.0",
        maxVersion: process.env.HOTFIX_MAX_VERSION,
        targetChannels: process.env.HOTFIX_CHANNELS?.split(","),
      };

      await createHotfix(hotfixConfig, projectRoot, outputDir);
    },
  };
};

export default hotfixPlugin;
