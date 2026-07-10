// Auto-generated from actions/github-script@v7
// Do not edit manually

import type { JobStep } from './base';

/**
 * Run simple scripts using the GitHub client
 * @see https://github.com/actionsgithubscript/v7
 */
export interface ActionsGithubScriptV7Inputs {
    /**
     * The GitHub token used to create an authenticated client
     * @default ${{ github.token }}
     */
    'github-token'?: string;
    /**
     * A comma separated list of status codes that will NOT be retried e.g. "400,500". No effect unless `retries` is set
     * @default 400,401,403,404,422
     */
    'retry-exempt-status-codes'?: string;
    /**
     * The script to run
     */
    script: string;
    /**
     * The number of times to retry a request
     * @default 0
     */
    retries?: number;
    /**
     * A comma-separated list of GraphQL API previews to accept
     */
    previews?: string;
    /**
     * Whether to tell the GitHub client to log details of its requests. true or false. Default is to run in debug mode when the GitHub Actions step debug logging is turned on.
     * @default ${{ runner.debug == '1' }}
     */
    debug?: string;
    /**
     * Either "string" or "json" (default "json")—how the result will be encoded
     * @default json
     */
    'result-encoding'?: string;
    /**
     * An optional user-agent string
     * @default actions/github-script
     */
    'user-agent'?: string;
    /**
     * An optional GitHub REST API URL to connect to a different GitHub instance. For example, https://my.github-enterprise-server.com/api/v3
     */
    'base-url'?: string;
}

export interface ActionsGithubScriptV7Outputs {
    /**
     * The return value of the script, stringified with `JSON.stringify`
     */
    result: string;
}

