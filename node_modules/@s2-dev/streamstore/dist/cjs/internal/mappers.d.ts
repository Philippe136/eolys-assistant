/**
 * Internal type mappers between SDK types and generated types.
 *
 * Only used for hot-path types (records, append/read responses).
 * Config, info, and metric types are used directly from generated types.
 */
import * as API from "../generated/types.gen.js";
import type * as InternalTypes from "../lib/stream/types.js";
import * as Types from "../types.js";
/**
 * Convert API StreamPosition to SDK StreamPosition.
 */
export declare function fromAPIStreamPosition(pos: API.StreamPosition): Types.StreamPosition;
/**
 * Convert API AppendAck to SDK AppendAck.
 */
export declare function fromAPIAppendAck(ack: API.AppendAck): Types.AppendAck;
/**
 * Convert API TailResponse to SDK TailResponse.
 */
export declare function fromAPITailResponse(res: API.TailResponse): Types.TailResponse;
/**
 * Convert SDK AppendRecord to API AppendRecord (for JSON/REST API).
 */
export declare function toAPIAppendRecord(record: Types.AppendRecord): API.AppendRecord;
/** Input type for read batch mappers - accepts both API and internal types. */
type ReadBatchInput<Format extends "string" | "bytes"> = API.ReadBatch | InternalTypes.ReadBatch<Format>;
/**
 * Convert API/internal ReadBatch to SDK ReadBatch (string format).
 */
export declare function fromAPIReadBatchString<Format extends "string" | "bytes" = "string">(batch: ReadBatchInput<Format>): Types.ReadBatch<"string">;
/**
 * Convert API/internal ReadBatch to SDK ReadBatch (bytes format).
 */
export declare function fromAPIReadBatchBytes<Format extends "string" | "bytes" = "bytes">(batch: ReadBatchInput<Format>): Types.ReadBatch<"bytes">;
/**
 * Convert SDK ReadInput (camelCase) to flat query parameters for the API (snake_case).
 */
export declare function toAPIReadQuery(input?: Types.ReadInput): {
    seq_num?: number;
    timestamp?: number;
    tail_offset?: number;
    clamp?: boolean;
    count?: number;
    bytes?: number;
    until?: number;
    wait?: number;
};
export {};
//# sourceMappingURL=mappers.d.ts.map