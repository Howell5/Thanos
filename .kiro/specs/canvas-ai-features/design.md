# Design Document

## Overview

本设计文档描述 AI 图片画布核心功能的技术实现方案。基于现有的 tldraw 画布架构，扩展 AI 图片编辑能力，包括 Image-to-Image、Inpainting、Outpainting、Remove Background、Upscale 等功能。

## Architecture

### 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Canvas Page                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌─────────────────────────────────────────────┐ │
│  │ Vertical │  │              tldraw Canvas                   │ │
│  │ Toolbar  │  │  ┌─────────────────────────────────────┐   │ │
│  │          │  │  │     InFrontOfTheCanvas Layer        │   │ │
│  │ - Select │  │  │  ┌─────────────────────────────┐   │   │ │
│  │ - Hand   │  │  │  │   FloatingToolbar (扩展)    │   │   │ │
│  │ - Draw   │  │  │  │   - Copy, Download, Info    │   │   │ │
│  │ - Eraser │  │  │  │   - Inpaint, Outpaint      │   │   │ │
│  │ - Arrow  │  │  │  │   - RemoveBG, Upscale      │   │   │ │
│  │          │  │  │  └─────────────────────────────┘   │   │ │
│  └──────────┘  │  │                                     │   │ │
│                │  │  ┌─────────────────────────────┐   │   │ │
│                │  │  │   InpaintingOverlay         │   │   │ │
│                │  │  │   (mask 绘制层)              │   │   │ │
│                │  │  └─────────────────────────────┘   │   │ │
│                │  └─────────────────────────────────────┘   │ │
│                └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 BottomPromptPanel (扩展)                 │   │
│  │  [History] [Prompt Input...] [Model▾] [Ratio▾] [Generate]│   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              TopBar (扩展 Undo/Redo)                     │   │
│  │  [← 返回] [项目名] [Undo] [Redo] [保存]                   │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 状态管理架构

```
┌─────────────────────────────────────────────────────────────┐
│                      useAIStore (扩展)                       │
├─────────────────────────────────────────────────────────────┤
│ State:                                                       │
│   - generatingTasks: Map<taskId, Task>                      │
│   - currentModel, aspectRatio                                │
│   - promptHistory: string[]           // 新增               │
│   - favoritePrompts: string[]         // 新增               │
│   - editMode: 'normal' | 'inpaint' | 'outpaint'  // 新增   │
│   - maskData: ImageData | null        // 新增               │
│   - selectedDirection: Direction      // 新增 (outpaint)    │
├─────────────────────────────────────────────────────────────┤
│ Actions:                                                     │
│   - generateImage(prompt, referenceImages?)                  │
│   - inpaintImage(imageId, mask, prompt)         // 新增     │
│   - outpaintImage(imageId, direction, prompt)   // 新增     │
│   - removeBackground(imageId)                   // 新增     │
│   - upscaleImage(imageId, scale)               // 新增     │
│   - addToHistory(prompt)                        // 新增     │
│   - toggleFavorite(prompt)                      // 新增     │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. FloatingToolbar 扩展

扩展现有的 FloatingToolbar，增加 AI 编辑操作按钮：

```typescript
interface FloatingToolbarProps {
  // 现有功能
  onCopy: () => void;
  onDownload: () => void;
  onShowInfo: () => void;
  // 新增功能
  onInpaint: () => void;      // 进入 inpainting 模式
  onOutpaint: () => void;     // 进入 outpainting 模式
  onRemoveBG: () => void;     // 去背景
  onUpscale: () => void;      // 放大
}
```

**UI 布局：**
```
┌─────────────────────────────────────────────────────────────┐
│ [复制] [下载] │ [局部重绘] [扩展] [去背景] [放大] │ [信息] │
└─────────────────────────────────────────────────────────────┘
```

### 2. InpaintingOverlay 组件（新增）

用于在图片上绘制 mask 区域：

```typescript
interface InpaintingOverlayProps {
  targetShapeId: string;        // 目标图片的 shape ID
  brushSize: number;            // 画笔大小
  onMaskComplete: (maskDataUrl: string) => void;
  onCancel: () => void;
}

interface InpaintingState {
  isActive: boolean;
  brushSize: number;            // 默认 20px
  maskCanvas: HTMLCanvasElement | null;
  strokes: Array<{x: number, y: number}[]>;
}
```

**交互流程：**
1. 用户点击"局部重绘"按钮
2. 图片上方显示半透明遮罩层
3. 用户用鼠标绘制要重绘的区域（红色半透明）
4. 绘制完成后，底部面板显示 prompt 输入
5. 用户输入 prompt 并点击生成
6. 系统发送原图 + mask + prompt 到 API

### 3. OutpaintingPanel 组件（新增）

用于选择扩展方向：

```typescript
interface OutpaintingPanelProps {
  onSelectDirection: (direction: OutpaintDirection) => void;
  onCancel: () => void;
}

type OutpaintDirection = 'top' | 'bottom' | 'left' | 'right' | 'all';
```

**UI 布局：**
```
┌─────────────────────────┐
│     扩展画布方向         │
│   ┌───┐                 │
│   │ ↑ │  上             │
│ ┌─┼───┼─┐               │
│ │←│ ■ │→│ 左  图片  右  │
│ └─┼───┼─┘               │
│   │ ↓ │  下             │
│   └───┘                 │
│   [全部扩展]            │
│   [取消]                │
└─────────────────────────┘
```

### 4. PromptHistoryPanel 组件（新增）

```typescript
interface PromptHistoryPanelProps {
  history: string[];
  favorites: string[];
  onSelectPrompt: (prompt: string) => void;
  onToggleFavorite: (prompt: string) => void;
}
```

### 5. API 接口扩展

```typescript
// 现有接口扩展
interface GenerateImageRequest {
  projectId: string;
  prompt: string;
  model: AIModel;
  aspectRatio: AspectRatio;
  // 新增字段
  referenceImages?: string[];   // base64 或 URL 数组
}

// 新增接口
interface InpaintImageRequest {
  projectId: string;
  imageId: string;              // 原图 ID
  imageData: string;            // 原图 base64
  maskData: string;             // mask base64
  prompt: string;
  model: AIModel;
}

interface OutpaintImageRequest {
  projectId: string;
  imageId: string;
  imageData: string;
  direction: OutpaintDirection;
  prompt: string;
  model: AIModel;
}

interface RemoveBackgroundRequest {
  projectId: string;
  imageId: string;
  imageData: string;
}

interface UpscaleImageRequest {
  projectId: string;
  imageId: string;
  imageData: string;
  scale: 2 | 4;
}
```

## Data Models

### Prompt History 存储

使用 localStorage 存储，key 为 `berryon:prompt-history:{projectId}`：

```typescript
interface PromptHistoryData {
  history: Array<{
    prompt: string;
    timestamp: number;
    modelId: string;
  }>;
  favorites: string[];
}
```

### Image Meta 扩展

```typescript
interface ImageMeta {
  source: 'ai-generated' | 'uploaded' | 'generating' | 'inpainted' | 'outpainted' | 'upscaled' | 'bg-removed';
  // 现有字段...
  // 新增字段
  originalImageId?: string;     // 原始图片 ID（用于 inpaint/outpaint）
  editType?: 'inpaint' | 'outpaint' | 'upscale' | 'remove-bg';
  editParams?: {
    direction?: OutpaintDirection;
    scale?: number;
    maskArea?: string;          // mask 区域描述
  };
}
```

## Error Handling

### 错误类型

| 错误场景 | 处理方式 |
|---------|---------|
| API 调用失败 | 显示错误 toast，保留原图不变 |
| Mask 绘制为空 | 提示用户"请先绘制需要重绘的区域" |
| 图片过大无法处理 | 提示尺寸限制，建议先缩小 |
| 网络超时 | 显示重试按钮 |
| Credits 不足 | 显示充值引导 |

### 操作可逆性

所有 AI 编辑操作都应支持 Undo：
- Inpaint/Outpaint/Upscale：生成新图片而非替换，用户可删除
- Remove Background：同上
- tldraw 自带 undo/redo 可回退画布操作

## Testing Strategy

### 单元测试

1. **useAIStore 测试**
   - 测试 promptHistory 的增删查
   - 测试 editMode 状态切换
   - 测试各种 API 调用的状态管理

2. **Mask 工具测试**
   - 测试 mask canvas 绑定/解绑
   - 测试画笔绘制坐标转换
   - 测试 mask 导出为 base64

### 集成测试

1. **Inpainting 流程**
   - 选中图片 → 进入 inpaint 模式 → 绘制 mask → 输入 prompt → 生成 → 验证结果

2. **Outpainting 流程**
   - 选中图片 → 选择方向 → 输入 prompt → 生成 → 验证尺寸变化

3. **Remove Background / Upscale**
   - 选中图片 → 点击按钮 → 等待处理 → 验证结果

### E2E 测试

- 完整的用户旅程：上传图片 → 生成变体 → 局部重绘 → 去背景 → 下载

## Implementation Phases

### Phase 1: Image-to-Image + Inpainting

1. 扩展 API 支持 referenceImages 参数
2. 修改 generateImage 函数传递参考图
3. 新增 InpaintingOverlay 组件
4. 扩展 FloatingToolbar 增加 Inpaint 按钮
5. 实现 inpaintImage API 调用

### Phase 2: Outpainting + Remove BG + Upscale

1. 新增 OutpaintingPanel 组件
2. 实现 outpaintImage API 调用
3. 实现 removeBackground API 调用
4. 实现 upscaleImage API 调用
5. 扩展 FloatingToolbar 增加对应按钮

### Phase 3: Prompt History + Undo/Redo

1. 实现 PromptHistoryPanel 组件
2. 添加 localStorage 持久化
3. 在 TopBar 添加 Undo/Redo 按钮
4. 连接 tldraw 的 undo/redo 方法
