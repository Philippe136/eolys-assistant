"use strict";
/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostMetrics = void 0;
const BaseMetrics_1 = require("./BaseMetrics");
const semconv_1 = require("./semconv");
const common_1 = require("./stats/common");
const si_1 = require("./stats/si");
/**
 * Metrics Collector - collects metrics for CPU, Memory, Network
 */
class HostMetrics extends BaseMetrics_1.BaseMetrics {
    _batchUpdateCpuUsages(observableResult, cpuUsages) {
        for (let i = 0, j = cpuUsages.length; i < j; i++) {
            const cpuUsage = cpuUsages[i];
            observableResult.observe(this._cpuTime, cpuUsage.user, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_USER,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuTime, cpuUsage.system, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_SYSTEM,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuTime, cpuUsage.idle, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_IDLE,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuTime, cpuUsage.interrupt, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_INTERRUPT,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuTime, cpuUsage.nice, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_NICE,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuUtilization, cpuUsage.userP, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_USER,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuUtilization, cpuUsage.systemP, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_SYSTEM,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuUtilization, cpuUsage.idleP, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_IDLE,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuUtilization, cpuUsage.interruptP, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_INTERRUPT,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
            observableResult.observe(this._cpuUtilization, cpuUsage.niceP, {
                [semconv_1.ATTR_SYSTEM_CPU_STATE]: semconv_1.SYSTEM_CPU_STATE_VALUE_NICE,
                [semconv_1.ATTR_SYSTEM_CPU_LOGICAL_NUMBER]: cpuUsage.cpuNumber,
            });
        }
    }
    _batchUpdateProcessCpuUsages(observableResult, processCpuUsage) {
        observableResult.observe(this._processCpuTime, processCpuUsage.user, {
            [semconv_1.ATTR_PROCESS_CPU_STATE]: semconv_1.PROCESS_CPU_STATE_VALUE_USER,
        });
        observableResult.observe(this._processCpuTime, processCpuUsage.system, {
            [semconv_1.ATTR_PROCESS_CPU_STATE]: semconv_1.PROCESS_CPU_STATE_VALUE_SYSTEM,
        });
        observableResult.observe(this._processCpuUtilization, processCpuUsage.userP, {
            [semconv_1.ATTR_PROCESS_CPU_STATE]: semconv_1.PROCESS_CPU_STATE_VALUE_USER,
        });
        observableResult.observe(this._processCpuUtilization, processCpuUsage.systemP, {
            [semconv_1.ATTR_PROCESS_CPU_STATE]: semconv_1.PROCESS_CPU_STATE_VALUE_SYSTEM,
        });
    }
    _batchUpdateMemUsages(observableResult, memUsage) {
        observableResult.observe(this._memoryUsage, memUsage.used, {
            [semconv_1.ATTR_SYSTEM_MEMORY_STATE]: semconv_1.SYSTEM_MEMORY_STATE_VALUE_USED,
        });
        observableResult.observe(this._memoryUsage, memUsage.free, {
            [semconv_1.ATTR_SYSTEM_MEMORY_STATE]: semconv_1.SYSTEM_MEMORY_STATE_VALUE_FREE,
        });
        observableResult.observe(this._memoryUtilization, memUsage.usedP, {
            [semconv_1.ATTR_SYSTEM_MEMORY_STATE]: semconv_1.SYSTEM_MEMORY_STATE_VALUE_USED,
        });
        observableResult.observe(this._memoryUtilization, memUsage.freeP, {
            [semconv_1.ATTR_SYSTEM_MEMORY_STATE]: semconv_1.SYSTEM_MEMORY_STATE_VALUE_FREE,
        });
    }
    _batchUpdateProcessMemUsage(observableResult, memoryUsage) {
        observableResult.observe(this._processMemoryUsage, memoryUsage);
    }
    _batchUpdateNetworkData(observableResult, networkUsages) {
        for (let i = 0, j = networkUsages.length; i < j; i++) {
            const networkUsage = networkUsages[i];
            observableResult.observe(this._networkDropped, networkUsage.rx_dropped, {
                [semconv_1.ATTR_SYSTEM_DEVICE]: networkUsage.iface,
                [semconv_1.ATTR_NETWORK_IO_DIRECTION]: semconv_1.NETWORK_IO_DIRECTION_VALUE_RECEIVE,
            });
            observableResult.observe(this._networkDropped, networkUsage.tx_dropped, {
                [semconv_1.ATTR_SYSTEM_DEVICE]: networkUsage.iface,
                [semconv_1.ATTR_NETWORK_IO_DIRECTION]: semconv_1.NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
            });
            observableResult.observe(this._networkErrors, networkUsage.rx_errors, {
                [semconv_1.ATTR_SYSTEM_DEVICE]: networkUsage.iface,
                [semconv_1.ATTR_NETWORK_IO_DIRECTION]: semconv_1.NETWORK_IO_DIRECTION_VALUE_RECEIVE,
            });
            observableResult.observe(this._networkErrors, networkUsage.tx_errors, {
                [semconv_1.ATTR_SYSTEM_DEVICE]: networkUsage.iface,
                [semconv_1.ATTR_NETWORK_IO_DIRECTION]: semconv_1.NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
            });
            observableResult.observe(this._networkIo, networkUsage.rx_bytes, {
                [semconv_1.ATTR_SYSTEM_DEVICE]: networkUsage.iface,
                [semconv_1.ATTR_NETWORK_IO_DIRECTION]: semconv_1.NETWORK_IO_DIRECTION_VALUE_RECEIVE,
            });
            observableResult.observe(this._networkIo, networkUsage.tx_bytes, {
                [semconv_1.ATTR_SYSTEM_DEVICE]: networkUsage.iface,
                [semconv_1.ATTR_NETWORK_IO_DIRECTION]: semconv_1.NETWORK_IO_DIRECTION_VALUE_TRANSMIT,
            });
        }
    }
    /**
     * Creates metrics
     */
    _createMetrics() {
        const observables = [];
        const systemCpuGroupEnabled = !this._metricGroups || this._metricGroups.includes('system.cpu');
        const systemMemoryGroupEnabled = !this._metricGroups || this._metricGroups.includes('system.memory');
        const systemNetworkGroupEnabled = !this._metricGroups || this._metricGroups.includes('system.network');
        const processCpuGroupEnabled = !this._metricGroups || this._metricGroups.includes('process.cpu');
        const processMemoryGroupEnabled = !this._metricGroups || this._metricGroups.includes('process.memory');
        if (systemCpuGroupEnabled) {
            this._cpuTime = this._meter.createObservableCounter(semconv_1.METRIC_SYSTEM_CPU_TIME, {
                description: 'Cpu time in seconds',
                unit: 's',
            });
            observables.push(this._cpuTime);
            this._cpuUtilization = this._meter.createObservableGauge(semconv_1.METRIC_SYSTEM_CPU_UTILIZATION, {
                description: 'Cpu usage time 0-1',
            });
            observables.push(this._cpuUtilization);
        }
        if (systemMemoryGroupEnabled) {
            this._memoryUsage = this._meter.createObservableGauge(semconv_1.METRIC_SYSTEM_MEMORY_USAGE, {
                description: 'Memory usage in bytes',
            });
            observables.push(this._memoryUsage);
            this._memoryUtilization = this._meter.createObservableGauge(semconv_1.METRIC_SYSTEM_MEMORY_UTILIZATION, {
                description: 'Memory usage 0-1',
            });
            observables.push(this._memoryUtilization);
        }
        if (systemNetworkGroupEnabled) {
            this._networkDropped = this._meter.createObservableCounter(
            // There is no semconv pkg export for this in v1.37.0 because
            // https://github.com/open-telemetry/semantic-conventions/issues/2828.
            // TODO: update to `METRIC_SYSTEM_NETWORK_PACKET_DROPPED` (breaking change)
            'system.network.dropped', {
                description: 'Network dropped packets',
            });
            observables.push(this._networkDropped);
            this._networkErrors = this._meter.createObservableCounter(semconv_1.METRIC_SYSTEM_NETWORK_ERRORS, {
                description: 'Network errors counter',
            });
            observables.push(this._networkErrors);
            this._networkIo = this._meter.createObservableCounter(semconv_1.METRIC_SYSTEM_NETWORK_IO, {
                description: 'Network transmit and received bytes',
            });
            observables.push(this._networkIo);
        }
        if (processCpuGroupEnabled) {
            this._processCpuTime = this._meter.createObservableCounter(semconv_1.METRIC_PROCESS_CPU_TIME, {
                description: 'Process Cpu time in seconds',
                unit: 's',
            });
            observables.push(this._processCpuTime);
            this._processCpuUtilization = this._meter.createObservableGauge(semconv_1.METRIC_PROCESS_CPU_UTILIZATION, {
                description: 'Process Cpu usage time 0-1',
            });
            observables.push(this._processCpuUtilization);
        }
        if (processMemoryGroupEnabled) {
            this._processMemoryUsage = this._meter.createObservableGauge(semconv_1.METRIC_PROCESS_MEMORY_USAGE, {
                description: 'Process Memory usage in bytes',
            });
            observables.push(this._processMemoryUsage);
        }
        this._meter.addBatchObservableCallback(async (observableResult) => {
            if (systemCpuGroupEnabled) {
                const cpuUsages = (0, common_1.getCpuUsageData)();
                this._batchUpdateCpuUsages(observableResult, cpuUsages);
            }
            if (systemMemoryGroupEnabled) {
                const memoryUsages = (0, common_1.getMemoryData)();
                this._batchUpdateMemUsages(observableResult, memoryUsages);
            }
            if (processCpuGroupEnabled) {
                const processCpuUsages = (0, common_1.getProcessCpuUsageData)();
                this._batchUpdateProcessCpuUsages(observableResult, processCpuUsages);
            }
            if (processMemoryGroupEnabled) {
                const processMemoryUsages = (0, common_1.getProcessMemoryData)();
                this._batchUpdateProcessMemUsage(observableResult, processMemoryUsages);
            }
            if (systemNetworkGroupEnabled) {
                const networkData = await (0, si_1.getNetworkData)();
                this._batchUpdateNetworkData(observableResult, networkData);
            }
        }, observables);
    }
    /**
     * Starts collecting metrics
     */
    start() {
        this._createMetrics();
    }
    // The metrics are created in `_createMetrics`.
    _cpuTime;
    _cpuUtilization;
    _memoryUsage;
    _memoryUtilization;
    _processCpuTime;
    _processCpuUtilization;
    _processMemoryUsage;
    _networkDropped;
    _networkErrors;
    _networkIo;
}
exports.HostMetrics = HostMetrics;
//# sourceMappingURL=metric.js.map