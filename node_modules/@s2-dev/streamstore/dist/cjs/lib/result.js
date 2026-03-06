"use strict";
/**
 * Result types for AppendSession operations.
 * Using discriminated unions for ergonomic error handling with TypeScript control flow analysis.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ok = ok;
exports.err = err;
exports.okClose = okClose;
exports.errClose = errClose;
exports.isOk = isOk;
/**
 * Constructs a successful append result.
 */
function ok(value) {
    return { ok: true, value };
}
/**
 * Constructs a failed append result.
 */
function err(error) {
    return { ok: false, error };
}
/**
 * Constructs a successful close result.
 */
function okClose() {
    return { ok: true };
}
/**
 * Constructs a failed close result.
 */
function errClose(error) {
    return { ok: false, error };
}
/**
 * Type guard to check if a result is successful.
 * Mainly for internal use; prefer `result.ok` for public API.
 */
function isOk(result) {
    return result.ok;
}
//# sourceMappingURL=result.js.map