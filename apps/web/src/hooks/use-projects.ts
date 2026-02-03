import { api } from "@/lib/api";
import type { CreateProject, UpdateProject } from "@repo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export const projectKeys = {
  all: ["projects"] as const,
  lists: () => [...projectKeys.all, "list"] as const,
  list: (params: { page?: number; limit?: number }) => [...projectKeys.lists(), params] as const,
  details: () => [...projectKeys.all, "detail"] as const,
  detail: (id: string) => [...projectKeys.details(), id] as const,
};

/**
 * Hook to fetch paginated project list
 */
export function useProjects(page = 1, limit = 20) {
  return useQuery({
    queryKey: projectKeys.list({ page, limit }),
    queryFn: async () => {
      const response = await api.api.projects.$get({
        query: { page: String(page), limit: String(limit) },
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to fetch projects");
      }
      return json.data;
    },
  });
}

/**
 * Hook to fetch single project details
 */
export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: async () => {
      const response = await api.api.projects[":id"].$get({
        param: { id },
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to fetch project");
      }
      return json.data;
    },
    enabled: !!id,
  });
}

/**
 * Hook to create a new project
 */
export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreateProject) => {
      const response = await api.api.projects.$post({ json: data });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to create project");
      }
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

/**
 * Hook to update a project
 */
export function useUpdateProject(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateProject) => {
      const response = await api.api.projects[":id"].$patch({
        param: { id },
        json: data,
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to update project");
      }
      return json.data;
    },
    onSuccess: (updatedProject) => {
      queryClient.setQueryData(projectKeys.detail(id), updatedProject);
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}

/**
 * Hook to delete a project
 */
export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await api.api.projects[":id"].$delete({
        param: { id },
      });
      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "Failed to delete project");
      }
      return json.data;
    },
    onSuccess: (_, deletedId) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(deletedId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.lists() });
    },
  });
}
