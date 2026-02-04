# Agent Runner MVP 架构文档

## 一、概述

本文档描述 Agent Runner 的 **MVP 版本**，目标是在一周内实现一个本地可运行的 AI Agent 执行可视化系统。

### 核心约束

- **本地运行**：只需在开发机上运行，不考虑云端部署
- **一画布一 Session**：简化状态管理，无需多会话支持
- **最小代码量**：约 300 行新代码

---

## 二、核心架构

### 2.1 Claude Code 在哪运行？

**Claude Agent SDK 会启动一个子进程运行 Claude Code CLI**，并通过 macOS `sandbox-exec` 提供内核级隔离。

```
┌─────────────────────────────────────────────────────────┐
│            Hono Backend (Node.js 进程)                   │
│                                                         │
│  query({                                                │
│    prompt: "...",                                       │
│    options: {                                           │
│      cwd: "/workspaces/project-123",  ← 工作目录        │
│      sandbox: { enabled: true }        ← OS 级沙箱      │
│    }                                                    │
│  })                                                     │
│           │                                             │
│           │ 启动子进程                                   │
│           ▼                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │     Claude Code CLI (独立子进程)                 │   │
│  │                                                  │   │
│  │  ┌────────────────────────────────────────────┐ │   │
│  │  │  sandbox-exec (macOS) / bubblewrap (Linux) │ │   │
│  │  │  - 写入限制: 只能写 cwd 目录内              │ │   │
│  │  │  - 网络: 通过代理控制                       │ │   │
│  │  │  - 所有子进程继承沙箱限制                   │ │   │
│  │  └────────────────────────────────────────────┘ │   │
│  │                                                  │   │
│  │  执行: Bash, Read, Write, Edit, Glob, Grep...  │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 2.2 整体架构图

```
┌───────────────────────────────────────────────────────┐
│                  Frontend (Canvas)                    │
│                                                       │
│   tldraw + AgentStore (Zustand) + SSE Client         │
│                                                       │
└───────────────────────────┬───────────────────────────┘
                            │ SSE (单向流)
                            ▼
┌───────────────────────────────────────────────────────┐
│                  Hono Backend                         │
│                                                       │
│  POST /api/agent/run                                  │
│    ↓                                                  │
│  query({ cwd, sandbox: { enabled: true } })          │
│    ↓                                                  │
│  [子进程] Claude Code CLI (sandbox-exec 包裹)         │
│    ↓                                                  │
│  只能在 /workspaces/{projectId} 内操作               │
│                                                       │
└───────────────────────────────────────────────────────┘
```

### 2.3 关键设计决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 沙箱方案 | SDK 内置 sandbox | macOS sandbox-exec 提供内核级隔离，无需 Docker |
| 通信协议 | SSE | 单向流足够，比 WebSocket 简单 |
| Shape 实现 | tldraw 原生 + meta | 无需自定义 Shape，降低复杂度 |
| 状态管理 | Zustand | 复用现有模式 |

---

## 三、安全模型

### 3.1 SDK 内置沙箱

Claude Agent SDK 的 `sandbox: { enabled: true }` 配置会：

- **macOS**：使用 `sandbox-exec`（Seatbelt）包裹子进程
- **Linux**：使用 `bubblewrap` 包裹子进程
- **内核级隔离**：即使被 prompt injection 攻击也无法突破

### 3.2 安全保证

| 威胁 | 是否阻止 | 原因 |
|------|---------|------|
| 写入 workspace 外的文件 | ✅ 是 | sandbox-exec 内核级阻止 |
| 执行 `rm -rf /` | ✅ 是 | 写入被限制在 cwd 内 |
| 读取 `~/.ssh` 等敏感目录 | ✅ 是 | SDK 默认屏蔽敏感路径 |
| 子进程逃逸 | ✅ 是 | 所有子进程继承沙箱限制 |
| 恶意网络请求 | ✅ 是 | 网络通过代理控制 |

### 3.3 配置示例

```typescript
const result = query({
  prompt: userPrompt,
  options: {
    cwd: "/workspaces/project-123",   // 工作目录
    sandbox: {
      enabled: true,                   // 启用 OS 级沙箱
      autoAllowBashIfSandboxed: true,  // 沙箱内自动批准 bash
      network: {
        allowLocalBinding: true,       // 允许 dev server 绑定端口
      }
    },
    permissionMode: "acceptEdits",     // 沙箱内自动批准文件编辑
    maxTurns: 30,                      // 防止无限循环
    maxBudgetUsd: 1.0,                 // 成本限制
  }
});
```

---

## 四、数据流设计

### 4.1 SDK 消息类型

Claude Agent SDK 返回的消息流：

```typescript
type SDKMessage =
  | SDKSystemMessage        // 初始化信息
  | SDKAssistantMessage     // Claude 响应（文本 + 工具调用）
  | SDKUserMessage          // 用户输入
  | SDKResultMessage        // 最终结果

// 助手消息包含内容块
interface SDKAssistantMessage {
  type: 'assistant';
  message: {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: unknown }
      | { type: 'tool_result'; tool_use_id: string; content: string }
    >;
  };
}

// 结果消息包含统计
interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution';
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}
```

### 4.2 前端事件类型（简化）

为了简化前端处理，将 SDK 消息转换为简化事件：

```typescript
type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_start'; tool: string; input: unknown }
  | { type: 'tool_end'; tool: string; output: string }
  | { type: 'message'; content: string }
  | { type: 'done'; cost: number; tokens: number }
  | { type: 'error'; message: string }
```

---

## 五、Canvas Shape 映射

### 5.1 使用原生 Shape + meta

MVP 不创建自定义 Shape，而是使用 tldraw 原生 Shape 配合 `meta` 字段：

| 事件类型 | Shape 类型 | 样式 |
|----------|-----------|------|
| `thinking` | `text` | 灰色文字，逐步追加 |
| `tool_start` | `geo` (rectangle) | 蓝色边框，显示工具名 |
| `tool_end` | 更新对应 `geo` | 绿色边框，添加输出摘要 |
| `message` | `text` | 黑色文字 |
| `error` | `geo` (rectangle) | 红色边框 |

### 5.2 布局策略

简单的垂直流式布局：

```typescript
class AgentRenderer {
  private y = 0;
  private readonly GAP = 20;

  renderEvent(event: AgentEvent) {
    const shapeId = createShapeId();

    switch (event.type) {
      case 'thinking':
        this.editor.createShape({
          id: shapeId,
          type: 'text',
          x: 100,
          y: this.y,
          props: { text: event.content },
          meta: { agentEvent: 'thinking' }
        });
        break;

      case 'tool_start':
        this.editor.createShape({
          id: shapeId,
          type: 'geo',
          x: 100,
          y: this.y,
          props: {
            w: 300,
            h: 60,
            geo: 'rectangle',
            text: `🔧 ${event.tool}`,
          },
          meta: {
            agentEvent: 'tool',
            toolInput: event.input
          }
        });
        break;
    }

    this.y += 80 + this.GAP;
  }
}
```

---

## 六、文件结构

### 6.1 新增文件（5 个）

```
apps/
├── api/src/
│   └── routes/
│       └── agent.ts              # SSE 路由 (~80 行)
│
└── web/src/
    ├── stores/
    │   └── use-agent-store.ts    # Agent 状态管理 (~60 行)
    ├── lib/
    │   └── agent-sse.ts          # SSE 客户端封装 (~40 行)
    └── components/canvas/
        ├── agent-panel.tsx       # 输入面板 UI (~50 行)
        └── agent-renderer.ts     # 事件→Shape 渲染 (~80 行)
```

**总计约 310 行新代码**

### 6.2 核心代码示例

#### 后端路由 (agent.ts)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

const agentRoute = new Hono()
  .post("/run", async (c) => {
    const { prompt, workspacePath } = await c.req.json();

    return streamSSE(c, async (stream) => {
      try {
        for await (const message of query({
          prompt,
          options: {
            cwd: workspacePath,
            sandbox: {
              enabled: true,
              autoAllowBashIfSandboxed: true,
            },
            permissionMode: "acceptEdits",
            maxTurns: 30,
          }
        })) {
          // 转换为简化事件
          const event = transformMessage(message);
          if (event) {
            await stream.writeSSE({ data: JSON.stringify(event) });
          }
        }
      } catch (error) {
        await stream.writeSSE({
          data: JSON.stringify({ type: 'error', message: String(error) })
        });
      }
    });
  });

function transformMessage(msg: SDKMessage): AgentEvent | null {
  if (msg.type === 'assistant') {
    for (const block of msg.message.content) {
      if (block.type === 'text') {
        return { type: 'thinking', content: block.text };
      }
      if (block.type === 'tool_use') {
        return { type: 'tool_start', tool: block.name, input: block.input };
      }
    }
  }
  if (msg.type === 'result') {
    return {
      type: 'done',
      cost: msg.total_cost_usd,
      tokens: msg.usage.input_tokens + msg.usage.output_tokens
    };
  }
  return null;
}

export default agentRoute;
```

#### 前端 Store (use-agent-store.ts)

```typescript
import { create } from 'zustand';
import { subscribeAgentSSE } from '../lib/agent-sse';

interface AgentState {
  status: 'idle' | 'running' | 'done' | 'error';
  events: AgentEvent[];
  abort: (() => void) | null;

  start: (prompt: string, workspacePath: string) => void;
  stop: () => void;
  reset: () => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  status: 'idle',
  events: [],
  abort: null,

  start: (prompt, workspacePath) => {
    const abort = subscribeAgentSSE(
      { prompt, workspacePath },
      (event) => {
        set((s) => ({
          events: [...s.events, event],
          status: event.type === 'done' ? 'done'
                : event.type === 'error' ? 'error'
                : 'running',
        }));
      }
    );
    set({ status: 'running', events: [], abort });
  },

  stop: () => {
    get().abort?.();
    set({ status: 'idle', abort: null });
  },

  reset: () => {
    get().abort?.();
    set({ status: 'idle', events: [], abort: null });
  },
}));
```

#### SSE 客户端 (agent-sse.ts)

```typescript
import { env } from '../env';

export function subscribeAgentSSE(
  params: { prompt: string; workspacePath: string },
  onEvent: (event: AgentEvent) => void
): () => void {
  const controller = new AbortController();

  fetch(`${env.VITE_API_URL}/api/agent/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    signal: controller.signal,
    credentials: 'include',
  }).then(async (res) => {
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = decoder.decode(value).split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const event = JSON.parse(line.slice(6));
          onEvent(event);
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onEvent({ type: 'error', message: String(err) });
    }
  });

  return () => controller.abort();
}
```

---

## 七、实施计划

### 5 天计划

| Day | 目标 | 交付物 |
|-----|------|--------|
| 1 | 后端 SSE + SDK 集成 | `/api/agent/run` 能返回流式消息 |
| 2 | 前端 SSE + Store | 控制台能打印 Agent 事件 |
| 3 | Canvas 渲染 | 事件变成 Shape 显示在画布上 |
| 4 | UI 完善 | AgentPanel 输入面板、状态显示 |
| 5 | 测试打磨 | 错误处理、边界情况 |

### 每日验收标准

- **Day 1**：curl 能收到 SSE 流
- **Day 2**：浏览器控制台能看到事件
- **Day 3**：画布上出现 Shape
- **Day 4**：能通过 UI 发起任务
- **Day 5**：完整流程无明显 bug

---

## 八、明确跳过的功能

| 功能 | 为什么跳过 | 后续可加 |
|------|-----------|---------|
| Docker/E2B 沙箱 | SDK 内置沙箱足够 | ✅ |
| 多 Session 管理 | 一画布一 Session | ✅ |
| 持久化 | 内存状态足够 | ✅ |
| 认证授权 | 本地运行 | ✅ |
| 自定义 Shape | 原生 Shape + meta 够用 | ✅ |
| 断线重连 | MVP 手动刷新 | ✅ |
| Token 计费 | 本地运行不需要 | ✅ |

---

## 九、依赖安装

```bash
# 后端
cd apps/api
pnpm add @anthropic-ai/claude-agent-sdk@latest

# 需要全局安装 Claude Code CLI
npm install -g @anthropic-ai/claude-code

# 确保环境变量
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

---

## 十、参考资源

- [Claude Agent SDK npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [TypeScript SDK 文档](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Hosting 文档](https://platform.claude.com/docs/en/agent-sdk/hosting)
- [Sandbox Settings](https://platform.claude.com/docs/en/agent-sdk/typescript#sandbox-settings)
- [Anthropic 沙箱工程博客](https://www.anthropic.com/engineering/claude-code-sandboxing)
