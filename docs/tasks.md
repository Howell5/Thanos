# Agent Runner MVP - 任务清单

## 总览

- **项目**: Thanos (Agent Runner MVP)
- **目标**: 一周内完成本地可运行的 AI Agent 执行可视化系统
- **仓库**: https://github.com/Howell5/Thanos

---

## Day 1: 后端 SSE + SDK 集成 ✅

**目标**: `/api/agent/run` 能返回流式消息

| 任务 | 状态 | 说明 |
|------|------|------|
| 安装 Claude Agent SDK | ✅ 完成 | `@anthropic-ai/claude-agent-sdk@0.2.31` |
| 创建 `/api/agent/run` SSE 路由 | ✅ 完成 | `apps/api/src/routes/agent.ts` |
| 配置 sandbox 设置 | ✅ 完成 | macOS sandbox-exec 启用 |
| 消息转换为前端事件 | ✅ 完成 | system/thinking/tool_start/tool_end/done/error |
| curl 测试验证 | ✅ 完成 | SSE 流正常返回 |

**交付物**:
- `apps/api/src/routes/agent.ts` (~140 行)
- 测试 workspace: `/workspaces/test-project/`

---

## Day 2: 前端 SSE 客户端 + Store ✅

**目标**: 浏览器控制台能打印 Agent 事件

| 任务 | 状态 | 说明 |
|------|------|------|
| 创建 SSE 客户端封装 | ✅ 完成 | `apps/web/src/lib/agent-sse.ts` |
| 创建 Agent Zustand Store | ✅ 完成 | `apps/web/src/stores/use-agent-store.ts` |
| 定义 AgentEvent 类型 | ✅ 完成 | 在 `agent-sse.ts` 中定义 |
| 浏览器控制台测试 | ✅ 完成 | 14 个事件成功接收 |

**交付物**:
- `apps/web/src/lib/agent-sse.ts` (~90 行)
- `apps/web/src/stores/use-agent-store.ts` (~176 行)

---

## Day 3: Canvas 渲染 ✅

**目标**: 事件变成 Shape 显示在画布上

| 任务 | 状态 | 说明 |
|------|------|------|
| 创建 AgentRenderer 类 | ✅ 完成 | 事件 → Frame Shape 映射 |
| 实现垂直流式布局 | ✅ 完成 | 基于 viewport 位置的 y 递增布局 |
| thinking 事件 → frame Shape | ✅ 完成 | 💭 前缀 + 流式更新 |
| tool_start → frame Shape | ✅ 完成 | 🔧 前缀 + 工具名和参数 |
| tool_end → 更新 Shape | ✅ 完成 | ✅ 前缀表示完成 |
| 集成到 Canvas 组件 | ✅ 完成 | useAgentRenderer hook |

**交付物**:
- `apps/web/src/components/canvas/agent-renderer.ts` (~235 行)
- `apps/web/src/components/canvas/agent-panel.tsx` (~155 行)
- `apps/web/src/hooks/use-agent-renderer.ts` (~50 行)

---

## Day 4: UI 完善

**目标**: AgentPanel 输入面板、状态显示

| 任务 | 状态 | 说明 |
|------|------|------|
| 创建 AgentPanel 组件 | ⬜ 待开始 | 输入框 + 按钮 |
| 实现 Run/Stop/Reset 按钮 | ⬜ 待开始 | 根据状态显示 |
| 显示运行状态 | ⬜ 待开始 | idle/running/done/error |
| 显示 cost 和 token 统计 | ⬜ 待开始 | 完成后显示 |
| workspace 路径配置 | ⬜ 待开始 | 可输入或默认 |

**交付物**:
- `apps/web/src/components/canvas/agent-panel.tsx` (~80 行)

---

## Day 5: 测试打磨

**目标**: 完整流程无明显 bug

| 任务 | 状态 | 说明 |
|------|------|------|
| 错误处理完善 | ⬜ 待开始 | 网络错误、SDK 错误 |
| 边界情况测试 | ⬜ 待开始 | 空 prompt、无效路径 |
| 长任务测试 | ⬜ 待开始 | 多工具调用场景 |
| UI 细节打磨 | ⬜ 待开始 | 加载状态、动画 |
| 文档更新 | ⬜ 待开始 | README、使用说明 |

**交付物**:
- 完整可用的 MVP
- 更新后的文档

---

## 文件清单

```
apps/api/src/
├── routes/
│   └── agent.ts              ✅ Day 1

apps/web/src/
├── lib/
│   └── agent-sse.ts          ✅ Day 2
├── stores/
│   └── use-agent-store.ts    ✅ Day 2
├── hooks/
│   └── use-agent-renderer.ts ✅ Day 3
└── components/canvas/
    ├── agent-renderer.ts     ✅ Day 3
    └── agent-panel.tsx       ✅ Day 3

docs/
├── agent-runner-mvp.md       ✅ Day 1
├── agent-runner-architecture.md ✅ Day 1
└── tasks.md                  ✅ 本文件
```

---

## 明确跳过的功能

| 功能 | 原因 |
|------|------|
| Docker/E2B 沙箱 | SDK 内置沙箱足够 |
| 多 Session 管理 | 一画布一 Session |
| 持久化 | 内存状态足够 |
| 认证授权 | 本地运行 |
| 自定义 Shape | 原生 Shape + meta 够用 |
| 断线重连 | MVP 手动刷新 |
| Token 计费 | 本地运行不需要 |

---

## 进度跟踪

| Day | 日期 | 状态 | 备注 |
|-----|------|------|------|
| Day 1 | 2025-02-05 | ✅ 完成 | 后端 SSE + SDK |
| Day 2 | 2025-02-05 | ✅ 完成 | 前端 SSE + Store |
| Day 3 | 2025-02-05 | ✅ 完成 | Canvas 渲染 + AgentPanel |
| Day 4 | - | ⬜ 待开始 | UI 完善 |
| Day 5 | - | ⬜ 待开始 | 测试打磨 |
