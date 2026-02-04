/**
 * Upload slice for AI store
 * Handles image upload state management
 */

import { ApiError } from "@/lib/api";
import type { UploadImageResponse } from "@repo/shared";
import type { StateCreator } from "zustand";

// Maximum concurrent upload tasks
export const MAX_CONCURRENT_UPLOADS = 3;

// Upload task info
export interface UploadTask {
  id: string;
  shapeId: string;
  file: File;
  fileName: string;
  fileSize: number;
  progress: number; // 0-100
  status: "uploading" | "completed" | "failed";
  error?: string;
  startedAt: number;
  // Result data (set on completion)
  r2Url?: string;
  imageId?: string;
}

export interface UploadSlice {
  // State
  uploadTasks: Map<string, UploadTask>;

  // Actions
  startUpload: (taskId: string, shapeId: string, file: File) => void;
  updateUploadProgress: (taskId: string, progress: number) => void;
  completeUpload: (taskId: string, r2Url: string, imageId: string) => void;
  failUpload: (taskId: string, error: string) => void;
  retryUpload: (taskId: string) => Promise<UploadImageResponse>;
  cancelUpload: (taskId: string) => void;
  uploadImage: (file: File, shapeId: string) => Promise<UploadImageResponse>;
  getUploadTask: (taskId: string) => UploadTask | undefined;
}

// Dependency: projectId getter from main store
interface UploadSliceDeps {
  projectId: string | null;
}

// Helper functions to compute derived state
function computeUploadingCount(tasks: Map<string, UploadTask>): number {
  return Array.from(tasks.values()).filter((t) => t.status === "uploading").length;
}

function computeHasFailedUploads(tasks: Map<string, UploadTask>): boolean {
  return Array.from(tasks.values()).some((t) => t.status === "failed");
}

function computeCanStartNewUpload(tasks: Map<string, UploadTask>): boolean {
  return computeUploadingCount(tasks) < MAX_CONCURRENT_UPLOADS;
}

// Selectors for computed values - use these in components
export const selectUploadingCount = (state: { uploadTasks: Map<string, UploadTask> }) =>
  computeUploadingCount(state.uploadTasks);

export const selectHasFailedUploads = (state: { uploadTasks: Map<string, UploadTask> }) =>
  computeHasFailedUploads(state.uploadTasks);

export const selectCanStartNewUpload = (state: { uploadTasks: Map<string, UploadTask> }) =>
  computeCanStartNewUpload(state.uploadTasks);

export const createUploadSlice: StateCreator<
  UploadSlice & UploadSliceDeps,
  [],
  [],
  UploadSlice
> = (set, get) => ({
  // Initial state
  uploadTasks: new Map(),

  // Actions
  startUpload: (taskId: string, shapeId: string, file: File) => {
    const task: UploadTask = {
      id: taskId,
      shapeId,
      file,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      status: "uploading",
      startedAt: Date.now(),
    };

    set((state) => {
      const newTasks = new Map(state.uploadTasks);
      newTasks.set(taskId, task);
      return { uploadTasks: newTasks };
    });
  },

  updateUploadProgress: (taskId: string, progress: number) => {
    set((state) => {
      const task = state.uploadTasks.get(taskId);
      if (!task) return state;

      const newTasks = new Map(state.uploadTasks);
      newTasks.set(taskId, { ...task, progress });
      return { uploadTasks: newTasks };
    });
  },

  completeUpload: (taskId: string, r2Url: string, imageId: string) => {
    set((state) => {
      const task = state.uploadTasks.get(taskId);
      if (!task) return state;

      const newTasks = new Map(state.uploadTasks);
      newTasks.set(taskId, {
        ...task,
        status: "completed",
        progress: 100,
        r2Url,
        imageId,
      });
      return { uploadTasks: newTasks };
    });
  },

  failUpload: (taskId: string, error: string) => {
    set((state) => {
      const task = state.uploadTasks.get(taskId);
      if (!task) return state;

      const newTasks = new Map(state.uploadTasks);
      newTasks.set(taskId, {
        ...task,
        status: "failed",
        error,
      });
      return { uploadTasks: newTasks };
    });
  },

  retryUpload: async (taskId: string) => {
    const task = get().uploadTasks.get(taskId);
    if (!task || task.status !== "failed") {
      throw new Error("无法重试该上传任务");
    }

    // Reset task status
    set((state) => {
      const newTasks = new Map(state.uploadTasks);
      newTasks.set(taskId, {
        ...task,
        status: "uploading",
        progress: 0,
        error: undefined,
      });
      return { uploadTasks: newTasks };
    });

    // Re-upload using the stored file
    return get().uploadImage(task.file, task.shapeId);
  },

  cancelUpload: (taskId: string) => {
    set((state) => {
      const newTasks = new Map(state.uploadTasks);
      newTasks.delete(taskId);
      return { uploadTasks: newTasks };
    });
  },

  uploadImage: async (file: File, shapeId: string) => {
    const { projectId, uploadTasks } = get();

    if (!projectId) {
      throw new Error("未设置项目 ID");
    }

    if (!computeCanStartNewUpload(uploadTasks)) {
      throw new Error(`最多同时上传 ${MAX_CONCURRENT_UPLOADS} 个文件`);
    }

    const taskId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Start tracking the upload
    get().startUpload(taskId, shapeId, file);

    try {
      // Simulate progress updates (since fetch doesn't support progress for uploads easily)
      const progressInterval = setInterval(() => {
        const task = get().uploadTasks.get(taskId);
        if (task && task.status === "uploading" && task.progress < 90) {
          get().updateUploadProgress(taskId, Math.min(task.progress + 10, 90));
        }
      }, 200);

      // Create FormData for upload
      const formData = new FormData();
      formData.append("projectId", projectId);
      formData.append("file", file);

      // Use native fetch for FormData upload
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/api/ai-images/upload`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        },
      );

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || `上传失败 (${response.status})`,
        );
      }

      const json = await response.json();
      if (!json.success) {
        throw new Error(json.error?.message || "上传失败");
      }

      const data = json.data as UploadImageResponse;

      // Complete the upload
      get().completeUpload(taskId, data.r2Url, data.id);

      return data;
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "上传失败，请重试";

      get().failUpload(taskId, errorMessage);
      throw new Error(errorMessage);
    }
  },

  getUploadTask: (taskId: string) => {
    return get().uploadTasks.get(taskId);
  },
});
