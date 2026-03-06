"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.additionalFiles = additionalFiles;
const additionalFiles_js_1 = require("../../internal/additionalFiles.js");
function additionalFiles(options) {
    return {
        name: "additionalFiles",
        async onBuildComplete(context, manifest) {
            await (0, additionalFiles_js_1.addAdditionalFilesToBuild)("additionalFiles", options, context, manifest);
        },
    };
}
//# sourceMappingURL=additionalFiles.js.map