"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.machineId = void 0;
const friendlyId_js_1 = require("../isomorphic/friendlyId.js");
const getEnv_js_1 = require("../utils/getEnv.js");
exports.machineId = (0, getEnv_js_1.getEnvVar)("TRIGGER_MACHINE_ID") ?? (0, friendlyId_js_1.generateFriendlyId)("machine");
//# sourceMappingURL=machineId.js.map