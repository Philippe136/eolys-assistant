import { IdempotencyKeyOptionsSchema } from "../schemas/api.js";
/**
 * Safely parses idempotencyKeyOptions from a database record and extracts the user-provided key.
 * Returns the user-provided key if valid options exist, otherwise falls back to the hash.
 *
 * @param run - Object containing idempotencyKey (the hash) and idempotencyKeyOptions (JSON from DB)
 * @returns The user-provided key, the hash as fallback, or null if neither exists
 */
export function getUserProvidedIdempotencyKey(run) {
    const parsed = IdempotencyKeyOptionsSchema.safeParse(run.idempotencyKeyOptions);
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
export function extractIdempotencyKeyScope(run) {
    const parsed = IdempotencyKeyOptionsSchema.safeParse(run.idempotencyKeyOptions);
    if (parsed.success) {
        return parsed.data.scope;
    }
    return undefined;
}
export function unsafeExtractIdempotencyKeyScope(run) {
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
export function extractIdempotencyKeyUser(run) {
    const parsed = IdempotencyKeyOptionsSchema.safeParse(run.idempotencyKeyOptions);
    if (parsed.success) {
        return parsed.data.key;
    }
    return undefined;
}
export function unsafeExtractIdempotencyKeyUser(run) {
    const unsafe = run.idempotencyKeyOptions;
    return unsafe?.key ?? undefined;
}
//# sourceMappingURL=idempotencyKeys.js.map