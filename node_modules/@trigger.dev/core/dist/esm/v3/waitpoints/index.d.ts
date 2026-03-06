import type { WaitpointTokenTypedResult } from "../schemas/common.js";
export declare class WaitpointTimeoutError extends Error {
    constructor(message: string);
}
export declare class ManualWaitpointPromise<TOutput> extends Promise<WaitpointTokenTypedResult<TOutput>> {
    constructor(executor: (resolve: (value: WaitpointTokenTypedResult<TOutput> | PromiseLike<WaitpointTokenTypedResult<TOutput>>) => void, reject: (reason?: any) => void) => void);
    unwrap(): Promise<TOutput>;
}
