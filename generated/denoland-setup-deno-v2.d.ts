// Auto-generated from denoland/setup-deno@v2
// Do not edit manually

import type { JobStep } from './base';

/**
 * Setup Deno by installing, downloading, and adding it to the path.
 * @see https://github.com/denolandsetupdeno/v2
 */
export interface DenolandSetupDenoV2Inputs {
    /**
     * A hash used as part of the cache key, which defaults to a hash of the deno.lock files.
     */
    'cache-hash'?: string;
    /**
     * The name to use for the binary.
     * @default deno
     */
    'deno-binary-name'?: string;
    /**
     * The Deno version to install. Can be a semver version of a stable release, "canary" for the latest canary, "lts" for the latest LTS, or the Git hash of a specific canary release.
     * @default 2.x
     */
    'deno-version'?: string;
    /**
     * File containing the Deno version to install such as .dvmrc or .tool-versions.
     */
    'deno-version-file'?: string;
    /**
     * Cache downloaded modules & packages automatically in GitHub Actions cache.
     * @default false
     */
    cache?: boolean;
}

export interface DenolandSetupDenoV2Outputs {
    /**
     * The Deno version that was installed.
     */
    'deno-version': string;
    /**
     * The release channel of the installed version.
     */
    'release-channel': string;
    /**
     * A boolean indicating whether the cache was hit.
     */
    'cache-hit': string;
}

