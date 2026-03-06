/**
 * Generate a random token of the specified byte length, base64 encoded.
 * Uses crypto.getRandomValues() which is available in browsers and Node.js 19+.
 *
 * @param byteLength Number of random bytes to generate (default: 16)
 * @returns Base64-encoded random string
 */
export declare const randomToken: (byteLength?: number) => string;
export declare const encodeToBase64: (bytes: Uint8Array) => string;
export declare const decodeFromBase64: (str: string) => Uint8Array;
export declare const stripCrlf: (str: string) => string;
//# sourceMappingURL=base64.d.ts.map