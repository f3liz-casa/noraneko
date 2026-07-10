import { Action, getAction } from "../generated/index.js";

const setupNode = getAction("actions/setup-node@v4");
const setupDeno = getAction("denoland/setup-deno@v2");

new Action({
    name: "Setup Noraneko Build Environment",
    description: "Sets up Node.js, Deno, and installs Noraneko dependencies",
}).steps(s => s
    .add(setupNode({ with: { "node-version": 22 } }))
    .add(setupDeno({ with: { "deno-version": "v2.x" } }))
    .add({
        name: "Install Noraneko dependencies",
        run: "deno install --allow-scripts",
        shell: "bash",
        "working-directory": "${{ github.workspace }}/noraneko",
    })
).build("setup-noraneko");
