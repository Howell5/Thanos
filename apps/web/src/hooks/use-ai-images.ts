import { api } from "@/lib/api";
import type { GenerateImage } from "@repo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const aiImageKeys = {
  all: ["ai-images"] as const,
  project: (projectId: string) => [...aiImageKeys.all, "project", projectId] as const,
  projectList: (projectId: string, params: { page?: number; limit?: number }) =>
    [...aiImageKeys.project(projectId), params] as const,
  history: () => [...aiImageKeys.all, "history"] as const,
  historyList: (params: { page?: number; limit?: number; projectId?: string }) =>
    [...aiImageKeys.history(), params] as const,
};

/**
 * Hook to fetch images for a specific project
 */
export function useProjectImages(projectId: string, page = 1, limit = 50) {
  return useQuery({
    queryKey: aiImageKeys.projectList(projectId, { page, limit }),
    queryFn: async () => {
      const response = await api.api["ai-images"].project[":id"].$get({
        param: { id: projectId },
        query: { page: String(page), limit: String(limit) },
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to fetch project images");
      }
      return json.data;
    },
    enabled: !!projectId,
  });
}

/**
 * Hook to fetch user's generation history
 */
export function useAIImageHistory(page = 1, limit = 20, projectId?: string) {
  return useQuery({
    queryKey: aiImageKeys.historyList({ page, limit, projectId }),
    queryFn: async () => {
      const query: Record<string, string> = {
        page: String(page),
        limit: String(limit),
      };
      if (projectId) {
        query.projectId = projectId;
      }

      const response = await api.api["ai-images"].history.$get({ query });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to fetch image history");
      }
      return json.data;
    },
  });
}

/**
 * Hook to generate an AI image
 */
export function useGenerateAIImage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: GenerateImage) => {
      const response = await api.api["ai-images"].generate.$post({ json: data });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to generate image");
      }
      return json.data;
    },
    onSuccess: (_, variables) => {
      // Invalidate project images and history
      queryClient.invalidateQueries({
        queryKey: aiImageKeys.project(variables.projectId),
      });
      queryClient.invalidateQueries({ queryKey: aiImageKeys.history() });
      // Also invalidate user data to update credits
      queryClient.invalidateQueries({ queryKey: ["user", "me"] });
    },
  });
}
