# Agent Runner 架构设计文档

## 一、概述

本文档描述了一个 **AI Agent 执行可视化系统** 的架构设计，目标是：

1. 在安全沙箱中运行 Claude Agent SDK
2. 将 Agent 的执行状态实时可视化到 Canvas
3. 支持本地 Docker 开发和 E2B 生产环境的无缝切换

---

## 二、核心架构

### 2.1 三层架构

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Frontend (Canvas)                               │
│                                                                         │
│  - tldraw 无限画布                                                       │
│  - Agent 状态可视化 (AgentCard, TerminalShape, CodeDiffShape...)         │
│  - 用户交互和反馈                                                        │
│                                                                         │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Main Backend (Hono API)                         │
│                                                                         │
│  - 用户认证、项目管理等业务逻辑                                            │
│  - 沙箱生命周期管理（创建/销毁/监控）                                       │
│  - 消息转发（Frontend ↔ Sandbox）                                        │
│  - Token 计费和限额                                                      │
│                                                                         │
│  注意：不直接运行 Agent SDK                                               │
│                                                                         │
└──────────────────────────────────┬──────────────────────────────────────┘
                                   │ HTTP/WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      Sandbox Container (独立进程)                        │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Claude Agent SDK                             │   │
│  │                                                                  │   │
│  │  - 执行用户任务                                                   │   │
│  │  - 调用工具 (Bash, Read, Write, Edit, Glob, Grep...)             │   │──► Anthropic API
│  │  - SDK 内置沙箱限制命令执行                                        │   │
│  │                                                                  │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Agent Runner Service（轻量 HTTP/WS 服务，暴露端口与主后端通信）           │
│                                                                         │
│  资源限制：1GiB RAM, 5GiB Disk, 1 CPU（可按任务调整）                     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 为什么要解耦？

| 问题 | 耦合在一起的风险 |
|------|-----------------|
| **安全性** | Agent 执行 Bash 命令可能影响主服务 |
| **资源隔离** | Agent 吃满 CPU/内存会拖垮整个 API |
| **故障隔离** | Agent 崩溃不应该让主服务挂掉 |
| **弹性伸缩** | Agent 容器需要独立扩缩容 |
| **多租户** | 不同用户的 Agent 需要隔离 |

---

## 三、Claude Agent SDK 核心概念

### 3.1 SDK 运行模式

SDK 提供两种主要交互方式：

```typescript
// 方式 1: query() - 一次性任务
for await (const message of query({
  prompt: "Fix the bug in auth.py",
  options: { allowedTools: ["Read", "Edit", "Bash"] }
})) {
  console.log(message);
}

// 方式 2: 流式输入模式 - 持续对话
const q = query({
  prompt: asyncGeneratorOfUserMessages(),
  options: { ... }
});

for await (const message of q) {
  // 处理消息
}

// 支持中断
await q.interrupt();
```

### 3.2 SDK 内置沙箱

SDK 自带命令执行沙箱，基于 OS 原语实现（Linux: `bubblewrap`, macOS: `sandbox-exec`）：

```typescript
const result = await query({
  prompt: "Build my project",
  options: {
    sandbox: {
      enabled: true,                    // 启用沙箱
      autoAllowBashIfSandboxed: true,   // 沙箱内自动批准 bash
      excludedCommands: ['docker'],     // 这些命令绕过沙箱
      network: {
        allowLocalBinding: true,        // 允许绑定本地端口
        allowUnixSockets: ['/var/run/docker.sock'],
      },
    },
    permissionMode: "acceptEdits",      // 自动接受文件编辑
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Grep"],
  }
});
```

**注意**：SDK 沙箱控制的是**命令执行**，文件系统和网络访问由权限规则控制。

### 3.3 消息类型

SDK 返回的消息流包含以下类型：

```typescript
type SDKMessage =
  | SDKAssistantMessage    // Claude 的响应（文本、工具调用）
  | SDKUserMessage         // 用户输入
  | SDKResultMessage       // 最终结果（成功/失败/超限）
  | SDKSystemMessage       // 系统初始化信息
  | SDKPartialAssistantMessage  // 流式部分消息（需启用）
```

关键消息结构：

```typescript
// 助手消息 - 包含文本和工具调用
interface SDKAssistantMessage {
  type: 'assistant';
  uuid: string;
  session_id: string;
  message: {
    content: Array<TextBlock | ToolUseBlock>;
  };
}

// 结果消息 - 任务完成
interface SDKResultMessage {
  type: 'result';
  subtype: 'success' | 'error_max_turns' | 'error_during_execution' | ...;
  duration_ms: number;
  total_cost_usd: number;
  usage: { input_tokens, output_tokens, ... };
}
```

### 3.4 会话管理

```typescript
// 捕获 session_id
let sessionId: string;

for await (const message of query({ prompt: "Start project" })) {
  if (message.type === 'system' && message.subtype === 'init') {
    sessionId = message.session_id;
  }
}

// 恢复会话
for await (const message of query({
  prompt: "Continue the work",
  options: { resume: sessionId }
})) {
  // ...
}

// 分支会话（探索不同方案，不修改原会话）
for await (const message of query({
  prompt: "Try a different approach",
  options: { resume: sessionId, forkSession: true }
})) {
  // ...
}
```

---

## 四、部署模式

### 4.1 Pattern 1: Ephemeral Sessions（临时会话）

```
用户发起任务 → 创建新容器 → 执行完毕 → 销毁容器
```

**适用场景**：
- Bug 修复
- 文件处理（发票、翻译）
- 一次性代码生成

**特点**：
- 最简单的模式
- 无状态，每次全新环境
- 容器生命周期 = 任务生命周期

### 4.2 Pattern 2: Long-Running Sessions（长运行会话）

```
容器持续运行 → 处理多个 Agent 进程 → 按需响应
```

**适用场景**：
- 邮件代理（持续监控）
- 网站构建器（需要暴露端口）
- 高频聊天机器人

**特点**：
- 容器长期存活
- 可能运行多个 Agent 进程
- 需要考虑资源管理

### 4.3 Pattern 3: Hybrid Sessions（混合会话）

```
临时容器 → 从数据库/SDK 加载历史状态 → 执行 → 保存状态 → 销毁
```

**适用场景**：
- 项目管理器（间歇性交互）
- 深度研究（多小时任务，可中断）
- 客户支持（跨多次对话）

**特点**：
- 结合临时容器和状态持久化
- 利用 SDK 的 `resume` 功能
- 成本和灵活性的平衡

---

## 五、沙箱提供商选择

### 5.1 本地开发：Docker

```yaml
# docker-compose.yml
services:
  agent-sandbox:
    build: ./agent-runner
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
    ports:
      - "8080:8080"
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1'
```

### 5.2 生产环境选项

| 提供商 | 特点 | 适用场景 |
|--------|------|---------|
| **E2B** | Firecracker microVM，~150ms 启动，硬件级隔离 | 需要强隔离的生产环境 |
| **Modal Sandbox** | 简单 API，按秒计费 | 快速原型 |
| **Fly Machines** | 全球边缘部署，快速启动 | 低延迟需求 |
| **Cloudflare Sandboxes** | 与 Cloudflare 生态集成 | 已使用 CF 的项目 |
| **Daytona** | 开发环境即服务 | 复杂开发环境 |

### 5.3 E2B vs Docker 对比

| 特性 | Docker 容器 | E2B (Firecracker) |
|------|------------|-------------------|
| 启动时间 | ~1 秒 | ~150ms |
| 内存开销 | ~50-100 MB | 3-5 MB |
| 隔离级别 | 进程级（共享内核） | 硬件级（独立内核） |
| 安全性 | 中等 | 高 |
| 本地开发 | 原生支持 | 需要云端 |

---

## 六、通信协议设计

### 6.1 Frontend ↔ Main Backend：WebSocket

```typescript
// 前端连接
const ws = new WebSocket(`wss://api.example.com/agent/ws/${projectId}`);

// 发送任务
ws.send(JSON.stringify({
  type: 'start',
  payload: {
    prompt: "Build a REST API for user management",
    options: { model: 'claude-sonnet-4-5-20250514' }
  }
}));

// 接收消息
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  // 更新 Canvas
  updateCanvas(message);
};

// 中断任务
ws.send(JSON.stringify({ type: 'interrupt' }));

// 用户回答 ask_user
ws.send(JSON.stringify({
  type: 'user_response',
  payload: { questionId: 'q1', answer: 'Option A' }
}));
```

### 6.2 Main Backend ↔ Sandbox：HTTP/WebSocket

沙箱内运行一个轻量服务，暴露端口供主后端通信：

```typescript
// 沙箱内的 Agent Runner 服务
import { query } from "@anthropic-ai/claude-agent-sdk";

Bun.serve({
  port: 8080,

  async fetch(req) {
    if (req.headers.get("upgrade") === "websocket") {
      const { socket, response } = Bun.upgradeWebSocket(req);

      socket.onmessage = async (event) => {
        const { type, payload } = JSON.parse(event.data);

        if (type === 'start') {
          for await (const message of query({
            prompt: payload.prompt,
            options: payload.options
          })) {
            socket.send(JSON.stringify(message));
          }
        }
      };

      return response;
    }

    return new Response("Agent Sandbox Ready");
  },
});
```

---

## 七、Canvas Shape 映射

### 7.1 消息类型到 Shape 的映射

| SDK 消息类型 | Canvas Shape | 说明 |
|-------------|--------------|------|
| `assistant` + TextBlock | `AgentCard` | 显示 Claude 的思考过程 |
| `assistant` + ToolUseBlock (Bash) | `TerminalShape` | 终端风格，显示命令和输出 |
| `assistant` + ToolUseBlock (Edit) | `CodeDiffShape` | 显示文件修改的 diff |
| `assistant` + ToolUseBlock (Read) | `AgentCard` 内嵌 | 折叠显示读取的文件内容 |
| `assistant` + ToolUseBlock (AskUserQuestion) | `Comment` | 交互气泡，用户点击选择 |
| `result` (success) | `ProductCard` | 最终产出物 |
| `result` (error) | `AgentCard` (红色) | 错误信息 |

### 7.2 Shape 更新策略

```typescript
// 状态管理
interface AgentCanvasState {
  runId: string | null;
  toolShapeMap: Map<string, string>;  // toolUseId → shapeId
  turnShapeMap: Map<string, string>;  // turnId → agentCardId
}

// 消息处理
function handleSDKMessage(message: SDKMessage) {
  switch (message.type) {
    case 'assistant':
      for (const block of message.message.content) {
        if (block.type === 'text') {
          updateOrCreateAgentCard(message.uuid, block.text);
        }
        if (block.type === 'tool_use') {
          const shapeId = createToolShape(block);
          toolShapeMap.set(block.id, shapeId);
        }
      }
      break;

    case 'result':
      createResultCard(message);
      break;
  }
}
```

---

## 八、安全性设计

### 8.1 多层安全

```
┌─────────────────────────────────────────────────────────────────┐
│ Layer 1: SDK 内置沙箱                                            │
│ - 命令执行限制 (bubblewrap/sandbox-exec)                         │
│ - 网络访问控制                                                   │
│ - 权限规则 (允许/拒绝工具)                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 2: 容器隔离                                                │
│ - 进程隔离 (Docker) 或硬件隔离 (E2B/Firecracker)                  │
│ - 资源限制 (CPU, Memory, Disk)                                   │
│ - 网络隔离 (无出站或白名单)                                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ Layer 3: 应用层安全                                              │
│ - API Key 管理（环境变量注入，不硬编码）                           │
│ - 用户上传内容验证                                                │
│ - Token 限额和计费                                               │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 API Key 管理

```typescript
// 主后端：创建沙箱时注入 API Key
const sandbox = await provider.create({
  image: 'agent-sandbox:latest',
  env: {
    ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,  // 从环境变量读取
  },
});

// 沙箱内：SDK 自动读取环境变量
// 无需在代码中处理 Key
```

### 8.3 用户上传验证

```typescript
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'text/plain', 'application/json'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

async function validateUpload(file: File): Promise<boolean> {
  if (file.size > MAX_FILE_SIZE) return false;

  const buffer = await file.arrayBuffer();
  const detected = await fileTypeFromBuffer(Buffer.from(buffer));

  return detected && ALLOWED_TYPES.includes(detected.mime);
}
```

---

## 九、Token 和成本管理

### 9.1 SDK 返回的使用信息

```typescript
// ResultMessage 包含完整的使用统计
interface SDKResultMessage {
  type: 'result';
  total_cost_usd: number;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
  modelUsage: {
    [modelName: string]: {
      inputTokens: number;
      outputTokens: number;
      costUSD: number;
    };
  };
}
```

### 9.2 限额控制

```typescript
// SDK 选项
const options = {
  maxTurns: 50,           // 最大对话轮次
  maxBudgetUsd: 5.0,      // 最大成本（美元）
};

// 主后端：用户级限额
async function checkUserQuota(userId: string, estimatedCost: number) {
  const dailyUsage = await getDailyUsage(userId);
  const limit = await getUserLimit(userId);

  if (dailyUsage + estimatedCost > limit) {
    throw new ApiError('Daily limit exceeded', 'LIMIT_REACHED');
  }
}
```

---

## 十、抽象层设计

### 10.1 沙箱提供商接口

```typescript
// packages/shared/src/sandbox/types.ts
export interface ISandboxProvider {
  create(config: SandboxConfig): Promise<SandboxInstance>;
  destroy(instanceId: string): Promise<void>;
  getWebSocketUrl(instanceId: string): Promise<string>;
  getStatus(instanceId: string): Promise<SandboxStatus>;
}

export interface SandboxConfig {
  image: string;          // Docker image 或 E2B template
  env: Record<string, string>;
  timeout?: number;       // 最大存活时间（秒）
  resources?: {
    memory?: number;      // MB
    cpu?: number;         // cores
    disk?: number;        // GB
  };
}

export interface SandboxInstance {
  id: string;
  provider: 'docker' | 'e2b';
  status: 'creating' | 'running' | 'stopped' | 'error';
  wsUrl: string;
  createdAt: Date;
}
```

### 10.2 Provider 实现

```typescript
// Docker Provider
export class DockerSandboxProvider implements ISandboxProvider {
  async create(config: SandboxConfig): Promise<SandboxInstance> {
    const container = await docker.createContainer({
      Image: config.image,
      Env: Object.entries(config.env).map(([k, v]) => `${k}=${v}`),
      ExposedPorts: { '8080/tcp': {} },
      HostConfig: {
        Memory: (config.resources?.memory || 1024) * 1024 * 1024,
        PortBindings: { '8080/tcp': [{ HostPort: '0' }] },
      },
    });

    await container.start();
    const info = await container.inspect();
    const port = info.NetworkSettings.Ports['8080/tcp'][0].HostPort;

    return {
      id: container.id,
      provider: 'docker',
      status: 'running',
      wsUrl: `ws://localhost:${port}`,
      createdAt: new Date(),
    };
  }
}

// E2B Provider
export class E2BSandboxProvider implements ISandboxProvider {
  async create(config: SandboxConfig): Promise<SandboxInstance> {
    const sandbox = await Sandbox.create({
      template: config.image,
      envs: config.env,
      timeout: config.timeout,
    });

    return {
      id: sandbox.sandboxId,
      provider: 'e2b',
      status: 'running',
      wsUrl: sandbox.getHost(8080),
      createdAt: new Date(),
    };
  }
}
```

### 10.3 工厂函数

```typescript
// apps/api/src/services/sandbox/factory.ts
export function createSandboxProvider(): ISandboxProvider {
  switch (env.SANDBOX_PROVIDER) {
    case 'docker':
      return new DockerSandboxProvider();
    case 'e2b':
      return new E2BSandboxProvider(env.E2B_API_KEY);
    default:
      throw new Error(`Unknown provider: ${env.SANDBOX_PROVIDER}`);
  }
}
```

---

## 十一、实施路线图

### Phase 1: 核心管道（1-2 周）

- [ ] 定义 `ISandboxProvider` 接口
- [ ] 实现 `DockerSandboxProvider`（本地开发）
- [ ] 创建 Agent Runner 服务（沙箱内的 HTTP/WS 服务）
- [ ] 实现主后端的 WebSocket 路由
- [ ] 端到端验证：执行简单任务并返回结果

### Phase 2: Canvas 集成（1-2 周）

- [ ] 实现 `TerminalShape`（Bash 命令可视化）
- [ ] 实现 `CodeDiffShape`（文件编辑可视化）
- [ ] 实现消息 → Shape 映射逻辑
- [ ] 利用现有 `findNonOverlappingPosition` 自动布局
- [ ] `AgentCard` 实时更新（打字机效果）

### Phase 3: 交互完善（1-2 周）

- [ ] `Comment` Shape 用于 `AskUserQuestion` 交互
- [ ] 用户在 Canvas 上的操作反馈给 Agent
- [ ] 断线重连 + 状态恢复
- [ ] 任务取消/中断

### Phase 4: 生产化（1-2 周）

- [ ] 实现 `E2BSandboxProvider`
- [ ] Token 监控 + 限额
- [ ] 沙箱预热池
- [ ] 安全审计

---

## 十二、参考资源

### 官方文档

- [Claude Agent SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [TypeScript SDK Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Hosting the Agent SDK](https://platform.claude.com/docs/en/agent-sdk/hosting)
- [Secure Deployment](https://platform.claude.com/docs/en/agent-sdk/secure-deployment)
- [Session Management](https://platform.claude.com/docs/en/agent-sdk/sessions)

### 沙箱提供商

- [E2B](https://e2b.dev/docs)
- [Modal Sandbox](https://modal.com/docs/guide/sandbox)
- [Fly Machines](https://fly.io/docs/machines/)
- [Cloudflare Sandboxes](https://github.com/cloudflare/sandbox-sdk)

### 项目现有文档

- [PRD](./prd.md) - 产品需求文档
- [CLAUDE.md](../CLAUDE.md) - 项目开发指南
