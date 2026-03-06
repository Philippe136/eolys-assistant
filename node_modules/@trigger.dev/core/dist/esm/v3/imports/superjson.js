// Use vendored superjson bundle to avoid ESM/CJS compatibility issues
// See: https://github.com/triggerdotdev/trigger.dev/issues/2937
// @ts-ignore
import superjson from "../vendor/superjson.mjs";
superjson.registerCustom({
    isApplicable: (v) => typeof Buffer === "function" && Buffer.isBuffer(v),
    serialize: (v) => [...v],
    deserialize: (v) => Buffer.from(v),
}, "buffer");
// @ts-ignore
export default superjson;
//# sourceMappingURL=superjson.js.map