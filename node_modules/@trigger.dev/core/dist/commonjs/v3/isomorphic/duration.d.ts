/**
 * Parses a natural language duration string into milliseconds.
 *
 * @param duration - Duration string like "1s", "5m", "2h", "1d", "1w"
 * @returns The duration in milliseconds, or undefined if invalid
 *
 * @example
 * parseNaturalLanguageDurationInMs("30m") // 1800000
 * parseNaturalLanguageDurationInMs("2h") // 7200000
 */
export declare function parseNaturalLanguageDurationInMs(duration: string): number | undefined;
export declare function parseNaturalLanguageDuration(duration: string): Date | undefined;
export declare function safeParseNaturalLanguageDuration(duration: string): Date | undefined;
export declare function parseNaturalLanguageDurationAgo(duration: string): Date | undefined;
export declare function safeParseNaturalLanguageDurationAgo(duration: string): Date | undefined;
export declare function stringifyDuration(seconds: number): string | undefined;
