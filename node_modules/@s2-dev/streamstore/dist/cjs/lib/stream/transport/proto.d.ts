import * as Proto from "../../../generated/proto/s2.js";
import type * as Types from "../../../types.js";
import type { ReadBatch, ReadRecord } from "../types.js";
export declare function bigintToSafeNumber(value: bigint, field: string): number;
/**
 * Convert a raw protobuf SequencedRecord to the requested ReadRecord format.
 * Used by the S2S transport for record conversion.
 */
export declare function convertProtoRecord<Format extends "string" | "bytes" = "string">(record: {
    seqNum?: bigint;
    timestamp?: bigint;
    headers?: Array<{
        name?: Uint8Array;
        value?: Uint8Array;
    }>;
    body?: Uint8Array;
}, format: Format, textDecoder?: TextDecoder): ReadRecord<Format>;
export declare const buildProtoAppendInput: (input: Types.AppendInput) => Proto.AppendInput;
export declare const encodeProtoAppendInput: (input: Types.AppendInput) => Uint8Array;
export declare const decodeProtoAppendAck: (data: ArrayBuffer | Uint8Array) => Proto.AppendAck;
export declare const protoAppendAckToJson: (ack: Proto.AppendAck) => Types.AppendAck;
export declare const decodeProtoReadBatch: (data: ArrayBuffer | Uint8Array) => ReadBatch<"bytes">;
//# sourceMappingURL=proto.d.ts.map