import type { BuildExtension } from "@trigger.dev/core/v3/build";
type LightpandaOpts = {
    version?: "nightly" | "latest";
    disableTelemetry?: boolean;
};
export declare const lightpanda: ({ version, disableTelemetry, }?: LightpandaOpts) => BuildExtension;
export {};
