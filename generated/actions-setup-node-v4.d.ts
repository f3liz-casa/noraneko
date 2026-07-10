// Auto-generated from actions/setup-node@v4
// Do not edit manually

import type { JobStep } from './base';

/**
 * Setup a Node.js environment by adding problem matchers and optionally downloading and adding it to the PATH.
 * @see https://github.com/actionssetupnode/v4
 */
export interface ActionsSetupNodeV4Inputs {
    /**
     * Set always-auth in npmrc.
     * @default false
     */
    'always-auth'?: boolean;
    /**
     * Optional scope for authenticating against scoped registries. Will fall back to the repository owner when using the GitHub Packages registry (https://npm.pkg.github.com/).
     */
    scope?: string;
    /**
     * Used to specify the path to a dependency file: package-lock.json, yarn.lock, etc. Supports wildcards or a list of file names for caching multiple dependencies.
     */
    'cache-dependency-path'?: string;
    /**
     * Used to specify an alternative mirror to downlooad Node.js binaries from
     */
    mirror?: string;
    /**
     * The token used as Authorization header when fetching from the mirror
     */
    'mirror-token'?: string;
    /**
     * Used to pull node distributions from node-versions. Since there's a default, this is typically not supplied by the user. When running this action on github.com, the default value is sufficient. When running on GHES, you can pass a personal access token for github.com if you are experiencing rate limiting.
     * @default ${{ github.server_url == 'https://github.com' && github.token || '' }}
     */
    token?: string;
    /**
     * File containing the version Spec of the version to use.  Examples: package.json, .nvmrc, .node-version, .tool-versions.
     */
    'node-version-file'?: string;
    /**
     * Target architecture for Node to use. Examples: x86, x64. Will use system architecture by default.
     */
    architecture?: string;
    /**
     * Used to specify a package manager for caching in the default directory. Supported values: npm, yarn, pnpm.
     */
    cache?: string;
    /**
     * Optional registry to set up for auth. Will set the registry in a project level .npmrc and .yarnrc file, and set up auth to read in from env.NODE_AUTH_TOKEN.
     */
    'registry-url'?: string;
    /**
     * Version Spec of the version to use. Examples: 12.x, 10.15.1, >=10.15.0.
     */
    'node-version'?: string;
    /**
     * Set this option if you want the action to check for the latest available version that satisfies the version spec.
     * @default false
     */
    'check-latest'?: boolean;
}

export interface ActionsSetupNodeV4Outputs {
    /**
     * A boolean value to indicate if a cache was hit.
     */
    'cache-hit': string;
    /**
     * The installed node version.
     */
    'node-version': string;
}

