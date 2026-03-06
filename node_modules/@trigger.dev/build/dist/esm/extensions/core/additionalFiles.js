import { addAdditionalFilesToBuild } from "../../internal/additionalFiles.js";
export function additionalFiles(options) {
    return {
        name: "additionalFiles",
        async onBuildComplete(context, manifest) {
            await addAdditionalFilesToBuild("additionalFiles", options, context, manifest);
        },
    };
}
//# sourceMappingURL=additionalFiles.js.map