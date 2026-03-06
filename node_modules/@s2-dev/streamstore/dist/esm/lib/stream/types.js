import { S2Error } from "../../error.js";
export class BatchSubmitTicket {
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
//# sourceMappingURL=types.js.map