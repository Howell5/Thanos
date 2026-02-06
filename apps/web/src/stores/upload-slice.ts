/**
 * Upload slice for AI store
 * Handles image upload state management with direct R2 upload via presigned URLs
 */

import { ApiError, api } from "@/lib/api";
import type { AllowedUploadType, ConfirmUploadResponse, PresignUploadResponse } from "@repo/shared";
import { isVideoType } from "@repo/shared";
import type { StateCreator } from "zustand";

// Maximum concurrent upload tasks
export const MAX_CONCURRENT_UPLOADS = 3;

/**
 * Media metadata extracted from file
 */
interface MediaMetadata {
  width: number;
  height: number;
  duration?: number; // Only for videos, in seconds
}

/**
 * Get media dimensions (and duration for videos) from a File object
 * Uses browser's Image API for images, and <video> element for videos
 */
function getMediaMetadata(file: File): Promise<MediaMetadata> {
  if (isVideoType(file.type)) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      const url = URL.createObjectURL(file);
      video.preload = "metadata";

      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: Math.round(video.duration),
        });
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        // Fallback to 0x0 if video metadata cannot be read
        resolve({ width: 0, height: 0 });
      };

      video.src = url;
    });
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片尺寸"));
    };

    img.src = url;
  });
}

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
  // Video-specific data (for video files, triggers clip analysis)
  videoId?: string;
  duration?: number;
}

// Extended response including video data
export interface UploadResult extends ConfirmUploadResponse {
  videoId?: string;
  duration?: number;
}

export interface UploadSlice {
  // State
  uploadTasks: Map<string, UploadTask>;

  // Actions
  startUpload: (taskId: string, shapeId: string, file: File) => void;
  updateUploadProgress: (taskId: string, progress: number) => void;
  completeUpload: (taskId: string, r2Url: string, imageId: string, videoId?: string) => void;
  failUpload: (taskId: string, error: string) => void;
  retryUpload: (taskId: string) => Promise<UploadResult>;
  cancelUpload: (taskId: string) => void;
  uploadImage: (file: File, shapeId: string) => Promise<UploadResult>;
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

export const createUploadSlice: StateCreator<UploadSlice & UploadSliceDeps, [], [], UploadSlice> = (
  set,
  get,
) => ({
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

  completeUpload: (taskId: string, r2Url: string, imageId: string, videoId?: string) => {
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
        videoId,
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
    const isVideo = isVideoType(file.type);

    // Start tracking the upload
    get().startUpload(taskId, shapeId, file);

    try {
      // Read media metadata from file (images get dims, videos get dims + duration)
      const metadata = await getMediaMetadata(file);

      // Step 1: Get presigned upload URL from backend (10%)
      get().updateUploadProgress(taskId, 10);

      const presignRes = await api.api["ai-images"].presign.$post({
        json: {
          projectId,
          filename: file.name,
          contentType: file.type as AllowedUploadType,
          fileSize: file.size,
          width: metadata.width || undefined,
          height: metadata.height || undefined,
        },
      });

      const presignJson = await presignRes.json();
      if (!presignJson.success) {
        throw new Error(
          (presignJson as { error?: { message?: string } }).error?.message || "获取上传 URL 失败",
        );
      }

      const presignData = presignJson.data as PresignUploadResponse;

      // Step 2: Upload directly to R2 using presigned URL (10% -> 70%)
      get().updateUploadProgress(taskId, 30);

      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadRes.ok) {
        throw new Error(`上传到存储失败 (${uploadRes.status})`);
      }

      get().updateUploadProgress(taskId, 70);

      // Step 3: Confirm upload completion to backend (70% -> 85%)
      const confirmRes = await api.api["ai-images"].presign.confirm.$post({
        json: {
          projectId,
          key: presignData.key,
          filename: file.name,
          contentType: file.type as AllowedUploadType,
          fileSize: file.size,
          width: metadata.width || undefined,
          height: metadata.height || undefined,
        },
      });

      const confirmJson = await confirmRes.json();
      if (!confirmJson.success) {
        throw new Error(
          (confirmJson as { error?: { message?: string } }).error?.message || "确认上传失败",
        );
      }

      const data = confirmJson.data as ConfirmUploadResponse;
      get().updateUploadProgress(taskId, 85);

      // Step 4: For videos, create video record to trigger clip analysis (85% -> 100%)
      // This is non-critical - upload succeeds even if video record creation fails
      let videoId: string | undefined;
      if (isVideo) {
        try {
          const videoRes = await api.api.videos.$post({
            json: {
              projectId,
              r2Key: presignData.key,
              r2Url: data.r2Url,
              originalFileName: file.name,
              fileSize: file.size,
              mimeType: file.type as "video/mp4" | "video/webm",
              width: metadata.width || undefined,
              height: metadata.height || undefined,
              duration: metadata.duration,
            },
          });

          const videoJson = await videoRes.json();
          if (videoJson.success) {
            videoId = (videoJson.data as { id: string }).id;
          }
        } catch (videoError) {
          // Log but don't fail the upload
          console.warn("[Upload] Failed to create video record:", videoError);
        }
      }

      // Complete the upload
      get().completeUpload(taskId, data.r2Url, data.id, videoId);

      return { ...data, videoId, duration: metadata.duration };
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
