/**
 * Result types for AppendSession operations.
 * Using discriminated unions for ergonomic error handling with TypeScript control flow analysis.
 */
import { S2Error } from "../error.js";
/**
 * Constructs a successful append result.
 */
export function ok(value) {
    return { ok: true, value };
}
/**
 * Constructs a failed append result.
 */
export function err(error) {
    return { ok: false, error };
}
/**
 * Constructs a successful close result.
 */
export function okClose() {
    return { ok: true };
}
/**
 * Constructs a failed close result.
 */
export function errClose(error) {
    return { ok: false, error };
}
/**
 * Type guard to check if a result is successful.
 * Mainly for internal use; prefer `result.ok` for public API.
 */
export function isOk(result) {
    return result.ok;
}
//# sourceMappingURL=result.js.map