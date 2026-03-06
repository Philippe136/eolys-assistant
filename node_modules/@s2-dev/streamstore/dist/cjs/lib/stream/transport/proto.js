"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decodeProtoReadBatch = exports.protoAppendAckToJson = exports.decodeProtoAppendAck = exports.encodeProtoAppendInput = exports.buildProtoAppendInput = void 0;
exports.bigintToSafeNumber = bigintToSafeNumber;
exports.convertProtoRecord = convertProtoRecord;
const error_js_1 = require("../../../error.js");
const Proto = require("../../../generated/proto/s2.js");
const textEncoder = new TextEncoder();
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);
function bigintToSafeNumber(value, field) {
    if (value > MAX_SAFE_BIGINT) {
        throw new error_js_1.S2Error({
            message: `${field} exceeds JavaScript Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}); use protobuf transport with bigint support or ensure values stay within 53-bit range`,
            code: "UNSAFE_INTEGER",
            status: 0,
            origin: "sdk",
        });
    }
    return Number(value);
}
const toBytes = (value) => {
    if (value === undefined || value === null) {
        return new Uint8Array();
    }
    return typeof value === "string" ? textEncoder.encode(value) : value;
};
const toProtoHeaders = (headers) => {
    if (!headers) {
        return [];
    }
    return headers.map(([name, value]) => ({
        name: toBytes(name),
        value: toBytes(value),
    }));
};
const toProtoAppendRecord = (record) => {
    let timestamp;
    if (record.timestamp !== undefined) {
        const ms = typeof record.timestamp === "number"
            ? record.timestamp
            : record.timestamp.getTime();
        timestamp = BigInt(ms);
    }
    return {
        timestamp,
        headers: toProtoHeaders(record.headers),
        body: toBytes(record.body),
    };
};
const fromProtoPosition = (position) => {
    if (!position) {
        return undefined;
    }
    return {
        seq_num: bigintToSafeNumber(position.seqNum, "StreamPosition.seqNum"),
        timestamp: Number(position.timestamp),
    };
};
const toSDKStreamPosition = (pos) => {
    return {
        seqNum: pos.seq_num,
        timestamp: new Date(pos.timestamp),
    };
};
const fromProtoSequencedRecord = (record) => {
    return {
        seq_num: bigintToSafeNumber(record.seqNum, "SequencedRecord.seqNum"),
        timestamp: Number(record.timestamp),
        headers: record.headers?.map((header) => [header.name, header.value]) ?? [],
        body: record.body,
    };
};
/**
 * Convert a raw protobuf SequencedRecord to the requested ReadRecord format.
 * Used by the S2S transport for record conversion.
 */
function convertProtoRecord(record, format, textDecoder = new TextDecoder()) {
    if (record.seqNum === undefined || record.timestamp === undefined) {
        throw new error_js_1.S2Error({
            message: "Malformed SequencedRecord: missing required seqNum or timestamp",
            status: 500,
            origin: "sdk",
        });
    }
    if (format === "bytes") {
        return {
            seq_num: bigintToSafeNumber(record.seqNum, "SequencedRecord.seqNum"),
            timestamp: bigintToSafeNumber(record.timestamp, "SequencedRecord.timestamp"),
            headers: record.headers?.map((h) => [h.name ?? new Uint8Array(), h.value ?? new Uint8Array()]),
            body: record.body,
        };
    }
    const headerEntries = record.headers?.map((h) => [
        h.name ? textDecoder.decode(h.name) : "",
        h.value ? textDecoder.decode(h.value) : "",
    ]);
    return {
        seq_num: bigintToSafeNumber(record.seqNum, "SequencedRecord.seqNum"),
        timestamp: bigintToSafeNumber(record.timestamp, "SequencedRecord.timestamp"),
        headers: headerEntries,
        body: record.body ? textDecoder.decode(record.body) : undefined,
    };
}
const buildProtoAppendInput = (input) => {
    return Proto.AppendInput.create({
        records: [...input.records].map((record) => toProtoAppendRecord(record)),
        fencingToken: input.fencingToken === null
            ? undefined
            : (input.fencingToken ?? undefined),
        matchSeqNum: input.matchSeqNum !== undefined ? BigInt(input.matchSeqNum) : undefined,
    });
};
exports.buildProtoAppendInput = buildProtoAppendInput;
const ensureUint8Array = (data) => {
    return data instanceof Uint8Array ? data : new Uint8Array(data);
};
const encodeProtoAppendInput = (input) => {
    return Proto.AppendInput.toBinary((0, exports.buildProtoAppendInput)(input));
};
exports.encodeProtoAppendInput = encodeProtoAppendInput;
const decodeProtoAppendAck = (data) => {
    return Proto.AppendAck.fromBinary(ensureUint8Array(data));
};
exports.decodeProtoAppendAck = decodeProtoAppendAck;
const protoAppendAckToJson = (ack) => {
    const start = fromProtoPosition(ack.start);
    const end = fromProtoPosition(ack.end);
    if (!start || !end) {
        throw new error_js_1.S2Error({
            message: "AppendAck missing start or end positions",
            status: 500,
            origin: "sdk",
        });
    }
    const tail = fromProtoPosition(ack.tail) ?? end;
    return {
        start: toSDKStreamPosition(start),
        end: toSDKStreamPosition(end),
        tail: toSDKStreamPosition(tail),
    };
};
exports.protoAppendAckToJson = protoAppendAckToJson;
const decodeProtoReadBatch = (data) => {
    const protoBatch = Proto.ReadBatch.fromBinary(ensureUint8Array(data));
    return {
        records: protoBatch.records.map((record) => fromProtoSequencedRecord(record)),
        tail: fromProtoPosition(protoBatch.tail),
    };
};
exports.decodeProtoReadBatch = decodeProtoReadBatch;
//# sourceMappingURL=proto.js.map