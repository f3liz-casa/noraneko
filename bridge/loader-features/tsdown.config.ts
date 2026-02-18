// SPDX-License-Identifier: MPL-2.0

import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["loader/mod.ts"],
  outDir: "_dist",
  format: "esm",
  target: "esnext",
  external: /^resource:\/\/|^chrome:\/\//,
  dts: false,
});
