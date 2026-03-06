import { apiClientManager, mergeRequestOptions } from "@trigger.dev/core/v3";
import { tracer } from "./tracer.js";
// Implementation
function execute(query, options, requestOptions) {
    const apiClient = apiClientManager.clientOrThrow();
    const from = dateToISOString(options?.from);
    const to = dateToISOString(options?.to);
    const $requestOptions = mergeRequestOptions({
        tracer,
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
export const query = {
    execute,
};
//# sourceMappingURL=query.js.map