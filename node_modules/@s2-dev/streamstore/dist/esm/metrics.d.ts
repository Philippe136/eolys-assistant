import type { RetryConfig, S2RequestOptions } from "./common.js";
import type { Client } from "./generated/client/types.gen.js";
import type * as Types from "./types.js";
/** Convert API metric response to SDK types with Date conversions. */
export declare function fromAPIMetricSetResponse(response: unknown): Types.MetricSetResponse;
/**
 * Helper for querying account, basin, and stream level metrics.
 *
 * Access via {@link S2.metrics}. Responses are automatically converted to Date-friendly SDK types.
 */
export declare class S2Metrics {
    readonly client: Client;
    private readonly retryConfig?;
    constructor(client: Client, retryConfig?: RetryConfig);
    /**
     * Account-level metrics.
     *
     * @param args.set Metric set to return
     * @param args.start Optional start timestamp (milliseconds since Unix epoch)
     * @param args.end Optional end timestamp (milliseconds since Unix epoch)
     * @param args.interval Optional aggregation interval for timeseries sets
     */
    account(args: Types.AccountMetricsInput, options?: S2RequestOptions): Promise<Types.MetricSetResponse>;
    /**
     * Basin-level metrics.
     *
     * @param args.basin Basin name
     * @param args.set Metric set to return
     * @param args.start Optional start timestamp (milliseconds since Unix epoch)
     * @param args.end Optional end timestamp (milliseconds since Unix epoch)
     * @param args.interval Optional aggregation interval for timeseries sets
     */
    basin(args: Types.BasinMetricsInput, options?: S2RequestOptions): Promise<Types.MetricSetResponse>;
    /**
     * Stream-level metrics.
     *
     * @param args.basin Basin name
     * @param args.stream Stream name
     * @param args.set Metric set to return
     * @param args.start Optional start timestamp (milliseconds since Unix epoch)
     * @param args.end Optional end timestamp (milliseconds since Unix epoch)
     * @param args.interval Optional aggregation interval for timeseries sets
     */
    stream(args: Types.StreamMetricsInput, options?: S2RequestOptions): Promise<Types.MetricSetResponse>;
}
//# sourceMappingURL=metrics.d.ts.map