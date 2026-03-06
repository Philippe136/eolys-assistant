import { BuildExtension } from "@trigger.dev/core/v3/build";
export declare function syncVercelEnvVars(options?: {
    projectId?: string;
    /**
     * Vercel API access token for authentication.
     * It's recommended to use the VERCEL_ACCESS_TOKEN environment variable instead of hardcoding this value.
     */
    vercelAccessToken?: string;
    vercelTeamId?: string;
    branch?: string;
}): BuildExtension;
