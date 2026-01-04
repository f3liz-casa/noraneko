// SPDX-License-Identifier: MPL-2.0

/**
 * Vite Plugin: Module Hash Manifest Generator
 *
 * Generates a manifest of all output chunks with their content hashes.
 * This enables the hotfix system to:
 * 1. Track which modules have changed between builds
 * 2. Determine if selective or full reload is needed
 * 3. Enable easy GC by tracking old vs new module versions
 *
 * Output: _dist/module-manifest.json
 * {
 *   "features/common/sidebar": {
 *     "file": "assets/js/features/common/sidebar-a1b2c3d4.js",
 *     "hash": "sha256-...",
 *     "size": 12345,
 *     "isFeature": true
 *   },
 *   ...
 * }
 */

import type { Plugin, OutputChunk } from "vite";
import { createHash } from "node:crypto";

// ============================================================================
// Types
// ============================================================================

export interface ModuleManifestEntry {
  /** Output file path relative to dist */
  file: string;
  /** SHA-256 hash of the chunk content */
  hash: string;
  /** Size in bytes */
  size: number;
  /** Whether this is a feature module (can be hotswapped) */
  isFeature: boolean;
  /** Feature category (common, static, etc.) */
  category?: string;
  /** Feature name */
  name?: string;
  /** Chunk dependencies */
  imports?: string[];
  /** Dynamic imports */
  dynamicImports?: string[];
}

export interface ModuleManifest {
  /** Build timestamp */
  buildTime: string;
  /** Build ID */
  buildId?: string;
  /** Version */
  version?: string;
  /** Module entries by chunk name */
  modules: Record<string, ModuleManifestEntry>;
  /** Feature modules only (for quick lookup) */
  features: string[];
}

// ============================================================================
// Plugin Options
// ============================================================================

export interface ModuleManifestPluginOptions {
  /** Output file name (default: module-manifest.json) */
  fileName?: string;
  /** Build ID to include in manifest */
  buildId?: string;
  /** Version to include in manifest */
  version?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/** Compute SHA-256 hash of content */
const computeHash = (content: string): string => {
  return createHash("sha256").update(content).digest("hex");
};

/** Check if a chunk is a feature module */
const isFeatureChunk = (name: string): boolean => {
  return name.startsWith("features/") || name.startsWith("modules/");
};

/** Parse feature info from chunk name */
const parseFeatureInfo = (
  name: string,
): { category?: string; name?: string } => {
  // features/common/sidebar -> { category: "common", name: "sidebar" }
  const featuresMatch = name.match(/^features\/([^/]+)\/([^/]+)$/);
  if (featuresMatch) {
    return { category: featuresMatch[1], name: featuresMatch[2] };
  }

  // modules/sidebar -> { category: "modules", name: "sidebar" }
  const modulesMatch = name.match(/^modules\/([^/]+)$/);
  if (modulesMatch) {
    return { category: "modules", name: modulesMatch[1] };
  }

  return {};
};

// ============================================================================
// Plugin
// ============================================================================

/**
 * Creates a Vite plugin that generates a module hash manifest.
 * This manifest is used by the hotfix system to track module changes.
 */
export function moduleManifestPlugin(
  options: ModuleManifestPluginOptions = {},
): Plugin {
  const { fileName = "module-manifest.json", buildId, version } = options;

  return {
    name: "noraneko-module-manifest",

    generateBundle(_outputOptions, bundle) {
      const manifest: ModuleManifest = {
        buildTime: new Date().toISOString(),
        buildId,
        version,
        modules: {},
        features: [],
      };

      for (const [chunkFileName, chunk] of Object.entries(bundle)) {
        // Only process JS chunks
        if ((chunk as any).type !== "chunk") continue;

        const outputChunk = chunk as OutputChunk;
        const chunkName = outputChunk.name || chunkFileName;

        // Compute hash of the chunk content
        const hash = computeHash(outputChunk.code);

        // Check if this is a feature module
        const isFeature = isFeatureChunk(chunkName);
        const featureInfo = isFeature ? parseFeatureInfo(chunkName) : {};

        const entry: ModuleManifestEntry = {
          file: chunkFileName,
          hash,
          size: outputChunk.code.length,
          isFeature,
          ...featureInfo,
        };

        // Include imports for dependency tracking
        if (outputChunk.imports?.length) {
          entry.imports = outputChunk.imports;
        }
        if (outputChunk.dynamicImports?.length) {
          entry.dynamicImports = outputChunk.dynamicImports;
        }

        manifest.modules[chunkName] = entry;

        // Track feature modules separately for quick lookup
        if (isFeature) {
          manifest.features.push(chunkName);
        }
      }

      // Sort features for consistent output
      manifest.features.sort();

      // Emit manifest as an asset through Vite's proper emit system
      this.emitFile({
        type: "asset",
        fileName,
        source: JSON.stringify(manifest, null, 2),
      });

      console.log(
        `✅ Generated ${fileName} with ${manifest.features.length} feature modules`,
      );
    },
  };
}

export default moduleManifestPlugin;
