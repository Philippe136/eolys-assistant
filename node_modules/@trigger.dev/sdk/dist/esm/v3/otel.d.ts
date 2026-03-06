export declare const otel: {
    withExternalTrace: <T>(fn: () => T) => T;
    metrics: import("@opentelemetry/api").MetricsAPI;
};
