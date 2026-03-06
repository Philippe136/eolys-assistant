/**
 * Internal type mappers between SDK types and generated types.
 *
 * Only used for hot-path types (records, append/read responses).
 * Config, info, and metric types are used directly from generated types.
 */
import * as API from "../generated/types.gen.js";
import { decodeFromBase64, encodeToBase64 } from "../lib/base64.js";
import * as Types from "../types.js";
// =============================================================================
// Utilities
// =============================================================================
const textEncoder = new TextEncoder();
function toBytes(value) {
    return typeof value === "string" ? textEncoder.encode(value) : value;
}
function toBase64(value) {
    return encodeToBase64(toBytes(value));
}
function fromBase64(value) {
    return decodeFromBase64(value);
}
/** Convert milliseconds to Date. */
function toDate(ms) {
    return new Date(ms);
}
/** Convert Date or milliseconds to milliseconds. */
function toEpochMs(value) {
    if (value === undefined || value === null)
        return undefined;
    return typeof value === "number" ? Math.floor(value) : value.getTime();
}
// =============================================================================
// Stream Position Mapper
// =============================================================================
/**
 * Convert API StreamPosition to SDK StreamPosition.
 */
export function fromAPIStreamPosition(pos) {
    return {
        seqNum: pos.seq_num,
        timestamp: toDate(pos.timestamp),
    };
}
/**
 * Convert API AppendAck to SDK AppendAck.
 */
export function fromAPIAppendAck(ack) {
    return {
        start: fromAPIStreamPosition(ack.start),
        end: fromAPIStreamPosition(ack.end),
        tail: fromAPIStreamPosition(ack.tail),
    };
}
/**
 * Convert API TailResponse to SDK TailResponse.
 */
export function fromAPITailResponse(res) {
    return {
        tail: fromAPIStreamPosition(res.tail),
    };
}
// =============================================================================
// Record Mappers - Append
// =============================================================================
/**
 * Convert SDK AppendRecord to API AppendRecord (for JSON/REST API).
 */
export function toAPIAppendRecord(record) {
    const isStringRecord = "body" in record && typeof record.body === "string";
    if (isStringRecord) {
        const stringRecord = record;
        return {
            body: stringRecord.body,
            headers: stringRecord.headers?.map(([name, value]) => [name, value]),
            timestamp: toEpochMs(stringRecord.timestamp),
        };
    }
    else {
        const bytesRecord = record;
        return {
            body: toBase64(bytesRecord.body),
            headers: bytesRecord.headers?.map(([name, value]) => [
                toBase64(name),
                toBase64(value),
            ]),
            timestamp: toEpochMs(bytesRecord.timestamp),
        };
    }
}
// =============================================================================
// Record Mappers - Read
// =============================================================================
/**
 * Convert API SequencedRecord to SDK ReadRecord (string format).
 */
function fromAPISequencedRecordString(record) {
    let headers = [];
    if (record.headers) {
        if (Array.isArray(record.headers)) {
            headers = record.headers.map(([name, value]) => [name, value]);
        }
        else if (typeof record.headers === "object") {
            headers = Object.entries(record.headers);
        }
    }
    return {
        seqNum: record.seq_num,
        timestamp: toDate(record.timestamp),
        body: record.body ?? "",
        headers,
    };
}
/**
 * Convert API SequencedRecord to SDK ReadRecord (bytes format).
 */
function fromAPISequencedRecordBytes(record) {
    let body;
    if (!record.body) {
        body = new Uint8Array();
    }
    else if (typeof record.body === "string") {
        body = fromBase64(record.body);
    }
    else {
        body = record.body;
    }
    let headers = [];
    if (record.headers) {
        if (Array.isArray(record.headers)) {
            headers = record.headers.map(([name, value]) => {
                const nameBytes = typeof name === "string" ? fromBase64(name) : name;
                const valueBytes = typeof value === "string" ? fromBase64(value) : value;
                return [nameBytes, valueBytes];
            });
        }
        else if (typeof record.headers === "object") {
            headers = Object.entries(record.headers).map(([name, value]) => [fromBase64(name), fromBase64(value)]);
        }
    }
    return {
        seqNum: record.seq_num,
        timestamp: toDate(record.timestamp),
        body,
        headers,
    };
}
/**
 * Convert API/internal ReadBatch to SDK ReadBatch (string format).
 */
export function fromAPIReadBatchString(batch) {
    return {
        records: batch.records.map((r) => fromAPISequencedRecordString(r)),
        tail: batch.tail ? fromAPIStreamPosition(batch.tail) : undefined,
    };
}
/**
 * Convert API/internal ReadBatch to SDK ReadBatch (bytes format).
 */
export function fromAPIReadBatchBytes(batch) {
    return {
        records: batch.records.map((r) => fromAPISequencedRecordBytes(r)),
        tail: batch.tail ? fromAPIStreamPosition(batch.tail) : undefined,
    };
}
// =============================================================================
// Read Input Mapper
// =============================================================================
/**
 * Convert SDK ReadInput (camelCase) to flat query parameters for the API (snake_case).
 */
export function toAPIReadQuery(input) {
    if (!input) {
        return {};
    }
    const query = {};
    if (input.start?.from) {
        const from = input.start.from;
        if ("seqNum" in from) {
            query.seq_num = Math.floor(from.seqNum);
        }
        else if ("timestamp" in from) {
            // Convert Date to milliseconds if needed
            query.timestamp =
                typeof from.timestamp === "number"
                    ? Math.floor(from.timestamp)
                    : from.timestamp.getTime();
        }
        else if ("tailOffset" in from) {
            query.tail_offset = Math.floor(from.tailOffset);
        }
    }
    if (input.start?.clamp !== undefined) {
        query.clamp = input.start.clamp;
    }
    if (input.stop?.limits) {
        if (input.stop.limits.count !== undefined) {
            query.count = Math.floor(input.stop.limits.count);
        }
        if (input.stop.limits.bytes !== undefined) {
            query.bytes = Math.floor(input.stop.limits.bytes);
        }
    }
    if (input.stop?.untilTimestamp !== undefined) {
        query.until =
            typeof input.stop.untilTimestamp === "number"
                ? Math.floor(input.stop.untilTimestamp)
                : input.stop.untilTimestamp.getTime();
    }
    if (input.stop?.waitSecs !== undefined) {
        query.wait = Math.max(0, Math.floor(input.stop.waitSecs));
    }
    return query;
}
//# sourceMappingURL=mappers.js.map