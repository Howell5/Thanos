/**
 * Render Video MCP Tool
 * Triggers video rendering and waits for completion
 */

import { tool } from "@anthropic-ai/claude-agent-sdk";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { editingPlans } from "../../db/schema";
import { createVideoRenderService } from "../../services/video-render.service";

/**
 * Create the render video tool scoped to a project
 */
export function createRenderVideoTool(projectId: string) {
  return tool(
    "render_video",
    "Render a video from an editing plan. Blocks until rendering is complete and returns the output URL. If the plan is in 'draft' status it will be automatically confirmed.",
    {
      planId: z.string().uuid().describe("The editing plan ID to render"),
    },
    async (args) => {
      try {
        const plan = await db.query.editingPlans.findFirst({
          where: eq(editingPlans.id, args.planId),
        });

        if (!plan) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Editing plan not found",
              },
            ],
            isError: true,
          };
        }

        if (plan.projectId !== projectId) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Editing plan belongs to a different project",
              },
            ],
            isError: true,
          };
        }

        if (plan.status === "rendering") {
          return {
            content: [
              {
                type: "text" as const,
                text: "Plan is already being rendered.",
              },
            ],
            isError: true,
          };
        }

        if (plan.status === "done") {
          return {
            content: [
              {
                type: "text" as const,
                text: `Plan is already rendered. Output URL: ${plan.outputUrl}`,
              },
            ],
          };
        }

        // Auto-confirm draft plans
        if (plan.status === "draft") {
          await db
            .update(editingPlans)
            .set({ status: "confirmed", updatedAt: new Date() })
            .where(eq(editingPlans.id, args.planId));
        }

        const renderService = createVideoRenderService();
        const result = await renderService.renderAndWait(args.planId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  planId: args.planId,
                  status: result.status,
                  ...(result.outputUrl ? { outputUrl: result.outputUrl } : {}),
                  ...(result.error ? { error: result.error } : {}),
                },
                null,
                2,
              ),
            },
          ],
          ...(result.status === "failed" ? { isError: true } : {}),
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error rendering video: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
