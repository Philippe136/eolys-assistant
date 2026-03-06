"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatchSubmitTicket = void 0;
class BatchSubmitTicket {
    promise;
    bytes;
    numRecords;
    constructor(promise, bytes, numRecords) {
        this.promise = promise;
        this.bytes = bytes;
        this.numRecords = numRecords;
    }
    /**
     * Returns a promise that resolves with the AppendAck once the batch is durable.
     */
    ack() {
        return this.promise;
    }
}
exports.BatchSubmitTicket = BatchSubmitTicket;
//# sourceMappingURL=types.js.map