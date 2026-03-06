export const TEST_TIMEOUT_MS = 120_000;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const makeBasinName = (prefix) => {
    const suffix = Math.random().toString(36).slice(2, 10);
    return `${prefix}-${suffix}`.slice(0, 48);
};
export const makeStreamName = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
export const isFreeTierLimitation = (err) => {
    const message = err && typeof err === "object" && "message" in err
        ? String(err.message)
        : "";
    return message.toLowerCase().includes("free tier");
};
export const waitForBasinReady = async (s2, basin, deadlineMs = 60_000) => {
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
                await sleep(500);
                continue;
            }
            throw err;
        }
    }
    throw new Error(`Timed out waiting for basin ${basin} to become active`);
};
//# sourceMappingURL=helpers.js.map