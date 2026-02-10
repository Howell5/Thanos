import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";

interface TextOverlayProps {
	text: string;
	position: "top" | "center" | "bottom";
}

const positionMap: Record<TextOverlayProps["position"], React.CSSProperties> = {
	top: {
		top: "10%",
		bottom: "auto",
		justifyContent: "flex-start",
	},
	center: {
		top: "50%",
		bottom: "auto",
		transform: "translateY(-50%)",
		justifyContent: "center",
	},
	bottom: {
		top: "auto",
		bottom: "15%",
		justifyContent: "flex-end",
	},
};

/**
 * Text overlay component with a subtle fade-in effect.
 * Renders white text on a dark semi-transparent background pill.
 */
export const TextOverlay: React.FC<TextOverlayProps> = ({ text, position }) => {
	const frame = useCurrentFrame();

	// Fade in over the first 10 frames
	const opacity = interpolate(frame, [0, 10], [0, 1], {
		extrapolateLeft: "clamp",
		extrapolateRight: "clamp",
	});

	const positionStyle = positionMap[position];

	return (
		<AbsoluteFill
			style={{
				display: "flex",
				alignItems: "center",
				...positionStyle,
				opacity,
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					backgroundColor: "rgba(0, 0, 0, 0.6)",
					color: "#ffffff",
					fontSize: 40,
					fontWeight: 600,
					padding: "12px 32px",
					borderRadius: 24,
					maxWidth: "80%",
					textAlign: "center",
					lineHeight: 1.4,
				}}
			>
				{text}
			</div>
		</AbsoluteFill>
	);
};
