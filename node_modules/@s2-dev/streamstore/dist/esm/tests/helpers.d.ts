import type { S2 } from "../index.js";
export declare const TEST_TIMEOUT_MS = 120000;
export declare const sleep: (ms: number) => Promise<unknown>;
export declare const makeBasinName: (prefix: string) => string;
export declare const makeStreamName: (prefix: string) => string;
export declare const isFreeTierLimitation: (err: unknown) => boolean;
export declare const waitForBasinReady: (s2: S2, basin: string, deadlineMs?: number) => Promise<void>;
//# sourceMappingURL=helpers.d.ts.map