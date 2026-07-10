import { Workflow, WorkflowCall } from "../generated/index.js";

const packageWorkflow = "./.github/workflows/package.yml";
const publishWorkflow = "./.github/workflows/publish_alpha.yml";

const packageWindows = new WorkflowCall(packageWorkflow, {
    with: {
        platform: "Windows-x86_64",
        runtime_artifact_workflow_run_id: "${{ inputs.runtime_windows_artifact_workflow_run_id }}",
    },
    secrets: "inherit",
});

const packageLinux = new WorkflowCall(packageWorkflow, {
    with: {
        platform: "Linux-x86_64",
        runtime_artifact_workflow_run_id: "${{ inputs.runtime_linux_artifact_workflow_run_id }}",
    },
    secrets: "inherit",
});

const packageMacos = new WorkflowCall(packageWorkflow, {
    with: {
        platform: "macOS-aarch64",
        runtime_artifact_workflow_run_id: "${{ inputs.runtime_macos_artifact_workflow_run_id }}",
    },
    secrets: "inherit",
});

const publish = new WorkflowCall(publishWorkflow, {
    needs: ["package-windows", "package-linux", "package-macos"],
    with: {
        win_runtime_artifact_workflow_call: "${{ github.run_id }}",
        linux_runtime_artifact_workflow_call: "${{ github.run_id }}",
        macos_runtime_artifact_workflow_call: "${{ github.run_id }}",
    },
});

const workflow = new Workflow({
    name: "(A) 🚀 Release Alpha",
    permissions: { contents: "write" },
    on: {
        workflow_dispatch: {
            inputs: {
                runtime_windows_artifact_workflow_run_id: {
                    description: "The workflow run ID for the Windows runtime artifact (leave empty for latest release)",
                    required: false,
                    type: "string",
                },
                runtime_linux_artifact_workflow_run_id: {
                    description: "The workflow run ID for the Linux runtime artifact (leave empty for latest release)",
                    required: false,
                    type: "string",
                },
                runtime_macos_artifact_workflow_run_id: {
                    description: "The workflow run ID for the macOS runtime artifact (leave empty for latest release)",
                    required: false,
                    type: "string",
                },
            },
        },
    },
}).jobs(j => j
    .add("package-windows", packageWindows)
    .add("package-linux", packageLinux)
    .add("package-macos", packageMacos)
    .add("publish", publish)
);

const def = workflow.toJSON();
(def as { "run-name"?: string })["run-name"] = "🚀 Release Alpha";
Workflow.fromObject(def).build("package_and_publish_alpha");
