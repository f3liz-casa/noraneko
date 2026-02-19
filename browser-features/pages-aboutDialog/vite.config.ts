import { defineConfig } from "vite";
import deno from "@deno/vite-plugin";
import react from "@vitejs/plugin-react";
import path from "node:path";

const r = (dir: string) => path.resolve(import.meta.dirname ?? ".", dir);

export default defineConfig({
  plugins: [
    deno(),
    react({
      jsxRuntime: "automatic",
      jsxImportSource: "preact",
    }),
  ],
  build: {
    outDir: "_dist",
    emptyOutDir: true,
    target:"esnext",
    rollupOptions: {
      
      input: {
        main: r("src/main.tsx"),
      },
      output: {
        entryFileNames: "[name].js",
        format: "iife",
      },
    },
  },
});
