"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserProvidedIdempotencyKey = getUserProvidedIdempotencyKey;
exports.extractIdempotencyKeyScope = extractIdempotencyKeyScope;
exports.unsafeExtractIdempotencyKeyScope = unsafeExtractIdempotencyKeyScope;
exports.extractIdempotencyKeyUser = extractIdempotencyKeyUser;
exports.unsafeExtractIdempotencyKeyUser = unsafeExtractIdempotencyKeyUser;
const api_js_1 = require("../schemas/api.js");
/**
 * Safely parses idempotencyKeyOptions from a database record and extracts the user-provided key.
 * Returns the user-provided key if valid options exist, otherwise falls back to the hash.
 *
 * @param run - Object containing idempotencyKey (the hash) and idempotencyKeyOptions (JSON from DB)
 * @returns The user-provided key, the hash as fallback, or null if neither exists
 */
function getUserProvidedIdempotencyKey(run) {
    const parsed = api_js_1.IdempotencyKeyOptionsSchema.safeParse(run.idempotencyKeyOptions);
    if (parsed.success) {
        return parsed.data.key;
    }
    return run.idempotencyKey ?? undefined;
}
/**
 * Safely parses idempotencyKeyOptions and extracts the scope.
 *
 * @param run - Object containing idempotencyKeyOptions (JSON from DB)
 * @returns The scope if valid options exist, otherwise undefined
 */
function extractIdempotencyKeyScope(run) {
    const parsed = api_js_1.IdempotencyKeyOptionsSchema.safeParse(run.idempotencyKeyOptions);
    if (parsed.success) {
        return parsed.data.scope;
    }
    return undefined;
}
function unsafeExtractIdempotencyKeyScope(run) {
    const unsafe = run.idempotencyKeyOptions;
    return unsafe?.scope ?? undefined;
}
/**
 * Extracts just the user-provided key from idempotencyKeyOptions, without falling back to the hash.
 * Useful for ClickHouse replication where we want to store only the explicit user key.
 *
 * @param run - Object containing idempotencyKeyOptions (JSON from DB)
 * @returns The user-provided key if valid options exist, otherwise undefined
 */
function extractIdempotencyKeyUser(run) {
    const parsed = api_js_1.IdempotencyKeyOptionsSchema.safeParse(run.idempotencyKeyOptions);
    if (parsed.success) {
        return parsed.data.key;
    }
    return undefined;
}
function unsafeExtractIdempotencyKeyUser(run) {
    const unsafe = run.idempotencyKeyOptions;
    return unsafe?.key ?? undefined;
}
//# sourceMappingURL=idempotencyKeys.js.map