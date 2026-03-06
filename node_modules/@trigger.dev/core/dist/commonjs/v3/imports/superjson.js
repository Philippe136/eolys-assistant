"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Use vendored superjson bundle to avoid ESM/CJS compatibility issues
// See: https://github.com/triggerdotdev/trigger.dev/issues/2937
// @ts-ignore
const superjson = require("../vendor/superjson.cjs");
// @ts-ignore
superjson.default.registerCustom({
    isApplicable: (v) => typeof Buffer === "function" && Buffer.isBuffer(v),
    serialize: (v) => [...v],
    deserialize: (v) => Buffer.from(v),
}, "buffer");
// @ts-ignore
module.exports.default = superjson.default;
//# sourceMappingURL=superjson-cjs.cjs.map