// Base types for gaji
// Auto-generated - Do not edit manually

export interface JobStep {
    name?: string;
    uses?: string;
    with?: Record<string, unknown>;
    run?: string;
    id?: string;
    if?: string;
    env?: Record<string, string>;
    'working-directory'?: string;
    shell?: string;
    'continue-on-error'?: boolean;
    'timeout-minutes'?: number;
}

export interface ActionStep<O = {}, Id extends string = string> extends JobStep {
    readonly outputs: O;
    readonly id: Id;
}

export type Step = JobStep | ActionStep<any>;

export type JobOutputs<T extends Record<string, string>> = {
    readonly [K in keyof T]: string;
};

export interface JobDefinition {
    'runs-on': string | string[];
    needs?: string | string[];
    if?: string;
    steps: JobStep[];
    env?: Record<string, string>;
    defaults?: {
        run?: {
            shell?: string;
            'working-directory'?: string;
        };
    };
    strategy?: {
        matrix?: Record<string, unknown>;
        'fail-fast'?: boolean;
        'max-parallel'?: number;
    };
    'continue-on-error'?: boolean;
    'timeout-minutes'?: number;
    services?: Record<string, Service>;
    container?: Container;
    outputs?: Record<string, string>;
    permissions?: Permissions;
}

export interface Service {
    image: string;
    credentials?: {
        username: string;
        password: string;
    };
    env?: Record<string, string>;
    ports?: (string | number)[];
    volumes?: string[];
    options?: string;
}

export interface Container {
    image: string;
    credentials?: {
        username: string;
        password: string;
    };
    env?: Record<string, string>;
    ports?: (string | number)[];
    volumes?: string[];
    options?: string;
}

export type Permissions = 'read-all' | 'write-all' | {
    actions?: 'read' | 'write' | 'none';
    checks?: 'read' | 'write' | 'none';
    contents?: 'read' | 'write' | 'none';
    deployments?: 'read' | 'write' | 'none';
    'id-token'?: 'read' | 'write' | 'none';
    issues?: 'read' | 'write' | 'none';
    packages?: 'read' | 'write' | 'none';
    'pull-requests'?: 'read' | 'write' | 'none';
    'repository-projects'?: 'read' | 'write' | 'none';
    'security-events'?: 'read' | 'write' | 'none';
    statuses?: 'read' | 'write' | 'none';
};

export interface WorkflowTrigger {
    branches?: string[];
    'branches-ignore'?: string[];
    tags?: string[];
    'tags-ignore'?: string[];
    paths?: string[];
    'paths-ignore'?: string[];
    types?: string[];
}

export interface ScheduleTrigger {
    cron: string;
}

export interface WorkflowDispatchInput {
    description?: string;
    required?: boolean;
    default?: string;
    type?: 'string' | 'boolean' | 'choice' | 'environment';
    options?: string[];
}

export interface WorkflowOn {
    push?: WorkflowTrigger;
    pull_request?: WorkflowTrigger;
    pull_request_target?: WorkflowTrigger;
    schedule?: ScheduleTrigger[];
    workflow_dispatch?: {
        inputs?: Record<string, WorkflowDispatchInput>;
    };
    workflow_call?: {
        inputs?: Record<string, WorkflowDispatchInput>;
        outputs?: Record<string, { description?: string; value: string }>;
        secrets?: Record<string, { description?: string; required?: boolean }>;
    };
    release?: { types?: string[] };
    issues?: { types?: string[] };
    issue_comment?: { types?: string[] };
    [key: string]: unknown;
}

export interface WorkflowConfig {
    name?: string;
    on: WorkflowOn;
    env?: Record<string, string>;
    defaults?: {
        run?: {
            shell?: string;
            'working-directory'?: string;
        };
    };
    concurrency?: {
        group: string;
        'cancel-in-progress'?: boolean;
    } | string;
    permissions?: Permissions;
}

export interface WorkflowDefinition extends WorkflowConfig {
    jobs: Record<string, JobDefinition>;
}

export interface ActionInputDefinition {
    description?: string;
    required?: boolean;
    default?: string;
    'deprecation-message'?: string;
}

export interface ActionOutputDefinition {
    description?: string;
    value?: string;
}

export interface NodeActionConfig {
    name: string;
    description: string;
    inputs?: Record<string, ActionInputDefinition>;
    outputs?: Record<string, ActionOutputDefinition>;
}

export interface NodeActionRuns {
    using: 'node12' | 'node16' | 'node20';
    main: string;
    pre?: string;
    post?: string;
    'pre-if'?: string;
    'post-if'?: string;
}

export interface DockerActionConfig {
    name: string;
    description: string;
    inputs?: Record<string, ActionInputDefinition>;
    outputs?: Record<string, ActionOutputDefinition>;
}

export interface DockerActionRuns {
    using: 'docker';
    image: string;
    entrypoint?: string;
    args?: string[];
    env?: Record<string, string>;
    'pre-entrypoint'?: string;
    'post-entrypoint'?: string;
    'pre-if'?: string;
    'post-if'?: string;
}

export interface GajiConfig {
    workflows?: string;
    output?: string;
    generated?: string;
    watch?: {
        debounce?: number;
        ignore?: string[];
    };
    build?: {
        validate?: boolean;
        format?: boolean;
        cacheTtlDays?: number;
    };
    github?: {
        token?: string;
        apiUrl?: string;
    };
}
