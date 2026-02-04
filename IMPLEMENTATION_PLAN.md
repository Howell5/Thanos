# Berryon 项目实施计划

> 基于 morph-template 模板构建 AI 图片生成无限画布应用

## 项目概述

**目标**：将 popart 项目的功能移植到 morph-template 架构上，实现：

- 用户认证和积分系统
- 多项目画布管理
- AI 图片生成（Vertex AI）
- 云端存储（Cloudflare R2）

## 技术栈

| 层级    | 技术                                |
| ------- | ----------------------------------- |
| 后端    | Hono + Drizzle ORM + PostgreSQL     |
| 认证    | Better Auth                         |
| AI 服务 | Vercel AI SDK v6 + Google Vertex AI |
| 存储    | Cloudflare R2                       |
| 前端    | React + Vite + TanStack Query       |
| 画布    | tldraw v4                           |
| UI      | shadcn/ui + Tailwind CSS            |

---

## Stage 1-6: 基础功能 ✅

**Status**: Complete

已完成数据库 Schema、共享 Schemas、后端服务层、API 路由、前端实现、编译验证。

---

## Stage 7: 图片上传到 R2

**Goal**: 用户拖放文件到画布时，自动上传到 R2 而非 base64 嵌入

**Status**: Not Started

### 背景

当前问题：
- 拖放图片直接转 base64 嵌入画布
- 导致画布数据量大、保存/加载慢
- 无法跨设备同步、无法统一管理

目标：
- 所有图片（AI 生成 + 用户上传）统一存储到 R2
- 使用 R2 CDN URL 作为图片源
- 上传过程中显示进度，支持失败重试

### 设计方案

#### 7.1 数据库改动

复用 `aiImages` 表，新增/修改字段：

```typescript
// 新增字段
source: text("source").notNull().default("ai"),  // "ai" | "upload"
originalFileName: text("original_file_name"),     // 上传时的原始文件名

// 修改为可空（上传图片无这些值）
prompt: text("prompt"),           // 移除 notNull
model: text("model"),             // 移除 notNull
aspectRatio: text("aspect_ratio"), // 移除 notNull
```

#### 7.2 R2 目录结构

```
projects/{projectId}/images/{timestamp}-{random}.{ext}
```

- 按项目组织，便于清理
- 用户维度通过数据库查询

#### 7.3 节点状态

扩展 `ImageMeta.source`：

```typescript
source: "ai-generated" | "uploaded" | "generating" | "uploading"
```

#### 7.4 上传流程

```
拖放文件 → 创建 Shape（本地预览 + uploading 状态）
        → 调用 API 上传到 R2
        → 成功：替换为 R2 URL，状态改为 uploaded
        → 失败：保留预览，显示重试按钮
```

### Tasks

#### Task 7.1: 数据库 Schema 改动
- [ ] 修改 `apps/api/src/db/schema.ts`
  - 新增 `source` 字段（默认 "ai"）
  - 新增 `originalFileName` 字段
  - `prompt`、`model`、`aspectRatio` 改为可空
- [ ] 运行 `pnpm db:push` 同步

**测试**: 数据库表结构正确，现有 AI 生成功能不受影响

#### Task 7.2: 共享 Schema 更新
- [ ] 更新 `packages/shared/src/schemas/ai-image.ts`
  - 新增 `imageSourceSchema` ("ai" | "upload")
  - 新增 `uploadImageSchema` (上传请求验证)
  - 新增 `uploadImageResponseSchema` (上传响应)
- [ ] 更新导出

**测试**: TypeScript 编译通过

#### Task 7.3: 上传 API 实现
- [ ] 在 `apps/api/src/routes/ai-images.ts` 新增上传端点
  - `POST /api/ai-images/upload`
  - 接收 multipart/form-data
  - 验证文件类型和大小（限制 10MB）
  - 上传到 R2
  - 创建数据库记录（source: "upload"）
  - 返回 { imageId, r2Url, width, height }

**测试**:
- curl 上传图片成功
- R2 中有文件
- 数据库有记录

#### Task 7.4: 前端上传状态管理
- [ ] 在 `apps/web/src/stores/use-ai-store.ts` 新增上传相关状态
  - `uploadTasks: Map<string, UploadTask>`
  - `startUpload()`, `updateProgress()`, `completeUpload()`, `failUpload()`, `retryUpload()`
  - 计算属性：`uploadingCount`, `hasFailedUploads`

**测试**: Store 状态变更正确

#### Task 7.5: 修改 addImageToCanvas 流程
- [ ] 修改 `apps/web/src/lib/image-assets.ts`
  - `addImageToCanvas()` 改为先创建带本地预览的 Shape
  - 触发上传任务
  - 上传成功后更新 Shape 的 src 和 meta

**测试**: 拖放图片后，R2 有文件，画布显示 R2 URL

#### Task 7.6: 上传进度 UI
- [ ] 创建 `apps/web/src/components/canvas/uploading-overlay.tsx`
  - 显示上传进度条/环
  - 失败时显示重试按钮
- [ ] 集成到画布的 `InFrontOfTheCanvas`

**测试**: 上传时显示进度，失败可重试

#### Task 7.7: 工具栏状态适配
- [ ] 修改 `apps/web/src/components/canvas/floating-toolbar.tsx`
  - uploading 状态时禁用「局部重绘」按钮
  - 下载按钮：uploading 时下载本地预览，uploaded 后下载 R2 原图

**测试**: 工具栏按钮状态正确

#### Task 7.8: 边界情况处理
- [ ] 文件大小限制（前端 + 后端双重验证）
- [ ] 非图片文件过滤
- [ ] 上传中关闭页面提示
- [ ] 并发上传队列控制（最多 3 个）

**测试**: 各边界情况处理正确

### Success Criteria

- [ ] 拖放图片到画布，自动上传到 R2
- [ ] 上传过程显示进度
- [ ] 上传失败可重试
- [ ] 现有 AI 生成功能不受影响
- [ ] 数据库统一管理所有图片

---

## 文件清单

### 新增文件

- `apps/web/src/components/canvas/uploading-overlay.tsx`

### 修改文件

- `apps/api/src/db/schema.ts` - aiImages 表字段调整
- `packages/shared/src/schemas/ai-image.ts` - 新增上传相关 schema
- `apps/api/src/routes/ai-images.ts` - 新增上传端点
- `apps/web/src/stores/use-ai-store.ts` - 新增上传状态管理
- `apps/web/src/lib/image-assets.ts` - 修改 addImageToCanvas 流程
- `apps/web/src/components/canvas/floating-toolbar.tsx` - 适配 uploading 状态
- `apps/web/src/components/canvas/tldraw-canvas.tsx` - 集成上传 UI

---

## 环境变量

```bash
# Vertex AI
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=us-central1  # 可选，默认 us-central1

# Cloudflare R2
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET=berryon-uploads
R2_PUBLIC_URL=https://pub-<hash>.r2.dev  # 可选，用于公开访问
```

---

## 下一步待办

### 部署前必须

1. 运行 `pnpm db:push` 同步数据库 schema
2. 配置环境变量（Vertex AI 和 R2）
3. 测试端到端流程

### 功能增强（后续）

1. 积分系统优化 - 基于 token 计费
2. 图片处理功能 - 放大、抠图
3. 画布自动保存（debounce）
4. Seedream 模型支持
5. 免费积分配置

### 已知注意事项

- tldraw v4 构建后 bundle 较大 (~2MB)，建议配置代码分割
- 需要为 Vertex AI 配置认证（Application Default Credentials 或 Service Account）
