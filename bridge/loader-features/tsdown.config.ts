// SPDX-License-Identifier: MPL-2.0

import { defineConfig } from "tsdown";
import { resolve } from "node:path";

const r = (p: string) => resolve(import.meta.dirname!, p);

export default defineConfig({
  entry: ["loader/mod.ts"],
  outDir: "_dist",
  format: "esm",
  target: "esnext",
  // chrome_root imports "resource://noraneko-loader/mod.js"; pin the extension
  // (tsdown's esm default would emit mod.mjs).
  outputOptions: { entryFileNames: "[name].js" },
  external: /^resource:\/\/|^chrome:\/\//,
  dts: false,
  resolve: {
    alias: [
      // #i18n/ is a deno workspace import; resolve it via the link-i18n symlink
      { find: /^#i18n\//, replacement: r("link-i18n") + "/" },
    ],
    preserveSymlinks: false,
  },
});
