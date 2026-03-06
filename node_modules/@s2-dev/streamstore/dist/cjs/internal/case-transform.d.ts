/**
 * Type-level and runtime utilities for converting between snake_case and camelCase.
 *
 * These utilities allow the SDK to expose camelCase APIs to users while the
 * generated types from OpenAPI use snake_case to match the wire format.
 */
/**
 * Convert a snake_case string literal to camelCase at the type level.
 *
 * @example
 * type Result = SnakeToCamel<"seq_num">; // "seqNum"
 * type Result2 = SnakeToCamel<"created_at">; // "createdAt"
 */
export type SnakeToCamel<S extends string> = S extends `${infer Head}_${infer Tail}` ? `${Head}${Capitalize<SnakeToCamel<Tail>>}` : S;
/**
 * Convert a camelCase string literal to snake_case at the type level.
 *
 * @example
 * type Result = CamelToSnake<"seqNum">; // "seq_num"
 * type Result2 = CamelToSnake<"createdAt">; // "created_at"
 */
export type CamelToSnake<S extends string> = S extends `${infer Head}${infer Tail}` ? Head extends Uppercase<Head> ? Head extends Lowercase<Head> ? `${Head}${CamelToSnake<Tail>}` : `_${Lowercase<Head>}${CamelToSnake<Tail>}` : `${Head}${CamelToSnake<Tail>}` : S;
/**
 * Recursively transform all keys in an object type from snake_case to camelCase.
 *
 * @example
 * type API = { seq_num: number; created_at: string };
 * type SDK = CamelCaseKeys<API>; // { seqNum: number; createdAt: string }
 */
export type CamelCaseKeys<T> = T extends object ? T extends Array<infer U> ? Array<CamelCaseKeys<U>> : T extends ReadonlyArray<infer U> ? ReadonlyArray<CamelCaseKeys<U>> : {
    [K in keyof T as SnakeToCamel<K & string>]: CamelCaseKeys<T[K]>;
} : T;
/**
 * Recursively transform all keys in an object type from camelCase to snake_case.
 *
 * @example
 * type SDK = { seqNum: number; createdAt: string };
 * type API = SnakeCaseKeys<SDK>; // { seq_num: number; created_at: string }
 */
export type SnakeCaseKeys<T> = T extends object ? T extends Array<infer U> ? Array<SnakeCaseKeys<U>> : T extends ReadonlyArray<infer U> ? ReadonlyArray<SnakeCaseKeys<U>> : {
    [K in keyof T as CamelToSnake<K & string>]: SnakeCaseKeys<T[K]>;
} : T;
/**
 * Recursively transform all keys in an object from snake_case to camelCase at runtime.
 *
 * @example
 * const api = { seq_num: 123, created_at: "2024-01-01" };
 * const sdk = toCamelCase(api); // { seqNum: 123, createdAt: "2024-01-01" }
 */
export declare function toCamelCase<T>(obj: unknown): CamelCaseKeys<T>;
/**
 * Recursively transform all keys in an object from camelCase to snake_case at runtime.
 *
 * @example
 * const sdk = { seqNum: 123, createdAt: "2024-01-01" };
 * const api = toSnakeCase(sdk); // { seq_num: 123, created_at: "2024-01-01" }
 */
export declare function toSnakeCase<T>(obj: unknown): SnakeCaseKeys<T>;
//# sourceMappingURL=case-transform.d.ts.map