import { requestCanvasSave } from "@/lib/canvas-events";
import {
  createPlaceholderShape,
  findNonOverlappingPosition,
  getPlaceholderDimensions,
  removePlaceholderShape,
  updatePlaceholderWithImage,
} from "@/lib/image-assets";
import {
  ASPECT_RATIOS,
  IMAGE_MODELS,
  IMAGE_SIZES,
  MAX_CONCURRENT_TASKS,
  NUMBER_OF_IMAGES_OPTIONS,
  useAIStore,
} from "@/stores/use-ai-store";
import type { AspectRatio, ImageSize } from "@repo/shared";
import { AlertCircle, ArrowRight, Check, ChevronDown, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { type TLImageShape, useEditor } from "tldraw";
import { Dropdown } from "./dropdown";

interface SelectedImage {
  id: string;
  src: string;
}

export function BottomPromptPanel() {
  const editor = useEditor();
  const {
    generatingTasks,
    generateImages,
    startGenerating,
    completeGenerating,
    failGenerating,
    error,
    clearError,
    currentModel,
    setCurrentModel,
    aspectRatio,
    setAspectRatio,
    imageSize,
    setImageSize,
    numberOfImages,
    setNumberOfImages,
    editMode,
    inpaintTarget,
    exitInpaintMode,
    inpaintImage,
    isInpainting,
  } = useAIStore();
  const [showModelPicker, setShowModelPicker] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const [prompt, setPrompt] = useState("");
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);

  // Auto-dismiss error after 5 seconds
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(clearError, 5000);
    return () => clearTimeout(timer);
  }, [error, clearError]);

  const generatingCount = generatingTasks.size;
  const canStartNewTask = generatingCount < MAX_CONCURRENT_TASKS;

  const updateSelection = useCallback(() => {
    const selectedShapes = editor.getSelectedShapes();

    // Filter for image shapes only, exclude generating placeholders
    const imageShapes = selectedShapes.filter((shape): shape is TLImageShape => {
      if (shape.type !== "image") return false;
      const meta = shape.meta as Record<string, unknown>;
      return meta?.source !== "generating";
    });

    if (imageShapes.length > 0) {
      const images: SelectedImage[] = [];

      for (const shape of imageShapes) {
        const assetId = shape.props.assetId;
        if (assetId) {
          const asset = editor.getAsset(assetId);
          if (asset && asset.type === "image" && asset.props.src) {
            images.push({
              id: shape.id,
              src: asset.props.src,
            });
          }
        }
      }

      setSelectedImages(images);
    } else {
      setSelectedImages([]);
    }
  }, [editor]);

  useEffect(() => {
    updateSelection();
    const dispose = editor.store.listen(() => updateSelection());
    return () => dispose();
  }, [editor, updateSelection]);

  const handleGenerate = async () => {
    if (!prompt.trim() || !canStartNewTask) return;

    const currentPrompt = prompt.trim();
    const currentAspectRatio = aspectRatio;
    const currentNumberOfImages = numberOfImages;

    const { width: placeholderWidth, height: placeholderHeight } =
      getPlaceholderDimensions(currentAspectRatio);
    const anchorShapeIds = selectedImages.map((img) => img.id);
    const placeholders: Array<{ taskId: string; shapeId: string }> = [];
    const lastPosition = findNonOverlappingPosition(
      editor,
      anchorShapeIds,
      placeholderWidth,
      placeholderHeight,
    );

    for (let i = 0; i < currentNumberOfImages; i++) {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`;

      // For subsequent images, offset horizontally with gap
      const position = {
        x: lastPosition.x + i * (placeholderWidth + 20),
        y: lastPosition.y + placeholderHeight / 2,
        anchorLeft: true,
      };

      const shapeId = createPlaceholderShape(editor, {
        taskId,
        aspectRatio: currentAspectRatio,
        modelId: currentModel.id,
        modelName: currentModel.name,
        prompt: currentPrompt,
        imageSize: currentAspectRatio,
        position,
      });

      placeholders.push({ taskId, shapeId });
      startGenerating(taskId, shapeId, currentPrompt);
    }

    // Clear prompt immediately so user can start typing next one
    setPrompt("");

    // Get reference images (base64 data) for image-to-image generation
    const referenceImages =
      selectedImages.length > 0 ? selectedImages.map((img) => img.src) : undefined;

    try {
      // Generate images (this runs in background)
      const result = await generateImages(currentPrompt, referenceImages);

      // Update each placeholder with corresponding image
      for (let i = 0; i < result.images.length && i < placeholders.length; i++) {
        const { imageUrl, imageId } = result.images[i];
        const { taskId, shapeId } = placeholders[i];

        await updatePlaceholderWithImage(editor, shapeId, imageUrl, imageId);
        completeGenerating(taskId, imageUrl, imageId);
      }

      // Trigger save after all images are added to canvas
      requestCanvasSave();
    } catch (err) {
      console.error("Failed to generate images:", err);

      // Remove all placeholders on error
      for (const { taskId, shapeId } of placeholders) {
        removePlaceholderShape(editor, shapeId);
        const errorMessage = err instanceof Error ? err.message : "未知错误";
        failGenerating(taskId, errorMessage);
      }
    }
  };

  // Handle inpaint generation
  const handleInpaint = async () => {
    if (!prompt.trim() || !inpaintTarget || isInpainting) return;

    const currentPrompt = prompt.trim();

    // Get mask from the InpaintingOverlay
    const exportMask = (window as unknown as { __exportInpaintMask?: () => string })
      .__exportInpaintMask;
    if (!exportMask) {
      console.error("Mask export function not found");
      return;
    }

    const maskData = exportMask();
    if (!maskData) {
      alert("请先在图片上绘制需要重绘的区域");
      return;
    }

    // Clear prompt immediately
    setPrompt("");

    try {
      const { imageUrl, imageId } = await inpaintImage(maskData, currentPrompt);

      // Update the original image shape with the new inpainted image
      await updatePlaceholderWithImage(editor, inpaintTarget.shapeId, imageUrl, imageId);

      // Trigger save after inpaint completes
      requestCanvasSave();

      // Exit inpaint mode
      exitInpaintMode();
    } catch (err) {
      console.error("Failed to inpaint image:", err);
      const errorMessage = err instanceof Error ? err.message : "局部重绘失败";
      failGenerating("inpaint", errorMessage);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (editMode === "inpaint") {
        handleInpaint();
      } else {
        handleGenerate();
      }
    }
  };

  const clearSelectedImages = () => {
    editor.selectNone();
    setSelectedImages([]);
  };

  const removeSelectedImage = (imageId: string) => {
    // Deselect just this one image
    const currentIds = editor.getSelectedShapeIds();
    const newIds = currentIds.filter((id) => id !== imageId);
    editor.setSelectedShapes(newIds);
  };

  // Close model picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelPickerRef.current && !modelPickerRef.current.contains(event.target as Node)) {
        setShowModelPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Position at bottom center (pointer-events-auto needed for tldraw's InFrontOfTheCanvas)
  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-[200] -translate-x-1/2 transform">
      {/* Error Toast */}
      {error && (
        <div className="absolute bottom-full left-1/2 mb-3 w-[500px] max-w-full -translate-x-1/2 transform">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 shadow-lg">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-800">生成失败</p>
              <p className="mt-0.5 break-words text-sm text-red-600">{error}</p>
            </div>
            <button
              onClick={clearError}
              className="flex-shrink-0 text-red-400 transition-colors hover:text-red-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <div className="w-[640px] rounded-2xl border border-gray-200 bg-white shadow-2xl">
        {/* Selected Images Preview */}
        {selectedImages.length > 0 && (
          <div className="px-5 pb-2 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              {selectedImages.map((image) => (
                <div key={image.id} className="relative inline-block">
                  <img
                    src={image.src}
                    alt="Selected"
                    className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
                  />
                  <button
                    onClick={() => removeSelectedImage(image.id)}
                    className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-gray-800 text-white transition-colors hover:bg-gray-700"
                    title="移除"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {selectedImages.length > 1 && (
                <button
                  onClick={clearSelectedImages}
                  className="rounded-md px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                  title="清除全部"
                >
                  清除全部
                </button>
              )}
            </div>
          </div>
        )}

        {/* Inpainting Mode Indicator */}
        {editMode === "inpaint" && (
          <div className="border-b border-purple-100 bg-purple-50 px-5 py-2">
            <p className="text-sm text-purple-700">
              🎨 局部重绘模式 - 在图片上绘制需要重绘的区域，然后输入描述
            </p>
          </div>
        )}

        {/* Input Area */}
        <div className="px-5 py-4">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder={
              editMode === "inpaint"
                ? "描述你想要在选定区域生成的内容..."
                : selectedImages.length > 0
                  ? "描述你想要的变化..."
                  : "描述你想要生成的图片..."
            }
            className="w-full resize-none border-none bg-transparent text-base leading-relaxed placeholder-gray-400 outline-none"
            rows={2}
            style={{ minHeight: "56px", maxHeight: "120px" }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 120)}px`;
            }}
          />
        </div>

        {/* Bottom Bar: Options + Generate Button */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
          {/* Left: Model Selector + Aspect Ratio */}
          <div className="flex items-center gap-2">
            {/* Model Selector */}
            <div className="relative" ref={modelPickerRef}>
              <button
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
              >
                <span>{currentModel.name}</span>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>

              {/* Model Picker Dropdown */}
              {showModelPicker && (
                <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
                  <div className="border-b border-gray-100 px-4 py-2.5">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                      选择模型
                    </p>
                  </div>
                  <div className="py-1">
                    {IMAGE_MODELS.map((model) => (
                      <button
                        key={model.id}
                        onClick={() => {
                          setCurrentModel(model);
                          setShowModelPicker(false);
                        }}
                        className={`flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 ${
                          currentModel.id === model.id ? "bg-purple-50" : ""
                        }`}
                      >
                        <div className="flex-1 text-left">
                          <div className="text-sm font-medium text-gray-800">{model.name}</div>
                          <div className="mt-0.5 text-xs text-gray-500">{model.description}</div>
                        </div>
                        {currentModel.id === model.id && (
                          <Check className="h-4 w-4 text-purple-600" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Aspect Ratio Selector */}
            <Dropdown<AspectRatio>
              value={aspectRatio}
              options={ASPECT_RATIOS}
              onChange={setAspectRatio}
              renderLabel={(option) => (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-800">{option.label}</span>
                  {option.description && (
                    <span className="text-xs text-gray-400">{option.description}</span>
                  )}
                </div>
              )}
            />

            {/* Image Size (Resolution) Selector - Only for Pro model */}
            {currentModel.id === "gemini-3-pro-image-preview" && (
              <Dropdown<ImageSize>
                value={imageSize}
                options={IMAGE_SIZES}
                onChange={setImageSize}
                renderLabel={(option) => (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-800">{option.label}</span>
                    {option.description && (
                      <span className="text-xs text-gray-400">{option.description}</span>
                    )}
                  </div>
                )}
              />
            )}

            {/* Number of Images Selector */}
            <div className="flex items-center rounded-lg bg-gray-100 p-0.5">
              {NUMBER_OF_IMAGES_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setNumberOfImages(n)}
                  className={`rounded-md px-2.5 py-1 text-sm transition-colors ${
                    numberOfImages === n
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                  title={n === 1 ? "生成1张" : `批量生成${n}张`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Status + Generate Button */}
          <div className="flex items-center gap-3">
            {/* Status */}
            {isInpainting ? (
              <p className="text-sm text-gray-500">正在重绘...</p>
            ) : generatingCount > 0 ? (
              <p className="text-sm text-gray-500">正在生成 {generatingCount} 张图片...</p>
            ) : editMode === "inpaint" ? (
              <p className="text-sm text-purple-600">绘制区域后输入描述</p>
            ) : selectedImages.length > 0 ? (
              <p className="text-sm text-gray-500">已选择 {selectedImages.length} 张参考图</p>
            ) : null}

            {/* Generate/Inpaint Button */}
            {editMode === "inpaint" ? (
              <button
                onClick={handleInpaint}
                disabled={!prompt.trim() || isInpainting}
                className="flex h-10 flex-shrink-0 items-center gap-2 rounded-xl bg-purple-600 px-4 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                title="开始重绘"
              >
                {isInpainting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ArrowRight className="h-5 w-5" />
                    <span className="text-sm font-medium">重绘</span>
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || !canStartNewTask}
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-colors hover:bg-purple-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                title={!canStartNewTask ? `最多同时生成 ${MAX_CONCURRENT_TASKS} 张图片` : "生成"}
              >
                {generatingCount > 0 ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <ArrowRight className="h-5 w-5" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
