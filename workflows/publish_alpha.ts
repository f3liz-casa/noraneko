import { getAction, Job, Workflow } from "../generated/index.js";

const checkout = getAction("actions/checkout@v4");
const downloadArtifact = getAction("actions/download-artifact@v4");
const uploadArtifact = getAction("actions/upload-artifact@v4");
const ghRelease = getAction("softprops/action-gh-release@v2");

const main = new Job("ubuntu-latest")
    .steps(s => s
        .add(checkout({}))
        .add({
            name: "Retrieve run IDs",
            run: `if [ -z "\${{ inputs.win_runtime_artifact_workflow_call }}" ]; then
  WINDOWS_ID=$(curl -s \\
    -H "Accept: application/vnd.github+json" \\
    -H "Authorization: Bearer \${{ secrets.GITHUB_TOKEN }}" \\
    "https://api.github.com/repos/\${{ github.repository }}/actions/workflows/package.yml/runs?branch=main&status=success" \\
  | jq -r '[.workflow_runs[] | select(.display_title | endswith("Windows-x86_64"))][0].id')
  echo "WINDOWS_RUN_ID=$WINDOWS_ID" >> $GITHUB_ENV
else
  echo "WINDOWS_RUN_ID=\${{ inputs.win_runtime_artifact_workflow_call }}" >> $GITHUB_ENV
fi

if [ -z "\${{ inputs.linux_runtime_artifact_workflow_call }}" ]; then
  LINUX_ID=$(curl -s \\
    -H "Accept: application/vnd.github+json" \\
    -H "Authorization: Bearer \${{ secrets.GITHUB_TOKEN }}" \\
    "https://api.github.com/repos/\${{ github.repository }}/actions/workflows/package.yml/runs?branch=main&status=success" \\
  | jq -r '[.workflow_runs[] | select(.display_title | endswith("Linux-x86_64"))][0].id')
  echo "LINUX_RUN_ID=$LINUX_ID" >> $GITHUB_ENV
else
  echo "LINUX_RUN_ID=\${{ inputs.linux_runtime_artifact_workflow_call }}" >> $GITHUB_ENV
fi

if [ -z "\${{ inputs.macos_runtime_artifact_workflow_call }}" ]; then
  MACOS_ID=$(curl -s \\
    -H "Accept: application/vnd.github+json" \\
    -H "Authorization: Bearer \${{ secrets.GITHUB_TOKEN }}" \\
    "https://api.github.com/repos/\${{ github.repository }}/actions/workflows/package.yml/runs?branch=main&status=success" \\
  | jq -r '[.workflow_runs[] | select(.display_title | endswith("macOS-aarch64"))][0].id')
  echo "MACOS_RUN_ID=$MACOS_ID" >> $GITHUB_ENV
else
  echo "MACOS_RUN_ID=\${{ inputs.macos_runtime_artifact_workflow_call }}" >> $GITHUB_ENV
fi
`,
        })
        .add(downloadArtifact({
            name: "Download Windows installer",
            with: {
                name: "noraneko-windows-x86_64-installer",
                "run-id": "${{ env.WINDOWS_RUN_ID }}",
                path: "~/noraneko-publish/win",
                "github-token": "${{ github.token }}",
            },
        }))
        .add(downloadArtifact({
            name: "Download Linux installer",
            with: {
                name: "noraneko-linux-x86_64-installer",
                "run-id": "${{ env.LINUX_RUN_ID }}",
                path: "~/noraneko-publish/linux",
                "github-token": "${{ github.token }}",
            },
        }))
        .add(downloadArtifact({
            name: "Download macOS installer",
            with: {
                name: "noraneko-macOS-aarch64-installer",
                "run-id": "${{ env.MACOS_RUN_ID }}",
                path: "~/noraneko-publish/macos",
                "github-token": "${{ github.token }}",
            },
        }))
        .add({
            name: "Get version info",
            run: `echo "NR_VERSION=alpha" >> "$GITHUB_ENV"
`,
        })
        .add(ghRelease({
            name: "Deploy to GitHub Releases 🚀",
            with: {
                files: `~/noraneko-publish/win/*.exe
~/noraneko-publish/linux/*.tar.xz
~/noraneko-publish/linux/*.deb
~/noraneko-publish/macos/*.dmg
`,
                tag_name: "alpha",
                name: "Alpha Release",
                body: `Noraneko Alpha Release

## Downloads
- **Windows**: Use the installer (.exe)
- **Linux**: Use the tarball (.tar.xz) or deb package (.deb)
- **macOS**: Use the disk image (.dmg)
`,
                draft: false,
                prerelease: true,
                token: "${{ github.token }}",
            },
        }))
        .add(uploadArtifact({
            name: "Publish Package 🎁",
            with: {
                name: "noraneko-publish",
                path: "~/noraneko-publish/*",
            },
        }))
    );

const workflow = new Workflow({
    name: "(A) |α| Publish Alpha",
    permissions: { contents: "write" },
    on: {
        workflow_dispatch: {},
        workflow_call: {
            inputs: {
                win_runtime_artifact_workflow_call: {
                    type: "string",
                    required: false,
                    default: "",
                },
                linux_runtime_artifact_workflow_call: {
                    type: "string",
                    required: false,
                    default: "",
                },
                macos_runtime_artifact_workflow_call: {
                    type: "string",
                    required: false,
                    default: "",
                },
            },
        },
    },
}).jobs(j => j
    .add("main", main)
);

const def = workflow.toJSON();
(def as { "run-name"?: string })["run-name"] = "|α| Publish Alpha";
Workflow.fromObject(def).build("publish_alpha");
