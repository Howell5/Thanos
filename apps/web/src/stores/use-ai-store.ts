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
    id: "imagen-3.0-generate-001",
    name: "Imagen 3",
    description: "高质量图像生成",
    credits: 100,
  },
  {
    id: "imagen-3.0-fast-001",
    name: "Imagen 3 Fast",
    description: "快速生成，适合快速迭代",
    credits: 50,
  },
];

export const DEFAULT_MODEL = IMAGE_MODELS[0];

// Aspect ratio options
export const ASPECT_RATIOS: readonly { value: AspectRatio; label: string; description: string }[] =
  [
    { value: "1:1", label: "1:1", description: "正方形" },
    { value: "16:9", label: "16:9", description: "宽屏" },
    { value: "9:16", label: "9:16", description: "竖屏" },
    { value: "4:3", label: "4:3", description: "标准" },
    { value: "3:4", label: "3:4", description: "竖版标准" },
  ];

export const DEFAULT_ASPECT_RATIO: AspectRatio = "1:1";

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

interface AIStore {
  // State
  generatingTasks: Map<string, GeneratingTask>;
  generatedImages: GeneratedImage[];
  error: string | null;
  currentPrompt: string;
  currentModel: ImageModel;
  aspectRatio: AspectRatio;
  // Project context
  projectId: string | null;

  // Computed
  isGenerating: boolean;
  canStartNewTask: boolean;
  generatingCount: number;

  // Actions
  setProjectId: (projectId: string) => void;
  setCurrentPrompt: (prompt: string) => void;
  setCurrentModel: (model: ImageModel) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  startGenerating: (taskId: string, shapeId: string, prompt: string) => void;
  completeGenerating: (taskId: string, imageUrl: string, imageId: string) => void;
  failGenerating: (taskId: string, error: string) => void;
  generateImage: (prompt: string) => Promise<{
    taskId: string;
    imageUrl: string;
    imageId: string;
  }>;
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
  projectId: null,

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
  generateImage: async (prompt: string) => {
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
        },
      });

      const json = await response.json();
      if (!json.success) {
        throw new Error("Failed to generate image");
      }

      const { image } = json.data;
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

  // Clear error
  clearError: () => {
    set({ error: null });
  },

  // Clear history
  clearHistory: () => {
    set({ generatedImages: [] });
  },
}));
