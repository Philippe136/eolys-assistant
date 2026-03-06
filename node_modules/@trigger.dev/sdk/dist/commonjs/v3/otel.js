"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otel = void 0;
const api_1 = require("@opentelemetry/api");
const v3_1 = require("@trigger.dev/core/v3");
exports.otel = {
    withExternalTrace: (fn) => {
        return v3_1.traceContext.withExternalTrace(fn);
    },
    metrics: api_1.metrics,
};
//# sourceMappingURL=otel.js.map