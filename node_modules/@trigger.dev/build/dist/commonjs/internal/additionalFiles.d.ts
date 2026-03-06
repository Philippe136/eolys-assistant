import { BuildManifest } from "@trigger.dev/core/v3";
import { BuildContext } from "@trigger.dev/core/v3/build";
export type AdditionalFilesOptions = {
    files: string[];
};
export declare function addAdditionalFilesToBuild(source: string, options: AdditionalFilesOptions, context: BuildContext, manifest: BuildManifest): Promise<void>;
