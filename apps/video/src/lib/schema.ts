import { z } from "zod";

export const segmentPropsSchema = z.object({
	videoUrl: z.string(),
	startFrom: z.number(),
	durationInFrames: z.number(),
	volume: z.number(),
	voiceoverAudioUrl: z.string().nullable(),
	textOverlay: z.string().nullable(),
	textPosition: z.enum(["top", "center", "bottom"]),
	transition: z.enum(["cut", "fade", "dissolve"]),
});

export const marketingVideoSchema = z.object({
	segments: z.array(segmentPropsSchema),
	bgmUrl: z.string().nullable(),
	bgmVolume: z.number(),
	fps: z.number(),
	width: z.number(),
	height: z.number(),
});

export type SegmentProps = z.infer<typeof segmentPropsSchema>;
export type MarketingVideoProps = z.infer<typeof marketingVideoSchema>;
