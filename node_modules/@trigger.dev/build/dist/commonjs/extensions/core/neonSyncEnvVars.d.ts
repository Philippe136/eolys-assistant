import { BuildExtension } from "@trigger.dev/core/v3/build";
export declare const NEON_ENV_VARS: string[];
export declare function syncNeonEnvVars(options?: {
    projectId?: string;
    /**
     * Neon API access token for authentication.
     * It's recommended to use the NEON_ACCESS_TOKEN environment variable instead of hardcoding this value.
     */
    neonAccessToken?: string;
    branch?: string;
    databaseName?: string;
    roleName?: string;
    envVarPrefix?: string;
}): BuildExtension;
