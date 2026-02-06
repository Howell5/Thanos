/**
 * Clip Parser
 * Parses <clip> XML tags from Gemini video analysis response
 */

export interface ClipData {
  videoId: string;
  timeRange: string;
  startTime: number;
  endTime: number;
  clipType: string;
  description: string;
  reason: string;
}

/**
 * Parse <clip> XML tags from analysis text
 * Supports both single-line attributes and nested description/reason tags
 */
export function parseClipTags(analysisText: string, videoId: string): ClipData[] {
  // Match <clip time="..." type="...">...</clip> pattern
  const clipPattern = /<clip\s+time="([^"]+)"\s+type="([^"]+)">([\s\S]*?)<\/clip>/gi;
  const descPattern = /<description>([\s\S]*?)<\/description>/i;
  const reasonPattern = /<reason>([\s\S]*?)<\/reason>/i;

  const clips: ClipData[] = [];

  let match: RegExpExecArray | null;
  while ((match = clipPattern.exec(analysisText)) !== null) {
    const [, timeRange, clipType, innerContent] = match;

    try {
      const [startStr, endStr] = timeRange.split("-");
      const startTime = timeStrToSeconds(startStr.trim());
      const endTime = timeStrToSeconds(endStr.trim());

      // Skip invalid time ranges
      if (startTime < 0 || endTime < 0 || startTime >= endTime) {
        console.warn(`[ClipParser] Skipping invalid time range: ${timeRange}`);
        continue;
      }

      const descMatch = descPattern.exec(innerContent);
      const reasonMatch = reasonPattern.exec(innerContent);

      clips.push({
        videoId,
        timeRange: timeRange.trim(),
        startTime,
        endTime,
        clipType: clipType.trim(),
        description: descMatch ? descMatch[1].trim() : "",
        reason: reasonMatch ? reasonMatch[1].trim() : "",
      });
    } catch (error) {
      console.warn(`[ClipParser] Skipping invalid clip:`, error);
      continue;
    }
  }

  return clips;
}

/**
 * Convert time string (MM:SS or HH:MM:SS) to seconds
 */
export function timeStrToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map((p) => parseInt(p, 10));

  if (parts.some(isNaN)) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  throw new Error(`Invalid time format: ${timeStr}`);
}

/**
 * Convert seconds to time string (MM:SS)
 */
export function secondsToTimeStr(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
