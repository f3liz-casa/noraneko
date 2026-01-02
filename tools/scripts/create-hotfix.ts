#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env
// SPDX-License-Identifier: MPL-2.0

/**
 * Hotfix Patch Creator
 *
 * Interactive CLI tool for creating hotfix patches in the Noraneko build system.
 * This tool helps developers quickly set up hotfix patches for bug fixes.
 *
 * Usage:
 *   deno task hotfix:create
 *
 * What it does:
 * 1. Prompts for hotfix details (ID, version, description, modules)
 * 2. Copies module files to hotfixes/source/patches/
 * 3. Generates a template manifest structure
 * 4. Calculates SHA-256 hashes for patch files
 * 5. Creates a README with instructions for signing and distribution
 */

import { parseArgs } from "@std/cli/parse-args";
import { join, dirname } from "@std/path";
import { ensureDir, exists } from "@std/fs";
import { encodeHex } from "@std/encoding/hex";

interface HotfixConfig {
  id: string;
  version: string;
  description: string;
  modules: string[];
  minVersion: string;
  maxVersion?: string;
  targetChannels?: string[];
}

interface PatchInfo {
  moduleName: string;
  originalModulePath: string;
  patchedModulePath: string;
  patchedModuleHash: string;
}

// Constants
const HASH_DISPLAY_LENGTH = 16;

/**
 * Compute SHA-256 hash of a file
 */
async function computeFileHash(filePath: string): Promise<string> {
  const content = await Deno.readFile(filePath);
  const hashBuffer = await crypto.subtle.digest("SHA-256", content);
  const hashArray = new Uint8Array(hashBuffer);
  return encodeHex(hashArray);
}

/**
 * Read user input from stdin
 */
async function readInput(): Promise<string> {
  const buf = new Uint8Array(8192); // Increased buffer for longer inputs
  const n = await Deno.stdin.read(buf);
  if (n === null) {
    return "";
  }
  return new TextDecoder().decode(buf.subarray(0, n)).trim();
}

/**
 * Prompt user for input with a default value
 */
async function prompt(message: string, defaultValue?: string): Promise<string> {
  const defaultText = defaultValue ? ` [${defaultValue}]` : "";
  console.log(`${message}${defaultText}`);
  const input = await readInput();
  
  if (input === "") {
    return defaultValue || "";
  }
  
  return input;
}

/**
 * Prompt user for confirmation
 */
async function confirm(message: string): Promise<boolean> {
  console.log(`${message} (y/N)`);
  const input = await readInput();
  return input.toLowerCase() === "y" || input.toLowerCase() === "yes";
}

/**
 * Interactive prompts to gather hotfix configuration
 */
async function gatherHotfixConfig(): Promise<HotfixConfig> {
  console.log("\n🔧 Noraneko Hotfix Creator\n");
  console.log("This tool will help you create a hotfix patch.\n");

  // Hotfix ID
  const id = await prompt(
    "Hotfix ID (e.g., fix-sidebar-crash):",
  );
  if (!id) {
    throw new Error("Hotfix ID is required");
  }

  // Version
  const version = await prompt(
    "Version (semver, e.g., 1.0.0):",
    "1.0.0",
  );

  // Description
  const description = await prompt(
    "Description (user-facing):",
  );
  if (!description) {
    throw new Error("Description is required");
  }

  // Modules to patch
  const modulesInput = await prompt(
    "Module names to patch (comma-separated, e.g., sidebar,tabs):",
  );
  if (!modulesInput) {
    throw new Error("At least one module is required");
  }
  const modules = modulesInput.split(",").map((m) => m.trim()).filter((m) => m.length > 0);

  // Min version
  const minVersion = await prompt(
    "Minimum Noraneko version:",
    "0.0.0",
  );

  // Max version (optional)
  const maxVersionInput = await prompt(
    "Maximum Noraneko version (leave empty for no limit):",
    "",
  );
  const maxVersion = maxVersionInput || undefined;

  // Target channels (optional)
  const channelsInput = await prompt(
    "Target channels (comma-separated: nightly,beta,release, or leave empty for all):",
    "",
  );
  const targetChannels = channelsInput
    ? channelsInput.split(",").map((c) => c.trim()).filter((c) => c.length > 0)
    : undefined;

  return {
    id,
    version,
    description,
    modules,
    minVersion,
    maxVersion,
    targetChannels,
  };
}

// Directories to exclude from recursive search
const EXCLUDED_DIRS = [".git", "node_modules", ".deno", "_dist", "dist"];

/**
 * Recursively search for a file in a directory
 */
async function findFileRecursive(
  dir: string,
  fileName: string,
): Promise<string | null> {
  try {
    for await (const entry of Deno.readDir(dir)) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isFile && entry.name === fileName) {
        return fullPath;
      }
      
      if (entry.isDirectory && !EXCLUDED_DIRS.includes(entry.name) && !entry.name.startsWith(".")) {
        const found = await findFileRecursive(fullPath, fileName);
        if (found) {
          return found;
        }
      }
    }
  } catch {
    // Directory might not exist or not accessible
  }
  return null;
}

/**
 * Copy module files to hotfixes/source/patches/
 */
async function copyModuleFiles(
  repoRoot: string,
  modules: string[],
): Promise<PatchInfo[]> {
  const patchInfos: PatchInfo[] = [];
  const patchesDir = join(repoRoot, "hotfixes", "source", "patches");

  await ensureDir(patchesDir);

  for (const moduleName of modules) {
    // Try common locations for module files
    const possiblePaths = [
      join(repoRoot, "browser-features", "modules", "modules", `${moduleName}.sys.mts`),
      join(repoRoot, "browser-features", "modules", "actors", `${moduleName}.sys.mts`),
      join(repoRoot, "bridge", "loader-features", "loader", `${moduleName}.ts`),
      join(repoRoot, "bridge", "loader-features", `${moduleName}.ts`),
      join(repoRoot, "bridge", "loader-modules", `${moduleName}.ts`),
    ];

    let sourceFile: string | null = null;
    
    // First try exact paths
    for (const path of possiblePaths) {
      if (await exists(path)) {
        sourceFile = path;
        break;
      }
    }

    // If not found, search in browser-features/chrome subdirectories
    if (!sourceFile) {
      const chromeSearchDirs = [
        join(repoRoot, "browser-features", "chrome", "static"),
        join(repoRoot, "browser-features", "chrome", "utils"),
        join(repoRoot, "browser-features", "chrome", "common"),
        join(repoRoot, "browser-features", "chrome", "experiment"),
      ];
      
      for (const searchDir of chromeSearchDirs) {
        if (await exists(searchDir)) {
          // Search for .ts, .tsx, or .mts files recursively
          const extensions = [".ts", ".tsx", ".mts"];
          for (const ext of extensions) {
            const foundFile = await findFileRecursive(searchDir, `${moduleName}${ext}`);
            if (foundFile) {
              sourceFile = foundFile;
              break;
            }
          }
          if (sourceFile) break;
        }
      }
      
      // If still not found, try the chrome root directory for top-level files
      if (!sourceFile) {
        const chromeRoot = join(repoRoot, "browser-features", "chrome");
        const extensions = [".ts", ".tsx", ".mts"];
        for (const ext of extensions) {
          const topLevelFile = join(chromeRoot, `${moduleName}${ext}`);
          if (await exists(topLevelFile)) {
            sourceFile = topLevelFile;
            break;
          }
        }
      }
    }

    if (!sourceFile) {
      console.error(`❌ Module file not found for: ${moduleName}`);
      console.error(`   Searched in: ${possiblePaths.join(", ")}`);
      console.error(`   Also searched browser-features/chrome subdirectories`);
      throw new Error(`Module file not found: ${moduleName}`);
    }

    // Determine target file extension
    // .sys.mts files become .sys.mjs, .mts files become .mjs, .ts/.tsx files become .js/.jsx
    let targetExt: string;
    
    if (sourceFile.endsWith(".sys.mts")) {
      targetExt = ".sys.mjs";
    } else if (sourceFile.endsWith(".mts")) {
      targetExt = ".mjs";
    } else if (sourceFile.endsWith(".tsx")) {
      targetExt = ".jsx";
    } else if (sourceFile.endsWith(".ts")) {
      targetExt = ".js";
    } else {
      console.error(`❌ Unsupported file extension for: ${sourceFile}`);
      throw new Error(`Unsupported file extension: ${sourceFile}`);
    }
    
    const targetFile = join(patchesDir, `${moduleName}${targetExt}`);

    // Copy file
    await Deno.copyFile(sourceFile, targetFile);
    console.log(`✅ Copied: ${sourceFile} → ${targetFile}`);

    // Compute hash
    const hash = await computeFileHash(targetFile);

    patchInfos.push({
      moduleName,
      originalModulePath: `resource://noraneko/modules/${moduleName}${targetExt}`,
      patchedModulePath: `patches/${moduleName}${targetExt}`,
      patchedModuleHash: hash,
    });
  }

  return patchInfos;
}

/**
 * Generate manifest template
 */
async function generateManifestTemplate(
  config: HotfixConfig,
  patches: PatchInfo[],
  repoRoot: string,
): Promise<string> {
  // Compute deno.lock hash for dependency change detection
  const denoLockPath = join(repoRoot, "deno.lock");
  let denoLockHash = "";
  if (await exists(denoLockPath)) {
    denoLockHash = await computeFileHash(denoLockPath);
    console.log(`✅ Computed deno.lock hash: ${denoLockHash.substring(0, HASH_DISPLAY_LENGTH)}...`);
  } else {
    console.warn("⚠️  deno.lock not found, skipping hash computation");
  }

  const manifest: Record<string, any> = {
    id: config.id,
    version: config.version,
    description: config.description,
    unlockCode: "WILL_BE_GENERATED_BY_WORKFLOW",
    patches: patches,
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
  
  // Add optional fields only if they have values
  if (config.maxVersion) {
    manifest.maxVersion = config.maxVersion;
  }
  if (config.targetChannels && config.targetChannels.length > 0) {
    manifest.targetChannels = config.targetChannels;
  }
  // Add deno.lock hash for hotswap change detection
  if (denoLockHash) {
    manifest.denoLockHash = denoLockHash;
  }

  return JSON.stringify(manifest, null, 2);
}

/**
 * Generate README with instructions
 */
function generateReadme(config: HotfixConfig, patches: PatchInfo[]): string {
  return `# Hotfix: ${config.id}

**Version:** ${config.version}  
**Description:** ${config.description}

## Modules Patched

${patches.map((p) => `- \`${p.moduleName}\` (hash: \`${p.patchedModuleHash.substring(0, HASH_DISPLAY_LENGTH)}...\`)`).join("\n")}

## Next Steps

### 1. Edit the Patch Files

The module files have been copied to \`hotfixes/source/patches/\`. Edit them to fix the bug:

${patches.map((p) => `- \`hotfixes/source/${p.patchedModulePath}\``).join("\n")}

### 2. Test Your Changes Locally

Before signing, test your changes locally:
1. Build the project: \`deno task feles-build\`
2. Test the patched modules
3. Verify the fix works as expected

### 3. Sign and Publish the Hotfix

Once tested, use the GitHub Actions workflow to sign the hotfix:

1. Go to: **Actions → 🔐 Sign Hotfix**
2. Fill in the workflow parameters:
   - **hotfix_id**: \`${config.id}\`
   - **version**: \`${config.version}\`
   - **description**: \`${config.description}\`
   - **patch_modules**: \`${config.modules.join(",")}\`
   - **min_version**: \`${config.minVersion}\`${config.maxVersion ? `\n   - **max_version**: \`${config.maxVersion}\`` : ""}

3. Run the workflow

The workflow will:
- Generate a unique unlock code (e.g., \`NK-7F2A\`)
- Sign the manifest using Sigstore (keyless)
- Record the signature in Rekor transparency log
- Upload the hotfix artifacts

### 4. Distribute the Unlock Code

Share the generated unlock code with testers or affected users. They can enter this code in **Settings → Advanced → Hotfix** to download and install the patch.

## Manifest Template

A manifest template has been saved to \`hotfixes/source/${config.id}-manifest-template.json\`.

This is for reference only - the actual manifest will be generated and signed by the workflow.

## Security Notes

- All hotfixes are signed using Sigstore keyless signing
- Signatures are recorded in the Rekor transparency log
- Only official GitHub Actions workflows can sign valid hotfixes
- Users will see the signer identity before installation

## Reverting

Users can revert hotfixes from Settings → Advanced → Hotfix by selecting the installed hotfix and clicking "Revert".
`;
}

/**
 * Main function
 */
async function main() {
  const args = parseArgs(Deno.args, {
    boolean: ["help", "non-interactive"],
    string: ["id", "version", "description", "modules"],
    alias: { h: "help" },
  });

  if (args.help) {
    console.log(`
Noraneko Hotfix Creator

Usage:
  deno task hotfix:create [options]

Options:
  --help, -h              Show this help message
  --non-interactive       Use command line arguments instead of prompts
  --id <id>               Hotfix ID (e.g., fix-sidebar-crash)
  --version <version>     Hotfix version (e.g., 1.0.0)
  --description <desc>    Description of the hotfix
  --modules <modules>     Comma-separated list of modules to patch

Examples:
  # Interactive mode (default)
  deno task hotfix:create

  # Non-interactive mode
  deno task hotfix:create --non-interactive --id fix-sidebar-crash --version 1.0.0 --description "Fix sidebar crash" --modules sidebar
    `);
    Deno.exit(0);
  }

  try {
    // Determine repository root (current directory should be repo root)
    const repoRoot = Deno.cwd();
    
    // Check if we're in the right directory
    const packageJsonPath = join(repoRoot, "package.json");
    if (!(await exists(packageJsonPath))) {
      console.error("❌ Error: Please run this script from the repository root");
      Deno.exit(1);
    }

    let config: HotfixConfig;

    if (args["non-interactive"]) {
      // Use command line arguments
      if (!args.id || !args.version || !args.description || !args.modules) {
        console.error("❌ Error: --id, --version, --description, and --modules are required in non-interactive mode");
        Deno.exit(1);
      }

      config = {
        id: args.id,
        version: args.version,
        description: args.description,
        modules: args.modules.split(",").map((m) => m.trim()),
        minVersion: "0.0.0",
      };
    } else {
      // Interactive mode
      config = await gatherHotfixConfig();
    }

    console.log("\n📋 Hotfix Configuration:");
    console.log(JSON.stringify(config, null, 2));
    console.log();

    if (!args["non-interactive"]) {
      const proceed = await confirm("Proceed with creating hotfix?");
      if (!proceed) {
        console.log("❌ Cancelled");
        Deno.exit(0);
      }
    }

    console.log("\n🔨 Creating hotfix...\n");

    // Copy module files
    const patches = await copyModuleFiles(repoRoot, config.modules);

    // Generate manifest template (includes deno.lock hash)
    const manifestTemplate = await generateManifestTemplate(config, patches, repoRoot);
    const manifestPath = join(
      repoRoot,
      "hotfixes",
      "source",
      `${config.id}-manifest-template.json`,
    );
    await Deno.writeTextFile(manifestPath, manifestTemplate);
    console.log(`✅ Generated manifest template: ${manifestPath}`);

    // Generate README
    const readme = generateReadme(config, patches);
    const readmePath = join(repoRoot, "hotfixes", "source", `${config.id}-README.md`);
    await Deno.writeTextFile(readmePath, readme);
    console.log(`✅ Generated README: ${readmePath}`);

    console.log("\n✅ Hotfix created successfully!\n");
    console.log("Next steps:");
    console.log(`1. Edit the patch files in hotfixes/source/patches/`);
    console.log(`2. Test your changes locally`);
    console.log(`3. Read the instructions in: ${readmePath}`);
    console.log(`4. Sign the hotfix using GitHub Actions workflow\n`);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    Deno.exit(1);
  }
}

// Run main function
if (import.meta.main) {
  main();
}
