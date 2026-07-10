// Auto-generated from actions/download-artifact@v4
// Do not edit manually

import type { JobStep } from './base';

/**
 * Download a build artifact that was previously uploaded in the workflow by the upload-artifact action
 * @see https://github.com/actionsdownloadartifact/v4
 */
export interface ActionsDownloadArtifactV4Inputs {
    /**
     * Name of the artifact to download. If unspecified, all artifacts for the run are downloaded.
     */
    name?: string;
    /**
     * IDs of the artifacts to download, comma-separated. Either inputs `artifact-ids` or `name` can be used, but not both.
     */
    'artifact-ids'?: string;
    /**
     * When multiple artifacts are matched, this changes the behavior of the destination directories. If true, the downloaded artifacts will be in the same directory specified by path. If false, the downloaded artifacts will be extracted into individual named directories within the specified path.
     * @default false
     */
    'merge-multiple'?: boolean;
    /**
     * The GitHub token used to authenticate with the GitHub API. This is required when downloading artifacts from a different repository or from a different workflow run. If this is not specified, the action will attempt to download artifacts from the current repository and the current workflow run.
     */
    'github-token'?: string;
    /**
     * The repository owner and the repository name joined together by "/". If github-token is specified, this is the repository that artifacts will be downloaded from.
     * @default ${{ github.repository }}
     */
    repository?: string;
    /**
     * The id of the workflow run where the desired download artifact was uploaded from. If github-token is specified, this is the run that artifacts will be downloaded from.
     * @default ${{ github.run_id }}
     */
    'run-id'?: string;
    /**
     * Destination path. Supports basic tilde expansion. Defaults to $GITHUB_WORKSPACE
     */
    path?: string;
    /**
     * A glob pattern matching the artifacts that should be downloaded. Ignored if name is specified.
     */
    pattern?: string;
}

export interface ActionsDownloadArtifactV4Outputs {
    /**
     * Path of artifact download
     */
    'download-path': string;
}

