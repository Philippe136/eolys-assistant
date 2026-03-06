"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lightpanda = void 0;
const lightpanda = ({ version = "latest", disableTelemetry = false, } = {}) => ({
    name: "lightpanda",
    onBuildComplete: async (context) => {
        if (context.target === "dev") {
            return;
        }
        context.logger.debug(`Adding lightpanda`, { version, disableTelemetry });
        const instructions = [
            `COPY --from=lightpanda/browser:${version} /usr/bin/lightpanda /usr/local/bin/lightpanda`,
            `RUN /usr/local/bin/lightpanda version || (echo "lightpanda binary is not functional" && exit 1)`,
        ];
        context.addLayer({
            id: "lightpanda",
            image: {
                instructions,
            },
            deploy: {
                env: {
                    ...(disableTelemetry ? { LIGHTPANDA_DISABLE_TELEMETRY: "true" } : {}),
                },
                override: true,
            },
        });
    },
});
exports.lightpanda = lightpanda;
//# sourceMappingURL=lightpanda.js.map