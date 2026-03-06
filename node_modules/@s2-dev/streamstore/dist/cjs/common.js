"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.S2Environment = void 0;
const endpoints_js_1 = require("./endpoints.js");
class S2Environment {
    static parse() {
        const config = {};
        const token = process.env.S2_ACCESS_TOKEN;
        if (token) {
            config.accessToken = token;
        }
        const accountEndpoint = process.env.S2_ACCOUNT_ENDPOINT;
        const basinEndpoint = process.env.S2_BASIN_ENDPOINT;
        if (accountEndpoint || basinEndpoint) {
            const endpointsInit = {
                account: accountEndpoint || undefined,
                basin: basinEndpoint || undefined,
            };
            config.endpoints = new endpoints_js_1.S2Endpoints(endpointsInit);
        }
        return config;
    }
}
exports.S2Environment = S2Environment;
//# sourceMappingURL=common.js.map