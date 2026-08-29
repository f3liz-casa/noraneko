// SPDX-License-Identifier: MPL-2.0

import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import decorators from "../../libs/vite-oxc-decorator-stage-3/dist/index.js";
import { genJarmnPlugin } from "../../libs/vite-plugin-gen-jarmn/plugin.ts";
import deno from "@deno/vite-plugin";

const r = (dir: string) => path.resolve(import.meta.dirname ?? ".", dir);

export default defineConfig({
  publicDir: r("public"),
  server: { port: 5181, strictPort: true },
  define: { "import.meta.env.__BUILDID2__": '"placeholder"' },

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
      input: { core: r("main.ts") },
      output: {
        // One classic script: loaded per window with loadSubScript, so no
        // ESM, no code-splitting. Everything the features import is inlined.
        format: "iife",
        name: "__noraneko_core",
        inlineDynamicImports: true,
        entryFileNames: "[name].js",

        assetFileNames(info) {
          const name = (info as any).originalFileNames?.at(0) ?? info.name;
          if (name?.endsWith(".svg")) return "assets/svg/[name][extname]";
          if (name?.endsWith(".css")) return "assets/css/[name][extname]";
          return "assets/[name][extname]";
        },

      },
    },
  },

  
  plugins: [
    deno(),
    react({
      jsxRuntime: "automatic",
      jsxImportSource: "preact",
    }),
    genJarmnPlugin("content", "noraneko", "content"),
  ],

  resolve: {
    preserveSymlinks: true,
    // libs/preact-xul has its own node_modules/preact (a deno symlink to the
    // same files). With preserveSymlinks that counts as a second copy, and
    // the options.vnode hook then lands on a preact nobody renders with.
    dedupe: ["preact"],
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
