import { getAction, Job, Workflow } from "../generated/index.js";

const checkout = getAction("actions/checkout@v5");
const setupDeno = getAction("denoland/setup-deno@v2");

// This workflow only runs when its own file changes, so it references itself.
const self = ".github/workflows/copilot-setup-steps.yml";

const copilotSetupSteps = new Job("ubuntu-latest", {
    permissions: { contents: "read" },
}).steps(s => s
    .add(checkout({ name: "Checkout code" }))
    .add(setupDeno({ with: { "deno-version": "v2.x" } }))
    .add({ name: "Install Dependencies", run: "deno i --allow-scripts" })
);

new Workflow({
    name: "Copilot Setup Steps",
    on: {
        workflow_dispatch: {},
        push: { paths: [self] },
        pull_request: { paths: [self] },
    },
}).jobs(j => j
    .add("copilot-setup-steps", copilotSetupSteps)
).build("copilot-setup-steps");
