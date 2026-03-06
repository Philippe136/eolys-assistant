"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InputStreamOncePromise = exports.InputStreamTimeoutError = void 0;
class InputStreamTimeoutError extends Error {
    streamId;
    timeoutMs;
    constructor(streamId, timeoutMs) {
        super(`Timeout waiting for input stream "${streamId}" after ${timeoutMs}ms`);
        this.streamId = streamId;
        this.timeoutMs = timeoutMs;
        this.name = "InputStreamTimeoutError";
    }
}
exports.InputStreamTimeoutError = InputStreamTimeoutError;
class InputStreamOncePromise extends Promise {
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
exports.InputStreamOncePromise = InputStreamOncePromise;
//# sourceMappingURL=types.js.map