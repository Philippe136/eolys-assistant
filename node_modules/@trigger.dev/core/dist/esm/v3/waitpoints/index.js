export class WaitpointTimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = "WaitpointTimeoutError";
    }
}
export class ManualWaitpointPromise extends Promise {
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
//# sourceMappingURL=index.js.map