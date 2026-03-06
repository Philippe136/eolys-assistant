/**
 * Result types for AppendSession operations.
 * Using discriminated unions for ergonomic error handling with TypeScript control flow analysis.
 */
import { S2Error } from "../error.js";
import type { AppendAck } from "../types.js";
/**
 * Result of an append operation.
 * Use discriminated union pattern: check `result.ok` to access either `value` or `error`.
 */
export type AppendResult = {
    ok: true;
    value: AppendAck;
} | {
    ok: false;
    error: S2Error;
};
/**
 * Result of a close operation.
 */
export type CloseResult = {
    ok: true;
} | {
    ok: false;
    error: S2Error;
};
/**
 * Constructs a successful append result.
 */
export declare function ok(value: AppendAck): AppendResult;
/**
 * Constructs a failed append result.
 */
export declare function err(error: S2Error): AppendResult;
/**
 * Constructs a successful close result.
 */
export declare function okClose(): CloseResult;
/**
 * Constructs a failed close result.
 */
export declare function errClose(error: S2Error): CloseResult;
/**
 * Type guard to check if a result is successful.
 * Mainly for internal use; prefer `result.ok` for public API.
 */
export declare function isOk<T>(result: {
    ok: true;
    value: T;
} | {
    ok: false;
    error: S2Error;
}): result is {
    ok: true;
    value: T;
};
//# sourceMappingURL=result.d.ts.map