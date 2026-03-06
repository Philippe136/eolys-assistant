import { AppendInput, type AppendRecord } from "./types.js";
export interface BatchTransformOptions {
    /** Duration in milliseconds to wait before flushing a batch (default: 5ms) */
    lingerDurationMillis?: number;
    /** Maximum number of records in a batch (default: 1000, max: 1000) */
    maxBatchRecords?: number;
    /** Maximum batch size in metered bytes (default: 1 MiB, max: 1 MiB) */
    maxBatchBytes?: number;
    /** Optional fencing token to enforce (remains static across batches) */
    fencingToken?: string;
    /** Optional sequence number to match for first batch (auto-increments for subsequent batches) */
    matchSeqNum?: number;
}
/** Batch output type with optional fencing token and matchSeqNum */
export type BatchOutput = AppendInput;
/**
 * A TransformStream that batches AppendRecords based on time, record count, and byte size.
 *
 * Input: AppendRecord (individual records)
 * Output: { records: AppendRecord[], fencingToken?: string, matchSeqNum?: number }
 *
 * @example
 * ```typescript
 * const batcher = new BatchTransform<"string">({
 *   lingerDurationMillis: 20,
 *   maxBatchRecords: 100,
 *   maxBatchBytes: 256 * 1024,
 *   matchSeqNum: 0  // Optional: auto-increments per batch
 * });
 *
 * // Pipe through the batcher and session to get acks
 * readable.pipeThrough(batcher).pipeThrough(session).pipeTo(writable);
 *
 * // Or use manually
 * const writer = batcher.writable.getWriter();
 * writer.write(AppendRecord.string({ body: "foo" }));
 * await writer.close();
 *
 * for await (const batch of batcher.readable) {
 *   console.log(`Got batch of ${batch.records.length} records`);
 * }
 * ```
 */
export declare class BatchTransform extends TransformStream<AppendRecord, BatchOutput> {
    private currentBatch;
    private currentBatchSize;
    private lingerTimer;
    private controller;
    private readonly maxBatchRecords;
    private readonly maxBatchBytes;
    private readonly lingerDuration;
    private readonly fencingToken?;
    private nextMatchSeqNum?;
    constructor(args?: BatchTransformOptions);
    private handleRecord;
    private flush;
    private startLingerTimer;
    private cancelLingerTimer;
}
//# sourceMappingURL=batch-transform.d.ts.map