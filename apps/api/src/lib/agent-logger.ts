/**
 * Agent conversation logger — dev mode only.
 *
 * Writes a JSONL file per agent run to workspaces/logs/.
 * Each line is a timestamped JSON object with the raw SDK message.
 */

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

// Resolve from apps/api/ up to project root, then into workspaces/logs/
const LOGS_DIR = resolve(join(process.cwd(), "..", "..", "workspaces", "logs"));

function ensureLogsDir(): void {
  if (!existsSync(LOGS_DIR)) {
    mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function ts(): string {
  return new Date().toISOString();
}

export class AgentLogger {
  private filePath: string;

  constructor(sessionId: string | undefined) {
    ensureLogsDir();
    // Use sessionId as filename so the same session appends to one file.
    // First request has no sessionId yet — use a timestamped name that will
    // only be used for that single init request.
    const name = sessionId ?? `new_${new Date().toISOString().replace(/[:.]/g, "-")}`;
    this.filePath = join(LOGS_DIR, `${name}.jsonl`);
  }

  /** Log the initial request */
  logRequest(data: {
    prompt: string;
    workspacePath: string;
    projectId?: string;
    sessionId?: string;
    mentionedShapes?: unknown[];
  }): void {
    this.write({ type: "request", ...data });
  }

  /** Log a raw SDK message (before transformMessage) */
  logSdkMessage(msg: unknown): void {
    this.write({ type: "sdk_message", data: msg });
  }

  /** Log a shape event emitted through the EventEmitter bridge */
  logShapeEvent(instruction: unknown): void {
    this.write({ type: "canvas_add_shape", data: instruction });
  }

  /** Log completion */
  logDone(): void {
    this.write({ type: "done" });
  }

  /** Log an error */
  logError(error: unknown): void {
    this.write({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  }

  /** Get the log file path (for console output) */
  getFilePath(): string {
    return this.filePath;
  }

  private write(entry: Record<string, unknown>): void {
    try {
      const line = JSON.stringify({ ts: ts(), ...entry });
      appendFileSync(this.filePath, `${line}\n`);
    } catch {
      // Logging should never crash the agent
    }
  }
}
