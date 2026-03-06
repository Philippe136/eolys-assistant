export class InputStreamTimeoutError extends Error {
    streamId;
    timeoutMs;
    constructor(streamId, timeoutMs) {
        super(`Timeout waiting for input stream "${streamId}" after ${timeoutMs}ms`);
        this.streamId = streamId;
        this.timeoutMs = timeoutMs;
        this.name = "InputStreamTimeoutError";
    }
}
export class InputStreamOncePromise extends Promise {
    constructor(executor) {
        super(executor);
    }
    unwrap() {
        return this.then((result) => {
            if (result.ok) {
                return result.output;
            }
            else {
                throw result.error;
            }
        });
    }
}
//# sourceMappingURL=types.js.map