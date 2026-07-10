import { defineConfig } from "./generated/index.js";

export default defineConfig({
    workflows: "workflows",
    output: ".github",
    generated: "generated",
});
