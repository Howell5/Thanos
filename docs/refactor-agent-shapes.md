# Agent Canvas Shape 架构重构 - 任务追踪

## 概述

将 "每个 SSE 事件 → 一个 Shape" 的瀑布流模式重构为三层解耦架构：
SSE 传输层 → 内容聚合层 → 展示层 (少量核心 Shape + 模板变体)

---

## Stage 1: 内容聚合层 ✅

| 任务 | 状态 | 文件 |
|------|------|------|
| 创建 agent-aggregator.ts | ✅ 完成 | `apps/web/src/lib/agent-aggregator.ts` |
| 添加 selectAgentTurn selector | ✅ 完成 | `apps/web/src/stores/use-agent-store.ts` |

## Stage 2: AgentProcessShape ✅

| 任务 | 状态 | 文件 |
|------|------|------|
| 创建 agent-process-shape.tsx | ✅ 完成 | `apps/web/src/components/canvas/agent-process-shape.tsx` |
| 重写 agent-renderer.ts | ✅ 完成 | `apps/web/src/components/canvas/agent-renderer.ts` |
| 修改 use-agent-renderer.ts | ✅ 完成 | `apps/web/src/hooks/use-agent-renderer.ts` |
| 注册新 Shape 到 tldraw-canvas.tsx | ✅ 完成 | `apps/web/src/components/canvas/tldraw-canvas.tsx` |

## Stage 3: RichCardShape + Artifact 渲染 ✅

| 任务 | 状态 | 文件 |
|------|------|------|
| 创建 rich-card-shape.tsx | ✅ 完成 | `apps/web/src/components/canvas/rich-card-shape.tsx` |
| renderer 添加 artifact 渲染 | ✅ 完成 | `apps/web/src/components/canvas/agent-renderer.ts` |
| 注册 RichCardShape | ✅ 完成 | `apps/web/src/components/canvas/tldraw-canvas.tsx` |

## Stage 4: 清理 ✅

| 任务 | 状态 | 文件 |
|------|------|------|
| 删除 agent-event-shape.tsx | ✅ 完成 | 已删除 |
| 移除旧 imports 和注册 | ✅ 完成 | `apps/web/src/components/canvas/tldraw-canvas.tsx` |
| 移除 selectToolEvents | ✅ 完成 | `apps/web/src/stores/use-agent-store.ts` |
| 构建验证 | ✅ 完成 | `pnpm build` + `pnpm check:lines` 均通过 |
