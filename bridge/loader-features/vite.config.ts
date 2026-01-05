import { defineConfig } from "vite";
import path from "node:path";
import deno from "@deno/vite-plugin";

const r = (dir: string) => path.resolve(import.meta.dirname ?? ".", dir);

export default defineConfig({
  plugins: [deno()],
  build: {
    outDir: r("dist"),
    emptyOutDir: true,
    lib: {
      entry: r("loader/index.ts"),
      formats: ["es"],
      fileName: "loader",
    },
    rollupOptions: {
      external: (id) => {
        // Externalize internal Firefox modules and virtual modules
        if (id.startsWith("resource://") || id.startsWith("chrome://"))
          return true;
        return false;
      },
      output: {
        entryFileNames: "loader.js",
      },
    },
    target: "esnext",
    minify: false,
  },
  resolve: {
    alias: [{ find: "#i18n", replacement: r("../../i18n") }],
  },
});
