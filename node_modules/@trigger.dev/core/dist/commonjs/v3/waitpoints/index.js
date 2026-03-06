"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualWaitpointPromise = exports.WaitpointTimeoutError = void 0;
class WaitpointTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = "WaitpointTimeoutError";
    }
}
exports.WaitpointTimeoutError = WaitpointTimeoutError;
class ManualWaitpointPromise extends Promise {
    constructor(executor) {
        super(executor);
    }
    unwrap() {
        return this.then((result) => {
            if (result.ok) {
                return result.output;
            }
            else {
                throw new WaitpointTimeoutError(result.error.message);
            }
        });
    }
}
exports.ManualWaitpointPromise = ManualWaitpointPromise;
//# sourceMappingURL=index.js.map