import { withS2Data } from "./error.js";
import { issueAccessToken, listAccessTokens, revokeAccessToken, } from "./generated/index.js";
import { toCamelCase, toSnakeCase } from "./internal/case-transform.js";
import { paginate } from "./lib/paginate.js";
import { withRetries } from "./lib/retry.js";
/** Convert expiresAt input (Date, milliseconds, or string) to RFC 3339 string for API. */
function toISOString(value) {
    if (value === null)
        return null;
    if (value === undefined)
        return undefined;
    if (value instanceof Date)
        return value.toISOString();
    if (typeof value === "number")
        return new Date(value).toISOString();
    return value;
}
/** Convert expiresAt from API (ISO string) to Date. */
function toDate(value) {
    if (value === null)
        return null;
    if (value === undefined)
        return undefined;
    return new Date(value);
}
/** Transform AccessTokenInfo response: convert expiresAt to Date. */
function transformTokenInfo(token) {
    return {
        ...token,
        expiresAt: toDate(token.expiresAt),
    };
}
/**
 * Account-scoped helper for listing, issuing, and revoking access tokens.
 *
 * Acquire via {@link S2.accessTokens}. Use {@link S2AccessTokens.listAll} for async iteration.
 */
export class S2AccessTokens {
    client;
    retryConfig;
    constructor(client, retryConfig) {
        this.client = client;
        this.retryConfig = retryConfig;
    }
    /**
     * List access tokens.
     *
     * @param args.prefix Filter to IDs beginning with this prefix
     * @param args.startAfter Filter to IDs lexicographically after this value
     * @param args.limit Max results (up to 1000)
     */
    async list(args, options) {
        const response = await withRetries(this.retryConfig, async () => {
            return await withS2Data(() => listAccessTokens({
                client: this.client,
                query: toSnakeCase(args),
                ...options,
            }));
        });
        const camelCased = toCamelCase(response);
        return {
            ...camelCased,
            accessTokens: camelCased.accessTokens.map(transformTokenInfo),
        };
    }
    /**
     * List all access tokens with automatic pagination.
     * Returns a lazy async iterable that fetches pages as needed.
     *
     * @param args - Optional filtering options: `prefix` to filter by ID prefix, `limit` for max results per page
     *
     * @example
     * ```ts
     * for await (const token of s2.accessTokens.listAll({ prefix: "service-" })) {
     *   console.log(token.id);
     * }
     * ```
     */
    listAll(args, options) {
        return paginate((a) => this.list(a, options).then((r) => ({
            items: r.accessTokens,
            hasMore: r.hasMore,
        })), args ?? {}, (token) => token.id);
    }
    /**
     * Issue a new access token.
     *
     * @param args.id Unique token ID (1-96 bytes)
     * @param args.scope Token scope (operations and resource sets)
     * @param args.autoPrefixStreams Namespace stream names by configured prefix scope
     * @param args.expiresAt Expiration time (Date or RFC 3339 string); defaults to requestor's token expiry
     */
    async issue(args, options) {
        // Convert Date to ISO string for API
        const apiArgs = {
            ...args,
            expiresAt: toISOString(args.expiresAt),
        };
        const response = await withRetries(this.retryConfig, async () => {
            return await withS2Data(() => issueAccessToken({
                client: this.client,
                body: toSnakeCase(apiArgs),
                ...options,
            }));
        });
        return toCamelCase(response);
    }
    /**
     * Revoke an access token by ID.
     *
     * @param args.id Token ID to revoke
     */
    async revoke(args, options) {
        await withRetries(this.retryConfig, async () => {
            return await withS2Data(() => revokeAccessToken({
                client: this.client,
                path: args,
                ...options,
            }));
        });
    }
}
//# sourceMappingURL=accessTokens.js.map