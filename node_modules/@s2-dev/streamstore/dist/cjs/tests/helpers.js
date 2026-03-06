"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.waitForBasinReady = exports.isFreeTierLimitation = exports.makeStreamName = exports.makeBasinName = exports.sleep = exports.TEST_TIMEOUT_MS = void 0;
exports.TEST_TIMEOUT_MS = 120_000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
exports.sleep = sleep;
const makeBasinName = (prefix) => {
    const suffix = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${suffix}`.slice(0, 48);
};
exports.makeBasinName = makeBasinName;
const makeStreamName = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
exports.makeStreamName = makeStreamName;
const isFreeTierLimitation = (err) => {
    const message = err && typeof err === "object" && "message" in err
        ? String(err.message)
        : "";
    return message.toLowerCase().includes("free tier");
};
exports.isFreeTierLimitation = isFreeTierLimitation;
const waitForBasinReady = async (s2, basin, deadlineMs = 60_000) => {
    const start = Date.now();
    while (Date.now() - start < deadlineMs) {
        try {
            await s2.basins.getConfig({ basin });
            return;
        }
        catch (err) {
            const status = err && typeof err === "object" && "status" in err
                ? err.status
                : undefined;
            if (status === 503) {
                await (0, exports.sleep)(500);
                continue;
            }
            throw err;
        }
    }
    throw new Error(`Timed out waiting for basin ${basin} to become active`);
};
exports.waitForBasinReady = waitForBasinReady;
//# sourceMappingURL=helpers.js.map