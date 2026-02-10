import React from "react";
import { Composition, registerRoot } from "remotion";
import { MarketingVideo } from "./compositions/marketing-video";
import { marketingVideoSchema } from "./lib/schema";
import type { MarketingVideoProps } from "./lib/schema";

const defaultProps: MarketingVideoProps = {
	segments: [
		{
			videoUrl:
				"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
			startFrom: 0,
			durationInFrames: 150,
			volume: 0,
			voiceoverAudioUrl: null,
			textOverlay: "Welcome to the demo",
			textPosition: "center",
			transition: "cut",
		},
		{
			videoUrl:
				"https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
			startFrom: 150,
			durationInFrames: 150,
			volume: 0,
			voiceoverAudioUrl: null,
			textOverlay: "Second segment",
			textPosition: "bottom",
			transition: "fade",
		},
	],
	bgmUrl: null,
	bgmVolume: 0.2,
	fps: 30,
	width: 1080,
	height: 1920,
};

const totalDuration = defaultProps.segments.reduce(
	(sum, seg) => sum + seg.durationInFrames,
	0,
);

export const RemotionRoot: React.FC = () => {
	return (
		<Composition
			id="MarketingVideo"
			component={MarketingVideo}
			schema={marketingVideoSchema}
			durationInFrames={totalDuration}
			fps={defaultProps.fps}
			width={defaultProps.width}
			height={defaultProps.height}
			defaultProps={defaultProps}
		/>
	);
};

registerRoot(RemotionRoot);
