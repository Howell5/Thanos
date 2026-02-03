# Berryon 项目实施计划

> 基于 morph-template 模板构建 AI 图片生成无限画布应用

## 项目概述

**目标**：将 popart 项目的功能移植到 morph-template 架构上，实现：
- 用户认证和积分系统
- 多项目画布管理
- AI 图片生成（Vertex AI）
- 云端存储（Cloudflare R2）

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Hono + Drizzle ORM + PostgreSQL |
| 认证 | Better Auth |
| AI 服务 | Vercel AI SDK v6 + Google Vertex AI |
| 存储 | Cloudflare R2 |
| 前端 | React + Vite + TanStack Query |
| 画布 | tldraw v4 |
| UI | shadcn/ui + Tailwind CSS |

---

## Stage 1: 数据库 Schema ✅

**Goal**: 添加 projects、aiImages、aiUsageHistory 三张表

**Status**: Complete

**已完成**:
- ✅ 更新 `apps/api/src/db/schema.ts`
- ✅ 添加 projects 表
- ✅ 添加 aiImages 表
- ✅ 添加 aiUsageHistory 表
- ✅ 更新 userRelations

---

## Stage 2: 共享 Schemas ✅

**Goal**: 在 packages/shared 中定义 Zod 验证 schemas

**Status**: Complete

**已完成**:
- ✅ 创建 `packages/shared/src/schemas/project.ts`
- ✅ 创建 `packages/shared/src/schemas/ai-image.ts`
- ✅ 更新 `packages/shared/src/index.ts`

---

## Stage 3: 后端服务层 ✅

**Goal**: 实现 Vertex AI 和 R2 存储集成

**Status**: Complete

**已完成**:
- ✅ 创建 `apps/api/src/lib/vertex-ai.ts`
- ✅ 创建 `apps/api/src/lib/r2.ts`
- ✅ 更新 `apps/api/src/env.ts` 添加新环境变量
- ✅ 更新 rate-limit 配置

---

## Stage 4: API 路由 ✅

**Goal**: 实现项目和 AI 图片生成的 API

**Status**: Complete

**已完成**:
- ✅ 创建 `apps/api/src/routes/projects.ts`
- ✅ 创建 `apps/api/src/routes/ai-images.ts`
- ✅ 更新 `apps/api/src/index.ts` 挂载路由

---

## Stage 5: 前端实现 ✅

**Goal**: 实现项目列表和画布编辑器页面

**Status**: Complete

**已完成**:
- ✅ 安装 tldraw v4 依赖
- ✅ 创建 React Query hooks
- ✅ 创建项目列表页
- ✅ 创建画布编辑器页
- ✅ 创建 AI 面板组件
- ✅ 配置路由

---

## Stage 6: 编译验证 ✅

**Goal**: 确保代码编译通过

**Status**: Complete

**已完成**:
- ✅ TypeScript 编译通过
- ✅ 无类型错误

---

## 文件清单

### 新增文件
- `apps/api/src/routes/projects.ts`
- `apps/api/src/routes/ai-images.ts`
- `apps/api/src/lib/vertex-ai.ts`
- `apps/api/src/lib/r2.ts`
- `packages/shared/src/schemas/project.ts`
- `packages/shared/src/schemas/ai-image.ts`
- `apps/web/src/hooks/use-projects.ts`
- `apps/web/src/hooks/use-ai-images.ts`
- `apps/web/src/pages/dashboard/projects.tsx`
- `apps/web/src/pages/canvas/index.tsx`
- `apps/web/src/components/canvas/ai-panel.tsx`
- `apps/web/src/components/ui/dialog.tsx`
- `apps/web/src/layouts/canvas-layout.tsx`

### 修改文件
- `apps/api/src/db/schema.ts` - 添加新表
- `apps/api/src/env.ts` - 添加环境变量
- `apps/api/src/index.ts` - 挂载路由
- `apps/api/src/lib/rate-limit.ts` - 添加限流配置
- `apps/api/package.json` - 添加 AI SDK 和 AWS S3 依赖
- `packages/shared/src/index.ts` - 导出新 schemas
- `apps/web/package.json` - 添加 tldraw 依赖
- `apps/web/src/App.tsx` - 配置路由
- `apps/web/src/lib/routes.ts` - 添加路由常量
- `apps/web/src/components/layout/dashboard-sidebar.tsx` - 添加 Projects 导航

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
R2_BUCKET=berryon-images
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
