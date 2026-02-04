import { ApiError, api } from "@/lib/api";
import type { AIModel, AspectRatio } from "@repo/shared";
import { create } from "zustand";

// Maximum concurrent generation tasks
export const MAX_CONCURRENT_TASKS = 5;

// Image models supported by berryon
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

// Aspect ratio options - full list from Gemini docs
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

// Number of images options
export const NUMBER_OF_IMAGES_OPTIONS = [1, 2, 3, 4] as const;
export const DEFAULT_NUMBER_OF_IMAGES = 1;

// Edit mode for inpainting/outpainting
export type EditMode = "normal" | "inpaint" | "outpaint";

// Inpainting target info
export interface InpaintTarget {
  shapeId: string;
  imageData: string; // base64 of the original image
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

// Result type for single or multiple images
interface GenerateResult {
  images: Array<{ imageUrl: string; imageId: string }>;
}

interface AIStore {
  // State
  generatingTasks: Map<string, GeneratingTask>;
  generatedImages: GeneratedImage[];
  error: string | null;
  currentPrompt: string;
  currentModel: ImageModel;
  aspectRatio: AspectRatio;
  numberOfImages: number;
  // Project context
  projectId: string | null;
  // Edit mode state
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
  // Generate multiple images
  generateImages: (prompt: string, referenceImages?: string[]) => Promise<GenerateResult>;
  // Inpainting actions
  enterInpaintMode: (shapeId: string, imageData: string) => void;
  exitInpaintMode: () => void;
  inpaintImage: (maskData: string, prompt: string) => Promise<{ imageUrl: string; imageId: string }>;
  clearError: () => void;
  clearHistory: () => void;
}

export const useAIStore = create<AIStore>((set, get) => ({
  // Initial state
  generatingTasks: new Map(),
  generatedImages: [],
  error: null,
  currentPrompt: "",
  currentModel: DEFAULT_MODEL,
  aspectRatio: DEFAULT_ASPECT_RATIO,
  numberOfImages: DEFAULT_NUMBER_OF_IMAGES,
  projectId: null,
  // Edit mode state
  editMode: "normal",
  inpaintTarget: null,
  isInpainting: false,

  // Computed getters (will be updated when tasks change)
  get isGenerating() {
    return get().generatingTasks.size > 0;
  },
  get canStartNewTask() {
    return get().generatingTasks.size < MAX_CONCURRENT_TASKS;
  },
  get generatingCount() {
    return get().generatingTasks.size;
  },

  // Set project ID
  setProjectId: (projectId: string) => {
    set({ projectId });
  },

  // Set current prompt
  setCurrentPrompt: (prompt: string) => {
    set({ currentPrompt: prompt });
  },

  // Set current model
  setCurrentModel: (model: ImageModel) => {
    set({ currentModel: model });
  },

  // Set aspect ratio
  setAspectRatio: (ratio: AspectRatio) => {
    set({ aspectRatio: ratio });
  },

  // Set number of images
  setNumberOfImages: (num: number) => {
    set({ numberOfImages: num });
  },

  // Start a generating task
  startGenerating: (taskId: string, shapeId: string, prompt: string) => {
    const { currentModel, aspectRatio } = get();

    const task: GeneratingTask = {
      id: taskId,
      shapeId,
      prompt,
      modelId: currentModel.id,
      modelName: currentModel.name,
      aspectRatio,
      imageSize: aspectRatio,
      startedAt: Date.now(),
    };

    set((state) => {
      const newTasks = new Map(state.generatingTasks);
      newTasks.set(taskId, task);
      return { generatingTasks: newTasks };
    });
  },

  // Complete a generating task
  completeGenerating: (taskId: string, imageUrl: string, imageId: string) => {
    const task = get().generatingTasks.get(taskId);
    if (!task) return;

    // Create image record
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

  // Fail a generating task
  failGenerating: (taskId: string, error: string) => {
    set((state) => {
      const newTasks = new Map(state.generatingTasks);
      newTasks.delete(taskId);
      return {
        generatingTasks: newTasks,
        error,
      };
    });
  },

  // Generate image via berryon API
  // Supports both text-to-image and image-to-image (with referenceImages)
  generateImage: async (prompt: string, referenceImages?: string[]) => {
    const { currentModel, aspectRatio, canStartNewTask, projectId } = get();

    if (!projectId) {
      throw new Error("未设置项目 ID");
    }

    if (!canStartNewTask) {
      throw new Error(`最多同时生成 ${MAX_CONCURRENT_TASKS} 张图片`);
    }

    const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    try {
      // Call berryon API
      const response = await api.api["ai-images"].generate.$post({
        json: {
          projectId,
          prompt,
          model: currentModel.id,
          aspectRatio,
          referenceImages,
        },
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error("Failed to generate image");
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = json.data as any;
      const image = data.image as { r2Url: string; id: string };
      const imageUrl = image.r2Url;
      const imageId = image.id;

      return { taskId, imageUrl, imageId };
    } catch (error) {
      console.error("Image generation error:", error);
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "生成失败，请重试";
      throw new Error(errorMessage);
    }
  },

  // Generate multiple images via berryon API
  generateImages: async (prompt: string, referenceImages?: string[]) => {
    const { currentModel, aspectRatio, numberOfImages, canStartNewTask, projectId } = get();

    if (!projectId) {
      throw new Error("未设置项目 ID");
    }

    if (!canStartNewTask) {
      throw new Error(`最多同时生成 ${MAX_CONCURRENT_TASKS} 张图片`);
    }

    try {
      // Call berryon API with numberOfImages
      const response = await api.api["ai-images"].generate.$post({
        json: {
          projectId,
          prompt,
          model: currentModel.id,
          aspectRatio,
          numberOfImages,
          referenceImages,
        },
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error("Failed to generate images");
      }

      // Handle both single image (backwards compat) and multiple images response
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = json.data as any;
      if ("images" in data && Array.isArray(data.images)) {
        // Multiple images response
        return {
          images: data.images.map((img: { r2Url: string; id: string }) => ({
            imageUrl: img.r2Url,
            imageId: img.id,
          })),
        };
      }
      // Single image response (backwards compatibility)
      const image = data.image as { r2Url: string; id: string };
      return {
        images: [{ imageUrl: image.r2Url, imageId: image.id }],
      };
    } catch (error) {
      console.error("Image generation error:", error);
      const errorMessage =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "生成失败，请重试";
      throw new Error(errorMessage);
    }
  },

  // Enter inpaint mode for a specific image
  enterInpaintMode: (shapeId: string, imageData: string) => {
    set({
      editMode: "inpaint",
      inpaintTarget: { shapeId, imageData },
    });
  },

  // Exit inpaint mode
  exitInpaintMode: () => {
    set({
      editMode: "normal",
      inpaintTarget: null,
    });
  },

  // Inpaint image via berryon API
  inpaintImage: async (maskData: string, prompt: string) => {
    const { projectId, inpaintTarget } = get();

    if (!projectId) {
      throw new Error("未设置项目 ID");
    }

    if (!inpaintTarget) {
      throw new Error("未选择要编辑的图片");
    }

    set({ isInpainting: true });

    try {
      const response = await api.api["ai-images"].inpaint.$post({
        json: {
          projectId,
          prompt,
          imageData: inpaintTarget.imageData,
          maskData,
        },
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error("Failed to inpaint image");
      }

      const { image } = json.data;
      return { imageUrl: image.r2Url, imageId: image.id };
    } catch (error) {
      console.error("Inpainting error:", error);
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

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Clear history
  clearHistory: () => {
    set({ generatedImages: [] });
  },
}));
