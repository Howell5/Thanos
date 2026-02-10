import React from "react";
import { AbsoluteFill, Audio, OffthreadVideo, Sequence } from "remotion";
import { TextOverlay } from "../components/text-overlay";
import type { MarketingVideoProps } from "../lib/schema";

/**
 * Main Remotion composition that renders a marketing video
 * from sequenced video segments with optional voiceover, text overlays, and BGM.
 */
export const MarketingVideo: React.FC<MarketingVideoProps> = ({
	segments,
	bgmUrl,
	bgmVolume,
}) => {
	// Calculate the starting frame for each segment by accumulating durations
	let currentFrame = 0;
	const segmentOffsets = segments.map((segment) => {
		const offset = currentFrame;
		currentFrame += segment.durationInFrames;
		return offset;
	});

	return (
		<AbsoluteFill style={{ backgroundColor: "#000000" }}>
			{/* Video segments */}
			{segments.map((segment, index) => (
				<Sequence
					key={`segment-${index}`}
					from={segmentOffsets[index]}
					durationInFrames={segment.durationInFrames}
				>
					<AbsoluteFill>
						<OffthreadVideo
							src={segment.videoUrl}
							startFrom={segment.startFrom}
							volume={segment.volume}
							style={{
								width: "100%",
								height: "100%",
								objectFit: "cover",
							}}
						/>

						{/* Voiceover audio layer */}
						{segment.voiceoverAudioUrl && <Audio src={segment.voiceoverAudioUrl} volume={1} />}

						{/* Text overlay */}
						{segment.textOverlay && (
							<TextOverlay text={segment.textOverlay} position={segment.textPosition} />
						)}
					</AbsoluteFill>
				</Sequence>
			))}

			{/* Background music spanning the full duration */}
			{bgmUrl && <Audio src={bgmUrl} volume={bgmVolume} loop />}
		</AbsoluteFill>
	);
};
