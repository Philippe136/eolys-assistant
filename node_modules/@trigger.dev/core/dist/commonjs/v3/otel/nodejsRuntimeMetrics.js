"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startNodejsRuntimeMetrics = startNodejsRuntimeMetrics;
const node_perf_hooks_1 = require("node:perf_hooks");
function tryMonitorEventLoopDelay() {
    try {
        const eld = (0, node_perf_hooks_1.monitorEventLoopDelay)({ resolution: 20 });
        eld.enable();
        return eld;
    }
    catch {
        // monitorEventLoopDelay is not implemented in Bun
        return undefined;
    }
}
function startNodejsRuntimeMetrics(meterProvider) {
    const meter = meterProvider.getMeter("nodejs-runtime", "1.0.0");
    // Event loop utilization (diff between collection intervals)
    let lastElu = node_perf_hooks_1.performance.eventLoopUtilization();
    const eluGauge = meter.createObservableGauge("nodejs.event_loop.utilization", {
        description: "Event loop utilization over the last collection interval",
        unit: "1",
    });
    // Event loop delay histogram (from perf_hooks) — not available in Bun
    const eld = tryMonitorEventLoopDelay();
    const observables = [eluGauge];
    let eldP95;
    let eldMax;
    if (eld) {
        eldP95 = meter.createObservableGauge("nodejs.event_loop.delay.p95", {
            description: "p95 event loop delay",
            unit: "s",
        });
        eldMax = meter.createObservableGauge("nodejs.event_loop.delay.max", {
            description: "Max event loop delay",
            unit: "s",
        });
        observables.push(eldP95, eldMax);
    }
    // Heap metrics
    const heapUsed = meter.createObservableGauge("nodejs.heap.used", {
        description: "V8 heap used",
        unit: "By",
    });
    const heapTotal = meter.createObservableGauge("nodejs.heap.total", {
        description: "V8 heap total allocated",
        unit: "By",
    });
    observables.push(heapUsed, heapTotal);
    // Single batch callback for all metrics
    meter.addBatchObservableCallback((obs) => {
        // ELU
        const currentElu = node_perf_hooks_1.performance.eventLoopUtilization();
        const diff = node_perf_hooks_1.performance.eventLoopUtilization(currentElu, lastElu);
        lastElu = currentElu;
        obs.observe(eluGauge, diff.utilization);
        // Event loop delay (nanoseconds -> seconds)
        if (eld && eldP95 && eldMax) {
            obs.observe(eldP95, eld.percentile(95) / 1e9);
            obs.observe(eldMax, eld.max / 1e9);
            eld.reset();
        }
        // Heap
        const mem = process.memoryUsage();
        obs.observe(heapUsed, mem.heapUsed);
        obs.observe(heapTotal, mem.heapTotal);
    }, observables);
}
//# sourceMappingURL=nodejsRuntimeMetrics.js.map