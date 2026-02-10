import type { EditingPlan } from "@repo/shared";
import { getResolutionDimensions, secondsToFrames } from "./frame-utils";
import type { MarketingVideoProps, SegmentProps } from "./schema";

/**
 * Convert an EditingPlan into Remotion composition props.
 *
 * @param plan - The editing plan from the agent
 * @param voiceoverUrls - TTS audio URLs mapping 1:1 to plan.segments (null if no voiceover)
 */
export function planToProps(
	plan: EditingPlan,
	voiceoverUrls: (string | null)[],
): MarketingVideoProps {
	const fps = plan.fps;
	const { width, height } = getResolutionDimensions(plan.resolution, plan.aspectRatio);

	const segments: SegmentProps[] = plan.segments.map((segment, index) => {
		const durationSeconds = segment.endTime - segment.startTime;
		const durationInFrames = secondsToFrames(durationSeconds, fps);
		const startFrom = secondsToFrames(segment.startTime, fps);
		const volume = plan.audio.muteOriginalAudio ? 0 : 1;

		return {
			videoUrl: segment.videoUrl,
			startFrom,
			durationInFrames,
			volume,
			voiceoverAudioUrl: voiceoverUrls[index] ?? null,
			textOverlay: segment.textOverlay,
			textPosition: segment.textPosition,
			transition: segment.transition,
		};
	});

	return {
		segments,
		bgmUrl: plan.audio.bgmUrl,
		bgmVolume: plan.audio.bgmVolume,
		fps,
		width,
		height,
	};
}
