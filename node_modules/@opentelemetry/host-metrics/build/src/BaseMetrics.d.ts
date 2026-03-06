import { Meter, MeterProvider } from '@opentelemetry/api';
/**
 * Metrics Collector Configuration
 */
export interface MetricsCollectorConfig {
    meterProvider?: MeterProvider;
    name?: string;
    metricGroups?: string[];
}
/**
 * Base Class for metrics
 */
export declare abstract class BaseMetrics {
    protected _meter: Meter;
    private _name;
    protected _metricGroups: Array<string> | undefined;
    constructor(config?: MetricsCollectorConfig);
    /**
     * Creates metrics
     */
    protected abstract _createMetrics(): void;
    /**
     * Starts collecting stats
     */
    abstract start(): void;
}
//# sourceMappingURL=BaseMetrics.d.ts.map