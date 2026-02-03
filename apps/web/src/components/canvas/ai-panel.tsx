import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGenerateAIImage } from "@/hooks/use-ai-images";
import { cn } from "@/lib/utils";
import type { AIModel, AspectRatio } from "@repo/shared";
import { ChevronDown, ChevronUp, Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";

interface AIPanelProps {
  projectId: string;
  onImageGenerated?: (imageUrl: string, imageId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

const aspectRatios: { value: AspectRatio; label: string }[] = [
  { value: "1:1", label: "1:1 (Square)" },
  { value: "16:9", label: "16:9 (Landscape)" },
  { value: "9:16", label: "9:16 (Portrait)" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

const models: { value: AIModel; label: string; credits: number }[] = [
  { value: "imagen-3.0-generate-001", label: "Imagen 3 (Standard)", credits: 100 },
  { value: "imagen-3.0-fast-001", label: "Imagen 3 (Fast)", credits: 50 },
];

export function AIPanel({ projectId, onImageGenerated, isOpen, onToggle }: AIPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("1:1");
  const [model, setModel] = useState<AIModel>("imagen-3.0-generate-001");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const generateImage = useGenerateAIImage();

  const handleGenerate = async () => {
    if (!prompt.trim()) return;

    try {
      const result = await generateImage.mutateAsync({
        projectId,
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        aspectRatio,
        model,
      });

      // Callback to add image to canvas
      if (onImageGenerated && result.image) {
        onImageGenerated(result.image.r2Url, result.image.id);
      }

      // Clear prompt after successful generation
      setPrompt("");
    } catch {
      // Error handled by mutation
    }
  };

  const selectedModel = models.find((m) => m.value === model);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
      >
        <Sparkles className="h-4 w-4" />
        AI Generate
      </button>
    );
  }

  return (
    <div className="fixed right-4 top-4 z-50 w-80 rounded-lg border bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold">AI Image Generator</span>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="space-y-4 p-4">
        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt</Label>
          <textarea
            id="prompt"
            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Describe the image you want to generate..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        {/* Aspect Ratio */}
        <div className="space-y-2">
          <Label>Aspect Ratio</Label>
          <div className="flex flex-wrap gap-2">
            {aspectRatios.map((ar) => (
              <button
                key={ar.value}
                type="button"
                onClick={() => setAspectRatio(ar.value)}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-xs transition-colors",
                  aspectRatio === ar.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input hover:bg-muted",
                )}
              >
                {ar.label}
              </button>
            ))}
          </div>
        </div>

        {/* Model Selection */}
        <div className="space-y-2">
          <Label>Model</Label>
          <div className="space-y-2">
            {models.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setModel(m.value)}
                className={cn(
                  "flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
                  model === m.value ? "border-primary bg-primary/5" : "border-input hover:bg-muted",
                )}
              >
                <span>{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.credits} credits</span>
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Options */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between text-sm text-muted-foreground hover:text-foreground"
          >
            <span>Advanced Options</span>
            {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showAdvanced && (
            <div className="space-y-2 pt-2">
              <Label htmlFor="negative-prompt">Negative Prompt</Label>
              <Input
                id="negative-prompt"
                placeholder="What to avoid in the image..."
                value={negativePrompt}
                onChange={(e) => setNegativePrompt(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={!prompt.trim() || generateImage.isPending}
          className="w-full"
        >
          {generateImage.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate ({selectedModel?.credits} credits)
            </>
          )}
        </Button>

        {/* Credits Info */}
        {generateImage.data && (
          <p className="text-center text-xs text-muted-foreground">
            Credits remaining: {generateImage.data.creditsRemaining}
          </p>
        )}
      </div>
    </div>
  );
}
