// SPDX-License-Identifier: MPL-2.0

import { defineConfig } from "vite";
import path from "node:path";
import solidPlugin from "vite-plugin-solid";
import istanbulPlugin from "vite-plugin-istanbul";
import decorators from "../../libs/vite-oxc-decorator-stage-3/dist/index.js";
import { genJarmnPlugin } from "../../libs/vite-plugin-gen-jarmn/plugin.ts";
import deno from "@deno/vite-plugin";
import { hotfixPlugin } from "./vite-plugin-hotfix.ts";

const r = (dir: string) => path.resolve(import.meta.dirname, dir);

export default defineConfig({
  publicDir: r("public"),
  server: { port: 5181, strictPort: true },
  define: { "import.meta.env.__BUILDID2__": '"placeholder"' },

  // Configure environments to avoid vite-plugin-solid dynamic import issue
  environments: {
    client: {
      resolve: {
        conditions: ["solid", "module", "browser", "development|production"],
      },
    },
    ssr: {
      resolve: {
        conditions: ["solid", "module", "node", "development|production"],
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

        manualChunks(id) {
          if (id.includes("node_modules")) {
            const parts = id.split("node_modules/")[1].split("/");
            // .pnpm || .deno
            let pkg = parts[0].startsWith(".") ? parts[1] : parts[0];
            return `external/${pkg}`;
          }
          if (id.includes(".svg")) {
            return `svg/${id.split("/").at(-1)?.replaceAll("svg_url", "glue")}`;
          }
          const match = id.match(/\/core\/common\/([A-Za-z-]+)/);
          if (match?.[1]) return `modules/${match[1]}`;
        },

        assetFileNames(info) {
          const name = info.originalFileNames.at(0);
          if (name?.endsWith(".svg")) return "assets/svg/[name][extname]";
          if (name?.endsWith(".css")) return "assets/css/[name][extname]";
          return "assets/[name][extname]";
        },

        chunkFileNames: "assets/js/[name].js",
      },
    },
  },

  plugins: [
    decorators(),
    deno(),

    solidPlugin({
      solid: {
        generate: "universal",
        moduleName: "@nora/solid-xul",
        contextToCustomElements: false,
        hydratable: true,
      },
      hot: false,
    }),

    {
      name: "noraneko_component_hmr_support",
      enforce: "pre",
      apply: "serve",
      transform(code, _id) {
        if (
          code.includes("\n@noraComponent") &&
          !code.includes("//@nora-only-dispose")
        ) {
          return {
            code:
              code +
              "\n" +
              [
                "if (import.meta.hot) {",
                "  import.meta.hot.accept((m) => {",
                "    if (m?.default) new m.default();",
                "  })",
                "}",
              ].join("\n"),
          };
        }
      },
    },

    istanbulPlugin(),
    genJarmnPlugin("content", "noraneko", "content"),
    hotfixPlugin({ outputDir: "hotfixes/source", enableOnBuild: false }),
  ],

  optimizeDeps: {
    include: [
      "./node_modules/@nora",
      "solid-js",
      "solid-js/web",
      "solid-js/store",
      "solid-js/html",
      "solid-js/h",
    ],
  },

  resolve: {
    dedupe: [
      "solid-js",
      "solid-js/web",
      "solid-js/store",
      "solid-js/html",
      "solid-js/h",
    ],
    preserveSymlinks: true,
    alias: [
      {
        find: "#bridge-loader-features",
        replacement: r("../../bridge/loader-features"),
      },
      { find: "@nora/skin", replacement: r("../../browser-features/skin") },
      {
        find: "@nora/solid-xul",
        replacement: r("../../libs/solid-xul/index.ts"),
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
