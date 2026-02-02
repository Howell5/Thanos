# 🚀 Ultimate Full-Stack RPC Monorepo Specification (v2.0)

## 1. 项目核心理念 (Core Philosophy)

本项目采用 **"RPC-Style"** 架构，利用 Hono 的类型推导和 Drizzle 的轻量化特性，实现**零 API 文档、零手动类型同步**的极致开发体验。

- **包管理器**: `pnpm` (Workspaces 模式) + `Turborepo` (任务编排)
- **语言**: TypeScript (Strict Mode)
- **代码规范**: **Biome** (替代 ESLint + Prettier，速度更快)
- **核心机制**: 后端导出路由类型 (`AppType`)，前端通过 `hono/client` 直接继承该类型，实现端到端类型安全。

## 2. 目录结构 (Directory Structure)

text

```text
/ (root)
├── package.json          # 根配置
├── pnpm-workspace.yaml   # 定义 apps/* 和 packages/*
├── turbo.json            # ✨ 新增: 定义构建管道 (build, dev, lint)
├── biome.json            # 统一 Lint/Format 配置
├── apps/
│   ├── api/              # 后端 (Hono + Drizzle) -> name: "@repo/api"
│   │   ├── src/
│   │   │   ├── db/       # Schema 定义
│   │   │   ├── routes/   # 路由模块
│   │   │   ├── env.ts    # ✨ 新增: 环境变量运行时校验
│   │   │   └── app.ts    # Hono 实例
│   │   └── Dockerfile    # ✨ 优化: 基于 Turbo Prune 的构建文件
│   └── web/              # 前端 (React + Vite)   -> 依赖 "@repo/api"
└── packages/
    └── shared/           # 纯逻辑共享 (Zod Schemas Only) -> name: "@repo/shared"
```

## 3. 技术栈详细清单 (Tech Stack)

### 📦 A. Shared (`packages/shared`)

**单一职责**：只放 Zod Schemas 和纯 TypeScript 类型工具。

- **核心库**: `zod`
- **作用**:
  - **Single Source of Truth (唯一真理源)**。
  - 后端引入 -> `zod-validator` 做请求校验。
  - 前端引入 -> `react-hook-form` + `zodResolver` 做表单校验。
  - **注意**: 不需要在这里定义 API 返回值的 interface，Hono 会自动推导。

### 🦁 B. Backend (`apps/api`)

**高性能 RPC 服务端**。

- **运行时**: Node.js (LTS v20+)
- **Web 框架**: **Hono**
  - _关键配置_: 必须 `export type AppType = typeof app`。
  - _中间件_: `@hono/zod-validator` (连接 Shared Schema)。
- **环境安全**: 使用 `dotenv` + `zod` 在启动时校验 `process.env`，防止运行时崩溃。
- **数据库**: PostgreSQL
- **ORM**: **Drizzle ORM**
  - _驱动_: `postgres` (postgres.js)
  - _工具_: `drizzle-kit`
- **部署模式**: Node.js Server (`@hono/node-server`)。

### 🦋 C. Frontend (`apps/web`)

**类型完全同步的客户端**。

- **构建工具**: Vite
- **框架**: React 18+
- **代码风格**: **Biome**
- **UI 组件库**: **shadcn/ui** + **Tailwind CSS**
- **API 客户端**: **Hono Client (`hono/client`)**
  - _机制_: `import { hc } from 'hono/client'` 泛型传入 `AppType`。
  - _✨ 增强_: 必须封装一个 `apiFetcher` 或类似 Wrapper，用于处理 `fetch` 不自动抛出非 2xx 错误的问题。
- **异步状态管理**: **TanStack Query (React Query)**
- **表单管理**: **React Hook Form** + **Zod Resolver** (复用 Shared Schema)。

## 4. 数据库与 ORM 规范 (Drizzle Specifics)

LLM 在生成数据库相关代码时需遵守：

1. **Schema 定义**: 所有表结构定义在 `apps/api/src/db/schema.ts`。
2. **迁移流程**:
   - 修改 schema -> `pnpm drizzle-kit generate` (生成 SQL) -> `pnpm drizzle-kit migrate` (应用变更)。
3. **查询风格**: 推荐使用 Drizzle 的 **"Relational Queries"** (e.g., `db.query.users.findMany(...)`) 以获得更好的可读性；复杂查询使用 Query Builder。

## 5. 编写代码的原则 (Rules for LLM)

请 LLM 严格遵循以下开发范式：

1. **RPC 优先 (RPC-First)**:
   - **绝对禁止**在前端手写 `fetch` 或 `axios` URL 字符串。
   - **绝对禁止**在前端手动定义 API 的 Response Interface。
   - 前端必须通过 `client.api.[route].$[method]()` 调用。
2. **校验同源 (Validation Single Source)**:
   - 新增功能流程：
     1. `packages/shared`: 定义 `createPostSchema`。
     2. `apps/api`: 路由引入该 Schema -> `zvalidator('json', createPostSchema)`。
     3. `apps/web`: 表单引入该 Schema -> `useForm({ resolver: zodResolver(createPostSchema) })`。
3. **模块化路由**:
   - Hono 实例应通过 `app.route('/users', usersRoute)` 拆分，避免单文件过大。
4. **类型引入规范**:
   - 前端引用后端类型时，**必须**使用 `import type { AppType } ...`，严禁使用 `import { ... }` 导致后端运行时代码泄露到前端构建中。

---

## 6. 构建与部署 (DevOps Enhancement)

为了解决 Monorepo 在 Docker 构建中上下文丢失的问题，采用 **Turbo Prune** 策略。

**Dockerfile 策略**:

1. 使用 `turbo prune --scope=@repo/api --docker` 提取仅与 API 相关的依赖。
2. 分阶段构建：`Pruner` -> `Installer` -> `Builder` -> `Runner`。
3. 这能显著减小镜像体积并利用 Docker 缓存。

---

### 🚀 初始化指令 (Prompt for LLM)

**如果你是 LLM，请执行以下初始化步骤：**

1. **Monorepo Setup**:
   - 创建根目录，配置 `pnpm-workspace.yaml`。
   - 初始化 `package.json` 并安装 `turbo` 和 `biome` 到根目录开发依赖。
   - 配置 `turbo.json` 定义 `build`, `dev`, `lint` 管道。
2. **Shared Package**:
   - 初始化 `packages/shared` (name: `@repo/shared`)。
   - 安装 `zod`。
   - 配置 `tsconfig.json` 使得其输出 ESM 模块。
3. **Backend Setup**:
   - 初始化 `apps/api` (name: `@repo/api`)。
   - 安装 `hono`, `@hono/node-server`, `@hono/zod-validator`, `drizzle-orm`, `postgres`, `dotenv`, `zod`。
   - 安装开发依赖 `drizzle-kit`, `tsx`。
   - **关键**: 在 `apps/api/src/index.ts` 中导出 `export type AppType = typeof app`。
4. **Frontend Setup**:
   - 初始化 `apps/web` (Vite + React + TS)。
   - 添加依赖 `"@repo/api": "workspace:*"` 和 `"@repo/shared": "workspace:*"`。
   - 安装 `shadcn-ui` CLI 并初始化。
   - 安装 `@tanstack/react-query`, `react-hook-form`, `@hookform/resolvers`。
   - 配置 `vite.config.ts` 设置 `server.proxy` 解决开发跨域。
   - 创建 `lib/client.ts` 封装 Hono Client。
5. **Infrastructure**:
   - 创建 `docker-compose.yml` (Postgres)。
   - 创建 `.env.example` 模板。
