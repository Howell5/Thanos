# Artifact 检测优化：Prompt 指令 + 后端解析替换启发式

## 问题

当前 `agent-aggregator.ts` 的 `detectArtifact()` 用启发式猜测 tool output 里有没有 artifact：
- 检查 JSON 有没有 `url`/`headers`/`rows`/`name` 字段
- 正则匹配图片 URL
- 长文本 >100 字符就当 text artifact

问题：
1. 误判 — Read 工具读了个长文件就变成 text artifact
2. 漏判 — agent 生成的图片 URL 格式不在预期里就检测不到
3. 不可靠 — 本质是"猜"，agent 没有主动声明产出了什么

## 方案

让 agent 通过 prompt 指令**主动声明**它产出了哪些 artifacts，后端解析后直接给前端。

```
Before:
  SDK events → 前端 detectArtifact() 猜 → artifacts

After:
  SDK (prompt 指令让 agent 声明 artifacts)
    → 后端从最终 assistant text 中提取 <artifacts> 标签
    → 解析成结构化数据，随 done 事件发给前端
    → 前端直接用，不再猜
```

## 为什么不用 Structured Output

`outputFormat` (structured output) 和 agent 工具调用冲突：
- Agent 每一轮都可能输出 tool_use，structured output 要求最终输出符合 JSON schema
- Agent 无法预知哪一轮是最后一轮
- 多轮 agent（`maxTurns: 30`）使用 outputFormat 会干扰工具调用能力

Prompt 指令更灵活：不干扰工具调用，agent 在任意轮次自然结束时附带声明。

## 具体设计

### 1. System Prompt 追加指令

在 `query()` 的 prompt 前面加一段指令：

```
When you complete your task, include an <artifacts> block at the end of your final response
listing any meaningful outputs you produced. Format:

<artifacts>
[
  { "type": "image", "url": "https://...", "title": "描述" },
  { "type": "text", "content": "...", "format": "markdown" },
  { "type": "table", "title": "...", "headers": ["col1"], "rows": [["val1"]] },
  { "type": "file", "name": "filename.ts", "path": "/path/to/file" }
]
</artifacts>

Rules:
- Only include artifacts that are actual deliverables (generated images, created files, analysis results)
- Do NOT include intermediate tool outputs (file reads, grep results) as artifacts
- If your task has no meaningful artifacts, omit the <artifacts> block entirely
- The JSON inside must be valid
```

### 2. 后端解析（agent.ts）

在 `transformMessage` 的 `result` 分支中，从 SDK 的最终 message text 提取 artifacts：

```typescript
// 新增 SSE 事件类型
| { type: "artifacts"; items: Artifact[] }

// 在 result message 处理中:
if (message.type === "result") {
  // ... 现有的 cost/token 逻辑 ...

  // 提取 assistant 最终文本中的 <artifacts> 块
  const resultText = extractResultText(message);
  const artifacts = parseArtifactsTag(resultText);

  if (artifacts.length > 0) {
    events.push({ type: "artifacts", items: artifacts });
  }
}
```

解析函数：

```typescript
const artifactSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("image"), url: z.string(), title: z.string().optional(),
             width: z.number().optional(), height: z.number().optional() }),
  z.object({ type: z.literal("text"), content: z.string(),
             format: z.enum(["plain", "markdown", "code"]).optional() }),
  z.object({ type: z.literal("table"), title: z.string().optional(),
             headers: z.array(z.string()), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal("file"), name: z.string(), path: z.string(),
             mimeType: z.string().optional() }),
]);

function parseArtifactsTag(text: string): Artifact[] {
  const match = text.match(/<artifacts>([\s\S]*?)<\/artifacts>/);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item => artifactSchema.safeParse(item).success);
  } catch {
    return [];
  }
}
```

### 3. 前端改动

**agent-sse.ts** — 新增事件类型：

```typescript
| { type: "artifacts"; items: Artifact[] }
```

**agent-aggregator.ts** — 简化：

```typescript
// 删除 detectArtifact() 函数及其所有启发式逻辑

// aggregateEvents 中:
case "artifacts":
  artifacts.push(...event.items);
  break;

// tool_end 不再调用 detectArtifact
case "tool_end": {
  // 只做 tool call 状态更新，不检测 artifact
  const idx = runningTools.get(event.tool);
  if (idx !== undefined) {
    toolCalls[idx].output = event.output;
    toolCalls[idx].status = "done";
    runningTools.delete(event.tool);
  }
  break;
}
```

### 4. 降级策略

Agent 可能不输出 `<artifacts>` 标签（指令被忽略、任务没有产出等）。需要降级：

```typescript
// 后端: 如果 result 没有 <artifacts> 标签，降级到简单启发式
// 只检测最明确的情况：图片 URL
function fallbackDetectImageUrl(text: string): Artifact[] {
  const urls = text.match(/https?:\/\/\S+\.(png|jpe?g|webp|gif)/gi);
  if (!urls) return [];
  return urls.map(url => ({ type: "image" as const, url }));
}
```

这样把启发式检测从前端移到了后端，前端完全不需要猜。

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `apps/api/src/routes/agent.ts` | 追加 system prompt 指令，result 中解析 `<artifacts>` 标签 |
| `apps/web/src/lib/agent-sse.ts` | AgentEvent 新增 `artifacts` 类型 |
| `apps/web/src/lib/agent-aggregator.ts` | 删除 `detectArtifact()`，新增 `artifacts` 事件处理 |

## 风险

1. **Agent 可能不遵循指令** — 降级策略兜底
2. **`<artifacts>` 里的 JSON 可能格式错误** — Zod safeParse 容错
3. **Agent 把中间结果也列为 artifact** — prompt 指令明确要求只列最终产出，但不保证 100%
4. **增加 prompt token 开销** — 指令约 ~150 tokens，可接受

## 依赖

- 依赖 Chat Panel 完成（Stage 8）— artifacts 需要在面板中展示 "Add to Canvas" 按钮
- 不依赖 Structured Output SDK 功能
