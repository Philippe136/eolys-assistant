import { BuildExtension } from "@trigger.dev/core/v3/build";
export type FfmpegOptions = {
    /**
     * The version of ffmpeg to install. If not provided, the latest version from apt will be installed.
     * If set to '7' or starts with '7.', a static build of ffmpeg 7.x from johnvansickle.com will be used instead of apt.
     * @example
     *   ffmpeg() // Installs latest ffmpeg from apt
     *   ffmpeg({ version: '7' }) // Installs static build of ffmpeg 7.x
     *   ffmpeg({ version: '7.0.1' }) // Installs static build of ffmpeg 7.x
     *   ffmpeg({ version: '6' }) // Version ignored, installs latest ffmpeg from apt
     *   ffmpeg({ version: '8' }) // Version ignored, installs latest ffmpeg from apt
     */
    version?: string;
};
/**
 * Add ffmpeg to the build, and automatically set the FFMPEG_PATH and FFPROBE_PATH environment variables.
 * @param options.version The version of ffmpeg to install. If not provided, the latest version from apt will be installed.
 * If set to '7' or starts with '7.', a static build of ffmpeg 7.x from johnvansickle.com will be used instead of apt.
 *
 * @returns The build extension.
 */
export declare function ffmpeg(options?: FfmpegOptions): BuildExtension;
