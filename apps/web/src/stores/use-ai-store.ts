import { ApiError, api } from "@/lib/api";
import type { AIModel, AspectRatio, ImageSize } from "@repo/shared";
import { create } from "zustand";
import { type UploadSlice, type UploadTask, createUploadSlice } from "./upload-slice";

// Re-export upload types and selectors
export type { UploadTask };
export {
  MAX_CONCURRENT_UPLOADS,
  selectCanStartNewUpload,
  selectHasFailedUploads,
  selectUploadingCount,
} from "./upload-slice";

// Maximum concurrent generation tasks
export const MAX_CONCURRENT_TASKS = 5;

// Image models supported by thanos
export interface ImageModel {
  id: AIModel;
  name: string;
  description: string;
  credits: number;
}

export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "gemini-2.5-flash-image",
    name: "Nanobanana",
    description: "快速生成，适合快速迭代",
    credits: 50,
  },
  {
    id: "gemini-3-pro-image-preview",
    name: "Nanobanana Pro",
    description: "高质量图像生成",
    credits: 100,
  },
];

export const DEFAULT_MODEL = IMAGE_MODELS[0];

// Aspect ratio options
export const ASPECT_RATIOS: readonly { value: AspectRatio; label: string; description: string }[] =
  [
    { value: "1:1", label: "1:1", description: "正方形" },
    { value: "3:2", label: "3:2", description: "横版照片" },
    { value: "2:3", label: "2:3", description: "竖版照片" },
    { value: "4:3", label: "4:3", description: "标准" },
    { value: "3:4", label: "3:4", description: "竖版标准" },
    { value: "5:4", label: "5:4", description: "横版画框" },
    { value: "4:5", label: "4:5", description: "Instagram" },
    { value: "16:9", label: "16:9", description: "宽屏" },
    { value: "9:16", label: "9:16", description: "手机竖屏" },
    { value: "21:9", label: "21:9", description: "超宽屏" },
  ];

export const DEFAULT_ASPECT_RATIO: AspectRatio = "1:1";

// Image size (resolution) options
export const IMAGE_SIZES: readonly { value: ImageSize; label: string; description: string }[] = [
  { value: "1K", label: "1K", description: "1024px 标准" },
  { value: "2K", label: "2K", description: "2048px 高清" },
  { value: "4K", label: "4K", description: "4096px 超清" },
];

export const DEFAULT_IMAGE_SIZE: ImageSize = "1K";

// Number of images options
export const NUMBER_OF_IMAGES_OPTIONS = [1, 2, 3, 4] as const;
export const DEFAULT_NUMBER_OF_IMAGES = 1;

// Edit mode for inpainting/outpainting
export type EditMode = "normal" | "inpaint" | "outpaint";

// Inpainting target info
export interface InpaintTarget {
  shapeId: string;
  imageData: string;
}

// Generating task info
export interface GeneratingTask {
  id: string;
  shapeId: string;
  prompt: string;
  modelId: string;
  modelName: string;
  aspectRatio: string;
  imageSize: string;
  startedAt: number;
}

interface GeneratedImage {
  id: string;
  imageUrl: string;
  prompt: string;
  modelId: string;
  createdAt: number;
}

interface GenerateResult {
  images: Array<{ imageUrl: string; imageId: string }>;
}

interface AIStoreCore {
  // State
  generatingTasks: Map<string, GeneratingTask>;
  generatedImages: GeneratedImage[];
  error: string | null;
  currentPrompt: string;
  currentModel: ImageModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  numberOfImages: number;
  projectId: string | null;
  editMode: EditMode;
  inpaintTarget: InpaintTarget | null;
  isInpainting: boolean;

  // Computed
  isGenerating: boolean;
  canStartNewTask: boolean;
  generatingCount: number;

  // Actions
  setProjectId: (projectId: string) => void;
  setCurrentPrompt: (prompt: string) => void;
  setCurrentModel: (model: ImageModel) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setImageSize: (size: ImageSize) => void;
  setNumberOfImages: (num: number) => void;
  startGenerating: (taskId: string, shapeId: string, prompt: string) => void;
  completeGenerating: (taskId: string, imageUrl: string, imageId: string) => void;
  failGenerating: (taskId: string, error: string) => void;
  generateImage: (
    prompt: string,
    referenceImages?: string[],
  ) => Promise<{
    taskId: string;
    imageUrl: string;
    imageId: string;
  }>;
  generateImages: (prompt: string, referenceImages?: string[]) => Promise<GenerateResult>;
  enterInpaintMode: (shapeId: string, imageData: string) => void;
  exitInpaintMode: () => void;
  inpaintImage: (
    maskData: string,
    prompt: string,
  ) => Promise<{ imageUrl: string; imageId: string }>;
  clearError: () => void;
  clearHistory: () => void;
}

type AIStore = AIStoreCore & UploadSlice;

export const useAIStore = create<AIStore>()((set, get, store) => ({
  // Core state
  generatingTasks: new Map(),
  generatedImages: [],
  error: null,
  currentPrompt: "",
  currentModel: DEFAULT_MODEL,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  imageSize: DEFAULT_IMAGE_SIZE,
  numberOfImages: DEFAULT_NUMBER_OF_IMAGES,
  projectId: null,
  editMode: "normal",
  inpaintTarget: null,
  isInpainting: false,

  // Computed
  get isGenerating() {
    return get().generatingTasks.size > 0;
  },
  get canStartNewTask() {
    return get().generatingTasks.size < MAX_CONCURRENT_TASKS;
  },
  get generatingCount() {
    return get().generatingTasks.size;
  },

  // Actions
  setProjectId: (projectId: string) => set({ projectId }),

  setCurrentPrompt: (prompt: string) => set({ currentPrompt: prompt }),

  setCurrentModel: (model: ImageModel) => set({ currentModel: model }),

  setAspectRatio: (ratio: AspectRatio) => set({ aspectRatio: ratio }),

  setImageSize: (size: ImageSize) => set({ imageSize: size }),

  setNumberOfImages: (num: number) => set({ numberOfImages: num }),

  startGenerating: (taskId: string, shapeId: string, prompt: string) => {
    const { currentModel, aspectRatio, imageSize } = get();
    const task: GeneratingTask = {
      id: taskId,
      shapeId,
      prompt,
      modelId: currentModel.id,
      modelName: currentModel.name,
      aspectRatio,
      imageSize,
      startedAt: Date.now(),
    };

    set((state) => {
      const newTasks = new Map(state.generatingTasks);
      newTasks.set(taskId, task);
      return { generatingTasks: newTasks };
    });
  },

  completeGenerating: (taskId: string, imageUrl: string, imageId: string) => {
    const task = get().generatingTasks.get(taskId);
    if (!task) return;

    const image: GeneratedImage = {
      id: imageId,
      imageUrl,
      prompt: task.prompt,
      modelId: task.modelId,
      createdAt: Date.now(),
    };

    set((state) => {
      const newTasks = new Map(state.generatingTasks);
      newTasks.delete(taskId);
      return {
        generatingTasks: newTasks,
        generatedImages: [image, ...state.generatedImages],
      };
    });
  },

  failGenerating: (taskId: string, error: string) => {
    set((state) => {
      const newTasks = new Map(state.generatingTasks);
      newTasks.delete(taskId);
      return { generatingTasks: newTasks, error };
    });
  },

  generateImage: async (prompt: string, referenceImages?: string[]) => {
    const { currentModel, aspectRatio, imageSize, canStartNewTask, projectId } = get();

    if (!projectId) throw new Error("未设置项目 ID");
    if (!canStartNewTask) throw new Error(`最多同时生成 ${MAX_CONCURRENT_TASKS} 张图片`);

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      const response = await api.api["ai-images"].generate.$post({
        json: {
          projectId,
          prompt,
          model: currentModel.id,
          aspectRatio,
          imageSize,
          referenceImages,
        },
      });

      const json = await response.json();
      if (!json.success) throw new Error("Failed to generate image");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = json.data as any;
      const image = data.image as { r2Url: string; id: string };
      return { taskId, imageUrl: image.r2Url, imageId: image.id };
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "生成失败，请重试";
      throw new Error(errorMessage);
    }
  },

  generateImages: async (prompt: string, referenceImages?: string[]) => {
    const { currentModel, aspectRatio, imageSize, numberOfImages, canStartNewTask, projectId } =
      get();

    if (!projectId) throw new Error("未设置项目 ID");
    if (!canStartNewTask) throw new Error(`最多同时生成 ${MAX_CONCURRENT_TASKS} 张图片`);

    try {
      const response = await api.api["ai-images"].generate.$post({
        json: {
          projectId,
          prompt,
          model: currentModel.id,
          aspectRatio,
          imageSize,
          numberOfImages,
          referenceImages,
        },
      });

      const json = await response.json();
      if (!json.success) throw new Error("Failed to generate images");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = json.data as any;
      if ("images" in data && Array.isArray(data.images)) {
        return {
          images: data.images.map((img: { r2Url: string; id: string }) => ({
            imageUrl: img.r2Url,
            imageId: img.id,
          })),
        };
      }
      const image = data.image as { r2Url: string; id: string };
      return { images: [{ imageUrl: image.r2Url, imageId: image.id }] };
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "生成失败，请重试";
      throw new Error(errorMessage);
    }
  },

  enterInpaintMode: (shapeId: string, imageData: string) => {
    set({ editMode: "inpaint", inpaintTarget: { shapeId, imageData } });
  },

  exitInpaintMode: () => {
    set({ editMode: "normal", inpaintTarget: null });
  },

  inpaintImage: async (maskData: string, prompt: string) => {
    const { projectId, inpaintTarget } = get();

    if (!projectId) throw new Error("未设置项目 ID");
    if (!inpaintTarget) throw new Error("未选择要编辑的图片");

    set({ isInpainting: true });

    try {
      const response = await api.api["ai-images"].inpaint.$post({
        json: { projectId, prompt, imageData: inpaintTarget.imageData, maskData },
      });

      const json = await response.json();
      if (!json.success) throw new Error("Failed to inpaint image");

      const { image } = json.data;
      return { imageUrl: image.r2Url, imageId: image.id };
    } catch (error) {
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "局部重绘失败，请重试";
      throw new Error(errorMessage);
    } finally {
      set({ isInpainting: false });
    }
  },

  clearError: () => set({ error: null }),

  clearHistory: () => set({ generatedImages: [] }),

  // Upload slice
  ...createUploadSlice(set, get, store),
}));
