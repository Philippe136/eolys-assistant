import { S2Endpoints } from "./endpoints.js";
export class S2Environment {
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
            config.endpoints = new S2Endpoints(endpointsInit);
        }
        return config;
    }
}
//# sourceMappingURL=common.js.map