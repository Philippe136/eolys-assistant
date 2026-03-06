"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.query = void 0;
const v3_1 = require("@trigger.dev/core/v3");
const tracer_js_1 = require("./tracer.js");
// Implementation
function execute(query, options, requestOptions) {
    const apiClient = v3_1.apiClientManager.clientOrThrow();
    const from = dateToISOString(options?.from);
    const to = dateToISOString(options?.to);
    const $requestOptions = (0, v3_1.mergeRequestOptions)({
        tracer: tracer_js_1.tracer,
        name: "query.execute()",
        icon: "query",
        attributes: {
            scope: options?.scope ?? "environment",
            format: options?.format ?? "json",
            query,
            period: options?.period,
            from,
            to,
        },
    }, requestOptions);
    return apiClient
        .executeQuery(query, {
        scope: options?.scope,
        period: options?.period,
        from,
        to,
        format: options?.format,
    }, $requestOptions)
        .then((response) => {
        return response;
    });
}
function dateToISOString(date) {
    if (date === undefined) {
        return undefined;
    }
    if (date instanceof Date) {
        return date.toISOString();
    }
    return new Date(date).toISOString();
}
exports.query = {
    execute,
};
//# sourceMappingURL=query.js.map