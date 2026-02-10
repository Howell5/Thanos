/**
 * Convert seconds to frames, rounding to the nearest integer.
 */
export function secondsToFrames(seconds: number, fps: number): number {
	return Math.round(seconds * fps);
}

/**
 * Convert frames to seconds.
 */
export function framesToSeconds(frames: number, fps: number): number {
	return frames / fps;
}

type Resolution = "720p" | "1080p";
type AspectRatio = "9:16" | "16:9" | "1:1";

const resolutionMap: Record<Resolution, Record<AspectRatio, { width: number; height: number }>> = {
	"1080p": {
		"9:16": { width: 1080, height: 1920 },
		"16:9": { width: 1920, height: 1080 },
		"1:1": { width: 1080, height: 1080 },
	},
	"720p": {
		"9:16": { width: 720, height: 1280 },
		"16:9": { width: 1280, height: 720 },
		"1:1": { width: 720, height: 720 },
	},
};

/**
 * Get pixel dimensions for a given resolution and aspect ratio combination.
 */
export function getResolutionDimensions(
	resolution: Resolution,
	aspectRatio: AspectRatio,
): { width: number; height: number } {
	return resolutionMap[resolution][aspectRatio];
}
