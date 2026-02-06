/**
 * Clip Parser
 * Parses JSON clip data from Gemini video analysis response
 */

export interface ClipData {
  videoId: string;
  timeRange: string;
  startTime: number;
  endTime: number;
  content: string;
  subjects: string[];
  actions: string[];
  scene: string | null;
  shotType: string | null;
  camera: string | null;
  audio: string | null;
  textOnScreen: string | null;
  mood: string | null;
}

interface RawClip {
  time: string;
  content: string;
  subjects?: string[] | null;
  actions?: string[] | null;
  scene?: string | null;
  shot_type?: string | null;
  camera?: string | null;
  audio?: string | null;
  text_on_screen?: string | null;
  mood?: string | null;
}

/**
 * Parse JSON clip data from Gemini analysis response
 */
export function parseClipJson(analysisText: string, videoId: string): ClipData[] {
  // Strip markdown code fences if present
  let jsonText = analysisText.trim();
  if (jsonText.startsWith("```json")) {
    jsonText = jsonText.slice(7);
  }
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.slice(3);
  }
  if (jsonText.endsWith("```")) {
    jsonText = jsonText.slice(0, -3);
  }
  jsonText = jsonText.trim();

  let parsed: { clips: RawClip[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    console.error("[ClipParser] Failed to parse JSON:", jsonText.slice(0, 200));
    throw new Error("Failed to parse clip analysis JSON");
  }

  if (!parsed.clips || !Array.isArray(parsed.clips)) {
    console.warn("[ClipParser] No clips array in parsed JSON");
    return [];
  }

  const clips: ClipData[] = [];

  for (const raw of parsed.clips) {
    try {
      if (!raw.time || !raw.content) {
        console.warn("[ClipParser] Skipping clip missing time or content");
        continue;
      }

      const [startStr, endStr] = raw.time.split("-");
      const startTime = timeStrToSeconds(startStr.trim());
      const endTime = timeStrToSeconds(endStr.trim());

      // Skip invalid time ranges
      if (startTime < 0 || endTime < 0 || startTime >= endTime) {
        console.warn(`[ClipParser] Skipping invalid time range: ${raw.time}`);
        continue;
      }

      clips.push({
        videoId,
        timeRange: raw.time.trim(),
        startTime,
        endTime,
        content: raw.content.trim(),
        subjects: toStringArray(raw.subjects),
        actions: toStringArray(raw.actions),
        scene: raw.scene?.trim() || null,
        shotType: raw.shot_type?.trim() || null,
        camera: raw.camera?.trim() || null,
        audio: raw.audio?.trim() || null,
        textOnScreen: raw.text_on_screen?.trim() || null,
        mood: raw.mood?.trim() || null,
      });
    } catch (error) {
      console.warn("[ClipParser] Skipping invalid clip:", error);
    }
  }

  return clips;
}

/**
 * Safely convert a value to a string array
 */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

/**
 * Convert time string (MM:SS or HH:MM:SS) to seconds
 */
export function timeStrToSeconds(timeStr: string): number {
  const parts = timeStr.split(":").map((p) => Number.parseInt(p, 10));

  if (parts.some(Number.isNaN)) {
    throw new Error(`Invalid time format: ${timeStr}`);
  }

  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }
  if (parts.length === 3) {
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
