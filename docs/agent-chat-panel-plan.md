# Agent Chat Panel 实施计划

把 agent 执行过程（thinking、tool calls）从 tldraw canvas shape 搬到右侧 Chat Panel，解决滚动/交互问题。Artifacts 保留在画布上但改为用户手动放置。

## 架构变更

```
Before:
  AgentStore → useAgentRenderer → AgentProcessShape (canvas, 不可滚动)
                                → Artifact shapes (canvas, 自动放置)

After:
  AgentStore → AgentChatPanel (React DOM, 可滚动)
             → useAgentRenderer → Artifact shapes only (canvas, 用户点击放置)
```

## Stage 1: 创建 AgentChatPanel 组件

**Goal**: 右侧面板展示 agent 执行过程，纯 React DOM，可滚动

**新文件**: `apps/web/src/components/canvas/agent-chat-panel.tsx`

**设计**:
- 不用 Sheet（有 overlay 遮挡画布），用 fixed 定位的 div
- 380px 宽, full height, right-0, z-[300]
- 仅在 agent status !== "idle" 时可见，或用户手动打开
- 内容自动滚动到底部

**数据源**: 直接消费 `useAgentStore` 的 `events` + `thinkingContent` + `status`

**消息渲染规则**:
- `thinking` → 黄底文本框，流式追加（用 store 的 `thinkingContent`）
- `tool_start` → 工具行: ⏳ + 工具名 + input 预览
- `tool_end` → 工具行: ✅ + 工具名 + output 预览
- `error` → 红色错误框
- `done` → 费用/token 统计条

**Status**: Not Started

---

## Stage 2: 集成到画布 + 合并 AgentPanel 输入

**Goal**: 把 Chat Panel 接入 InFrontOfTheCanvas，把 prompt 输入合并进来

**改动文件**:
- `tldraw-canvas.tsx`: 在 InFrontOfTheCanvas 中加入 `<AgentChatPanel />`
- 把 `agent-panel.tsx` 的 prompt input + run/stop/reset 移入 chat panel 底部
- 右下角加 toggle 按钮控制面板开关
- Agent 开始运行时自动打开面板

**Status**: Not Started

---

## Stage 3: 移除 AgentProcessShape

**Goal**: 停止在画布上渲染 AgentProcessShape，只保留 artifact 渲染

**改动文件**:
- `agent-renderer.ts`: 删除 process shape 相关逻辑，保留 `renderArtifact`（改为 public）
- `use-agent-renderer.ts`: 不再调 `renderTurn` 做 process 更新
- `tldraw-canvas.tsx`: 从 shapeUtils 移除 `AgentProcessShapeUtil`
- 删除 `agent-process-shape.tsx`

**Status**: Not Started

---

## Stage 4: Artifact "Add to Canvas" 按钮

**Goal**: Chat Panel 中检测到的 artifact 可手动放置到画布

**改动**:
- Chat Panel: `tool_end` 产出 artifact 时，显示预览 + "Add to Canvas" 按钮
- 点击时调用 `AgentRenderer.renderArtifact(artifact, index)`
- 移除自动 artifact 渲染，改为用户手动触发
- 跟踪已放置的 artifact，防止重复添加

**Status**: Not Started
