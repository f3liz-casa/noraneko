// SPDX-License-Identifier: MPL-2.0

import { defineConfig } from "vite";
import path from "node:path";
import preact from "@preact/preset-vite";
// import istanbulPlugin from "vite-plugin-istanbul";
import decorators from "../../libs/vite-oxc-decorator-stage-3/dist/index.js";
// import { genJarmnPlugin } from "../../libs/vite-plugin-gen-jarmn/plugin.ts";
// import deno from "@deno/vite-plugin";
// import { hotfixPlugin } from "./vite-plugin-hotfix.ts";
// import { moduleManifestPlugin } from "./vite-plugin-module-manifest.ts";

const r = (dir: string) => path.resolve(import.meta.dirname, dir);

export default defineConfig({
  publicDir: r("public"),
  server: { port: 5181, strictPort: true },
  define: { "import.meta.env.__BUILDID2__": '"placeholder"' },

  // Configure environments
  environments: {
    client: {
      resolve: {
        conditions: ["preact", "module", "browser", "development|production"],
      },
    },
    ssr: {
      resolve: {
        conditions: ["preact", "module", "node", "development|production"],
      },
    },
  },

  build: {
    sourcemap: true,
    reportCompressedSize: false,
    minify: false,
    cssMinify: false,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    target: "esnext",
    outDir: r("_dist"),

    rollupOptions: {
      preserveEntrySignatures: "allow-extension",
      input: { core: r("main.ts") },
      output: {
        esModule: true,
        entryFileNames: "[name].js",

        /**
         * Module chunking strategy for hotfix support:
         * - Feature modules (common/*, static/*) -> separate chunks with predictable names
         * - External dependencies -> vendor chunks
         * - SVG assets -> separate chunks
         *
         * This enables the hotfix system to:
         * 1. Identify which modules changed via hash comparison
         * 2. Replace individual module chunks without full reload
         * 3. Enable easy GC of old module versions
         */
        manualChunks(id) {
          // Vendor/external dependencies - shared across all modules
          if (id.includes("node_modules")) {
            const parts = id.split("node_modules/")[1].split("/");
            // .pnpm || .deno
            let pkg = parts[0].startsWith(".") ? parts[1] : parts[0];
            return `external/${pkg}`;
          }

          // SVG assets
          if (id.includes(".svg")) {
            return `svg/${id.split("/").at(-1)?.replaceAll("svg_url", "glue")}`;
          }

          // Feature modules from features/* - each gets its own chunk for hotswap
          const featureMatch = id.match(/\/features\/([A-Za-z0-9_-]+)\//);
          if (featureMatch?.[1]) {
            return `features/${featureMatch[1]}`;
          }

          // Feature modules from static/* - each gets its own chunk for hotswap
          const staticMatch = id.match(/\/static\/([A-Za-z0-9_-]+)\//);
          if (staticMatch?.[1]) {
            return `features/static/${staticMatch[1]}`;
          }

          // Legacy pattern support
          const match = id.match(/\/core\/common\/([A-Za-z-]+)/);
          if (match?.[1]) return `modules/${match[1]}`;
        },

        assetFileNames(info) {
          const name = info.originalFileNames.at(0);
          if (name?.endsWith(".svg")) return "assets/svg/[name][extname]";
          if (name?.endsWith(".css")) return "assets/css/[name][extname]";
          return "assets/[name][extname]";
        },

        // Use content hash for cache busting but predictable base names for hotfix identification
        chunkFileNames: "assets/js/[name]-[hash:8].js",
      },
    },
  },

  plugins: [
    decorators(),
    // deno(),
    preact(),
    // {
    //   name: "noraneko_component_hmr_support",
    //   enforce: "pre",
    //   apply: "serve",
    //   transform(code, _id) {
    //     if (
    //       code.includes("\n@noraComponent") &&
    //       !code.includes("//@nora-only-dispose")
    //     ) {
    //       return {
    //         code:
    //           code +
    //           "\n" +
    //           [
    //             "if (import.meta.hot) {",
    //             "  import.meta.hot.accept((m) => {",
    //             "    if (m?.default) new m.default();",
    //             "  })",
    //             "}",
    //           ].join("\n"),
    //       };
    //     }
    //   },
    // },
    // istanbulPlugin(),
    // genJarmnPlugin("content", "noraneko", "content"),
    // hotfixPlugin({ outputDir: "hotfixes/source", enableOnBuild: false }),
    // // Generate module manifest for hotfix hash tracking
    // moduleManifestPlugin(),
  ],

  optimizeDeps: {
    include: [
      "./node_modules/@nora",
      "preact",
      "preact/compat",
      "preact/hooks",
      "preact/debug",
      "@preact/signals",
    ],
  },

  resolve: {
    dedupe: [
      "preact",
      "preact/compat",
      "preact/hooks",
      "preact/debug",
      "@preact/signals",
    ],
    preserveSymlinks: true,
    alias: [
      {
        find: "#bridge-loader-features",
        replacement: r("../../bridge/loader-features"),
      },
      { find: "@nora/skin", replacement: r("../../browser-features/skin") },
      {
        find: "@nora/preact-xul",
        replacement: r("../../libs/preact-xul/index.ts"),
      },
      {
        find: "@nora/shared",
        replacement: r("../shared"),
      },
      { find: "@std/toml", replacement: "@jsr/std__toml" },
      { find: "#i18n", replacement: r("../../i18n") },
      { find: "#features-chrome", replacement: r(".") },
    ],
  },
});
