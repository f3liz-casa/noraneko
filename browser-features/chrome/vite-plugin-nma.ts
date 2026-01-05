import type { Plugin } from "vite";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { relative, join, resolve } from "node:path";
import { Buffer } from "node:buffer";
import process from "node:process";

const ESSENTIAL_MODULES = new Set([
  "core",
  "index",
  "main",
  "startup",
  "bootstrap",
]);

function getHash(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

function getFiles(dir: string): string[] {
  let files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        files = files.concat(getFiles(fullPath));
      } else {
        files.push(fullPath);
      }
    }
  } catch (_e) {
    // Directory might not exist or be accessible
  }
  return files;
}

interface SourceModule {
  hash: string;
  sourceFiles: { path: string; hash: string }[];
}

export function nmaPlugin(): Plugin {
  let root = process.cwd();
  const sourceModules = new Map<string, SourceModule>();

  return {
    name: "vite-plugin-nma",
    configResolved(config) {
      root = config.root;

      // Helper to scan a category directory (e.g., "features", "static")
      const scanCategory = (dirName: string, modulePrefix: string) => {
        const catDir = resolve(root, dirName);
        if (!existsSync(catDir)) return;

        const subdirs = readdirSync(catDir);
        for (const subdir of subdirs) {
          const modDir = join(catDir, subdir);
          if (statSync(modDir).isDirectory()) {
            const files = getFiles(modDir);
            const sourceFiles = files
              .map((file) => {
                const relPath = relative(root, file).replace(/\\/g, "/");
                const content = readFileSync(file);
                const hash = getHash(content);
                return { path: relPath, hash };
              })
              .sort((a, b) => a.path.localeCompare(b.path));

            const combinedHash =
              sourceFiles.length > 0
                ? getHash(sourceFiles.map((f) => f.hash).join(""))
                : "0000000000000000000000000000000000000000000000000000000000000000";

            const name = entryName(modulePrefix, subdir);
            sourceModules.set(name, {
              hash: combinedHash,
              sourceFiles,
            });
          }
        }
      };

      // Scan known module locations
      scanCategory("features", "modules");
      scanCategory("static", "modules/static");
    },
    generateBundle(_options, bundle) {
      const modules = [];
      const assets = [];

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk") {
          // Identify if this chunk corresponds to a known source module
          const name = chunk.name;
          const sourceMod = sourceModules.get(name);

          // For 'core', we treat it specially since it's not in features/ or static/
          // We'll just hash main.ts for now as a proxy, or use provided graph if we wanted,
          // but sticking to "source file" rule:
          let finalSourceMod = sourceMod;

          if (!finalSourceMod && name === "core") {
            const mainPath = resolve(root, "main.ts");
            if (existsSync(mainPath)) {
              const content = readFileSync(mainPath);
              const hash = getHash(content);
              const relPath = relative(root, mainPath).replace(/\\/g, "/");
              finalSourceMod = {
                hash,
                sourceFiles: [{ path: relPath, hash }],
              };
            }
          }

          if (finalSourceMod || name.startsWith("modules/")) {
            // If we found source files, use them.
            // If not (but it's a modules/ chunk), use empty/placeholder to satisfy type but indicate no source found.
            const modData = finalSourceMod || {
              hash: "0000000000000000000000000000000000000000000000000000000000000000",
              sourceFiles: [],
            };

            modules.push({
              name: chunk.name,
              path: fileName,
              dependencies: [...chunk.imports, ...chunk.dynamicImports],
              essential: ESSENTIAL_MODULES.has(chunk.name),
              hash: modData.hash,
              sourceFiles: modData.sourceFiles,
            });
          }
        } else {
          assets.push({
            name: chunk.name ?? fileName,
            path: fileName,
          });
        }
      }

      this.emitFile({
        type: "asset",
        fileName: "nma-metadata.json",
        source: JSON.stringify({ modules, assets }, null, 2),
      });
    },
  };
}

function entryName(prefix: string, name: string) {
  return prefix ? `${prefix}/${name}` : name;
}
