// SPDX-License-Identifier: MPL-2.0

// Bundles one actor's generated content entry into _dist/<name>/content.js
// (IIFE content script). The target actor is passed by build.ts via the
// WEBEXT_ACTOR env var (one run per actor). birpc and the shared content
// runtime are inlined; the parent methods are tree-shaken out.

import { defineConfig } from "tsdown";
import process from "node:process";

const actor = process.env.WEBEXT_ACTOR;
if (!actor) {
  throw new Error("WEBEXT_ACTOR env var is required");
}

export default defineConfig({
  entry: { [`${actor}/content`]: `_gen/${actor}/content.entry.ts` },
  outDir: "_dist",
  format: "iife",
  target: "esnext",
  platform: "browser",
  clean: false,
  treeshake: { manualPureFunctions: ["defineParent", "defineContent"] },
  outputOptions: { entryFileNames: "[name].js", codeSplitting: false },
});
