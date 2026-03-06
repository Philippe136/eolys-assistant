import { metrics } from "@opentelemetry/api";
import { traceContext } from "@trigger.dev/core/v3";
export const otel = {
    withExternalTrace: (fn) => {
        return traceContext.withExternalTrace(fn);
    },
    metrics,
};
//# sourceMappingURL=otel.js.map