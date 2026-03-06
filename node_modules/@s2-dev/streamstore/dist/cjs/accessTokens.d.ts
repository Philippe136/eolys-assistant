import type { RetryConfig, S2RequestOptions } from "./common.js";
import type { Client } from "./generated/client/types.gen.js";
import type * as Types from "./types.js";
/**
 * Account-scoped helper for listing, issuing, and revoking access tokens.
 *
 * Acquire via {@link S2.accessTokens}. Use {@link S2AccessTokens.listAll} for async iteration.
 */
export declare class S2AccessTokens {
    readonly client: Client;
    private readonly retryConfig?;
    constructor(client: Client, retryConfig?: RetryConfig);
    /**
     * List access tokens.
     *
     * @param args.prefix Filter to IDs beginning with this prefix
     * @param args.startAfter Filter to IDs lexicographically after this value
     * @param args.limit Max results (up to 1000)
     */
    list(args?: Types.ListAccessTokensInput, options?: S2RequestOptions): Promise<Types.ListAccessTokensResponse>;
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
    listAll(args?: Types.ListAllAccessTokensInput, options?: S2RequestOptions): AsyncIterable<Types.AccessTokenInfo>;
    /**
     * Issue a new access token.
     *
     * @param args.id Unique token ID (1-96 bytes)
     * @param args.scope Token scope (operations and resource sets)
     * @param args.autoPrefixStreams Namespace stream names by configured prefix scope
     * @param args.expiresAt Expiration time (Date or RFC 3339 string); defaults to requestor's token expiry
     */
    issue(args: Types.IssueAccessTokenInput, options?: S2RequestOptions): Promise<Types.IssueAccessTokenResponse>;
    /**
     * Revoke an access token by ID.
     *
     * @param args.id Token ID to revoke
     */
    revoke(args: Types.RevokeAccessTokenInput, options?: S2RequestOptions): Promise<void>;
}
//# sourceMappingURL=accessTokens.d.ts.map