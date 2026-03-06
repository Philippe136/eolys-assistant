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
exports.SYSTEM_MEMORY_STATE_VALUE_USED = exports.SYSTEM_MEMORY_STATE_VALUE_FREE = exports.SYSTEM_CPU_STATE_VALUE_USER = exports.SYSTEM_CPU_STATE_VALUE_SYSTEM = exports.SYSTEM_CPU_STATE_VALUE_NICE = exports.SYSTEM_CPU_STATE_VALUE_INTERRUPT = exports.SYSTEM_CPU_STATE_VALUE_IDLE = exports.PROCESS_CPU_STATE_VALUE_USER = exports.PROCESS_CPU_STATE_VALUE_SYSTEM = exports.NETWORK_IO_DIRECTION_VALUE_TRANSMIT = exports.NETWORK_IO_DIRECTION_VALUE_RECEIVE = exports.METRIC_SYSTEM_NETWORK_IO = exports.METRIC_SYSTEM_NETWORK_ERRORS = exports.METRIC_SYSTEM_MEMORY_UTILIZATION = exports.METRIC_SYSTEM_MEMORY_USAGE = exports.METRIC_SYSTEM_CPU_UTILIZATION = exports.METRIC_SYSTEM_CPU_TIME = exports.METRIC_PROCESS_MEMORY_USAGE = exports.METRIC_PROCESS_CPU_UTILIZATION = exports.METRIC_PROCESS_CPU_TIME = exports.ATTR_SYSTEM_MEMORY_STATE = exports.ATTR_SYSTEM_DEVICE = exports.ATTR_SYSTEM_CPU_STATE = exports.ATTR_SYSTEM_CPU_LOGICAL_NUMBER = exports.ATTR_PROCESS_CPU_STATE = exports.ATTR_NETWORK_IO_DIRECTION = void 0;
/*
 * This file contains a copy of unstable semantic convention definitions
 * used by this package.
 * @see https://github.com/open-telemetry/opentelemetry-js/tree/main/semantic-conventions#unstable-semconv
 */
/**
 * The network IO operation direction.
 *
 * @example transmit
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.ATTR_NETWORK_IO_DIRECTION = 'network.io.direction';
/**
 * Deprecated, use `cpu.mode` instead.
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `cpu.mode`.
 */
exports.ATTR_PROCESS_CPU_STATE = 'process.cpu.state';
/**
 * Deprecated, use `cpu.logical_number` instead.
 *
 * @example 1
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.ATTR_SYSTEM_CPU_LOGICAL_NUMBER = 'system.cpu.logical_number';
/**
 * Deprecated, use `cpu.mode` instead.
 *
 * @example idle
 * @example interrupt
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 *
 * @deprecated Replaced by `cpu.mode`.
 */
exports.ATTR_SYSTEM_CPU_STATE = 'system.cpu.state';
/**
 * The device identifier
 *
 * @example (identifier)
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.ATTR_SYSTEM_DEVICE = 'system.device';
/**
 * The memory state
 *
 * @example free
 * @example cached
 *
 * @experimental This attribute is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.ATTR_SYSTEM_MEMORY_STATE = 'system.memory.state';
/**
 * Total CPU seconds broken down by different states.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_PROCESS_CPU_TIME = 'process.cpu.time';
/**
 * Difference in process.cpu.time since the last measurement, divided by the elapsed time and number of CPUs available to the process.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_PROCESS_CPU_UTILIZATION = 'process.cpu.utilization';
/**
 * The amount of physical memory in use.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_PROCESS_MEMORY_USAGE = 'process.memory.usage';
/**
 * Seconds each logical CPU spent on each mode.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_SYSTEM_CPU_TIME = 'system.cpu.time';
/**
 * For each logical CPU, the utilization is calculated as the change in cumulative CPU time (cpu.time) over a measurement interval, divided by the elapsed time.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_SYSTEM_CPU_UTILIZATION = 'system.cpu.utilization';
/**
 * Reports memory in use by state.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_SYSTEM_MEMORY_USAGE = 'system.memory.usage';
/**
 * TODO.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_SYSTEM_MEMORY_UTILIZATION = 'system.memory.utilization';
/**
 * Count of network errors detected.
 *
 * @note Measured as:
 *
 *   - Linux: the `errs` column in `/proc/net/dev` ([source](https://web.archive.org/web/20180321091318/http://www.onlamp.com/pub/a/linux/2000/11/16/LinuxAdmin.html)).
 *   - Windows: [`InErrors`/`OutErrors`](https://docs.microsoft.com/windows/win32/api/netioapi/ns-netioapi-mib_if_row2)
 *     from [`GetIfEntry2`](https://docs.microsoft.com/windows/win32/api/netioapi/nf-netioapi-getifentry2).
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_SYSTEM_NETWORK_ERRORS = 'system.network.errors';
/**
 * TODO.
 *
 * @experimental This metric is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.METRIC_SYSTEM_NETWORK_IO = 'system.network.io';
/**
 * Enum value "receive" for attribute {@link ATTR_NETWORK_IO_DIRECTION}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.NETWORK_IO_DIRECTION_VALUE_RECEIVE = 'receive';
/**
 * Enum value "transmit" for attribute {@link ATTR_NETWORK_IO_DIRECTION}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.NETWORK_IO_DIRECTION_VALUE_TRANSMIT = 'transmit';
/**
 * Enum value "system" for attribute {@link ATTR_PROCESS_CPU_STATE}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.PROCESS_CPU_STATE_VALUE_SYSTEM = 'system';
/**
 * Enum value "user" for attribute {@link ATTR_PROCESS_CPU_STATE}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.PROCESS_CPU_STATE_VALUE_USER = 'user';
/**
 * Enum value "idle" for attribute {@link ATTR_SYSTEM_CPU_STATE}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.SYSTEM_CPU_STATE_VALUE_IDLE = 'idle';
/**
 * Enum value "interrupt" for attribute {@link ATTR_SYSTEM_CPU_STATE}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.SYSTEM_CPU_STATE_VALUE_INTERRUPT = 'interrupt';
/**
 * Enum value "nice" for attribute {@link ATTR_SYSTEM_CPU_STATE}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.SYSTEM_CPU_STATE_VALUE_NICE = 'nice';
/**
 * Enum value "system" for attribute {@link ATTR_SYSTEM_CPU_STATE}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.SYSTEM_CPU_STATE_VALUE_SYSTEM = 'system';
/**
 * Enum value "user" for attribute {@link ATTR_SYSTEM_CPU_STATE}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.SYSTEM_CPU_STATE_VALUE_USER = 'user';
/**
 * Enum value "free" for attribute {@link ATTR_SYSTEM_MEMORY_STATE}.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.SYSTEM_MEMORY_STATE_VALUE_FREE = 'free';
/**
 * Enum value "used" for attribute {@link ATTR_SYSTEM_MEMORY_STATE}.
 *
 * Actual used virtual memory in bytes.
 *
 * @experimental This enum value is experimental and is subject to breaking changes in minor releases of `@opentelemetry/semantic-conventions`.
 */
exports.SYSTEM_MEMORY_STATE_VALUE_USED = 'used';
//# sourceMappingURL=semconv.js.map